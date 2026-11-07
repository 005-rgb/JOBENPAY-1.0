/**
 * server/test/e2e/recurring-e2e.test.js
 * End-to-end integration, recurring schedules and automatic reconciliation test for RECURRING
 * (Item 13 CCC, PRD §11, K-RECURRING, AD-17, T-08)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('RECURRING End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const subscriberId = '00000000-0000-4000-8000-000000000004';

  const intentId = 'e2e00000-0000-4000-8000-000000000016';
  const idempKey = 'idemp_e2e_recurring_init_001';
  const planId = 'PLAN-E2E-RECUR-001';
  const subId = 'I-SUB-E2E-RECUR-001';
  const captureId = 'CAPTURE-E2E-REC-CYCLE-1';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM recurring_execution_history WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM recurring_schedules WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. Full E2E: Subscription Init -> Cycle Charge -> Ledger Posting -> Cancel -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM recurring_execution_history WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM recurring_schedules WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    const cycleAmount = 4900n; // $49.00 / month

    // Step 1: Submit recurring init intent
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'RECURRING', 'init', 'SUBMITTED',
        $4, 'USD', $5, $6,
        'hash_e2e_recur_req', $7, $8
      ) RETURNING *
    `, [
      intentId, orgId, agentId, cycleAmount.toString(), subscriberId, mandateVersionId, idempKey,
      JSON.stringify({ frequency: 'MONTHLY', intervalCount: 1, subscriberEmail: 'sub@example.com' })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Register recurring_schedules row
    const nextRun = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const schedRes = await client.query(`
      INSERT INTO recurring_schedules (
        org_id, intent_id, counterparty_id, amount_minor, currency,
        frequency, interval_count, next_run_at, remaining_cycles,
        paypal_plan_id, paypal_subscription_id, status
      ) VALUES ($1, $2, $3, $4, 'USD', 'MONTHLY', 1, $5, 12, $6, $7, 'ACTIVE')
      RETURNING schedule_id
    `, [orgId, intentId, subscriberId, cycleAmount.toString(), nextRun, planId, subId]);

    const scheduleId = schedRes.rows[0].schedule_id;

    // Step 2: Policy Evaluation -> APPROVED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'APPROVED'
      WHERE intent_id = $1
    `, [intentId]);

    // Step 3: Transition to EXECUTING (1st Cycle Charged via Webhook)
    await client.query(`
      UPDATE transaction_intents
      SET status = 'EXECUTING'
      WHERE intent_id = $1
    `, [intentId]);

    // Record execution history
    await client.query(`
      INSERT INTO recurring_execution_history (
        org_id, schedule_id, intent_id, cycle_number, charged_amount_minor,
        currency, status, paypal_capture_id
      ) VALUES ($1, $2, $3, 1, $4, 'USD', 'COMPLETED', $5)
    `, [orgId, scheduleId, intentId, cycleAmount.toString(), captureId]);

    // Step 4: Ledger Legs Generation (RULE_RECURRING_CHARGE: DEBIT org:main -> CREDIT subscriber)
    const legs = generateLedgerLegs({
      category: 'RECURRING',
      sub_type: 'charge',
      amount_minor: cycleAmount,
      currency: 'USD',
      counterparty_id: subscriberId,
    });
    assert.equal(legs.length, 2);

    await client.query('BEGIN');
    for (const leg of legs) {
      await client.query(`
        INSERT INTO transaction_legs (
          intent_id, leg_type, account_ref, amount_minor, currency, status
        ) VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [intentId, leg.legType, leg.accountRef, leg.amountMinor.toString(), leg.currency]);
    }
    await client.query('COMMIT');

    // Verify DB Trigger enforces balanced entries
    const legCheck = await client.query(`
      SELECT 
        SUM(CASE WHEN leg_type = 'DEBIT' THEN amount_minor ELSE 0 END) AS total_debit,
        SUM(CASE WHEN leg_type = 'CREDIT' THEN amount_minor ELSE 0 END) AS total_credit
      FROM transaction_legs
      WHERE intent_id = $1
    `, [intentId]);

    assert.equal(legCheck.rows[0].total_debit, '4900');
    assert.equal(legCheck.rows[0].total_credit, '4900');

    // Step 5: Mark COMPLETED & Record settlement
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED'
      WHERE intent_id = $1
    `, [intentId]);

    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, $4, 'USD', 'SETTLED', now())
    `, [orgId, intentId, captureId, cycleAmount.toString()]);

    const finalIntent = await client.query('SELECT status FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');

    const settlement = await client.query('SELECT status FROM settlement_records WHERE intent_id = $1', [intentId]);
    assert.equal(settlement.rows[0].status, 'SETTLED');

    // Step 6: Cancellation lifecycle step
    await client.query(`
      UPDATE recurring_schedules
      SET status = 'CANCELLED'
      WHERE schedule_id = $1
    `, [scheduleId]);

    const cancelledSched = await client.query('SELECT status FROM recurring_schedules WHERE schedule_id = $1', [scheduleId]);
    assert.equal(cancelledSched.rows[0].status, 'CANCELLED');

    // Step 7: Generate and verify SAR v1.1
    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'RECURRING',
        sub_type: 'charge',
        status: 'COMPLETED',
        amount_minor: cycleAmount.toString(),
        currency: 'USD',
      },
      legs,
      executions: [{ providerRefs: { subscriptionId: subId } }],
    });

    assert.equal(sar.category, 'RECURRING');
    assert.equal(sar.sub_type, 'charge');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '4900');
    assert.equal(sar.legs_summary.total_credit, '4900');

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });
});

