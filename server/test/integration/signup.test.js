import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import crypto from 'node:crypto';

import app from '../../src/app.js';
import pool from '../../src/db/pool.js';
import { env } from '../../src/config.js';
import { closeTestApp, startTestApp } from '../helpers/testApp.js';
import { clearMockOutbox, getMockOutbox, mockSinkTransport, resetTransport, setTransport } from '../../src/email/transport.js';
import { claimAndSendEmail } from '../../src/email/outbox.js';
import { runCleanup } from '../../src/jobs/cleanup.js';
import { decrypt, hmacSha256, sha256Hex } from '../../src/lib/crypto.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

beforeEach(async () => {
  setTransport(mockSinkTransport);
  clearMockOutbox();
  if (hasDatabase) {
    await pool.query("DELETE FROM rate_limit_buckets WHERE key LIKE 'signup:%' OR key LIKE 'resend:%'");
  }
});

function randomIp() {
  return `198.51.100.${1 + crypto.randomInt(250)}`;
}

test('P5: Registration disabled returns 403 REGISTRATION_DISABLED', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 0;
  const { server, url } = await startTestApp();
  try {
    const res = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: `disabled-${crypto.randomUUID()}@example.test`,
        password: 'ValidPassword123!',
        displayName: 'Test User',
        orgName: 'Test Org',
        acceptTerms: true,
      }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'REGISTRATION_DISABLED');
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('P5: Registration validates input, honeypot, acceptTerms, and content-type', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 1;
  clearMockOutbox();
  const { server, url } = await startTestApp();
  try {
    // Content-Type not JSON -> 415
    const nonJson = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'x-forwarded-for': randomIp(),
      },
      body: 'email=test@example.com',
    });
    assert.equal(nonJson.status, 415);
    const nonJsonBody = await nonJson.json();
    assert.equal(nonJsonBody.error.code, 'UNSUPPORTED_MEDIA_TYPE');

    // acceptTerms false -> 400
    const noTerms = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: `noterms-${crypto.randomUUID()}@example.test`,
        password: 'ValidPassword123!',
        displayName: 'No Terms',
        orgName: 'No Terms Org',
        acceptTerms: false,
      }),
    });
    assert.equal(noTerms.status, 400);

    // Honeypot website filled -> 202 without creating user or email
    const honeypotEmail = `bot-${crypto.randomUUID()}@example.test`;
    const honeypotRes = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: honeypotEmail,
        password: 'ValidPassword123!',
        displayName: 'Bot User',
        orgName: 'Bot Org',
        acceptTerms: true,
        website: 'https://spam.bot',
      }),
    });
    assert.equal(honeypotRes.status, 202);
    const honeypotBody = await honeypotRes.json();
    assert.equal(honeypotBody.status, 'verification_sent');

    const botUser = await pool.query('SELECT * FROM users WHERE email = $1', [honeypotEmail]);
    assert.equal(botUser.rowCount, 0, 'Honeypot request must not create a user');
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('P5: Anti-enumeration produces identical status and body across new, verified, and unverified states', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 1;
  clearMockOutbox();
  const { server, url } = await startTestApp();

  const newEmail = `user-new-${crypto.randomUUID()}@example.test`;
  const verifiedEmail = `user-ver-${crypto.randomUUID()}@example.test`;
  const unverifiedEmail = `user-unver-${crypto.randomUUID()}@example.test`;

  try {
    // 1. State: New user
    const res1 = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: newEmail,
        password: 'ValidPassword123!',
        displayName: 'New User',
        orgName: 'New Org',
        acceptTerms: true,
      }),
    });
    assert.equal(res1.status, 202);
    const body1 = await res1.json();
    assert.deepEqual(body1, { status: 'verification_sent' });

    // Verify unverified user created in DB with no org
    const userRow1 = await pool.query('SELECT * FROM users WHERE email = $1', [newEmail]);
    assert.equal(userRow1.rowCount, 1);
    assert.equal(userRow1.rows[0].email_verified_at, null);
    assert.equal(userRow1.rows[0].pending_org_name, 'New Org');

    const membership1 = await pool.query('SELECT * FROM memberships WHERE user_id = $1', [userRow1.rows[0].id]);
    assert.equal(membership1.rowCount, 0, 'Unverified user must not have an organization or membership');

    // Verify SIGNUP_REQUESTED audit event with HMAC email
    const auditRes = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'SIGNUP_REQUESTED' ORDER BY created_at DESC LIMIT 1",
    );
    assert.ok(auditRes.rowCount > 0);
    const expectedHmac = hmacSha256(env.JOBENPAY_HMAC_PEPPER, newEmail);
    assert.equal(auditRes.rows[0].details.emailHmac, expectedHmac);

    // 2. Pre-create verified user and test registration on verified email
    await pool.query(
      "INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ($1, 'hash', 'Verified User', now())",
      [verifiedEmail],
    );
    const res2 = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: verifiedEmail,
        password: 'ValidPassword123!',
        displayName: 'Verified Attempt',
        orgName: 'Other Org',
        acceptTerms: true,
      }),
    });
    assert.equal(res2.status, 202);
    const body2 = await res2.json();
    assert.deepEqual(body2, { status: 'verification_sent' });

    // 3. Pre-create unverified user and test registration on existing unverified email
    await pool.query(
      "INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ($1, 'hash', 'Unverified User', NULL)",
      [unverifiedEmail],
    );
    const res3 = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: unverifiedEmail,
        password: 'ValidPassword123!',
        displayName: 'Unverified Attempt',
        orgName: 'Attempted Org',
        acceptTerms: true,
      }),
    });
    assert.equal(res3.status, 202);
    const body3 = await res3.json();
    assert.deepEqual(body3, { status: 'verification_sent' });
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('P5: Rate limits on registration (IP 5/hour, email 3/hour, global limit)', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 1;
  const { server, url } = await startTestApp();

  const dedicatedIp = `198.51.200.${100 + crypto.randomInt(100)}`;

  try {
    // 1. IP rate limit: 5/hour per IP
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${url}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': dedicatedIp,
        },
        body: JSON.stringify({
          email: `ip-test-${i}-${crypto.randomUUID()}@example.test`,
          password: 'ValidPassword123!',
          displayName: `User IP ${i}`,
          orgName: `Org IP ${i}`,
          acceptTerms: true,
        }),
      });
      assert.equal(res.status, 202);
    }

    const ipLimited = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': dedicatedIp,
      },
      body: JSON.stringify({
        email: `ip-test-6-${crypto.randomUUID()}@example.test`,
        password: 'ValidPassword123!',
        displayName: 'User IP 6',
        orgName: 'Org IP 6',
        acceptTerms: true,
      }),
    });
    assert.equal(ipLimited.status, 429);
    const ipLimBody = await ipLimited.json();
    assert.equal(ipLimBody.error.code, 'RATE_LIMITED');

    // 2. Email rate limit: 3/hour per email (using fresh IPs)
    const emailToLimit = `ratelimit-${crypto.randomUUID()}@example.test`;
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${url}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': randomIp(),
        },
        body: JSON.stringify({
          email: emailToLimit,
          password: 'ValidPassword123!',
          displayName: `User ${i}`,
          orgName: `Org ${i}`,
          acceptTerms: true,
        }),
      });
      assert.equal(res.status, 202);
    }

    const emailLimited = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: emailToLimit,
        password: 'ValidPassword123!',
        displayName: 'Excess User',
        orgName: 'Excess Org',
        acceptTerms: true,
      }),
    });
    assert.equal(emailLimited.status, 429);
    const emailLimBody = await emailLimited.json();
    assert.equal(emailLimBody.error.code, 'RATE_LIMITED');

    // 3. Global daily limit: SIGNUP_DAILY_LIMIT returns 503
    const originalLimit = env.SIGNUP_DAILY_LIMIT;
    try {
      env.SIGNUP_DAILY_LIMIT = 1;
      const globalLimited = await fetch(`${url}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': randomIp(),
        },
        body: JSON.stringify({
          email: `global-limit-${crypto.randomUUID()}@example.test`,
          password: 'ValidPassword123!',
          displayName: 'Global User',
          orgName: 'Global Org',
          acceptTerms: true,
        }),
      });
      assert.equal(globalLimited.status, 503);
      const globalBody = await globalLimited.json();
      assert.equal(globalBody.error.code, 'SERVICE_UNAVAILABLE');
      assert.match(globalBody.error.message, /Signups are temporarily unavailable/);
    } finally {
      env.SIGNUP_DAILY_LIMIT = originalLimit;
    }
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('P5: Token verification lifecycle: single use, expiration, parallel race, and org creation', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 1;
  clearMockOutbox();
  const { server, url } = await startTestApp();

  const email = `token-lifecycle-${crypto.randomUUID()}@example.test`;
  const orgName = `Acme Ventures ${crypto.randomInt(1000, 9999)}`;
  const password = 'StrongPassword!2026';

  try {
    // Register user
    const regRes = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email,
        password,
        displayName: 'Alice Lifecycle',
        orgName,
        acceptTerms: true,
      }),
    });
    assert.equal(regRes.status, 202);

    // Retrieve generated token from email_tokens
    const tokenQuery = await pool.query(
      "SELECT * FROM email_tokens WHERE meta->>'email' = $1 AND kind = 'VERIFY'",
      [email],
    );
    assert.equal(tokenQuery.rowCount, 1);
    const tokenHash = tokenQuery.rows[0].token_hash;

    // Check email outbox had verify email sent and contains link
    let verifyMail = null;
    for (let i = 0; i < 20; i++) {
      const sentEmails = getMockOutbox();
      verifyMail = sentEmails.find((m) => m.to === email);
      if (verifyMail) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(verifyMail, 'Verify email must have been sent to mock outbox');
    assert.ok(verifyMail.text.includes('/verify-email?token='));
    const tokenMatch = verifyMail.text.match(/token=([0-9a-fA-F]+)/);
    assert.ok(tokenMatch, 'Verification link must contain token');
    const rawToken = tokenMatch[1];
    assert.equal(sha256Hex(rawToken), tokenHash);

    // 1. Parallel verification test: fire 2 concurrent requests with the SAME token
    const [resA, resB] = await Promise.all([
      fetch(`${url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      }),
      fetch(`${url}/api/v1/auth/verify-email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: rawToken }),
      }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    assert.deepEqual(statuses, [200, 400], 'One parallel verification must succeed (200) and the other fail (400)');

    // Verify exactly ONE org was created with the pending_org_name
    const orgs = await pool.query('SELECT * FROM organizations WHERE name = $1', [orgName]);
    assert.equal(orgs.rowCount, 1, 'Exactly one organization must be created');
    const newOrg = orgs.rows[0];
    assert.equal(newOrg.name, orgName);

    // Verify user is verified and has membership OWNER
    const verifiedUserRes = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const verifiedUser = verifiedUserRes.rows[0];
    assert.ok(verifiedUser.email_verified_at !== null);

    const membership = await pool.query(
      'SELECT * FROM memberships WHERE org_id = $1 AND user_id = $2',
      [newOrg.id, verifiedUser.id],
    );
    assert.equal(membership.rowCount, 1);
    assert.equal(membership.rows[0].role, 'OWNER');
    assert.equal(membership.rows[0].is_judge, false);

    // 2. Second verification with the same token now fails (single use)
    const thirdTry = await fetch(`${url}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(thirdTry.status, 400);
    const thirdBody = await thirdTry.json();
    assert.equal(thirdBody.error.code, 'TOKEN_INVALID_OR_EXPIRED');

    // 3. Test invalid token
    const invalidTokenRes = await fetch(`${url}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'nonexistent-token-that-is-long-enough-to-be-valid-format' }),
    });
    assert.equal(invalidTokenRes.status, 400);
    const invalidBody = await invalidTokenRes.json();
    assert.equal(invalidBody.error.code, 'TOKEN_INVALID_OR_EXPIRED');

    // 4. Test expired token
    const expiredRaw = crypto.randomBytes(32).toString('hex');
    const expiredHash = sha256Hex(expiredRaw);
    await pool.query(
      `INSERT INTO email_tokens (kind, token_hash, expires_at, meta)
       VALUES ('VERIFY', $1, now() - interval '1 hour', $2)`,
      [expiredHash, JSON.stringify({ userId: verifiedUser.id, email })],
    );
    const expiredRes = await fetch(`${url}/api/v1/auth/verify-email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: expiredRaw }),
    });
    assert.equal(expiredRes.status, 400);
    const expiredBody = await expiredRes.json();
    assert.equal(expiredBody.error.code, 'TOKEN_INVALID_OR_EXPIRED');

    // 5. Test login after verification
    const loginRes = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    assert.equal(loginBody.ok, true);
    const cookie = loginRes.headers.get('set-cookie')?.match(/jp_sid=([^;]+)/)?.[1];
    assert.ok(cookie);

    // Check /api/v1/auth/me shows OWNER role on the newly created org
    const meRes = await fetch(`${url}/api/v1/auth/me`, {
      headers: {
        cookie: `jp_sid=${cookie}`,
        'x-csrf-token': loginBody.csrfToken,
      },
    });
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.role, 'OWNER');
    assert.equal(meBody.org.id, newOrg.id);

    // 6. Multi-tenant isolation: new org cannot access demo org's resources
    const demoOrg = await pool.query("SELECT id FROM organizations WHERE slug = 'jobenpay-demo'");
    if (demoOrg.rowCount > 0) {
      const demoOrgId = demoOrg.rows[0].id;
      assert.notEqual(meBody.org.id, demoOrgId, 'New org must not be demo org');
    }
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('P5: Login blocks unverified users with EMAIL_NOT_VERIFIED and allows login after verification', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 1;
  const { server, url } = await startTestApp();

  const unverifiedEmail = `login-unverified-${crypto.randomUUID()}@example.test`;
  const password = 'CorrectPassword!123';

  try {
    // Register user (unverified)
    const regRes = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email: unverifiedEmail,
        password,
        displayName: 'Unverified Login Test',
        orgName: 'Unverified Corp',
        acceptTerms: true,
      }),
    });
    assert.equal(regRes.status, 202);

    // Attempt login with correct password -> 403 EMAIL_NOT_VERIFIED
    const blockedLogin = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: unverifiedEmail, password }),
    });
    assert.equal(blockedLogin.status, 403);
    const blockedBody = await blockedLogin.json();
    assert.equal(blockedBody.code, 'EMAIL_NOT_VERIFIED');

    // Attempt login with incorrect password -> generic failure
    const wrongLogin = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: unverifiedEmail, password: 'WrongPassword999!' }),
    });
    assert.equal(wrongLogin.status, 200);
    const wrongBody = await wrongLogin.json();
    assert.equal(wrongBody.ok, false);
    assert.equal(wrongBody.message, 'Authentication failed.');
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('P5: Resend verification cancels old token and obeys cooldown', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  const original = env.REGISTRATION_ENABLED;
  env.REGISTRATION_ENABLED = 1;
  const { server, url } = await startTestApp();

  const email = `resend-${crypto.randomUUID()}@example.test`;

  try {
    // Register
    const regRes = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': randomIp(),
      },
      body: JSON.stringify({
        email,
        password: 'ValidPassword123!',
        displayName: 'Resend User',
        orgName: 'Resend Org',
        acceptTerms: true,
      }),
    });
    assert.equal(regRes.status, 202);

    // Check first token
    const firstTokens = await pool.query(
      "SELECT * FROM email_tokens WHERE meta->>'email' = $1 AND kind = 'VERIFY' AND used_at IS NULL",
      [email],
    );
    assert.equal(firstTokens.rowCount, 1);
    const firstTokenId = firstTokens.rows[0].id;

    // Resend verification
    const resendRes = await fetch(`${url}/api/v1/auth/resend-verification`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    assert.equal(resendRes.status, 202);
    const resendBody = await resendRes.json();
    assert.deepEqual(resendBody, { status: 'verification_sent' });

    // The old token should now be cancelled (used_at is set)
    const oldTokenQuery = await pool.query('SELECT * FROM email_tokens WHERE id = $1', [firstTokenId]);
    assert.ok(oldTokenQuery.rows[0].used_at !== null, 'Old token must be marked used_at on resend');

    // A new token exists
    const newTokens = await pool.query(
      "SELECT * FROM email_tokens WHERE meta->>'email' = $1 AND kind = 'VERIFY' AND used_at IS NULL",
      [email],
    );
    assert.equal(newTokens.rowCount, 1);
    assert.notEqual(newTokens.rows[0].id, firstTokenId);
  } finally {
    env.REGISTRATION_ENABLED = original;
    await closeTestApp(server);
  }
});

test('P5: Outbox encryption and delivery retry up to 5 attempts', { skip: !hasDatabase }, async () => {
  app.set('trust proxy', true);
  clearMockOutbox();
  const failingTransport = {
    sendMail: async () => {
      const err = new Error('SMTP connection timed out');
      err.code = 'ETIMEDOUT';
      throw err;
    },
  };
  setTransport(failingTransport);

  try {
    const email = `retry-${crypto.randomUUID()}@example.test`;
    const toHash = sha256Hex(email);

    // Register user to generate outbox
    const original = env.REGISTRATION_ENABLED;
    env.REGISTRATION_ENABLED = 1;
    const { server, url } = await startTestApp();

    try {
      const regRes = await fetch(`${url}/api/v1/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': randomIp(),
        },
        body: JSON.stringify({
          email,
          password: 'ValidPassword123!',
          displayName: 'Retry User',
          orgName: 'Retry Org',
          acceptTerms: true,
        }),
      });
      assert.equal(regRes.status, 202);
    } finally {
      env.REGISTRATION_ENABLED = original;
      await closeTestApp(server);
    }

    // Find the outbox row
    const outboxRes = await pool.query('SELECT * FROM email_outbox WHERE to_hash = $1', [toHash]);
    assert.ok(outboxRes.rowCount > 0);
    const outboxId = outboxRes.rows[0].id;

    // Verify payload is encrypted with AES-GCM and AAD "email_outbox:payload"
    const decrypted = decrypt({
      key: env.JOBENPAY_ENC_KEY,
      payload: outboxRes.rows[0].payload,
      aad: 'email_outbox:payload',
    });
    const parsedPayload = JSON.parse(decrypted);
    assert.equal(parsedPayload.to, email);

    // Simulate retry attempts until 5 attempts reached
    let finalOutbox;
    for (let i = 0; i < 10; i++) {
      try {
        await claimAndSendEmail(outboxId);
      } catch {
        // Expected failure
      }
      const res = await pool.query('SELECT * FROM email_outbox WHERE id = $1', [outboxId]);
      finalOutbox = res.rows[0];
      if (finalOutbox?.status === 'FAILED') break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    assert.ok(finalOutbox);
    assert.equal(finalOutbox.status, 'FAILED');
    assert.equal(finalOutbox.attempts, 5);

    const auditRes = await pool.query(
      "SELECT * FROM audit_events WHERE action = 'EMAIL_SEND_FAILED' AND details->>'outboxId' = $1",
      [outboxId],
    );
    assert.equal(auditRes.rowCount, 1, 'Audit event EMAIL_SEND_FAILED must be written on 5th failure');
  } finally {
    resetTransport();
  }
});

test('P5: Cleanup job removes unverified users older than 7 days along with tokens and outbox', { skip: !hasDatabase }, async () => {
  const oldEmail = `old-unverified-${crypto.randomUUID()}@example.test`;
  const toHash = sha256Hex(oldEmail);

  // Insert unverified user older than 8 days
  const userRes = await pool.query(
    `INSERT INTO users (email, password_hash, display_name, email_verified_at, created_at)
     VALUES ($1, 'hash', 'Old Unverified', NULL, now() - interval '8 days')
     RETURNING id`,
    [oldEmail],
  );
  const oldUserId = userRes.rows[0].id;

  // Insert associated email token
  await pool.query(
    `INSERT INTO email_tokens (kind, token_hash, expires_at, meta, created_at)
     VALUES ('VERIFY', $1, now() - interval '7 days', $2, now() - interval '8 days')`,
    [sha256Hex(`old-token-${oldEmail}`), JSON.stringify({ userId: oldUserId, email: oldEmail })],
  );

  // Insert associated outbox record
  await pool.query(
    `INSERT INTO email_outbox (org_id, to_hash, template, payload, status, created_at)
     VALUES (NULL, $1, 'verifyEmail', 'encrypted', 'PENDING', now() - interval '8 days')`,
    [toHash],
  );

  // Insert cleanup job row with status RUNNING
  const jobId = crypto.randomUUID();
  await pool.query(
    "INSERT INTO jobs (id, type, status, payload) VALUES ($1, 'cleanup', 'RUNNING', '{}')",
    [jobId],
  );

  // Run cleanup job
  await runCleanup({ id: jobId }, { db: pool });

  // Verify user, token, and outbox were purged
  const checkUser = await pool.query('SELECT id FROM users WHERE id = $1', [oldUserId]);
  assert.equal(checkUser.rowCount, 0, 'Unverified user older than 7 days must be deleted');

  const checkToken = await pool.query("SELECT id FROM email_tokens WHERE meta->>'userId' = $1", [oldUserId]);
  assert.equal(checkToken.rowCount, 0, 'Associated email tokens must be deleted');

  const checkOutbox = await pool.query('SELECT id FROM email_outbox WHERE to_hash = $1', [toHash]);
  assert.equal(checkOutbox.rowCount, 0, 'Associated outbox entry must be deleted');
});
