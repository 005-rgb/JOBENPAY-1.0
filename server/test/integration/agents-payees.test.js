import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { runMigrations } from '../../scripts/migrate.js';
import { hashAgentApiKey } from '../../src/lib/agentApiKeys.js';
import { hashPassword } from '../../src/lib/crypto.js';

const connectionString = process.env.TEST_DATABASE_URL;
const hasDatabaseEnv = Boolean(connectionString);
const helperScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../helpers/paypalAppChild.js');
const verifyScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/verify-ledger.js');
const seedScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/seed.js');
const password = 'TestPassword123!';
const encryptionKey = crypto.randomBytes(32).toString('base64');
const pepper = crypto.randomBytes(32).toString('base64');
const signingKey = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  publicKeyEncoding: { type: 'spki', format: 'der' },
}).privateKey.toString('base64');

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

async function createSession(db, { orgId, role, email }) {
  const passwordHash = await hashPassword(password);
  const user = await db.query(
    'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
    [email, passwordHash, `SYNTHETIC ${role}`],
  );
  const userId = user.rows[0].id;
  await db.query(
    'INSERT INTO memberships (org_id, user_id, role) VALUES ($1, $2, $3)',
    [orgId, userId, role],
  );
  const token = randomUUID() + randomUUID();
  const csrfToken = randomUUID();
  await db.query(
    `INSERT INTO sessions (id_hash, user_id, current_org_id, csrf_secret, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
    [createHash('sha256').update(token).digest('hex'), userId, orgId, csrfToken],
  );
  return { token, csrfToken, userId };
}

function headers(session, extra = {}) {
  return {
    cookie: `jp_sid=${session.token}`,
    'x-csrf-token': session.csrfToken,
    ...extra,
  };
}

async function postJson(url, session, body) {
  return fetch(url, {
    method: 'POST',
    headers: headers(session, { 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

function runChild(script, args, envVars) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: { ...process.env, ...envVars },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Child exited with ${code}: ${output}`));
      }
    });
  });
}

test('agents, API keys, and payees enforce tenancy, step-up, redaction, and rate limits', {
  skip: !hasDatabaseEnv,
}, async () => {
  const schema = `s06_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const isolatedUrl = new URL(connectionString);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema},public`);
  const isolatedConnectionString = isolatedUrl.toString();
  const db = new pg.Pool({ connectionString: isolatedConnectionString });
  let appProcess;
  let appOutput = '';

  try {
    await runMigrations(isolatedConnectionString);
    const seedEnv = {
      DATABASE_URL: isolatedConnectionString,
      NODE_ENV: 'test',
      JOBENPAY_ENC_KEY: encryptionKey,
      JOBENPAY_HMAC_PEPPER: pepper,
      SEED_OWNER_PASSWORD: password,
      SEED_JUDGE_PASSWORD: password,
      SEED_APPROVER_PASSWORD: password,
      SEED_VIEWER_PASSWORD: password,
    };
    const firstSeed = await runChild(seedScript, [], seedEnv);
    const secondSeed = await runChild(seedScript, [], seedEnv);
    assert.match(firstSeed, /Demo agent API key:/);
    assert.doesNotMatch(secondSeed, /Demo agent API key:/);
    const seededCounts = await db.query(`
      SELECT
        (SELECT count(*)::integer FROM memberships WHERE org_id = organizations.id) AS members,
        (SELECT count(*)::integer FROM agents WHERE org_id = organizations.id) AS agents,
        (SELECT count(*)::integer FROM payees WHERE org_id = organizations.id) AS payees,
        (SELECT count(*)::integer FROM agent_api_keys WHERE org_id = organizations.id AND revoked_at IS NULL) AS keys
      FROM organizations
      WHERE slug = 'jobenpay-demo'
    `);
    assert.deepEqual(seededCounts.rows[0], { members: 4, agents: 1, payees: 3, keys: 1 });

    const orgA = randomUUID();
    const orgB = randomUUID();
    await db.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6)', [
      orgA, 'SYNTHETIC Org A', `s06-a-${schema}`,
      orgB, 'SYNTHETIC Org B', `s06-b-${schema}`,
    ]);
    const ownerA = await createSession(db, { orgId: orgA, role: 'OWNER', email: `owner-a@${schema}.test` });
    const operatorA = await createSession(db, { orgId: orgA, role: 'OPERATOR', email: `operator-a@${schema}.test` });
    const ownerB = await createSession(db, { orgId: orgB, role: 'OWNER', email: `owner-b@${schema}.test` });

    appProcess = spawn(process.execPath, [helperScript], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: isolatedConnectionString,
        JOBENPAY_ENC_KEY: encryptionKey,
        JOBENPAY_HMAC_PEPPER: pepper,
        JOBENPAY_LEDGER_SIGNING_KEY: signingKey,
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

    const createdAgent = await postJson(`${baseUrl}/api/v1/agents`, ownerA, {
      name: 'SYNTHETIC Integration Agent',
      description: 'SYNTHETIC test data',
    });
    assert.equal(createdAgent.status, 201);
    const agent = (await createdAgent.json()).agent;

    const createdKey = await postJson(`${baseUrl}/api/v1/agents/${agent.id}/keys`, ownerA, {});
    assert.equal(createdKey.status, 201);
    const keyBody = await createdKey.json();
    assert.match(keyBody.apiKey, /^jp_sbx_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{32}$/);
    const keyDetailsResponse = await fetch(`${baseUrl}/api/v1/agents/${agent.id}`, {
      headers: headers(ownerA),
    });
    const keyDetails = await keyDetailsResponse.json();
    assert.equal(keyDetailsResponse.status, 200);
    assert.equal(JSON.stringify(keyDetails).includes(keyBody.apiKey), false);
    assert.equal(keyDetails.keys[0].prefix, keyBody.key.prefix);
    const storedKey = await db.query(
      'SELECT key_hash FROM agent_api_keys WHERE org_id = $1 AND id = $2',
      [orgA, keyBody.key.id],
    );
    assert.equal(storedKey.rows[0].key_hash, hashAgentApiKey(pepper, keyBody.apiKey));
    assert.notEqual(storedKey.rows[0].key_hash, keyBody.apiKey);

    const crossTenant = await fetch(`${baseUrl}/api/v1/agents/${agent.id}`, {
      headers: headers(ownerB),
    });
    assert.equal(crossTenant.status, 404);
    const crossTenantPatch = await fetch(`${baseUrl}/api/v1/agents/${agent.id}`, {
      method: 'PATCH',
      headers: headers(ownerB, { 'content-type': 'application/json' }),
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(crossTenantPatch.status, 404);

    const ping = await fetch(`${baseUrl}/agent/v1/ping`, {
      headers: { authorization: `Bearer ${keyBody.apiKey}` },
    });
    assert.equal(ping.status, 200);
    assert.equal((await ping.json()).agentId, agent.id);

    const rotateStepUp = await postJson(`${baseUrl}/api/v1/auth/step-up`, ownerA, {
      purpose: 'ROTATE_CREDENTIALS',
      password,
    });
    const rotateGrant = await rotateStepUp.json();
    assert.equal(rotateStepUp.status, 200);
    const rotateWithoutGrant = await postJson(`${baseUrl}/api/v1/agents/${agent.id}/keys/rotate`, ownerA, {});
    assert.equal(rotateWithoutGrant.status, 403);
    const rotated = await postJson(`${baseUrl}/api/v1/agents/${agent.id}/keys/rotate`, ownerA, {
      grantId: rotateGrant.grantId,
    });
    assert.equal(rotated.status, 201);
    const rotatedBody = await rotated.json();
    const oldKeyPing = await fetch(`${baseUrl}/agent/v1/ping`, {
      headers: { authorization: `Bearer ${keyBody.apiKey}` },
    });
    assert.equal(oldKeyPing.status, 401);
    const oldKeyStatus = await db.query(
      'SELECT revoked_at FROM agent_api_keys WHERE org_id = $1 AND id = $2',
      [orgA, keyBody.key.id],
    );
    assert.ok(oldKeyStatus.rows[0].revoked_at);
    const explicitKey = await postJson(`${baseUrl}/api/v1/agents/${agent.id}/keys`, ownerA, {});
    const explicitKeyBody = await explicitKey.json();
    const revokeKey = await postJson(
      `${baseUrl}/api/v1/agents/${agent.id}/keys/${explicitKeyBody.key.id}/revoke`,
      ownerA,
      {},
    );
    assert.equal(revokeKey.status, 204);
    const revokedPing = await fetch(`${baseUrl}/agent/v1/ping`, {
      headers: { authorization: `Bearer ${explicitKeyBody.apiKey}` },
    });
    assert.equal(revokedPing.status, 401);

    const operatorPayeeIdentifier = `operator-${randomUUID()}@synthetic.test`;
    const operatorPayeeResponse = await postJson(`${baseUrl}/api/v1/payees`, operatorA, {
      displayName: 'SYNTHETIC Operator Payee',
      kind: 'EMAIL',
      identifier: operatorPayeeIdentifier,
    });
    assert.equal(operatorPayeeResponse.status, 201);
    const operatorPayeeBody = await operatorPayeeResponse.json();
    assert.equal(JSON.stringify(operatorPayeeBody).includes(operatorPayeeIdentifier), false);

    const payeeIdentifier = `invoice-${randomUUID()}@synthetic.test`;
    const payeeResponse = await postJson(`${baseUrl}/api/v1/payees`, ownerA, {
      displayName: 'SYNTHETIC Invoice Payee',
      kind: 'EMAIL',
      identifier: payeeIdentifier,
    });
    assert.equal(payeeResponse.status, 201);
    const payee = (await payeeResponse.json()).payee;
    assert.equal(payee.identifier, payeeIdentifier);
    assert.equal(payee.trust, 'PENDING_REVIEW');

    const payeeListResponse = await fetch(`${baseUrl}/api/v1/payees`, {
      headers: headers(ownerA),
    });
    const payeeList = await payeeListResponse.json();
    assert.equal(payeeListResponse.status, 200);
    assert.equal(JSON.stringify(payeeList).includes(payeeIdentifier), false);

    const newIdentifier = `updated-${randomUUID()}@synthetic.test`;
    const patchPayee = await fetch(`${baseUrl}/api/v1/payees/${payee.id}`, {
      method: 'PATCH',
      headers: headers(ownerA, { 'content-type': 'application/json' }),
      body: JSON.stringify({ identifier: newIdentifier }),
    });
    assert.equal(patchPayee.status, 200);
    assert.equal((await patchPayee.json()).payee.identifier, newIdentifier);
    const revisions = await db.query(
      'SELECT old_hmac, new_hmac FROM payee_revisions WHERE org_id = $1 AND payee_id = $2',
      [orgA, payee.id],
    );
    assert.equal(revisions.rowCount, 1);
    assert.notEqual(revisions.rows[0].old_hmac, revisions.rows[0].new_hmac);
    const changedAt = await db.query(
      'SELECT changed_at FROM payees WHERE org_id = $1 AND id = $2',
      [orgA, payee.id],
    );
    assert.ok(changedAt.rows[0].changed_at);

    const duplicatePayee = await postJson(`${baseUrl}/api/v1/payees`, ownerA, {
      displayName: 'SYNTHETIC Duplicate',
      kind: 'EMAIL',
      identifier: operatorPayeeIdentifier,
    });
    assert.equal(duplicatePayee.status, 409);

    const operatorTrust = await postJson(`${baseUrl}/api/v1/payees/${payee.id}/trust`, operatorA, {
      trust: 'TRUSTED',
    });
    assert.equal(operatorTrust.status, 403);
    const trustWithoutGrant = await postJson(`${baseUrl}/api/v1/payees/${payee.id}/trust`, ownerA, {
      trust: 'TRUSTED',
    });
    assert.equal(trustWithoutGrant.status, 403);
    const trustStepUp = await postJson(`${baseUrl}/api/v1/auth/step-up`, ownerA, {
      purpose: 'TRUST_PAYEE',
      password,
    });
    const trustGrant = await trustStepUp.json();
    const trustPayee = await postJson(`${baseUrl}/api/v1/payees/${payee.id}/trust`, ownerA, {
      trust: 'TRUSTED',
      grantId: trustGrant.grantId,
    });
    assert.equal(trustPayee.status, 200);

    const limiterKeyResponse = await postJson(`${baseUrl}/api/v1/agents/${agent.id}/keys`, ownerA, {});
    const limiterKey = (await limiterKeyResponse.json()).apiKey;
    let lastPing;
    for (let count = 0; count < 61; count += 1) {
      lastPing = await fetch(`${baseUrl}/agent/v1/ping`, {
        headers: { authorization: `Bearer ${limiterKey}` },
      });
    }
    assert.equal(lastPing.status, 429);

    const disableAgent = await fetch(`${baseUrl}/api/v1/agents/${agent.id}`, {
      method: 'PATCH',
      headers: headers(ownerA, { 'content-type': 'application/json' }),
      body: JSON.stringify({ status: 'DISABLED' }),
    });
    assert.equal(disableAgent.status, 200);
    const disabledPing = await fetch(`${baseUrl}/agent/v1/ping`, {
      headers: { authorization: `Bearer ${rotatedBody.apiKey}` },
    });
    assert.equal(disabledPing.status, 403);

    const ledgerTypes = await db.query(
      `SELECT type FROM ledger_entries
       WHERE org_id = $1 AND type IN ('AGENT_KEY_ROTATED', 'PAYEE_TRUST_CHANGED')
       ORDER BY seq`,
      [orgA],
    );
    assert.deepEqual(ledgerTypes.rows.map(({ type }) => type), ['AGENT_KEY_ROTATED', 'PAYEE_TRUST_CHANGED']);
    const ledgerOutput = await runChild(verifyScript, ['--org', orgA], {
      DATABASE_URL: isolatedConnectionString,
      NODE_ENV: 'test',
      JOBENPAY_LEDGER_SIGNING_KEY: signingKey,
    });
    assert.match(ledgerOutput, /"status":"VALID"/);

    assert.equal(appOutput.includes(keyBody.apiKey), false);
    assert.equal(appOutput.includes(rotatedBody.apiKey), false);
    assert.equal(appOutput.includes(explicitKeyBody.apiKey), false);
    assert.equal(appOutput.includes(limiterKey), false);
    assert.equal(appOutput.includes(payeeIdentifier), false);
    assert.equal(appOutput.includes(newIdentifier), false);
    assert.equal(appOutput.includes(operatorPayeeIdentifier), false);
  } finally {
    if (appProcess && appProcess.exitCode === null) {
      const closed = once(appProcess, 'close');
      appProcess.kill('SIGTERM');
      await closed;
    }
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
