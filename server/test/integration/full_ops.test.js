// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { getCircuitBreaker } from '../../src/lib/circuit-breaker.js';

test('full ops integration flow', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();

  t.before(async () => {
    // Ensure standard breakers exist in registry
    getCircuitBreaker('paypal');
    getCircuitBreaker('ai');

    appInfo = await startTestApp();

    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      orgId,
      'Full Ops Test Org',
      `ops-full-${orgId.slice(0, 8)}`,
    ]);

    // Insert an audit log event
    await pool.query(`
      INSERT INTO audit_events (id, org_id, actor_id, action, details, created_at)
      VALUES ($1, $2, $3, 'ops.verified', '{"resource_type": "ops", "status": "ok"}'::jsonb, now())
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

  await t.test('test_full_ops_flow', async () => {
    // Step 1: Health checks
    const healthz = await fetch(`${appInfo.url}/healthz`);
    assert.equal(healthz.status, 200);
    const healthzData = await healthz.json();
    assert.equal(healthzData.status, 'ok');

    const readyz = await fetch(`${appInfo.url}/readyz`);
    assert.equal(readyz.status, 200);
    const readyzData = await readyz.json();
    assert.equal(readyzData.status, 'ready');
    assert.equal(readyzData.checks.database, true);
    assert.equal(readyzData.checks.migrations, true);

    const startupz = await fetch(`${appInfo.url}/startupz`);
    assert.equal(startupz.status, 200);
    const startupzData = await startupz.json();
    assert.equal(startupzData.status, 'started');

    // Step 2: SLO endpoints
    const slos = await fetch(`${appInfo.url}/api/v1/ops/slo`);
    assert.equal(slos.status, 200);
    const slosData = await slos.json();
    assert.ok(Array.isArray(slosData.slos));
    assert.equal(slosData.slos.length, 6);

    const singleSlo = await fetch(`${appInfo.url}/api/v1/ops/slo/slo_decision_latency`);
    assert.equal(singleSlo.status, 200);
    const singleSloData = await singleSlo.json();
    assert.equal(singleSloData.id, 'slo_decision_latency');
    assert.ok(Array.isArray(singleSloData.history));

    // Step 3: Circuit Breakers
    const breakers = await fetch(`${appInfo.url}/api/v1/ops/circuit-breakers`);
    assert.equal(breakers.status, 200);
    const breakersData = await breakers.json();
    assert.ok(Array.isArray(breakersData.breakers));
    assert.ok(breakersData.breakers.some((b) => b.name === 'paypal'));
    assert.ok(breakersData.breakers.some((b) => b.name === 'ai'));

    // Step 4: Per-Tenant Metrics
    const metrics = await fetch(`${appInfo.url}/api/v1/ops/tenants/${orgId}/metrics?window=1h`);
    assert.equal(metrics.status, 200);
    const metricsData = await metrics.json();
    assert.equal(metricsData.org_id, orgId);
    assert.ok(metricsData.metrics);
    assert.equal(typeof metricsData.metrics.requests_total, 'number');

    // Step 5: Audit Log Query
    const audit = await fetch(`${appInfo.url}/api/v1/audit?org_id=${orgId}&action=ops.verified`);
    assert.equal(audit.status, 200);
    const auditData = await audit.json();
    assert.ok(Array.isArray(auditData.events));
    assert.equal(auditData.events.length, 1);
    assert.equal(auditData.events[0].action, 'ops.verified');
    assert.equal(auditData.events[0].org_id, orgId);
  });
});
