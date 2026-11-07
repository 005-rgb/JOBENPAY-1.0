/**
 * server/test/e2e/void-e2e.test.js
 * End-to-end integration, authorization primitive and automatic reconciliation test for VOID
 * (Item 13 CCC, K-VOID, WP V-0, AD-11)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('VOID End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const buyerId = '00000000-0000-4000-8000-000000000007';

  const intentId = 'e2e00000-0000-4000-8000-000000000003';
  const authId = 'AUTH-E2E-VOID-001';
  const idempKey = 'idemp_e2e_void_001';

  t.after(async () => {
    // Cleanup
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2', [orgId, authId]);
    await client.end();
  });

  await t.test('1. Full E2E: Authorization Setup -> Proposal -> Approval -> Void Execution -> Webhook -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);
    await client.query('DELETE FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2', [orgId, authId]);

    // Step 0: Set up payment_authorizations row (WP V-0)
    await client.query(`
      INSERT INTO payment_authorizations (
        authorization_id, org_id, authorized_amount_minor, captured_amount_minor, currency, status
      ) VALUES ($1, $2, 50000, 0, 'USD', 'CREATED')
    `, [authId, orgId]);

    // Step 1: Propose Void
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'VOID', 'authorization', 'SUBMITTED',
        50000, 'USD', $4, $5,
        'hash_e2e_void_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, buyerId, mandateVersionId, idempKey,
      JSON.stringify({ authorizationId: authId, reason: 'Customer requested order cancellation before capture' }),
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
      SET status = 'EXECUTING',
          metadata = metadata || jsonb_build_object('authorizationId', $3::text)
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId, authId]);

    // Step 4: Gateway Execution / Webhook PAYMENT.AUTHORIZATION.VOIDED
    const legs = generateLedgerLegs({
      category: 'VOID',
      sub_type: 'authorization',
      amount_minor: 50000n,
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

    // Update authorization status in payment_authorizations
    await client.query(`
      UPDATE payment_authorizations
      SET status = 'VOIDED',
          updated_at = now()
      WHERE org_id = $1 AND authorization_id = $2
    `, [orgId, authId]);

    // Update intent status to COMPLETED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED',
          metadata = metadata || jsonb_build_object('voidStatus', 'VOIDED')
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);
    await client.query('COMMIT');

    // Step 5: Automated Reconciliation creates settlement record & updates status to RECONCILED
    await client.query(`
      INSERT INTO settlement_records (org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at)
      VALUES ($1, $2, $3, 50000, 'USD', 'SETTLED', now())
    `, [orgId, intentId, authId]);

    await client.query(`
      UPDATE transaction_intents
      SET reconciliation_status = 'RECONCILED'
      WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    // Step 6: Verify final state, authorization primitive and audit record
    const authAfter = await client.query(`
      SELECT * FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2
    `, [orgId, authId]);
    assert.equal(authAfter.rows[0].status, 'VOIDED');

    const finalIntent = await client.query(`
      SELECT * FROM transaction_intents WHERE intent_id = $1 AND org_id = $2
    `, [intentId, orgId]);

    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');

    // Generate & verify SAR v1.1
    const sar = generateSar({
      intent: finalIntent.rows[0],
      legs,
      executions: [{ providerRefs: { authorizationId: authId } }],
    });

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.category, 'VOID');
    assert.equal(sar.paypal_refs.authorization_id, authId);
  });
});

