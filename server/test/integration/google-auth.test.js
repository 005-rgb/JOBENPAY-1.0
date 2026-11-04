import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import crypto from 'node:crypto';

import app from '../../src/app.js';
import pool from '../../src/db/pool.js';
import { env } from '../../src/config.js';
import { closeTestApp, startTestApp } from '../helpers/testApp.js';
import { clearMockOutbox, getMockOutbox, mockSinkTransport, setTransport } from '../../src/email/transport.js';
import { createUnverifiedUser } from '../../src/repositories/users.js';
import { createMembership } from '../../src/repositories/memberships.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

beforeEach(async () => {
  setTransport(mockSinkTransport);
  clearMockOutbox();
  if (hasDatabase) {
    await pool.query("DELETE FROM rate_limit_buckets WHERE key LIKE 'google:%' OR key LIKE 'signup:%'");
  }
});

function randomIp() {
  return `198.51.100.${1 + crypto.randomInt(250)}`;
}

function createMockGoogleJwt(claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: env.GOOGLE_CLIENT_ID || 'mock-google-client-id',
    sub: `google-sub-${crypto.randomUUID()}`,
    email: `google-${crypto.randomUUID()}@google.test`,
    email_verified: true,
    name: 'Google Test User',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  })).toString('base64url');
  const signature = Buffer.from('sig').toString('base64url');
  return `${header}.${payload}.${signature}`;
}

test('Google Auth: Content-Type must be application/json', { skip: !hasDatabase }, async () => {
  const { server, url } = await startTestApp();
  try {
    const res = await fetch(`${url}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'invalid body',
    });
    assert.equal(res.status, 415);
  } finally {
    await closeTestApp(server);
  }
});

test('Google Auth: Validation rejects missing or short credential', { skip: !hasDatabase }, async () => {
  const { server, url } = await startTestApp();
  try {
    const res = await fetch(`${url}/api/v1/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential: 'short' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error?.code || body.code, 'VALIDATION_FAILED');
  } finally {
    await closeTestApp(server);
  }
});

test('Google Auth: Existing verified user can log in with Google', { skip: !hasDatabase }, async () => {
  const email = `verified-google-${crypto.randomUUID()}@google.test`;
  const token = createMockGoogleJwt({ email, name: 'Verified Google User' });

  // Create user and organization
  const user = await createUnverifiedUser(pool, {
    email,
    passwordHash: 'hash',
    displayName: 'Verified Google User',
    pendingOrgName: 'Existing Org',
  });
  await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [user.id]);
  const orgSlug = `existing-org-${crypto.randomBytes(4).toString('hex')}`;
  const orgRes = await pool.query(
    'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *',
    ['Existing Org', orgSlug],
  );
  const org = orgRes.rows[0];
  await createMembership(org.id, { userId: user.id, role: 'OWNER', isJudge: false });

  const { server, url } = await startTestApp();
  try {
    const res = await fetch(`${url}/api/v1/auth/google`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({ credential: token }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.isNewUser, false);
    assert.equal(body.user.email, email);
    assert.ok(body.csrfToken);

    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('jp_sid='));

    // Verify audit log
    const auditRes = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'LOGIN_GOOGLE' AND details->>'email' = $1",
      [email],
    );
    assert.equal(auditRes.rowCount, 1);
  } finally {
    await closeTestApp(server);
  }
});

test('Google Auth: Existing unverified user logging in via Google gets verified and org created', { skip: !hasDatabase }, async () => {
  const email = `unverified-google-${crypto.randomUUID()}@google.test`;
  const token = createMockGoogleJwt({ email, name: 'Unverified Google User' });

  const user = await createUnverifiedUser(pool, {
    email,
    passwordHash: 'hash',
    displayName: 'Unverified Google User',
    pendingOrgName: 'Pending Google Org',
  });
  // Ensure email_verified_at is NULL
  await pool.query('UPDATE users SET email_verified_at = NULL WHERE id = $1', [user.id]);

  const { server, url } = await startTestApp();
  try {
    const res = await fetch(`${url}/api/v1/auth/google`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({ credential: token }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.isNewUser, false);

    // Verify user is now verified in database
    const dbUserRes = await pool.query('SELECT * FROM users WHERE id = $1', [user.id]);
    assert.ok(dbUserRes.rows[0].email_verified_at !== null);

    // Verify organization was created from pending_org_name
    const orgRes = await pool.query('SELECT * FROM organizations WHERE name = $1', ['Pending Google Org']);
    assert.equal(orgRes.rowCount, 1);
  } finally {
    await closeTestApp(server);
  }
});

test('Google Auth: New user signing up with Google creates user, org, membership, and logs in immediately', { skip: !hasDatabase }, async () => {
  const email = `new-google-${crypto.randomUUID()}@google.test`;
  const token = createMockGoogleJwt({ email, name: 'Brand New Google User' });

  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 1;
  const { server, url } = await startTestApp();

  try {
    const res = await fetch(`${url}/api/v1/auth/google`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        credential: token,
        orgName: 'Acme Cloud Services',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.isNewUser, true);
    assert.equal(body.user.email, email);
    assert.equal(body.user.displayName, 'Brand New Google User');
    assert.ok(body.csrfToken);

    // Check cookie
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('jp_sid='));

    // Verify user in DB
    const dbUserRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    assert.equal(dbUserRes.rowCount, 1);
    const createdUser = dbUserRes.rows[0];
    assert.ok(createdUser.email_verified_at !== null, 'Google signup must be verified immediately');
    assert.ok(createdUser.terms_accepted_at !== null);

    // Verify organization in DB
    const dbOrgRes = await pool.query('SELECT * FROM organizations WHERE name = $1', ['Acme Cloud Services']);
    assert.equal(dbOrgRes.rowCount, 1);
    const createdOrg = dbOrgRes.rows[0];

    // Verify membership OWNER
    const membershipRes = await pool.query(
      'SELECT * FROM memberships WHERE org_id = $1 AND user_id = $2',
      [createdOrg.id, createdUser.id],
    );
    assert.equal(membershipRes.rowCount, 1);
    assert.equal(membershipRes.rows[0].role, 'OWNER');
    assert.equal(membershipRes.rows[0].is_judge, false);

    // Verify audit events
    const auditSignup = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'SIGNUP_GOOGLE' AND details->>'email' = $1",
      [email],
    );
    assert.equal(auditSignup.rowCount, 1);

    const auditOrg = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'ORG_CREATED' AND details->>'name' = $1",
      ['Acme Cloud Services'],
    );
    assert.equal(auditOrg.rowCount, 1);
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('Google Auth: New user registration is rejected when REGISTRATION_ENABLED is 0', { skip: !hasDatabase }, async () => {
  const email = `disabled-google-${crypto.randomUUID()}@google.test`;
  const token = createMockGoogleJwt({ email, name: 'Disabled Reg User' });

  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 0;
  const { server, url } = await startTestApp();

  try {
    const res = await fetch(`${url}/api/v1/auth/google`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({ credential: token }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error?.code || body.code, 'REGISTRATION_DISABLED');
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('Google Auth: Locked user account is rejected with 403', { skip: !hasDatabase }, async () => {
  const email = `locked-google-${crypto.randomUUID()}@google.test`;
  const token = createMockGoogleJwt({ email, name: 'Locked User' });

  const user = await createUnverifiedUser(pool, {
    email,
    passwordHash: 'hash',
    displayName: 'Locked User',
  });
  await pool.query('UPDATE users SET locked_until = now() + interval \'1 hour\' WHERE id = $1', [user.id]);

  const { server, url } = await startTestApp();
  try {
    const res = await fetch(`${url}/api/v1/auth/google`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({ credential: token }),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'FORBIDDEN');
    assert.equal(body.message, 'Account locked.');
  } finally {
    await closeTestApp(server);
  }
});
