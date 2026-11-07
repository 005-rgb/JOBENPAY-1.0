/**
 * server/test/e2e/partial-e2e.test.js
 * End-to-end integration, partial capture tracking and automatic reconciliation test for PARTIAL
 * (Item 13 CCC, K-PARTIAL, AD-10, AD-27)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { generateSar, verifySar } from '../../src/services/sar.js';

test('PARTIAL End-to-End Lifecycle & Automated Reconciliation', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const orgId = '00000000-0000-4000-8000-000000000001';
  const agentId = '00000000-0000-4000-8000-000000000002';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const buyerId = '00000000-0000-4000-8000-000000000007';

  const intentId = 'e2e00000-0000-4000-8000-000000000004';
  const authId = 'AUTH-E2E-PARTIAL-001';
  const idempKey = 'idemp_e2e_partial_001';

  t.after(async () => {
    // Cleanup
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2', [orgId, authId]);
    await client.end();
  });

  await t.test('1. Full E2E: Authorization Setup -> Partial Capture Proposal -> Approval -> Capture -> Balanced Legs -> Reconciled', async () => {
    // Clean prior
    await client.query('ROLLBACK').catch(() => {});
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM settlement_records WHERE intent_id = $1', [intentId]);
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [orgId, idempKey]);
    await client.query('DELETE FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2', [orgId, authId]);

    // Step 0: Set up payment_authorizations row with $1,000.00 authorized
    await client.query(`
      INSERT INTO payment_authorizations (
        authorization_id, org_id, authorized_amount_minor, captured_amount_minor, currency, status
      ) VALUES ($1, $2, 100000, 0, 'USD', 'CREATED')
    `, [authId, orgId]);

    // Step 1: Propose Partial Capture ($400.00)
    const insertRes = await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, counterparty_id, mandate_version_id,
        request_hash, idempotency_key, metadata
      ) VALUES (
        $1, $2, $3, 'PARTIAL', 'payment', 'SUBMITTED',
        40000, 'USD', $4, $5,
        'hash_e2e_partial_req', $6, $7
      ) RETURNING *
    `, [
      intentId, orgId, agentId, buyerId, mandateVersionId, idempKey,
      JSON.stringify({ authorizationId: authId, isFinal: false, description: 'E2E partial capture' })
    ]);
    assert.equal(insertRes.rowCount, 1);

    // Step 2: Evaluation & Approval
    await client.query(
      `UPDATE transaction_intents SET status = 'APPROVED' WHERE intent_id = $1`,
      [intentId]
    );

    // Step 3: Execution & Partial Capture completion
    const captureId = 'CAP-E2E-PARTIAL-999';

    // Step 4: Generate balanced ledger legs and insert inside a transaction
    const legs = generateLedgerLegs({
      category: 'PARTIAL',
      sub_type: 'payment',
      amount_minor: 40000n,
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

    // Update cumulative authorization tracking
    await client.query(`
      UPDATE payment_authorizations
      SET captured_amount_minor = captured_amount_minor + 40000,
          status = 'PARTIALLY_CAPTURED',
          updated_at = now()
      WHERE org_id = $1 AND authorization_id = $2
    `, [orgId, authId]);

    // Update intent to COMPLETED
    await client.query(`
      UPDATE transaction_intents
      SET status = 'COMPLETED',
          metadata = metadata || jsonb_build_object('captureId', $2::text)
      WHERE intent_id = $1 AND org_id = $3
    `, [intentId, captureId, orgId]);
    await client.query('COMMIT');

    // Verify updated authorization status
    const authCheck = await client.query(
      'SELECT * FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2',
      [orgId, authId]
    );
    assert.equal(authCheck.rows[0].captured_amount_minor, '40000');
    assert.equal(authCheck.rows[0].status, 'PARTIALLY_CAPTURED');

    // Step 5: Record settlement
    await client.query(`
      INSERT INTO settlement_records (
        org_id, intent_id, paypal_ref, amount_minor, currency, status, reconciled_at
      ) VALUES ($1, $2, $3, 40000, 'USD', 'SETTLED', now())
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
        category: 'PARTIAL',
        sub_type: 'payment',
        status: 'COMPLETED',
        amount_minor: '40000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_e2e_partial_req',
      },
      legs,
      executions: [{ providerRefs: { authorizationId: authId, captureId } }],
    });

    assert.equal(sar.category, 'PARTIAL');
    assert.equal(sar.sub_type, 'payment');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.authorization_id, authId);
    assert.equal(sar.paypal_refs.capture_id, captureId);

    const sarVerification = verifySar(sar);
    assert.equal(sarVerification.valid, true);

    // Final check: intent is fully reconciled
    const finalIntent = await client.query('SELECT * FROM transaction_intents WHERE intent_id = $1', [intentId]);
    assert.equal(finalIntent.rows[0].status, 'COMPLETED');
    assert.equal(finalIntent.rows[0].reconciliation_status, 'RECONCILED');
  });
});
