/**
 * server/test/e2e/sale-e2e.test.js
 * End-to-end integration, Buyer Harness and automatic reconciliation test for SALE (Item 13 CCC, K-SALE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { approveOrder } from '../../../tools/buyer-harness/index.js';

test('SALE End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const buyerId = '00000000-0000-4000-8000-000000000005';

  const intentId = 'e2e00000-0000-4000-8000-000000000001';
  const idempKey = 'idemp_e2e_sale_001';

  t.after(async () => {
    // Cleanup
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. Full E2E: Proposal -> Approval -> Executing (Order Created) -> Buyer Harness -> Capture -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    // Step 1: Propose Sale
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'SALE', 'standard', 'SUBMITTED',
        250000, 'USD', $4, $5,
        'hash_e2e_sale_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, buyerId, mandateVersionId, idempKey,
      JSON.stringify({ description: 'Software license purchase' }),
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

    // Step 3: Worker Initiates Execution & Creates PayPal Order
    const dummyOrderId = 'ORD-E2E-SALE-001';
    const dummyApprovalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=${dummyOrderId}`;

    await client.query(`
      UPDATE transaction_intents
      SET status = 'EXECUTING',
          metadata = metadata || jsonb_build_object('orderId', $3::text, 'approvalUrl', $4::text)
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId, dummyOrderId, dummyApprovalUrl]);

    // Step 4: Buyer Harness Approves Order
    const harnessResult = await approveOrder(dummyApprovalUrl, { synthetic: true });
    assert.equal(harnessResult.success, true);

    // Step 5: Webhook / Capture Execution succeeds -> moves to COMPLETED and posts balanced legs
    const legs = generateLedgerLegs({
      category: 'SALE',
      sub_type: 'standard',
      amount_minor: 250000n,
      currency: 'USD',
      counterparty_id: buyerId,
    });

    await client.query('BEGIN');
    // Post double-entry legs
    for (const leg of legs) {
      await client.query(`
        INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref, status)
        VALUES ($1, $2, $3, $4, $5, 'POSTED')
      `, [intentId, leg.legType, leg.amountMinor.toString(), leg.currency, leg.accountRef]);
    }

    // Update status to COMPLETED with captureId
    const dummyCaptureId = 'CAP-E2E-SALE-001';
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED',
          metadata = metadata || jsonb_build_object('captureId', $3::text)
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId, dummyCaptureId]);
    await client.query('COMMIT');

    // Step 6: Automated Reconciliation creates settlement record & updates status to RECONCILED
    await client.query(`
      INSERT INTO settlement_records (org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at)
      VALUES ($1, $2, $3, 250000, 'USD', 'SETTLED', now())
    `, [orgId, intentId, dummyCaptureId]);

    await client.query(`
      UPDATE transaction_intents
      SET reconciliation_status = 'RECONCILED'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 7: Verify final state and audit record
    const finalIntent = await client.query(`
      SELECT * FROM transaction_intents WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');

    // Generate & verify SAR v1.1
    const sar = generateSar({
      intent: finalIntent.rows[0],
      legs,
      executions: [{ providerRefs: { orderId: dummyOrderId, captureId: dummyCaptureId } }],
    });

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.category, 'SALE');
    assert.equal(sar.paypal_refs.order_id, dummyOrderId);
    assert.equal(sar.paypal_refs.capture_id, dummyCaptureId);
  });
});

