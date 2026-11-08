// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { rotateAgentApiKey, rotateLedgerSigningKey } from '../../src/services/secret_rotation.js';

test('secret_rotation unit tests', async (t) => {
  const orgId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  t.before(async () => {
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      orgId,
      'Rotation Org',
      `rot-${orgId.slice(0, 8)}`,
    ]);

    await pool.query('INSERT INTO agents (id, org_id, name, status) VALUES ($1, $2, $3, $4)', [
      agentId,
      orgId,
      'Rotation Agent',
      'ACTIVE',
    ]);
  });

  t.after(async () => {
    await pool.query('DELETE FROM ledger_signing_keys WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM agent_api_keys WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM agents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  await t.test('test_secret_rotation_new_key', async () => {
    // 1. Initial rotation creates first active key
    const result1 = await rotateAgentApiKey(agentId, orgId, userId);
    assert.ok(result1.new_key.startsWith('jp_sbx_'));
    assert.ok(result1.expires_at);

    const keys = await pool.query(
      'SELECT id, prefix, grace_until, revoked_at FROM agent_api_keys WHERE agent_id = $1 ORDER BY created_at DESC',
      [agentId],
    );
    assert.equal(keys.rows.length, 1);
    assert.equal(keys.rows[0].grace_until, null);
    assert.equal(keys.rows[0].revoked_at, null);

    // Test ledger signing key rotation
    const ledgerRes1 = await rotateLedgerSigningKey(orgId);
    assert.ok(ledgerRes1.new_kid);
    assert.equal(ledgerRes1.old_kid, null);

    const lKeys1 = await pool.query(
      'SELECT kid, status FROM ledger_signing_keys WHERE org_id = $1',
      [orgId],
    );
    assert.equal(lKeys1.rows.length, 1);
    assert.equal(lKeys1.rows[0].status, 'ACTIVE');
  });

  await t.test('test_secret_rotation_grace', async () => {
    // 2. Second rotation: creates new key and sets grace_until on old key
    const result2 = await rotateAgentApiKey(agentId, orgId, userId);
    assert.ok(result2.new_key);

    const keys = await pool.query(
      'SELECT id, prefix, grace_until, revoked_at FROM agent_api_keys WHERE agent_id = $1 ORDER BY created_at DESC',
      [agentId],
    );
    assert.equal(keys.rows.length, 2);
    // Newest key has null grace_until (fully active)
    assert.equal(keys.rows[0].grace_until, null);
    // Old key has grace_until set in the future
    assert.ok(keys.rows[1].grace_until);
    assert.ok(new Date(keys.rows[1].grace_until).getTime() > Date.now());

    // Second ledger key rotation: old key transitions to ROTATED, new key is ACTIVE
    const ledgerRes2 = await rotateLedgerSigningKey(orgId);
    assert.ok(ledgerRes2.new_kid);
    assert.ok(ledgerRes2.old_kid);

    const lKeys2 = await pool.query(
      'SELECT kid, status FROM ledger_signing_keys WHERE org_id = $1 ORDER BY created_at DESC',
      [orgId],
    );
    assert.equal(lKeys2.rows.length, 2);
    assert.equal(lKeys2.rows[0].status, 'ACTIVE');
    assert.equal(lKeys2.rows[1].status, 'ROTATED');
  });

  await t.test('test_secret_rotation_agent_not_found', async () => {
    const nonExistentAgentId = crypto.randomUUID();
    await assert.rejects(
      async () => rotateAgentApiKey(nonExistentAgentId, orgId, userId),
      (err) => {
        assert.equal(err.code, 'AGENT_NOT_FOUND');
        assert.equal(err.statusCode, 404);
        return true;
      },
    );
  });

  await t.test('test_secret_rotation_error_handling', async () => {
    // Pass invalid UUID to trigger PostgreSQL error and verify ROLLBACK and release
    await assert.rejects(
      async () => rotateAgentApiKey('invalid-uuid-format', orgId, userId),
      /invalid input syntax for type uuid/,
    );

    await assert.rejects(
      async () => rotateLedgerSigningKey('invalid-uuid-format'),
      /invalid input syntax for type uuid/,
    );
  });
});
