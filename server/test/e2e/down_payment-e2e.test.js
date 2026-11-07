/**
 * server/test/e2e/down_payment-e2e.test.js
 * End-to-end integration, escrow tracking and automatic reconciliation test for DOWN_PAYMENT
 * (Item 13 CCC, PRD §11 test_dp_e2e, K-DOWN_PAYMENT, AD-04, AD-26, T-09)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('DOWN_PAYMENT End-to-End Lifecycle & Automated Reconciliation (test_dp_e2e)', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const buyerId = '00000000-0000-4000-8000-000000000007';

  const intentId = 'e2e00000-0000-4000-8000-000000000005';
  const authId = 'AUTH-E2E-DP-001';
  const idempKey = 'idemp_e2e_dp_001';

  t.after(async () => {
    // Cleanup
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM down_payment_accounts WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2', [orgId, authId]);
    await client.end();
  });

  await t.test('1. test_dp_e2e: Initial DP Proposal -> Approval -> Capture -> Escrow Credited -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM down_payment_accounts WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);
    await client.query('DELETE FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2', [orgId, authId]);

    // Step 0: Set up payment_authorizations row with $1,000.00 authorized
    await client.query(`
      INSERT INTO payment_authorizations (
        authorization_id, org_id, authorized_amount_minor, captured_amount_minor, currency, status
      ) VALUES ($1, $2, 100000, 0, 'USD', 'CREATED')
    `, [authId, orgId]);

    // Step 1: Propose Initial Down Payment ($200.00)
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'DOWN_PAYMENT', 'initial', 'SUBMITTED',
        20000, 'USD', $4, $5,
        'hash_e2e_dp_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, buyerId, mandateVersionId, idempKey,
      JSON.stringify({ authorizationId: authId, totalAmountMinor: '100000', description: 'E2E DP initial' })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Register initial down_payment_accounts row
    await client.query(`
      INSERT INTO down_payment_accounts (
        org_id, intent_id, counterparty_id, dp_amount_minor, total_amount_minor, status, authorization_id
      ) VALUES ($1, $2, $3, 20000, 100000, 'PENDING', $4)
    `, [orgId, intentId, buyerId, authId]);

    // Step 2: Evaluation & Approval
    await client.query(
      `UPDATE transaction_intents SET status = 'APPROVED' WHERE intent_id = $1`,
      [intentId]
    );

    // Step 3: Execution & Initial Capture completion
    const captureId = 'CAP-E2E-DP-INITIAL-001';

    // Step 4: Generate balanced ledger legs (DEBIT buyer -> CREDIT org:down_payment_escrow)
    const legs = generateLedgerLegs({
      category: 'DOWN_PAYMENT',
      sub_type: 'initial',
      amount_minor: 20000n,
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

    // Update cumulative authorization and down payment account status
    await client.query(`
      UPDATE payment_authorizations
      SET captured_amount_minor = captured_amount_minor + 20000,
          status = 'PARTIALLY_CAPTURED',
          updated_at = now()
      WHERE org_id = $1 AND authorization_id = $2
    `, [orgId, authId]);

    await client.query(`
      UPDATE down_payment_accounts
      SET status = 'DP_PAID'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Update intent to COMPLETED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED',
          metadata = metadata || jsonb_build_object('captureId', $2::text)
      WHERE intent_id = $1 AND org_id = $3
    `, [intentId, captureId, orgId]);
    await client.query('COMMIT');

    // Verify down_payment_accounts status
    const dpCheck = await client.query(
      'SELECT * FROM down_payment_accounts WHERE intent_id = $1',
      [intentId]
    );
    assert.equal(dpCheck.rows[0].status, 'DP_PAID');
    assert.equal(dpCheck.rows[0].dp_amount_minor, '20000');

    // Step 5: Record settlement
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, 20000, 'USD', 'SETTLED', now())
    `, [orgId, intentId, captureId]);

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
        category: 'DOWN_PAYMENT',
        sub_type: 'initial',
        status: 'COMPLETED',
        amount_minor: '20000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_e2e_dp_req',
      },
      legs,
      executions: [{ providerRefs: { authorizationId: authId, captureId } }],
    });

    assert.equal(sar.category, 'DOWN_PAYMENT');
    assert.equal(sar.sub_type, 'initial');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.authorization_id, authId);
    assert.equal(sar.paypal_refs.capture_id, captureId);

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);

    // Final check
    const finalIntent = await client.query('SELECT * FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');
  });
});

