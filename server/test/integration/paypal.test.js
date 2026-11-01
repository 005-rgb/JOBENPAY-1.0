import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { runMigrations } from '../../scripts/migrate.js';
import { hashPassword } from '../../src/lib/crypto.js';
import { sha256Hex } from '../../src/lib/crypto.js';
import { createFakePaypalServer } from '../helpers/fake-paypal.js';

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

async function readJson(response) {
  return response.json();
}

test('PayPal connection and webhook routes enforce credentials, signatures, deduplication, and rate limits', {
  skip: !hasDatabaseEnv,
}, async () => {
  const schema = `paypal_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const isolatedUrl = new URL(connectionString);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema},public`);
  const isolatedConnectionString = isolatedUrl.toString();
  const db = new pg.Pool({ connectionString: isolatedConnectionString });
  let fake;
  let appProcess;
  let appOutput = '';

  try {
    fake = await createFakePaypalServer();
    await runMigrations(isolatedConnectionString);
    const orgId = randomUUID();
    await db.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'PayPal tests', 'jobenpay-demo']);
    const owner = await createSession(db, { orgId, role: 'OWNER', email: 'owner@paypal.test' });
    const viewer = await createSession(db, { orgId, role: 'VIEWER', email: 'viewer@paypal.test' });
    const judge = await createSession(db, { orgId, role: 'OWNER', email: 'judge@paypal.test', isJudge: true });

    appProcess = spawn(process.execPath, [helperScript], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: isolatedConnectionString,
        JOBENPAY_ENC_KEY: encryptionKey,
        PAYPAL_API_BASE_OVERRIDE: fake.baseUrl,
        PUBLIC_BASE_URL: 'https://jobenpay.test',
        WORKER_ENABLED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    appProcess.stdout.setEncoding('utf8');
    appProcess.stdout.on('data', (chunk) => { appOutput += chunk; });
    appProcess.stderr.setEncoding('utf8');
    appProcess.stderr.on('data', (chunk) => { appOutput += chunk; });
    const port = await waitForPort(appProcess);
    const baseUrl = `http://127.0.0.1:${port}`;

    const judgeLoginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'judge@paypal.test', password }),
    });
    assert.equal(judgeLoginResponse.status, 200);
    const judgeLogin = await readJson(judgeLoginResponse);
    assert.equal(judgeLogin.ok, true);
    const judgeCookie = judgeLoginResponse.headers.get('set-cookie')?.match(/jp_sid=([^;]+)/)?.[1];
    assert.ok(judgeCookie);
    const authenticatedJudge = { cookie: judgeCookie, csrfToken: judgeLogin.csrfToken };
    const authenticatedJudgeMeResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: requestHeaders(authenticatedJudge),
    });
    const authenticatedJudgeMe = await readJson(authenticatedJudgeMeResponse);
    assert.equal(authenticatedJudgeMe.role, 'JUDGE');
    assert.equal(authenticatedJudgeMe.org.id, orgId);

    const ownerDashboard = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: requestHeaders(owner),
    });
    assert.ok((await readJson(ownerDashboard)).queue);
    const ownerQueue = await fetch(`${baseUrl}/api/v1/admin/queue`, {
      headers: requestHeaders(owner),
    });
    assert.equal(ownerQueue.status, 200);
    assert.ok(Object.hasOwn(await readJson(ownerQueue), 'depth'));
    const judgeQueue = await fetch(`${baseUrl}/api/v1/admin/queue`, {
      headers: requestHeaders(judge),
    });
    assert.equal(judgeQueue.status, 200);
    const viewerQueue = await fetch(`${baseUrl}/api/v1/admin/queue`, {
      headers: requestHeaders(viewer),
    });
    assert.equal(viewerQueue.status, 403);
    const viewerDashboard = await fetch(`${baseUrl}/api/v1/dashboard/summary`, {
      headers: requestHeaders(viewer),
    });
    assert.equal(Object.hasOwn(await readJson(viewerDashboard), 'queue'), false);

    const noConnection = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      headers: requestHeaders(owner),
    });
    assert.equal(noConnection.status, 200);
    assert.equal((await readJson(noConnection)).client_id_masked, null);

    const put = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      method: 'PUT',
      headers: requestHeaders(owner, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        webhookId: 'WEBHOOK-ID',
      }),
    });
    assert.equal(put.status, 200);
    const saved = await readJson(put);
    assert.equal(saved.status, 'UNTESTED');
    assert.equal(saved.client_id_masked, '****ient');
    assert.equal(saved.clientSecret, undefined);
    assert.equal(JSON.stringify(saved).includes('test-client'), false);
    assert.equal(JSON.stringify(saved).includes('test-secret'), false);
    assert.ok(saved.webhookUrl.startsWith('https://jobenpay.test/webhooks/paypal/'));
    const webhookToken = saved.webhookUrl.split('/').at(-1);
    assert.ok(webhookToken.length >= 40);

    const viewerConnection = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      headers: requestHeaders(viewer),
    });
    assert.equal((await readJson(viewerConnection)).webhookUrl, null);
    const judgeConnection = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      headers: requestHeaders(judge),
    });
    assert.equal((await readJson(judgeConnection)).webhookUrl, null);
    const judgeMe = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: requestHeaders(judge),
    });
    assert.equal((await readJson(judgeMe)).role, 'JUDGE');
    const judgeCredentialUpdate = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      method: 'PUT',
      headers: requestHeaders(judge, { 'content-type': 'application/json' }),
      body: JSON.stringify({ clientId: 'judge-client', clientSecret: 'judge-secret' }),
    });
    assert.equal(judgeCredentialUpdate.status, 403);

    const wrongPurposeGrantId = randomUUID();
    await db.query(
      `INSERT INTO step_up_grants (id, user_id, session_id, purpose, expires_at)
       VALUES ($1, $2, $3, 'ROTATE_CREDENTIALS', now() + interval '5 minutes')`,
      [wrongPurposeGrantId, judge.userId, judge.sessionId],
    );
    const wrongPurposeFreeze = await fetch(`${baseUrl}/api/v1/org/freeze`, {
      method: 'POST',
      headers: requestHeaders(judge, {
        'content-type': 'application/json',
        'x-step-up-grant': wrongPurposeGrantId,
      }),
      body: JSON.stringify({ purpose: 'ROTATE_CREDENTIALS' }),
    });
    assert.equal(wrongPurposeFreeze.status, 401);
    const unusedGrant = await db.query(
      'SELECT consumed_at FROM step_up_grants WHERE id = $1',
      [wrongPurposeGrantId],
    );
    assert.equal(unusedGrant.rows[0].consumed_at, null);
    const properPurposeGrantId = randomUUID();
    await db.query(
      `INSERT INTO step_up_grants (id, user_id, session_id, purpose, expires_at)
       VALUES ($1, $2, $3, 'FREEZE_TOGGLE', now() + interval '5 minutes')`,
      [properPurposeGrantId, judge.userId, judge.sessionId],
    );
    const validPurposeFreeze = await fetch(`${baseUrl}/api/v1/org/freeze`, {
      method: 'POST',
      headers: requestHeaders(judge, {
        'content-type': 'application/json',
        'x-step-up-grant': properPurposeGrantId,
      }),
      body: JSON.stringify({ purpose: 'ROTATE_CREDENTIALS' }),
    });
    assert.equal(validPurposeFreeze.status, 200);

    const stored = await db.query('SELECT client_id_enc, client_secret_enc FROM paypal_connections WHERE org_id = $1', [orgId]);
    assert.equal(stored.rows[0].client_id_enc.includes('test-client'), false);
    assert.equal(stored.rows[0].client_secret_enc.includes('test-secret'), false);
    const connectionGet = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      headers: requestHeaders(owner),
    });
    const publicConnection = await readJson(connectionGet);
    assert.equal(JSON.stringify(publicConnection).includes('test-client'), false);
    assert.equal(JSON.stringify(publicConnection).includes('test-secret'), false);

    const connected = await fetch(`${baseUrl}/api/v1/paypal/connection/test`, {
      method: 'POST',
      headers: requestHeaders(owner),
    });
    assert.equal(connected.status, 200);
    assert.equal((await readJson(connected)).status, 'CONNECTED');

    const rotateWithoutGrant = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      method: 'PUT',
      headers: requestHeaders(owner, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        clientId: 'rotated-client',
        clientSecret: 'rotated-secret',
        webhookId: 'WEBHOOK-ID',
      }),
    });
    assert.equal(rotateWithoutGrant.status, 403);

    const stepUp = await fetch(`${baseUrl}/api/v1/auth/step-up`, {
      method: 'POST',
      headers: requestHeaders(owner, { 'content-type': 'application/json' }),
      body: JSON.stringify({ purpose: 'ROTATE_CREDENTIALS', password }),
    });
    assert.equal(stepUp.status, 200);
    const rotateGrant = await readJson(stepUp);
    const rotate = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      method: 'PUT',
      headers: requestHeaders(owner, { 'content-type': 'application/json' }),
      body: JSON.stringify({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        webhookId: 'WEBHOOK-ID',
        grantId: rotateGrant.grantId,
      }),
    });
    assert.equal(rotate.status, 200);
    fake.setOauthStatus(401);
    const failedTest = await fetch(`${baseUrl}/api/v1/paypal/connection/test`, {
      method: 'POST',
      headers: requestHeaders(owner),
    });
    assert.equal(failedTest.status, 400);
    const failedResult = await readJson(failedTest);
    assert.equal(failedResult.status, 'ERROR');
    assert.equal(failedResult.lastErrorCode, 'PAYPAL_AUTH_FAILED');
    fake.setOauthStatus(200);
    const recoveredTest = await fetch(`${baseUrl}/api/v1/paypal/connection/test`, {
      method: 'POST',
      headers: requestHeaders(owner),
    });
    assert.equal(recoveredTest.status, 200);

    const unknownToken = await fetch(`${baseUrl}/webhooks/paypal/not-a-real-token`, { method: 'POST' });
    assert.equal(unknownToken.status, 404);
    assert.equal((await unknownToken.text()).includes('not-a-real-token'), false);
    const event = { id: `EVENT-${randomUUID()}`, event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', resource: { id: 'resource' } };
    const eventHeaders = {
      'content-type': 'application/json',
      'paypal-auth-algo': 'SHA256withRSA',
      'paypal-cert-url': 'http://fake-paypal.test/cert',
      'paypal-transmission-id': 'transmission',
      'paypal-transmission-sig': 'signature',
      'paypal-transmission-time': new Date().toISOString(),
    };
    fake.setVerificationStatus('FAILURE');
    const rejected = await fetch(`${baseUrl}/webhooks/paypal/${webhookToken}`, {
      method: 'POST',
      headers: eventHeaders,
      body: JSON.stringify(event),
    });
    assert.equal(rejected.status, 400);
    assert.equal((await db.query('SELECT 1 FROM webhook_events WHERE paypal_event_id = $1', [event.id])).rowCount, 0);

    fake.setVerificationStatus('SUCCESS');
    const accepted = await fetch(`${baseUrl}/webhooks/paypal/${webhookToken}`, {
      method: 'POST',
      headers: eventHeaders,
      body: JSON.stringify(event),
    });
    const duplicate = await fetch(`${baseUrl}/webhooks/paypal/${webhookToken}`, {
      method: 'POST',
      headers: eventHeaders,
      body: JSON.stringify(event),
    });
    assert.equal(accepted.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM webhook_events WHERE paypal_event_id = $1', [event.id])).rows[0].count, 1);
    assert.equal((await db.query("SELECT count(*)::integer AS count FROM jobs WHERE dedupe_key = $1", [`wh:${event.id}`])).rows[0].count, 1);

    const viewerPut = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      method: 'PUT',
      headers: requestHeaders(viewer, { 'content-type': 'application/json' }),
      body: JSON.stringify({ clientId: 'attacker', clientSecret: 'attacker-secret' }),
    });
    const viewerDelete = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      method: 'DELETE',
      headers: requestHeaders(viewer),
    });
    assert.equal(viewerPut.status, 403);
    assert.equal(viewerDelete.status, 403);

    const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
    await db.query(`
      INSERT INTO rate_limit_buckets (key, window_start, count)
      VALUES ($1, $2, 120)
      ON CONFLICT (key, window_start) DO UPDATE SET count = 120
    `, [`webhook:${sha256Hex(webhookToken)}`, windowStart]);
    const limited = await fetch(`${baseUrl}/webhooks/paypal/${webhookToken}`, {
      method: 'POST',
      headers: eventHeaders,
      body: JSON.stringify({ ...event, id: `EVENT-${randomUUID()}` }),
    });
    assert.equal(limited.status, 429);

    const deleteStepUp = await fetch(`${baseUrl}/api/v1/auth/step-up`, {
      method: 'POST',
      headers: requestHeaders(owner, { 'content-type': 'application/json' }),
      body: JSON.stringify({ purpose: 'ROTATE_CREDENTIALS', password }),
    });
    const deleteGrant = await readJson(deleteStepUp);
    const removed = await fetch(`${baseUrl}/api/v1/paypal/connection`, {
      method: 'DELETE',
      headers: requestHeaders(owner, { 'content-type': 'application/json' }),
      body: JSON.stringify({ grantId: deleteGrant.grantId }),
    });
    assert.equal(removed.status, 204);
    assert.equal((await db.query('SELECT 1 FROM paypal_connections WHERE org_id = $1', [orgId])).rowCount, 0);

    assert.equal(appOutput.includes('test-secret'), false);
    assert.equal(appOutput.includes('test-client'), false);
    assert.equal(appOutput.includes('rotated-secret'), false);
    assert.equal(appOutput.includes('rotated-client'), false);
    assert.equal(appOutput.includes('attacker-secret'), false);
    assert.equal(appOutput.includes(webhookToken), false);
  } finally {
    if (appProcess && appProcess.exitCode === null) {
      const closed = once(appProcess, 'close');
      appProcess.kill('SIGTERM');
      await closed;
    }
    if (fake) {
      await fake.close();
    }
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
