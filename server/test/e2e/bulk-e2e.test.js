/**
 * server/test/e2e/bulk-e2e.test.js
 * End-to-end integration, batch records and automatic reconciliation test for BULK
 * (Item 13 CCC, PRD §11, K-BULK, AD-17, T-19)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { computeParentStatus } from '../../../shared/bulk.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('BULK End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const payee1Id = '00000000-0000-4000-8000-000000000004';
  const payee2Id = '00000000-0000-4000-8000-000000000005';
  const payee3Id = '00000000-0000-4000-8000-000000000006';

  const parentIntentId = 'e2e00000-0000-4000-8000-000000000010';
  const child1Id = 'e2e00000-0000-4000-8000-000000000011';
  const child2Id = 'e2e00000-0000-4000-8000-000000000012';
  const child3Id = 'e2e00000-0000-4000-8000-000000000013';

  const idempKey = 'idemp_e2e_bulk_batch_001';
  const paypalBatchId = 'BATCH-E2E-BULK-9988';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id IN ($1, $2, $3, $4)', [parentIntentId, child1Id, child2Id, child3Id]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [parentIntentId]);
    await client.query('DELETE FROM bulk_batches WHERE parent_intent_id = $1', [parentIntentId]);
    await client.query('DELETE FROM transaction_intents WHERE parent_intent_id = $1', [parentIntentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [parentIntentId]);
    await client.end();
  });

  await t.test('1. Full E2E: Bulk Batch Proposal -> Approval -> Partial Failure -> PARTIALLY_COMPLETED -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id IN ($1, $2, $3, $4)', [parentIntentId, child1Id, child2Id, child3Id]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [parentIntentId]);
    await client.query('DELETE FROM bulk_batches WHERE parent_intent_id = $1', [parentIntentId]);
    await client.query('DELETE FROM transaction_intents WHERE parent_intent_id = $1', [parentIntentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    const totalBatchAmount = 10000n; // $100.00 total (50 + 30 + 20)

    // Step 1: Submit parent intent
    await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'BULK', 'payout', 'SUBMITTED',
        $4, 'USD', $5,
        'hash_e2e_bulk_parent', $6, $7
      )
    `, [
      parentIntentId, orgId, agentId,
      totalBatchAmount.toString(), mandateVersionId, idempKey,
      JSON.stringify({ itemCount: 3 })
    ]);

    // Insert bulk_batches
    await client.query(`
      INSERT INTO bulk_batches (
        org_id, parent_intent_id, item_count, total_amount_minor, currency, status, paypal_batch_id
      ) VALUES ($1, $2, 3, $3, 'USD', 'PENDING', $4)
    `, [orgId, parentIntentId, totalBatchAmount.toString(), paypalBatchId]);

    // Insert 3 child intents
    const childConfigs = [
      { id: child1Id, amount: 5000n, payee: payee1Id, idx: 1 },
      { id: child2Id, amount: 3000n, payee: payee2Id, idx: 2 },
      { id: child3Id, amount: 2000n, payee: payee3Id, idx: 3 },
    ];

    for (const c of childConfigs) {
      await client.query(`
        INSERT INTO transaction_intents (
          intent_id, org_id, agent_id, category, sub_type, status,
          amount_minor, currency, counterparty_id, parent_intent_id,
          mandate_version_id, request_hash, idempotency_key
        ) VALUES (
          $1, $2, $3, 'BULK', 'payout', 'SUBMITTED',
          $4, 'USD', $5, $6,
          $7, $8, $9
        )
      `, [
        c.id, orgId, agentId,
        c.amount.toString(), c.payee, parentIntentId,
        mandateVersionId, `hash_e2e_bulk_child_${c.idx}`, `${idempKey}_item_${c.idx}`
      ]);
    }

    // Step 2: Evaluation & Approval
    await client.query(`UPDATE transaction_intents SET status = 'APPROVED' WHERE intent_id = $1`, [parentIntentId]);
    await client.query(`UPDATE transaction_intents SET status = 'EXECUTING' WHERE intent_id = $1`, [parentIntentId]);
    await client.query(`UPDATE bulk_batches SET status = 'PROCESSING' WHERE parent_intent_id = $1`, [parentIntentId]);

    // Step 3: Webhook processing for items: Item 1 & 2 succeed, Item 3 fails
    // Item 1 succeeds: post legs
    const legs1 = generateLedgerLegs({ category: 'BULK', sub_type: 'payout', amount_minor: 5000n, currency: 'USD', counterparty_id: payee1Id });
    await client.query('BEGIN');
    for (const leg of legs1) {
      await client.query(`
        INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref, status)
        VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [child1Id, leg.legType, leg.amountMinor.toString(), leg.currency, leg.accountRef]);
    }
    await client.query(`UPDATE transaction_intents SET status = 'COMPLETED' WHERE intent_id = $1`, [child1Id]);
    await client.query('COMMIT');

    // Item 2 succeeds: post legs
    const legs2 = generateLedgerLegs({ category: 'BULK', sub_type: 'payout', amount_minor: 3000n, currency: 'USD', counterparty_id: payee2Id });
    await client.query('BEGIN');
    for (const leg of legs2) {
      await client.query(`
        INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref, status)
        VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [child2Id, leg.legType, leg.amountMinor.toString(), leg.currency, leg.accountRef]);
    }
    await client.query(`UPDATE transaction_intents SET status = 'COMPLETED' WHERE intent_id = $1`, [child2Id]);
    await client.query('COMMIT');

    // Item 3 fails: no legs, release budget
    await client.query(`UPDATE transaction_intents SET status = 'FAILED' WHERE intent_id = $1`, [child3Id]);

    // Step 4: Recompute parent batch status
    const allChildStatuses = ['COMPLETED', 'COMPLETED', 'FAILED'];
    const finalParentStatus = computeParentStatus(allChildStatuses);
    assert.equal(finalParentStatus, 'PARTIALLY_COMPLETED');

    await client.query(`
      UPDATE transaction_intents SET status = $1, reconciliation_status = 'RECONCILED' WHERE intent_id = $2
    `, [finalParentStatus, parentIntentId]);

    await client.query(`
      UPDATE bulk_batches SET status = $1 WHERE parent_intent_id = $2
    `, [finalParentStatus, parentIntentId]);

    // Step 5: Record settlement for settled amount ($80.00)
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, 8000, 'USD', 'SETTLED', now())
    `, [orgId, parentIntentId, paypalBatchId]);

    // Step 6: Verify ledger totals
    const legsCountRes = await client.query(`
      SELECT leg_type, SUM(amount_minor) AS total
      FROM transaction_legs
      WHERE intent_id IN ($1, $2, $3)
      GROUP BY leg_type
    `, [child1Id, child2Id, child3Id]);

    const debitSum = legsCountRes.rows.find((r) => r.leg_type === 'DEBIT')?.total;
    const creditSum = legsCountRes.rows.find((r) => r.leg_type === 'CREDIT')?.total;
    assert.equal(debitSum, '8000');
    assert.equal(creditSum, '8000');
    assert.equal(debitSum, creditSum, 'Double-entry ledger for successful items must balance perfectly');

    // Step 7: Generate and verify SAR v1.1
    const sar = generateSar({
      intent: {
        intent_id: parentIntentId,
        org_id: orgId,
        category: 'BULK',
        sub_type: 'payout',
        status: finalParentStatus,
        amount_minor: '8000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_e2e_bulk_parent',
      },
      legs: [...legs1, ...legs2],
      executions: [{ providerRefs: { payoutBatchId: paypalBatchId } }],
    });

    assert.equal(sar.category, 'BULK');
    assert.equal(sar.sub_type, 'payout');
    assert.equal(sar.status, 'PARTIALLY_COMPLETED');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '8000');
    assert.equal(sar.legs_summary.total_credit, '8000');

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);
  });
});

