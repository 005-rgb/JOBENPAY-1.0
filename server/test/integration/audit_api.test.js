// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';

test('audit_api integration test', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  t.before(async () => {
    appInfo = await startTestApp();
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      orgId,
      'Audit API Org',
      `aud-api-${orgId.slice(0, 8)}`,
    ]);

    await pool.query(`
      INSERT INTO audit_events (id, org_id, actor_id, action, details, created_at)
      VALUES ($1, $2, $3, 'mandate.activated', '{"resource_type": "mandate", "version": 2}'::jsonb, now())
    `, [crypto.randomUUID(), orgId, userId]);
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.query('DELETE FROM audit_events WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  await t.test('test_audit_log_query', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/audit?org_id=${orgId}&action=mandate.activated`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.events));
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0].action, 'mandate.activated');
    assert.equal(data.events[0].org_id, orgId);
    assert.equal(data.events[0].user_id, userId);
    assert.equal(data.events[0].resource_type, 'mandate');
  });
});
