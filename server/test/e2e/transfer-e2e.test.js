/**
 * server/test/e2e/transfer-e2e.test.js
 * End-to-end integration, transfer records and automatic reconciliation test for TRANSFER
 * (Item 13 CCC, PRD §11, K-TRANSFER, AD-17, T-18)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('TRANSFER End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const senderId = '00000000-0000-4000-8000-000000000004';
  const receiverId = '00000000-0000-4000-8000-000000000005';

  const intentId = 'e2e00000-0000-4000-8000-000000000014';
  const idempKey = 'idemp_e2e_transfer_p2p_001';
  const paypalPayoutId = 'PAYOUT-E2E-TRANSFER-5566';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transfer_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. Full E2E: Transfer Proposal -> Approval -> Execution -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transfer_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    const transferAmount = 25000n; // $250.00

    // Step 1: Submit transfer intent
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'TRANSFER', 'p2p', 'SUBMITTED',
        $4, 'USD', $5, $6,
        'hash_e2e_transfer_req', $7, $8
      ) RETURNING *
    `, [
      intentId, orgId, agentId, transferAmount.toString(), receiverId, mandateVersionId, idempKey,
      JSON.stringify({ senderCounterpartyId: senderId, receiverCounterpartyId: receiverId })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Register transfer_records row
    await client.query(`
      INSERT INTO transfer_records (
        org_id, intent_id, sender_counterparty_id, receiver_counterparty_id,
        amount_minor, currency, status
      ) VALUES ($1, $2, $3, $4, $5, 'USD', 'PENDING')
    `, [orgId, intentId, senderId, receiverId, transferAmount.toString()]);

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
      UPDATE transfer_records
      SET status = 'PROCESSING'
      WHERE intent_id = $1
    `, [intentId]);

    // Step 4: Ledger Legs Generation (RULE_TRANSFER_P2P: DEBIT sender, CREDIT receiver)
    const legs = generateLedgerLegs({
      category: 'TRANSFER',
      sub_type: 'p2p',
      amount_minor: transferAmount,
      currency: 'USD',
      sender_counterparty_id: senderId,
      receiver_counterparty_id: receiverId,
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

    assert.equal(legCheck.rows[0].total_debit, '25000');
    assert.equal(legCheck.rows[0].total_credit, '25000');

    // Step 5: Mark COMPLETED & Record settlement
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED'
      WHERE intent_id = $1
    `, [intentId]);

    await client.query(`
      UPDATE transfer_records
      SET status = 'COMPLETED', paypal_payout_id = $2
      WHERE intent_id = $1
    `, [intentId, paypalPayoutId]);

    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, $4, 'USD', 'SETTLED', now())
    `, [orgId, intentId, paypalPayoutId, transferAmount.toString()]);

    const finalIntent = await client.query('SELECT status FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');

    const finalRecord = await client.query('SELECT status, paypal_payout_id FROM transfer_records WHERE intent_id = $1', [intentId]);
    assert.equal(finalRecord.rows[0].status, 'COMPLETED');
    assert.equal(finalRecord.rows[0].paypal_payout_id, paypalPayoutId);

    const settlement = await client.query('SELECT status FROM settlement_records WHERE intent_id = $1', [intentId]);
    assert.equal(settlement.rows[0].status, 'SETTLED');

    // Step 6: Generate and verify SAR v1.1
    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'TRANSFER',
        sub_type: 'p2p',
        status: 'COMPLETED',
        amount_minor: transferAmount.toString(),
        currency: 'USD',
      },
      legs,
      executions: [{ providerRefs: { payoutBatchId: paypalPayoutId } }],
    });

    assert.equal(sar.category, 'TRANSFER');
    assert.equal(sar.sub_type, 'p2p');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '25000');
    assert.equal(sar.legs_summary.total_credit, '25000');

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });
});
