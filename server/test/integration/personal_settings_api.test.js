// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pool } from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';
import { generateTotpCode } from '../../src/lib/totp.js';

async function setupTestUser(slugPrefix = 'personal-test') {
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const slug = `${slugPrefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  await pool.query(
    'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)',
    [orgId, `Org ${slugPrefix}`, slug]
  );
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, has_password, email_verified_at)
     VALUES ($1, $2, $3, $4, false, now())`,
    [userId, `user-${slug}@jobenpay.test`, 'dummy-oauth-hash', `User ${slugPrefix}`]
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36',
    ipAddress: '127.0.0.1',
  });

  return {
    orgId,
    userId,
    headers: {
      'content-type': 'application/json',
      'Cookie': `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
    },
  };
}

test('Personal Settings API Integration Tests', async (t) => {
  const { server, url } = await startTestApp();
  const auth = await setupTestUser('ps-test');

  t.after(async () => {
    await closeTestApp(server);
  });

  // 1. GET /api/v1/me/profile
  await t.test('GET /api/v1/me/profile returns authenticated user profile', async () => {
    const res = await fetch(`${url}/api/v1/me/profile`, {
      headers: auth.headers,
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.user.id, auth.userId);
    assert.equal(data.user.has_password, false);
    assert.equal(data.user.totp_enabled, false);
    assert.equal(data.user.role, 'OWNER');
    assert.ok(data.user.notification_preferences);
  });

  // 2. PATCH /api/v1/me/profile
  await t.test('PATCH /api/v1/me/profile updates display name and job title', async () => {
    const res = await fetch(`${url}/api/v1/me/profile`, {
      method: 'PATCH',
      headers: auth.headers,
      body: JSON.stringify({
        display_name: 'Lead Auditor Jane',
        job_title: 'Chief Compliance Officer',
        avatar_url: 'https://example.com/jane.png',
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.user.display_name, 'Lead Auditor Jane');
    assert.equal(data.user.job_title, 'Chief Compliance Officer');
    assert.equal(data.user.avatar_url, 'https://example.com/jane.png');
  });

  // 3. POST /api/v1/me/password
  await t.test('POST /api/v1/me/password creates local password for OAuth user and validates policy', async () => {
    // 3a. Rejects weak password
    const weakRes = await fetch(`${url}/api/v1/me/password`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        new_password: 'short',
      }),
    });
    assert.equal(weakRes.status, 400);

    // 3b. Creates local password
    const createRes = await fetch(`${url}/api/v1/me/password`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        new_password: 'Password123!',
      }),
    });
    assert.equal(createRes.status, 200);
    const createData = await createRes.json();
    assert.equal(createData.ok, true);
    assert.equal(createData.has_password, true);

    // 3c. Updating password now requires correct current_password
    const wrongCurrentRes = await fetch(`${url}/api/v1/me/password`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        current_password: 'WrongPassword!',
        new_password: 'NewPassword123!',
      }),
    });
    assert.equal(wrongCurrentRes.status, 400);

    // 3d. Successfully changes password with correct current_password
    const successRes = await fetch(`${url}/api/v1/me/password`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({
        current_password: 'Password123!',
        new_password: 'NewPassword456!',
      }),
    });
    assert.equal(successRes.status, 200);
  });

  // 4. POST /api/v1/me/2fa/setup & /verify & /disable
  await t.test('2FA Lifecycle: setup, verify with TOTP code, and disable', async () => {
    // Setup
    const setupRes = await fetch(`${url}/api/v1/me/2fa/setup`, {
      method: 'POST',
      headers: auth.headers,
    });
    assert.equal(setupRes.status, 200);
    const setupData = await setupRes.json();
    assert.ok(setupData.secret);
    assert.ok(setupData.otpauth_url);
    assert.ok(setupData.qr_svg.includes('<svg'));

    // Verify with invalid code
    const invalidVerifyRes = await fetch(`${url}/api/v1/me/2fa/verify`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ code: '000000' }),
    });
    assert.equal(invalidVerifyRes.status, 400);

    // Verify with valid code
    const validCode = generateTotpCode(setupData.secret);
    const verifyRes = await fetch(`${url}/api/v1/me/2fa/verify`, {
      method: 'POST',
      headers: auth.headers,
      body: JSON.stringify({ code: validCode }),
    });
    assert.equal(verifyRes.status, 200);
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.ok, true);
    assert.equal(verifyData.totp_enabled, true);

    // Disable 2FA
    const disableRes = await fetch(`${url}/api/v1/me/2fa/disable`, {
      method: 'POST',
      headers: auth.headers,
    });
    assert.equal(disableRes.status, 200);
    const disableData = await disableRes.json();
    assert.equal(disableData.ok, true);
    assert.equal(disableData.totp_enabled, false);
  });

  // 5. GET /api/v1/me/sessions & DELETE /api/v1/me/sessions
  await t.test('Sessions: lists active sessions and revokes other sessions', async () => {
    // Create a second session for the same user
    const secondSession = await createSession(auth.orgId, {
      userId: auth.userId,
      currentOrgId: auth.orgId,
      csrfSecret: 'csrf-2',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/605.1.15',
      ipAddress: '192.168.1.100',
    });

    // List sessions
    const listRes = await fetch(`${url}/api/v1/me/sessions`, {
      headers: auth.headers,
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.ok, true);
    assert.ok(listData.sessions.length >= 2);
    
    const current = listData.sessions.find((s) => s.is_current);
    assert.ok(current);
    assert.equal(current.browser, 'Google Chrome');

    // Revoke other sessions
    const revokeRes = await fetch(`${url}/api/v1/me/sessions`, {
      method: 'DELETE',
      headers: auth.headers,
    });
    assert.equal(revokeRes.status, 200);
    const revokeData = await revokeRes.json();
    assert.equal(revokeData.ok, true);
    assert.ok(revokeData.count >= 1);

    // Re-list sessions -> only current remains
    const reListRes = await fetch(`${url}/api/v1/me/sessions`, {
      headers: auth.headers,
    });
    const reListData = await reListRes.json();
    assert.equal(reListData.sessions.length, 1);
    assert.equal(reListData.sessions[0].is_current, true);
  });

  // 6. PATCH /api/v1/me/notifications
  await t.test('PATCH /api/v1/me/notifications updates notification toggles', async () => {
    const res = await fetch(`${url}/api/v1/me/notifications`, {
      method: 'PATCH',
      headers: auth.headers,
      body: JSON.stringify({
        email_approvals: false,
        inapp_security: true,
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.notification_preferences.email_approvals, false);
    assert.equal(data.notification_preferences.inapp_security, true);
  });
});

