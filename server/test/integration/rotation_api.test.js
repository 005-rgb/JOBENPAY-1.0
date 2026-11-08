// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';

test('rotation_api integration test', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  let key1 = null;
  let key2 = null;

  t.before(async () => {
    appInfo = await startTestApp();

    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      orgId,
      'Rotation API Org',
      `rot-api-${orgId.slice(0, 8)}`,
    ]);

    await pool.query('INSERT INTO agents (id, org_id, name, status) VALUES ($1, $2, $3, $4)', [
      agentId,
      orgId,
      'Rotation Agent',
      'ACTIVE',
    ]);
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.query('DELETE FROM ledger_signing_keys WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM agent_api_keys WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM agents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  await t.test('test_rotate_api_key', async () => {
    // Initial rotation creates key1
    const res1 = await fetch(`${appInfo.url}/api/v1/agents/${agentId}/keys/rotate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': orgId,
      },
      body: JSON.stringify({ org_id: orgId }),
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.ok(data1.new_key.startsWith('jp_sbx_'));
    assert.ok(data1.expires_at);
    key1 = data1.new_key;

    // Verify key1 can authenticate to agent ping endpoint
    const ping1 = await fetch(`${appInfo.url}/api/v1/agent/v1/ping`, {
      headers: { authorization: `Bearer ${key1}` },
    });
    // Either 200 or 404 depending on ping route, but NOT 401 UNAUTHENTICATED
    assert.notEqual(ping1.status, 401);
  });

  await t.test('test_rotate_api_key_grace', async () => {
    // Second rotation creates key2; key1 enters grace period
    const res2 = await fetch(`${appInfo.url}/api/v1/agents/${agentId}/keys/rotate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': orgId,
      },
      body: JSON.stringify({ org_id: orgId }),
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.ok(data2.new_key);
    key2 = data2.new_key;

    // Both key2 (new key) AND key1 (grace key) must be valid (not 401)
    const pingNew = await fetch(`${appInfo.url}/api/v1/agent/v1/ping`, {
      headers: { authorization: `Bearer ${key2}` },
    });
    assert.notEqual(pingNew.status, 401);

    const pingOldGrace = await fetch(`${appInfo.url}/api/v1/agent/v1/ping`, {
      headers: { authorization: `Bearer ${key1}` },
    });
    assert.notEqual(pingOldGrace.status, 401);
  });

  await t.test('test_rotate_api_key_expired', async () => {
    // Manually expire key1's grace period in DB
    await pool.query(
      "UPDATE agent_api_keys SET grace_until = now() - interval '10 seconds' WHERE agent_id = $1 AND grace_until IS NOT NULL",
      [agentId],
    );

    // Old expired key now returns 401 UNAUTHENTICATED
    const pingOldExpired = await fetch(`${appInfo.url}/api/v1/agent/v1/ping`, {
      headers: { authorization: `Bearer ${key1}` },
    });
    assert.equal(pingOldExpired.status, 401);

    // New key is still valid
    const pingNew = await fetch(`${appInfo.url}/api/v1/agent/v1/ping`, {
      headers: { authorization: `Bearer ${key2}` },
    });
    assert.notEqual(pingNew.status, 401);
  });

  await t.test('test_rotate_ledger_key', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/org/ledger-keys/rotate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': orgId,
      },
      body: JSON.stringify({ org_id: orgId }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.new_kid);
    assert.ok(data.rotated_at);
  });
});
