// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { hashPassword } from '../../src/lib/crypto.js';

test('PayPal Environment Isolation & Dynamic Settings (PRD 3.0 Patch)', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  let sessionToken = '';
  let csrfToken = '';

  t.before(async () => {
    appInfo = await startTestApp();

    // 1. Create Organization & User
    await pool.query(
      `INSERT INTO organizations (id, name, slug, display_name, legal_name, billing_email)
       VALUES ($1, 'PayPal Test Org', $2, 'PayPal Test Org', 'PayPal Test Org Inc', 'paypal@test.cloud')`,
      [orgId, `paypal-test-${orgId.slice(0, 8)}`],
    );

    const pwdHash = await hashPassword('Password123!Safe');
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, 'PayPal Admin')`,
      [userId, `admin-${orgId.slice(0, 8)}@test.cloud`, pwdHash],
    );

    await pool.query(
      `INSERT INTO memberships (org_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [orgId, userId],
    );

    sessionToken = crypto.randomBytes(32).toString('hex');
    csrfToken = crypto.randomBytes(16).toString('hex');
    const idHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    await pool.query(
      `INSERT INTO sessions (id_hash, user_id, current_org_id, csrf_secret, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
      [idHash, userId, orgId, csrfToken],
    );
  });

  t.after(async () => {
    await pool.query('DELETE FROM payment_webhook_events WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM paypal_connections WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM memberships WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
  });

  let sbxWebhookToken = '';
  let liveWebhookToken = '';

  await t.test('1. GET /api/v1/paypal/credentials returns empty state for SANDBOX', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/paypal/credentials`, {
      headers: {
        cookie: `jp_sid=${sessionToken}`,
        'x-jobenpay-environment': 'SANDBOX',
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.environment, 'SANDBOX');
    assert.equal(body.client_id_masked, null);
    assert.equal(body.status, 'UNTESTED');
  });

  await t.test('2. PUT /api/v1/paypal/credentials saves credentials for SANDBOX environment', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/paypal/credentials`, {
      method: 'PUT',
      headers: {
        cookie: `jp_sid=${sessionToken}`,
        'x-csrf-token': csrfToken,
        'x-jobenpay-environment': 'SANDBOX',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: 'sbx_client_12345678',
        clientSecret: 'sbx_secret_abcdefgh',
        webhookId: 'WH-SBX-001',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.environment, 'SANDBOX');
    assert.equal(body.client_id_masked, '****5678');
    assert.ok(body.webhookUrl.includes('/api/v1/webhooks/sbx/paypal/'));
    sbxWebhookToken = body.webhookUrl.split('/paypal/')[1];
    assert.ok(sbxWebhookToken.length > 10);
  });

  await t.test('3. GET /api/v1/paypal/credentials for LIVE is isolated (still empty)', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/paypal/credentials`, {
      headers: {
        cookie: `jp_sid=${sessionToken}`,
        'x-jobenpay-environment': 'LIVE',
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.environment, 'LIVE');
    assert.equal(body.client_id_masked, null);
    assert.equal(body.status, 'UNTESTED');
  });

  await t.test('4. PUT /api/v1/paypal/credentials saves credentials for LIVE environment', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/paypal/credentials`, {
      method: 'PUT',
      headers: {
        cookie: `jp_sid=${sessionToken}`,
        'x-csrf-token': csrfToken,
        'x-jobenpay-environment': 'LIVE',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        clientId: 'live_client_87654321',
        clientSecret: 'live_secret_zyxwvuts',
        webhookId: 'WH-LIVE-002',
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.environment, 'LIVE');
    assert.equal(body.client_id_masked, '****4321');
    assert.ok(body.webhookUrl.includes('/api/v1/webhooks/live/paypal/'));
    liveWebhookToken = body.webhookUrl.split('/paypal/')[1];
    assert.ok(liveWebhookToken.length > 10);
    assert.notEqual(sbxWebhookToken, liveWebhookToken);
  });

  await t.test('5. Verify SANDBOX data remains intact and separate from LIVE data', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/paypal/credentials`, {
      headers: {
        cookie: `jp_sid=${sessionToken}`,
        'x-jobenpay-environment': 'SANDBOX',
      },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.environment, 'SANDBOX');
    assert.equal(body.client_id_masked, '****5678');
    assert.equal(body.webhookId, 'WH-SBX-001');
    assert.ok(body.webhookUrl.includes('/api/v1/webhooks/sbx/paypal/'));
  });

  await t.test('6. Webhooks routing: Sandbox webhook accepts Sandbox token', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/webhooks/sbx/paypal/${sbxWebhookToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-EVT-SBX-01',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'CAP-001' },
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.environment, 'SANDBOX');
  });

  await t.test('7. Webhooks routing: Sandbox webhook blocks Live token (Cross-Environment Blocked)', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/webhooks/sbx/paypal/${liveWebhookToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-EVT-SBX-02',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'CAP-002' },
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'CROSS_ENVIRONMENT_MUTATION_BLOCKED');
  });

  await t.test('8. Webhooks routing: Live webhook blocks Sandbox token (Cross-Environment Blocked)', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/webhooks/live/paypal/${sbxWebhookToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: 'WH-EVT-LIVE-01',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'CAP-003' },
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'CROSS_ENVIRONMENT_MUTATION_BLOCKED');
  });
});
