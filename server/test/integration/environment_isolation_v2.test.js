// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { hashPassword } from '../../src/lib/crypto.js';

test('PRD 3.0 (REVISI 2.0) Environment Isolation V2 Integration Tests', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const testPassword = 'Password123!Safe';
  let sessionToken = '';
  let csrfToken = '';

  t.before(async () => {
    appInfo = await startTestApp();

    // 1. Create Organization (Global entity - no environment column)
    await pool.query(
      `INSERT INTO organizations (id, name, slug, display_name, legal_name, billing_email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        'Acme Global Corp',
        `acme-${orgId.slice(0, 8)}`,
        'Acme Global Corp',
        'Acme Corporation Inc.',
        'billing@acmeglobal.com',
      ],
    );

    // 2. Create User (Global entity - no default_environment column)
    const pwdHash = await hashPassword(testPassword);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)`,
      [userId, `owner-${orgId.slice(0, 8)}@acmeglobal.com`, pwdHash, 'Acme Owner'],
    );

    // 3. Create Membership (Global entity - no environment column)
    await pool.query(
      `INSERT INTO memberships (org_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [orgId, userId, 'OWNER'],
    );

    // 4. Create Session for authentication
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
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    // Cleanup test data
    await pool.query('DELETE FROM transaction_intents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM agents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM memberships WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  function authHeaders(extra = {}) {
    return {
      cookie: `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
      ...extra,
    };
  }

  await t.test('test_org_profile_global: GET /api/v1/org/profile returns identical data in SANDBOX and LIVE', async () => {
    const resSandbox = await fetch(`${appInfo.url}/api/v1/org/profile`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
    });
    assert.equal(resSandbox.status, 200);
    const dataSandbox = await resSandbox.json();

    const resLive = await fetch(`${appInfo.url}/api/v1/org/profile`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
    });
    assert.equal(resLive.status, 200);
    const dataLive = await resLive.json();

    assert.equal(dataSandbox.org_id, orgId);
    assert.equal(dataLive.org_id, orgId);
    assert.equal(dataSandbox.display_name, 'Acme Global Corp');
    assert.equal(dataLive.display_name, 'Acme Global Corp');
    assert.equal(dataSandbox.legal_name, 'Acme Corporation Inc.');
    assert.equal(dataLive.legal_name, 'Acme Corporation Inc.');
    assert.equal(dataSandbox.billing_email, 'billing@acmeglobal.com');
    assert.equal(dataLive.billing_email, 'billing@acmeglobal.com');
  });

  await t.test('test_env_header_missing_global: GET /api/v1/org/profile without header succeeds (200 OK)', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/org/profile`, {
      method: 'GET',
      headers: authHeaders(), // No X-Jobenpay-Environment
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.org_id, orgId);
    assert.equal(data.display_name, 'Acme Global Corp');
  });

  await t.test('test_env_header_missing: GET /api/v1/agents without environment header returns 400 ENVIRONMENT_HEADER_MISSING', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/agents`, {
      method: 'GET',
      headers: authHeaders(), // No X-Jobenpay-Environment
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error.code, 'ENVIRONMENT_HEADER_MISSING');
  });

  await t.test('test_agent_isolation: agents created in SANDBOX never appear in LIVE', async () => {
    // 1. Create Agent in SANDBOX
    const createRes = await fetch(`${appInfo.url}/api/v1/agents`, {
      method: 'POST',
      headers: authHeaders({
        'content-type': 'application/json',
        'X-Jobenpay-Environment': 'SANDBOX',
      }),
      body: JSON.stringify({
        name: 'Sandbox Payment Bot',
        description: 'Test agent in Sandbox',
      }),
    });
    assert.equal(createRes.status, 201);
    const createdBody = await createRes.json();
    const sandboxAgent = createdBody.agent;
    assert.equal(sandboxAgent.name, 'Sandbox Payment Bot');
    assert.equal(sandboxAgent.environment, 'SANDBOX');

    // 2. Query agents with LIVE header -> Must return 0 items
    const listLiveRes = await fetch(`${appInfo.url}/api/v1/agents`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
    });
    assert.equal(listLiveRes.status, 200);
    const liveBody = await listLiveRes.json();
    assert.deepEqual(liveBody.agents, []);

    // 3. Query agents with SANDBOX header -> Must return the created agent
    const listSandboxRes = await fetch(`${appInfo.url}/api/v1/agents`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
    });
    assert.equal(listSandboxRes.status, 200);
    const sandboxBody = await listSandboxRes.json();
    assert.equal(sandboxBody.agents.length, 1);
    assert.equal(sandboxBody.agents[0].id, sandboxAgent.id);
    assert.equal(sandboxBody.agents[0].environment, 'SANDBOX');
  });

  await t.test('test_mandate_isolation: Database trigger trg_check_agent_environment rejects cross-env agent assignment', async () => {
    // 1. Query the Sandbox agent created earlier
    const agentRes = await pool.query(
      `SELECT id, agent_id, environment FROM agents WHERE org_id = $1 AND environment = 'SANDBOX' LIMIT 1`,
      [orgId],
    );
    assert.ok(agentRes.rows.length > 0);
    const agent = agentRes.rows[0];
    assert.equal(agent.environment, 'SANDBOX');

    const mandateVersionId = crypto.randomUUID();
    const requestHash = crypto.randomBytes(32).toString('hex');

    // 2. Attempting to insert a transaction_intent with environment = 'LIVE' referencing SANDBOX agent
    const intentId = crypto.randomUUID();
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO transaction_intents (
            intent_id, org_id, agent_id, idempotency_key, category, sub_type, amount_minor, currency, status, mandate_version_id, request_hash, environment
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            intentId,
            orgId,
            agent.id,
            `idemp-${intentId.slice(0, 8)}`,
            'PAYOUT',
            'standard',
            5000n,
            'USD',
            'DRAFT',
            mandateVersionId,
            requestHash,
            'LIVE', // Cross-environment mismatch!
          ],
        );
      },
      (err) => {
        return err.message && err.message.includes('Environment mismatch: agent=SANDBOX transaction=LIVE');
      },
    );

    // 3. Inserting with matching environment (SANDBOX) must succeed
    const validIntentId = crypto.randomUUID();
    const insertOk = await pool.query(
      `INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, idempotency_key, category, sub_type, amount_minor, currency, status, mandate_version_id, request_hash, environment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING intent_id, environment`,
      [
        validIntentId,
        orgId,
        agent.id,
        `idemp-${validIntentId.slice(0, 8)}`,
        'PAYOUT',
        'standard',
        5000n,
        'USD',
        'DRAFT',
        mandateVersionId,
        requestHash,
        'SANDBOX', // Matches agent environment!
      ],
    );
    assert.equal(insertOk.rows[0].intent_id, validIntentId);
    assert.equal(insertOk.rows[0].environment, 'SANDBOX');
  });

  await t.test('test_membership_global: Same membership can access both environments seamlessly', async () => {
    // Check that memberships table has NO environment column
    const colCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'memberships' AND column_name = 'environment'`,
    );
    assert.equal(colCheck.rows.length, 0);

    // Check that organizations table has NO environment column
    const orgColCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'organizations' AND column_name = 'environment'`,
    );
    assert.equal(orgColCheck.rows.length, 0);

    // Check that users table has NO default_environment column
    const userColCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_name = 'users' AND column_name = 'default_environment'`,
    );
    assert.equal(userColCheck.rows.length, 0);

    // User can access global org profile
    const profileRes = await fetch(`${appInfo.url}/api/v1/org/profile`, {
      method: 'GET',
      headers: authHeaders(),
    });
    assert.equal(profileRes.status, 200);

    // User can switch between environments on operational routes
    const sbxRes = await fetch(`${appInfo.url}/api/v1/agents`, {
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
    });
    assert.equal(sbxRes.status, 200);

    const liveRes = await fetch(`${appInfo.url}/api/v1/agents`, {
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
    });
    assert.equal(liveRes.status, 200);
  });
});
