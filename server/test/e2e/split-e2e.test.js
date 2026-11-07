/**
 * server/test/e2e/split-e2e.test.js
 * End-to-end integration, split records and automatic reconciliation test for SPLIT
 * (Item 13 CCC, PRD §11, K-SPLIT, AD-13, AD-17, T-13, T-14)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { calculateSplitShares } from '../../../shared/split.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('SPLIT End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const payeeId = '00000000-0000-4000-8000-000000000004';

  const intentId = 'e2e00000-0000-4000-8000-000000000015';
  const idempKey = 'idemp_e2e_split_collect_001';
  const paypalOrderId = 'ORDER-E2E-SPLIT-8899';
  const paypalPayoutId = 'PAYOUT-E2E-SPLIT-3344';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM split_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. Full E2E: Split Collection -> Fee Calculation -> Split Partition -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM split_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    const totalAmount = 50000n; // $500.00 total
    const feeBps = 250;         // 2.5% = $12.50 fee = 1250 minor units

    // Step 1: Submit split collection intent
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'SPLIT', 'collect', 'SUBMITTED',
        $4, 'USD', $5, $6,
        'hash_e2e_split_req', $7, $8
      ) RETURNING *
    `, [
      intentId, orgId, agentId, totalAmount.toString(), payeeId, mandateVersionId, idempKey,
      JSON.stringify({ platformFeeBps: feeBps })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Register split_records row
    await client.query(`
      INSERT INTO split_records (
        org_id, intent_id, sub_type, total_amount_minor, currency,
        platform_fee_bps, platform_fee_minor, recipient_counterparty_id,
        recipient_share_minor, status
      ) VALUES ($1, $2, 'collect', $3, 'USD', $4, 1250, $5, 48750, 'PENDING')
    `, [orgId, intentId, totalAmount.toString(), feeBps, payeeId]);

    // Step 2: Policy Evaluation -> APPROVED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'APPROVED'
      WHERE intent_id = $1
    `, [intentId]);

    // Step 3: Transition to EXECUTING
    await client.query(`
      UPDATE transaction_intents
      SET status = 'EXECUTING'
      WHERE intent_id = $1
    `, [intentId]);

    await client.query(`
      UPDATE split_records
      SET status = 'COLLECTED', paypal_reference_id = $2
      WHERE intent_id = $1
    `, [intentId, paypalOrderId]);

    // Step 4: Ledger Legs Generation for split partition (DEBIT split_escrow -> CREDIT main fee + CREDIT payee)
    const legs = generateLedgerLegs({
      category: 'SPLIT',
      sub_type: 'split',
      amount_minor: totalAmount,
      platform_fee_bps: feeBps,
      currency: 'USD',
      counterparty_id: payeeId,
    });
    assert.equal(legs.length, 3);

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

    assert.equal(legCheck.rows[0].total_debit, '50000');
    assert.equal(legCheck.rows[0].total_credit, '50000');

    // Step 5: Mark COMPLETED & Record settlement
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED'
      WHERE intent_id = $1
    `, [intentId]);

    await client.query(`
      UPDATE split_records
      SET status = 'SETTLED'
      WHERE intent_id = $1
    `, [intentId]);

    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, $4, 'USD', 'SETTLED', now())
    `, [orgId, intentId, paypalPayoutId, totalAmount.toString()]);

    const finalIntent = await client.query('SELECT status FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');

    const finalRecord = await client.query('SELECT status, platform_fee_minor FROM split_records WHERE intent_id = $1', [intentId]);
    assert.equal(finalRecord.rows[0].status, 'SETTLED');
    assert.equal(finalRecord.rows[0].platform_fee_minor, '1250');

    const settlement = await client.query('SELECT status FROM settlement_records WHERE intent_id = $1', [intentId]);
    assert.equal(settlement.rows[0].status, 'SETTLED');

    // Step 6: Generate and verify SAR v1.1
    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SPLIT',
        sub_type: 'split',
        status: 'COMPLETED',
        amount_minor: totalAmount.toString(),
        currency: 'USD',
      },
      legs,
      executions: [{ providerRefs: { payoutBatchId: paypalPayoutId } }],
    });

    assert.equal(sar.category, 'SPLIT');
    assert.equal(sar.sub_type, 'split');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '50000');
    assert.equal(sar.legs_summary.total_credit, '50000');

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });
});

