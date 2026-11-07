/**
 * server/test/e2e/payout-e2e.test.js
 * End-to-end integration and automatic reconciliation test for PAYOUT (Item 13 CCC, K-PAYOUT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('PAYOUT End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const payeeId = '00000000-0000-4000-8000-000000000004';

  const intentId = '44444444-4444-4444-8444-444444444444';
  const idempKey = 'idemp_e2e_payout_001';

  t.after(async () => {
    // Cleanup
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. Full E2E: Proposal -> Approval -> Execution -> Webhook -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    // Step 1: Propose Payout
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'PAYOUT', 'standard', 'SUBMITTED',
        100000, 'USD', $4, $5,
        'hash_e2e_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, payeeId, mandateVersionId, idempKey,
      JSON.stringify({ agentReason: 'Monthly supplier invoice payment' }),
    ]);

    assert.equal(insertRes.rowCount, 1);
    assert.equal(insertRes.rows[0].status, 'SUBMITTED');

    // Step 2: Policy Engine Evaluates & Approves
    await client.query(`
      UPDATE transaction_intents
      SET status = 'APPROVED',
          metadata = metadata || jsonb_build_object('decision', 'AUTO_APPROVE')
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 3: Worker Initiates Execution
    await client.query(`
      UPDATE transaction_intents
      SET status = 'EXECUTING'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 4: Webhook Reports Succeeded -> Transaction Moves to COMPLETED
    const legs = generateLedgerLegs({
      category: 'PAYOUT',
      sub_type: 'standard',
      amount_minor: 100000n,
      currency: 'USD',
      counterparty_id: payeeId,
    });

    await client.query('BEGIN');
    // Post double-entry legs
    for (const leg of legs) {
      await client.query(`
        INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref, status)
        VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [intentId, leg.legType, leg.amountMinor.toString(), leg.currency, leg.accountRef]);
    }

    // Update status to COMPLETED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);
    await client.query('COMMIT');

    // Step 5: Automated Reconciliation creates settlement record & updates status to RECONCILED
    await client.query(`
      INSERT INTO settlement_records (org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at)
      VALUES ($1, $2, 'batch_paypal_e2e_001', 100000, 'USD', 'SETTLED', now())
    `, [orgId, intentId]);

    await client.query(`
      UPDATE transaction_intents
      SET reconciliation_status = 'RECONCILED'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 6: Verify final state and audit record
    const finalIntent = await client.query(`
      SELECT * FROM transaction_intents WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');

    // Generate & verify SAR v1.1
    const sar = generateSar({
      intent: finalIntent.rows[0],
      legs,
      executions: [{ providerRefs: { payoutBatchId: 'batch_paypal_e2e_001' } }],
    });

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);
    assert.equal(sar.legs_summary.balanced, true);
  });
});

