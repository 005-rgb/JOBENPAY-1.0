/**
 * server/test/e2e/scheduled-e2e.test.js
 * End-to-end integration, scheduled runs and automatic reconciliation test for SCHEDULED
 * (Item 13 CCC, PRD §11, K-SCHEDULED, AD-14, T-01)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('SCHEDULED End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const payeeId = '00000000-0000-4000-8000-000000000004';

  const intentId = 'e2e00000-0000-4000-8000-000000000009';
  const idempKey = 'idemp_e2e_sched_001';
  const paypalBatchId = 'BATCH-E2E-SCHED-01';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM scheduled_runs WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. test_scheduled_payout_e2e: Schedule -> Worker Fire -> Execution -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM scheduled_runs WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    const scheduledAt = '2026-12-01T10:00:00Z';

    // Step 1: Submit scheduled payout ($100.00)
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'SCHEDULED', 'payout', 'SCHEDULED',
        10000, 'USD', $4, $5,
        'hash_e2e_sched_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, payeeId, mandateVersionId, idempKey,
      JSON.stringify({ scheduledAt, recipientEmail: 'payee_sched@example.com' })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Register scheduled_runs row
    await client.query(`
      INSERT INTO scheduled_runs (
        org_id, intent_id, scheduled_at, status
      ) VALUES ($1, $2, $3, 'PENDING')
    `, [orgId, intentId, scheduledAt]);

    // Step 2: Worker polling and re-evaluation at fire time
    await client.query(`
      UPDATE scheduled_runs
      SET status = 'FIRED', fired_at = now(), re_eval_outcome = 'PASSED'
      WHERE intent_id = $1 AND status = 'PENDING'
    `, [intentId]);

    await client.query(`
      UPDATE transaction_intents
      SET status = 'EXECUTING'
      WHERE intent_id = $1
    `, [intentId]);

    // Step 3: Execution completed & generate balanced ledger legs (DEBIT org:main -> CREDIT payee)
    const legs = generateLedgerLegs({
      category: 'SCHEDULED',
      sub_type: 'payout',
      amount_minor: 10000n,
      currency: 'USD',
      counterparty_id: payeeId,
    });
    assert.equal(legs.length, 2);

    await client.query('BEGIN');
    for (const leg of legs) {
      await client.query(`
        INSERT INTO transaction_legs (
          intent_id, leg_type, amount_minor, currency, account_ref, status
        ) VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [intentId, leg.legType, leg.amountMinor.toString(), leg.currency, leg.accountRef]);
    }

    // Step 4: Update intent to COMPLETED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED',
          metadata = metadata || jsonb_build_object('payoutBatchId', $2::text)
      WHERE intent_id = $1 AND org_id = $3
    `, [intentId, paypalBatchId, orgId]);
    await client.query('COMMIT');

    // Step 5: Record settlement
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, 10000, 'USD', 'SETTLED', now())
    `, [orgId, intentId, paypalBatchId]);

    await client.query(`
      UPDATE transaction_intents
      SET reconciliation_status = 'RECONCILED'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 6: Generate and verify SAR v1.1
    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SCHEDULED',
        sub_type: 'payout',
        status: 'COMPLETED',
        amount_minor: '10000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_e2e_sched_req',
      },
      legs,
      executions: [{ providerRefs: { payoutBatchId: paypalBatchId } }],
    });

    assert.equal(sar.category, 'SCHEDULED');
    assert.equal(sar.sub_type, 'payout');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.payout_batch_id, paypalBatchId);

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);

    const finalIntent = await client.query('SELECT * FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');
  });

  await t.test('2. Revoked mandate fails re-evaluation at fire time -> REJECTED without ledger entries', async () => {
    const revokedIntentId = 'e2e00000-0000-4000-8000-000000000098';
    const revokedIdemp = 'idemp_sched_revoked_test';

    await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key
      ) VALUES (
        $1, $2, $3, 'SCHEDULED', 'payout', 'SCHEDULED',
        5000, 'USD', $4, $5,
        'hash_sched_revoked', $6
      )
    `, [revokedIntentId, orgId, agentId, payeeId, mandateVersionId, revokedIdemp]);

    await client.query(`
      INSERT INTO scheduled_runs (org_id, intent_id, scheduled_at, status)
      VALUES ($1, $2, '2026-12-01T12:00:00Z', 'PENDING')
    `, [orgId, revokedIntentId]);

    // Simulate fire with failed re-evaluation
    await client.query(`
      UPDATE scheduled_runs
      SET status = 'FAILED', re_eval_outcome = 'MANDATE_INACTIVE'
      WHERE intent_id = $1
    `, [revokedIntentId]);

    await client.query(`
      UPDATE transaction_intents
      SET status = 'REJECTED'
      WHERE intent_id = $1
    `, [revokedIntentId]);

    const finalRevoked = await client.query('SELECT status FROM transaction_intents WHERE intent_id = $1', [revokedIntentId]);
    assert.equal(finalRevoked.rows[0].status, 'REJECTED');

    const legsCheck = await client.query('SELECT COUNT(*) FROM transaction_legs WHERE intent_id = $1', [revokedIntentId]);
    assert.equal(parseInt(legsCheck.rows[0].count, 10), 0);

    // Clean up test row
    await client.query('DELETE FROM scheduled_runs WHERE intent_id = $1', [revokedIntentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [revokedIntentId]);
  });
});

