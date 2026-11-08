// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';

test('metrics_api integration test', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();

  t.before(async () => {
    appInfo = await startTestApp();
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      orgId,
      'Metrics API Org',
      `met-api-${orgId.slice(0, 8)}`,
    ]);
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  await t.test('test_tenant_metrics_endpoint', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/tenants/${orgId}/metrics?window=1h`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.org_id, orgId);
    assert.equal(data.window, '1h');
    assert.ok(data.metrics);
    assert.equal(typeof data.metrics.requests_total, 'number');
    assert.equal(typeof data.metrics.decisions_total, 'number');
    assert.equal(typeof data.metrics.payouts_total, 'number');
    assert.ok(data.generated_at);
  });
});
