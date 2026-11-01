import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { closeTestApp, startTestApp } from './helpers/testApp.js';
import pool from '../src/db/pool.js';
import app from '../src/app.js';
import { runMigrations } from '../scripts/migrate.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

test('register endpoint returns REGISTRATION_DISABLED when disabled', async () => {
  const { server, url } = await startTestApp();
  try {
    const response = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@jobenpay.test', password: 'Password123!' }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'REGISTRATION_DISABLED');
  } finally {
    await closeTestApp(server);
  }
});

test('login flow is skipped without a configured test database', { skip: !hasDatabase }, async () => {
  const { server, url } = await startTestApp();
  try {
    const response = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@jobenpay.test', password: 'Password123!' }),
    });
    assert.ok(response.ok || response.status === 200);
  } finally {
    await closeTestApp(server);
  }
});

test('login permits 10 requests per IP per minute and rejects the 11th', { skip: !hasDatabase }, async () => {
  await runMigrations(process.env.TEST_DATABASE_URL);
  app.set('trust proxy', true);
  const { server, url } = await startTestApp();
  const sourceIp = `198.51.100.${1 + crypto.randomInt(254)}`;
  try {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await fetch(`${url}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': sourceIp,
        },
        body: JSON.stringify({ email: `missing-${crypto.randomUUID()}@example.test`, password: 'not-a-real-password' }),
      });
      assert.equal(response.status, 200);
    }
    const limited = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': sourceIp,
      },
      body: JSON.stringify({ email: 'missing@example.test', password: 'not-a-real-password' }),
    });
    assert.equal(limited.status, 429);
  } finally {
    app.set('trust proxy', false);
    await closeTestApp(server);
  }
});

test('authenticated session permits 300 API requests per minute and rejects the 301st', {
  skip: !hasDatabase,
}, async () => {
  await runMigrations(process.env.TEST_DATABASE_URL);
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const passwordHash = 'unused-in-this-session-limit-test';
  await pool.query(
    'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)',
    [orgId, 'Rate limit test', `rate-limit-${orgId}`],
  );
  await pool.query(
    'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
    [userId, `${orgId}@example.test`, passwordHash],
  );
  await pool.query(
    `INSERT INTO sessions (id, id_hash, user_id, current_org_id, csrf_secret, expires_at)
     VALUES ($1,$2,$3,$4,'csrf',now() + interval '1 hour')`,
    [sessionId, crypto.createHash('sha256').update(rawToken).digest('hex'), userId, orgId],
  );
  const { server, url } = await startTestApp();
  const originalNow = Date.now;
  try {
    Date.now = () => Date.UTC(2026, 10, 1, 0, 0, 0);
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const response = await fetch(`${url}/api/v1/developer/info`, {
        headers: { cookie: `jp_sid=${rawToken}` },
      });
      assert.equal(response.status, 200);
    }
    const limited = await fetch(`${url}/api/v1/developer/info`, {
      headers: { cookie: `jp_sid=${rawToken}` },
    });
    assert.equal(limited.status, 429);
  } finally {
    Date.now = originalNow;
    await closeTestApp(server);
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
  }
});
