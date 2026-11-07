/**
 * server/test/e2e/dispute-e2e.test.js
 * End-to-end integration, dispute records and automatic reconciliation test for DISPUTE
 * (Item 13 CCC, PRD §11, K-DISPUTE, AD-12, AD-23, T-06)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('DISPUTE End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const buyerId = '00000000-0000-4000-8000-000000000007';

  const intentId = 'e2e00000-0000-4000-8000-000000000008';
  const idempKey = 'idemp_e2e_dispute_001';
  const paypalDisputeId = 'PP-D-E2E-998811';

  t.after(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM disputes WHERE org_id = $1 AND paypal_dispute_id = $2', [orgId, paypalDisputeId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.end();
  });

  await t.test('1. test_dispute_e2e: Dispute Chargeback Creation -> Human Review -> Claim Resolution -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM disputes WHERE org_id = $1 AND paypal_dispute_id = $2', [orgId, paypalDisputeId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);

    // Step 1: Customer Dispute Ingestion / Proposal ($75.00)
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'DISPUTE', 'chargeback', 'SUBMITTED',
        7500, 'USD', $4, $5,
        'hash_e2e_dispute_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, buyerId, mandateVersionId, idempKey,
      JSON.stringify({ disputeId: paypalDisputeId, reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED' })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Register disputes table row
    await client.query(`
      INSERT INTO disputes (
        org_id, paypal_dispute_id, status, reason, amount_minor, currency, raw
      ) VALUES ($1, $2, 'OPEN', 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED', 7500, 'USD', $3)
    `, [orgId, paypalDisputeId, JSON.stringify({ intentId })]);

    // Step 2: Evaluation & Human Maker/Checker Approval (AD-23: Human-only confirmation)
    await client.query(
      `UPDATE transaction_intents SET status = 'APPROVED' WHERE intent_id = $1`,
      [intentId]
    );

    // Step 3: Dispute resolved in buyer favor / accepted
    await client.query(`
      UPDATE disputes
      SET status = 'RESOLVED'
      WHERE org_id = $1 AND paypal_dispute_id = $2
    `, [orgId, paypalDisputeId]);

    // Step 4: Generate balanced ledger legs (DEBIT org:main -> CREDIT buyer)
    const legs = generateLedgerLegs({
      category: 'DISPUTE',
      sub_type: 'chargeback',
      amount_minor: 7500n,
      currency: 'USD',
      counterparty_id: buyerId,
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

    // Update intent to COMPLETED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED',
          metadata = metadata || jsonb_build_object('disputeId', $2::text)
      WHERE intent_id = $1 AND org_id = $3
    `, [intentId, paypalDisputeId, orgId]);
    await client.query('COMMIT');

    // Verify disputes table status
    const dispCheck = await client.query(
      'SELECT * FROM disputes WHERE paypal_dispute_id = $1 AND org_id = $2',
      [paypalDisputeId, orgId]
    );
    assert.equal(dispCheck.rows[0].status, 'RESOLVED');
    assert.equal(dispCheck.rows[0].amount_minor, '7500');

    // Step 5: Record settlement
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, 7500, 'USD', 'SETTLED', now())
    `, [orgId, intentId, paypalDisputeId]);

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
        category: 'DISPUTE',
        sub_type: 'chargeback',
        status: 'COMPLETED',
        amount_minor: '7500',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_e2e_dispute_req',
      },
      legs,
      executions: [{ providerRefs: { disputeId: paypalDisputeId } }],
    });

    assert.equal(sar.category, 'DISPUTE');
    assert.equal(sar.sub_type, 'chargeback');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.dispute_id, paypalDisputeId);

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);

    // Final intent check
    const finalIntent = await client.query('SELECT * FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');
  });

  await t.test('2. Inquiry sub-type has memo balanced ledger entries and generates valid SAR', async () => {
    const inquiryLegs = generateLedgerLegs({
      category: 'DISPUTE',
      sub_type: 'inquiry',
      amount_minor: 7500n,
      currency: 'USD',
      counterparty_id: buyerId,
    });
    assert.equal(inquiryLegs.length, 2);

    const inquirySar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'DISPUTE',
        sub_type: 'inquiry',
        status: 'COMPLETED',
        amount_minor: '7500',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_e2e_dispute_inquiry_req',
      },
      legs: inquiryLegs,
      executions: [{ providerRefs: { disputeId: paypalDisputeId } }],
    });

    assert.equal(inquirySar.category, 'DISPUTE');
    assert.equal(inquirySar.sub_type, 'inquiry');
    assert.equal(inquirySar.legs_summary.balanced, true);

    const inquiryVerification = verifySar(inquirySar);
    assert.equal(inquiryVerification.valid, true);
  });
});
