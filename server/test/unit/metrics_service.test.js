// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { getTenantMetrics, parseWindowInterval } from '../../src/services/metrics_service.js';

test('metrics_service unit tests', async (t) => {
  const orgId = crypto.randomUUID();

  t.before(async () => {
    // Seed org and payment_requests
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      orgId,
      'Metrics Org',
      `metrics-${orgId.slice(0, 8)}`,
    ]);

    const agentId = crypto.randomUUID();
    await pool.query('INSERT INTO agents (id, org_id, name, status) VALUES ($1, $2, $3, $4)', [
      agentId,
      orgId,
      'Metrics Agent',
      'ACTIVE',
    ]);

    // Insert 1 approved payout
    await pool.query(`
      INSERT INTO payment_requests (
        id, org_id, agent_id, action, status, amount_minor, currency, decision, agent_idempotency_key
      ) VALUES ($1, $2, $3, 'PAYOUT', 'RECONCILED', 5000, 'USD', 'AUTO_APPROVE', 'idem-1')
    `, [crypto.randomUUID(), orgId, agentId]);

    // Insert 1 rejected payout
    await pool.query(`
      INSERT INTO payment_requests (
        id, org_id, agent_id, action, status, amount_minor, currency, decision, agent_idempotency_key
      ) VALUES ($1, $2, $3, 'PAYOUT', 'REJECTED', 3000, 'USD', 'REJECT', 'idem-2')
    `, [crypto.randomUUID(), orgId, agentId]);

    // Insert 1 pending refund
    await pool.query(`
      INSERT INTO payment_requests (
        id, org_id, agent_id, action, status, amount_minor, currency, decision, agent_idempotency_key
      ) VALUES ($1, $2, $3, 'REFUND', 'PENDING_APPROVAL', 2000, 'USD', 'REQUIRE_APPROVAL', 'idem-3')
    `, [crypto.randomUUID(), orgId, agentId]);
  });

  t.after(async () => {
    await pool.query('DELETE FROM payment_requests WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM agents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  await t.test('test_tenant_metrics_aggregation', async () => {
    const res = await getTenantMetrics(orgId, '1h');
    assert.equal(res.org_id, orgId);
    assert.equal(res.window, '1h');
    assert.equal(res.metrics.requests_total, 3);
    assert.equal(res.metrics.payouts_total, 2);
    assert.equal(res.metrics.payouts_success, 1);
    assert.equal(res.metrics.payouts_failed, 1);
    assert.equal(res.metrics.decisions_total, 3);
    assert.equal(res.metrics.decisions_approved, 1);
    assert.equal(res.metrics.decisions_rejected, 1);
    assert.equal(res.metrics.decisions_pending_approval, 1);
    assert.ok(res.generated_at);
  });

  await t.test('test_tenant_metrics_window', async () => {
    assert.equal(parseWindowInterval('15m'), '15 minutes');
    assert.equal(parseWindowInterval('1h'), '1 hour');
    assert.equal(parseWindowInterval('24h'), '24 hours');
    assert.equal(parseWindowInterval('7d'), '7 days');
    assert.equal(parseWindowInterval('30d'), '30 days');
    assert.equal(parseWindowInterval('unknown'), '1 hour');

    const res = await getTenantMetrics(orgId, '24h');
    assert.equal(res.window, '24h');
    assert.equal(res.metrics.requests_total, 3);
  });
});
