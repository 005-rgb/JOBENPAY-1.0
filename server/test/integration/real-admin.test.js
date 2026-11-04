import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { runMigrations } from '../../scripts/migrate.js';
import { hashPassword, sha256Hex } from '../../src/lib/crypto.js';

const connectionString = process.env.TEST_DATABASE_URL;
const hasDatabaseEnv = Boolean(connectionString);
const helperScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../helpers/paypalAppChild.js');
const encryptionKey = Buffer.alloc(32, 7).toString('base64');
const password = 'TestPassword123!';

function waitForPort(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`App did not start. Output: ${output}`)), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/PAYPAL_APP_PORT:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (code !== null) {
        clearTimeout(timer);
        reject(new Error(`App child exited with code ${code}. Output: ${output}`));
      }
    });
  });
}

async function createSession(db, { orgId, role, email, isJudge = false }) {
  const passwordHash = await hashPassword(password);
  const user = await db.query(
    'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
    [email, passwordHash, role],
  );
  const actualUserId = user.rows[0].id;
  await db.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, actualUserId, role, isJudge],
  );
  const cookie = randomUUID() + randomUUID();
  const csrfToken = randomUUID();
  const sessionResult = await db.query(`
    INSERT INTO sessions (id_hash, user_id, current_org_id, csrf_secret, expires_at)
    VALUES ($1, $2, $3, $4, now() + interval '1 hour')
    RETURNING id
  `, [sha256Hex(cookie), actualUserId, orgId, csrfToken]);
  return { cookie, csrfToken, userId: actualUserId, sessionId: sessionResult.rows[0].id };
}

function requestHeaders(session, extra = {}) {
  return {
    cookie: `jp_sid=${session.cookie}`,
    'x-csrf-token': session.csrfToken,
    ...extra,
  };
}

test('Real-admin preflight and evidence routes enforce RBAC (403 for non-OWNER/JUDGE) and tenant scoping (404 for other org)', {
  skip: !hasDatabaseEnv,
}, async () => {
  const schema = `real_admin_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const isolatedUrl = new URL(connectionString);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema},public`);
  const isolatedConnectionString = isolatedUrl.toString();
  const db = new pg.Pool({ connectionString: isolatedConnectionString });

  let appProcess;
  let appOutput = '';
  let appStderr = '';

  try {
    await runMigrations(isolatedConnectionString);

    // Setup Org A and Org B
    const orgIdA = randomUUID();
    const orgIdB = randomUUID();
    await db.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgIdA, 'Org A', 'jobenpay-demo']);
    await db.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgIdB, 'Org B', 'org-b']);

    const ownerA = await createSession(db, { orgId: orgIdA, role: 'OWNER', email: 'owner.a@test.com' });
    const judgeA = await createSession(db, { orgId: orgIdA, role: 'OWNER', email: 'judge.a@test.com', isJudge: true });
    const viewerA = await createSession(db, { orgId: orgIdA, role: 'VIEWER', email: 'viewer.a@test.com' });
    const ownerB = await createSession(db, { orgId: orgIdB, role: 'OWNER', email: 'owner.b@test.com' });

    // Seed agent, agent key, and payment request in Org A
    const agentRes = await db.query(
      `INSERT INTO agents (org_id, name, status) VALUES ($1, 'Agent A', 'ACTIVE') RETURNING id`,
      [orgIdA],
    );
    const agentId = agentRes.rows[0].id;

    const requestRes = await db.query(`
      INSERT INTO payment_requests (org_id, agent_id, action, status, amount_minor, currency, request_hash)
      VALUES ($1, $2, 'PAYOUT', 'RECONCILED', 100, 'USD', 'hash123')
      RETURNING id
    `, [orgIdA, agentId]);
    const requestIdA = requestRes.rows[0].id;

    // Spawn server child process
    appProcess = spawn(process.execPath, [helperScript], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: isolatedConnectionString,
        JOBENPAY_ENC_KEY: encryptionKey,
        PUBLIC_BASE_URL: 'https://jobenpay.test',
        WORKER_ENABLED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    appProcess.stdout.setEncoding('utf8');
    appProcess.stdout.on('data', (chunk) => { appOutput += chunk; });
    appProcess.stderr.setEncoding('utf8');
    appProcess.stderr.on('data', (chunk) => { appStderr += chunk; });

    const port = await waitForPort(appProcess);
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Preflight RBAC tests
    // OWNER should succeed (200)
    const ownerPreflight = await fetch(`${baseUrl}/api/v1/admin/real-preflight`, {
      headers: requestHeaders(ownerA),
    });
    assert.equal(ownerPreflight.status, 200);
    const preflightBody = await ownerPreflight.json();
    assert.ok(Array.isArray(preflightBody.checks));
    assert.equal(preflightBody.checks.length, 12);

    // JUDGE should succeed (200)
    const judgePreflight = await fetch(`${baseUrl}/api/v1/admin/real-preflight`, {
      headers: requestHeaders(judgeA),
    });
    assert.equal(judgePreflight.status, 200);

    // VIEWER should be forbidden (403)
    const viewerPreflight = await fetch(`${baseUrl}/api/v1/admin/real-preflight`, {
      headers: requestHeaders(viewerA),
    });
    assert.equal(viewerPreflight.status, 403);

    // 2. Evidence Export RBAC & Tenant Scoping tests
    // OWNER of Org A should succeed (200)
    const ownerEvidence = await fetch(`${baseUrl}/api/v1/admin/evidence/${requestIdA}`, {
      headers: requestHeaders(ownerA),
    });
    assert.equal(ownerEvidence.status, 200);
    assert.match(ownerEvidence.headers.get('content-disposition') || '', /attachment; filename="evidence-/);
    const evidenceBody = await ownerEvidence.json();
    assert.equal(evidenceBody.request.id, requestIdA);
    assert.ok(evidenceBody.timings);
    assert.ok(evidenceBody.meta);

    // JUDGE of Org A should succeed (200)
    const judgeEvidence = await fetch(`${baseUrl}/api/v1/admin/evidence/${requestIdA}`, {
      headers: requestHeaders(judgeA),
    });
    assert.equal(judgeEvidence.status, 200);

    // VIEWER of Org A should be forbidden (403)
    const viewerEvidence = await fetch(`${baseUrl}/api/v1/admin/evidence/${requestIdA}`, {
      headers: requestHeaders(viewerA),
    });
    assert.equal(viewerEvidence.status, 403);

    // OWNER of Org B attempting to access Org A request should get 404 (cross-tenant isolation)
    const crossTenantEvidence = await fetch(`${baseUrl}/api/v1/admin/evidence/${requestIdA}`, {
      headers: requestHeaders(ownerB),
    });
    assert.equal(crossTenantEvidence.status, 404);

    // Non-existent request should get 404
    const notFoundEvidence = await fetch(`${baseUrl}/api/v1/admin/evidence/${randomUUID()}`, {
      headers: requestHeaders(ownerA),
    });
    assert.equal(notFoundEvidence.status, 404);
  } finally {
    if (appProcess && !appProcess.killed) {
      appProcess.kill('SIGTERM');
    }
    await db.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
