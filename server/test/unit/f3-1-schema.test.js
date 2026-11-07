/**
 * server/test/unit/f3-1-schema.test.js
 * Unit & Integration tests for WP F3-1: Universal Transaction Engine Schema §2,
 * payment_requests VIEW 1.2 compatibility, and double-entry legs enforcement.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { env } from '../../src/config.js';
import { databaseConnectionOptions } from '../../src/db/connection.js';

test('F3-1: Universal Transaction Engine Schema and Compatible VIEW', async (t) => {
  const client = new pg.Client(databaseConnectionOptions(env.TEST_DATABASE_URL));
  await client.connect();

  const testOrgId = '00000000-0000-4000-8000-000000000001';
  const testAgentId = '00000000-0000-4000-8000-000000000002';
  const testMandateVersionId = '00000000-0000-4000-8000-000000000003';
  const testPayeeId = '00000000-0000-4000-8000-000000000004';

  t.after(async () => {
    await client.end();
  });

  await t.test('1. payment_requests VIEW allows 1.2 INSERT, SELECT, UPDATE, DELETE transparently', async () => {
    const testId = '11111111-1111-4111-8111-111111111111';
    const testKey = 'test_idemp_key_1_2';

    // Cleanup if exists
    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [testOrgId, testKey]);

    // 1. INSERT via VIEW (1.2 style)
    const insertRes = await client.query(`
      INSERT INTO payment_requests (
        id, org_id, agent_id, mandate_version_id, action, status,
        amount_minor, currency, payee_id, target_ref, agent_reason,
        agent_idempotency_key, request_hash, decision, reason_codes
      ) VALUES (
        $1, $2, $3, $4, 'PAYOUT', 'RECEIVED',
        50000, 'USD', $5, 'paypal:account@example.test', 'Supplier payment',
        $6, 'hash_req_123', 'REQUIRE_APPROVAL', ARRAY['AMOUNT_REQUIRES_APPROVAL']
      ) RETURNING id, status, amount_minor, currency, payee_id, agent_reason, decision, reason_codes
    `, [testId, testOrgId, testAgentId, testMandateVersionId, testPayeeId, testKey]);

    assert.equal(insertRes.rowCount, 1);
    assert.equal(insertRes.rows[0].id, testId);
    assert.equal(insertRes.rows[0].status, 'RECEIVED');
    assert.equal(insertRes.rows[0].amount_minor, '50000');
    assert.deepEqual(insertRes.rows[0].reason_codes, ['AMOUNT_REQUIRES_APPROVAL']);

    // 2. Verify underlying transaction_intents row
    const intentRes = await client.query(`
      SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2
    `, [testOrgId, testId]);

    assert.equal(intentRes.rowCount, 1);
    assert.equal(intentRes.rows[0].category, 'PAYOUT');
    assert.equal(intentRes.rows[0].sub_type, 'standard');
    assert.equal(intentRes.rows[0].status, 'SUBMITTED'); // Mapped status
    assert.equal(intentRes.rows[0].amount_minor, '50000');
    assert.equal(intentRes.rows[0].idempotency_key, testKey);

    // 3. UPDATE via VIEW (1.2 style)
    const updateRes = await client.query(`
      UPDATE payment_requests
      SET status = 'APPROVED', decision = 'AUTO_APPROVE'
      WHERE org_id = $1 AND id = $2
      RETURNING id, status, decision
    `, [testOrgId, testId]);

    assert.equal(updateRes.rowCount, 1);
    assert.equal(updateRes.rows[0].status, 'APPROVED');

    // Verify underlying row updated
    const updatedIntent = await client.query(`
      SELECT status, metadata FROM transaction_intents WHERE org_id = $1 AND intent_id = $2
    `, [testOrgId, testId]);
    assert.equal(updatedIntent.rows[0].status, 'APPROVED');
    assert.equal(updatedIntent.rows[0].metadata.decision, 'AUTO_APPROVE');

    // 4. DELETE via VIEW
    const delRes = await client.query(`
      DELETE FROM payment_requests WHERE org_id = $1 AND id = $2
    `, [testOrgId, testId]);
    assert.equal(delRes.rowCount, 1);

    const checkGone = await client.query(`
      SELECT 1 FROM transaction_intents WHERE org_id = $1 AND intent_id = $2
    `, [testOrgId, testId]);
    assert.equal(checkGone.rowCount, 0);
  });

  await t.test('2. transaction_legs balanced trigger allows balanced debit/credit and rejects unbalanced legs', async () => {
    const intentId = '22222222-2222-4222-8222-222222222222';
    const key = 'test_idemp_balanced_legs';

    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [testOrgId, key]);

    await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, mandate_version_id, request_hash, idempotency_key
      ) VALUES (
        $1, $2, $3, 'PAYOUT', 'standard', 'SUBMITTED',
        10000, 'USD', $4, 'hash_balanced', $5
      )
    `, [intentId, testOrgId, testAgentId, testMandateVersionId, key]);

    // 1. Balanced insert in a transaction -> Success
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
      VALUES ($1, 'DEBIT', 10000, 'USD', 'payee:123')
    `, [intentId]);
    await client.query(`
      INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
      VALUES ($1, 'CREDIT', 10000, 'USD', 'org:main')
    `, [intentId]);
    await client.query('COMMIT');

    const legsCount = await client.query(`
      SELECT count(*)::int as count FROM transaction_legs WHERE intent_id = $1
    `, [intentId]);
    assert.equal(legsCount.rows[0].count, 2);

    // 2. Unbalanced insert in a transaction -> COMMIT throws Unbalanced ledger
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
      VALUES ($1, 'DEBIT', 5000, 'USD', 'payee:123')
    `, [intentId]);
    await assert.rejects(
      client.query('COMMIT'),
      (err) => err.message.includes('Unbalanced ledger')
    );
    await client.query('ROLLBACK').catch(() => {});

    // Clean up
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]).catch(async () => {
      // legs prevent_legs_mutation blocks hard delete unless trigger disabled for test cleanup
      await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
      await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
      await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    });
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
  });

  await t.test('3. transaction_legs immutability trigger blocks financial UPDATE and hard DELETE', async () => {
    const intentId = '33333333-3333-4333-8333-333333333333';
    const key = 'test_idemp_immutability';

    await client.query('DELETE FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2', [testOrgId, key]);

    await client.query(`
      INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, mandate_version_id, request_hash, idempotency_key
      ) VALUES (
        $1, $2, $3, 'PAYOUT', 'standard', 'SUBMITTED',
        10000, 'USD', $4, 'hash_immutability', $5
      )
    `, [intentId, testOrgId, testAgentId, testMandateVersionId, key]);

    await client.query('BEGIN');
    const leg1 = await client.query(`
      INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
      VALUES ($1, 'DEBIT', 10000, 'USD', 'payee:123') RETURNING leg_id
    `, [intentId]);
    await client.query(`
      INSERT INTO transaction_legs (intent_id, leg_type, amount_minor, currency, account_ref)
      VALUES ($1, 'CREDIT', 10000, 'USD', 'org:main')
    `, [intentId]);
    await client.query('COMMIT');

    const legId = leg1.rows[0].leg_id;

    // Direct UPDATE of amount_minor -> Rejected
    await assert.rejects(
      client.query(`UPDATE transaction_legs SET amount_minor = 9999 WHERE leg_id = $1`, [legId]),
      (err) => err.message.includes('Transaction legs are immutable')
    );

    // Direct hard DELETE -> Rejected
    await assert.rejects(
      client.query(`DELETE FROM transaction_legs WHERE leg_id = $1`, [legId]),
      (err) => err.message.includes('Transaction legs are immutable')
    );

    // Updating non-financial status (e.g. POSTED -> SETTLED) is allowed
    const statusUpdate = await client.query(`
      UPDATE transaction_legs SET status = 'SETTLED' WHERE leg_id = $1 RETURNING status
    `, [legId]);
    assert.equal(statusUpdate.rows[0].status, 'SETTLED');

    // Clean up
    await client.query('ALTER TABLE transaction_legs DISABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_legs WHERE intent_id = $1', [intentId]);
    await client.query('ALTER TABLE transaction_legs ENABLE TRIGGER trg_prevent_legs_mutation');
    await client.query('DELETE FROM transaction_intents WHERE intent_id = $1', [intentId]);
  });
});

