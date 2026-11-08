// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';

test('WP1: SLO Endpoints Integration Test', async (t) => {
  const { server, url: baseUrl } = await startTestApp();

  t.after(async () => {
    await closeTestApp(server);
    await pool.end();
  });

  const orgId = crypto.randomUUID();
  const slug = `slo-org-${orgId.slice(0, 8)}`;
  await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'SLO Org', slug]);

  const userId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
    [userId, `owner-${slug}@jobenpay.test`, 'dummy-hash', 'SLO Owner']
  );
  await pool.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, userId, 'OWNER', false]
  );

  const csrfToken = crypto.randomUUID();
  const { token: sessionToken } = await createSession(orgId, {
    userId,
    currentOrgId: orgId,
    csrfSecret: csrfToken,
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
  });

  const headers = {
    'content-type': 'application/json',
    Cookie: `jp_sid=${sessionToken}`,
    'x-csrf-token': csrfToken,
  };

  await t.test('test_slo_endpoint: GET /api/v1/ops/slo mengembalikan 200 dan daftar 6 SLO', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ops/slo`, {
      method: 'GET',
      headers,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.slos), 'body.slos harus array');
    assert.strictEqual(body.slos.length, 6, 'Harus ada 6 SLO');
    assert.ok(body.generated_at, 'generated_at harus terisi');

    const doublePayout = body.slos.find((s) => s.id === 'slo_double_payout');
    assert.ok(doublePayout);
    assert.strictEqual(doublePayout.target, 1.0);
  });

  await t.test('test_slo_by_id_endpoint: GET /api/v1/ops/slo/:id mengembalikan 200 dengan history', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ops/slo/slo_decision_latency`, {
      method: 'GET',
      headers,
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.id, 'slo_decision_latency');
    assert.strictEqual(body.target, 0.95);
    assert.ok(Array.isArray(body.history));
    assert.strictEqual(body.history.length, 2);
  });
});

