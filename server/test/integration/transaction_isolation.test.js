// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { hashPassword } from '../../src/lib/crypto.js';

test('Zero-Leak Transaction Environment Isolation & Anti-IDOR Suite (PRD 3.0 & PRD 1.3)', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const testPassword = 'Password123!Safe';
  let sessionToken = '';
  let csrfToken = '';

  let sandboxAgentId;
  let sandboxMandateVersionId;
  let liveAgentId;
  let liveMandateVersionId;

  t.before(async () => {
    appInfo = await startTestApp();

    // 1. Create Organization
    await pool.query(
      `INSERT INTO organizations (id, name, slug, display_name, legal_name, billing_email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        'Isolation Test Org',
        `iso-${orgId.slice(0, 8)}`,
        'Isolation Test Org',
        'Isolation Testing Inc.',
        'billing@isolation.test',
      ],
    );

    // 2. Create User
    const pwdHash = await hashPassword(testPassword);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)`,
      [userId, `owner-${orgId.slice(0, 8)}@isolation.test`, pwdHash, 'Isolation Owner'],
    );

    // 3. Create Membership (OWNER role)
    await pool.query(
      `INSERT INTO memberships (org_id, user_id, role)
       VALUES ($1, $2, $3)`,
      [orgId, userId, 'OWNER'],
    );

    // 4. Create Session
    sessionToken = crypto.randomBytes(32).toString('hex');
    csrfToken = crypto.randomBytes(16).toString('hex');
    const idHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    await pool.query(
      `INSERT INTO sessions (id_hash, user_id, current_org_id, csrf_secret, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
      [idHash, userId, orgId, csrfToken],
    );

    // 5. Create Sandbox Agent and Mandate
    sandboxAgentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agents (id, org_id, name, environment, status)
       VALUES ($1, $2, 'Sandbox Agent', 'SANDBOX', 'ACTIVE')`,
      [sandboxAgentId, orgId],
    );

    const sbxMandateId = crypto.randomUUID();
    sandboxMandateVersionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO mandates (id, org_id, agent_id, name, status)
       VALUES ($1, $2, $3, 'Sandbox Mandate', 'ACTIVE')`,
      [sbxMandateId, orgId, sandboxAgentId],
    );
    await pool.query(
      `INSERT INTO mandate_versions (id, org_id, mandate_id, version, policy, policy_canonical, policy_hash, signing_kid, valid_from, valid_to, prompt_version)
       VALUES ($1, $2, $3, 1, '{}'::jsonb, '{}', 'hash_sbx', 'kid_sbx', now() - interval '1 day', now() + interval '1 day', 'p1')`,
      [sandboxMandateVersionId, orgId, sbxMandateId],
    );

    // 6. Create Live Agent and Mandate
    liveAgentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO agents (id, org_id, name, environment, status)
       VALUES ($1, $2, 'Live Agent', 'LIVE', 'ACTIVE')`,
      [liveAgentId, orgId],
    );

    const liveMandateId = crypto.randomUUID();
    liveMandateVersionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO mandates (id, org_id, agent_id, name, status)
       VALUES ($1, $2, $3, 'Live Mandate', 'ACTIVE')`,
      [liveMandateId, orgId, liveAgentId],
    );
    await pool.query(
      `INSERT INTO mandate_versions (id, org_id, mandate_id, version, policy, policy_canonical, policy_hash, signing_kid, valid_from, valid_to, prompt_version)
       VALUES ($1, $2, $3, 1, '{}'::jsonb, '{}', 'hash_live', 'kid_live', now() - interval '1 day', now() + interval '1 day', 'p1')`,
      [liveMandateVersionId, orgId, liveMandateId],
    );
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.query('DELETE FROM transaction_legs WHERE intent_id IN (SELECT intent_id FROM transaction_intents WHERE org_id = $1)', [orgId]);
    await pool.query('DELETE FROM transaction_intents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM mandate_versions WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM mandates WHERE org_id = $1', [orgId]);
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

  await t.test('test_idor_decision_blocked: Sandbox transaction decision cannot be executed via LIVE environment (404 Not Found)', async () => {
    const sandboxIntentId = crypto.randomUUID();
    const idemKey = `idem_sbx_${crypto.randomBytes(4).toString('hex')}`;

    // Create a Sandbox transaction pending approval
    await pool.query(
      `INSERT INTO transaction_intents (
         intent_id, org_id, agent_id, category, sub_type, status,
         amount_minor, currency, idempotency_key, request_hash, mandate_version_id, environment
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        sandboxIntentId,
        orgId,
        sandboxAgentId,
        'PAYOUT',
        'standard',
        'NEEDS_APPROVAL',
        '5000',
        'USD',
        idemKey,
        `hash_${idemKey}`,
        sandboxMandateVersionId,
        'SANDBOX',
      ],
    );

    // Attempt to decide (APPROVE) the Sandbox transaction while operating in LIVE mode
    const res = await fetch(`${appInfo.url}/api/v1/transactions/${sandboxIntentId}/decision`, {
      method: 'POST',
      headers: authHeaders({
        'content-type': 'application/json',
        'x-environment': 'LIVE',
      }),
      body: JSON.stringify({ decision: 'APPROVE', comment: 'Cross-env attack' }),
    });

    assert.equal(res.status, 404, 'Expected 404 NOT_FOUND for cross-environment decision attempt');
    const body = await res.json();
    assert.equal(body.error?.code || body.code, 'NOT_FOUND');

    // Verify transaction remains untouched in database
    const checkDb = await pool.query('SELECT status FROM transaction_intents WHERE intent_id = $1', [sandboxIntentId]);
    assert.equal(checkDb.rows[0].status, 'NEEDS_APPROVAL', 'Status must not have mutated across environments');
  });

  await t.test('test_idor_sar_blocked: Sandbox transaction SAR cannot be exported via LIVE environment (404 Not Found)', async () => {
    const sandboxIntentId = crypto.randomUUID();
    const idemKey = `idem_sar_${crypto.randomBytes(4).toString('hex')}`;

    // Create a Sandbox transaction
    await pool.query(
      `INSERT INTO transaction_intents (
         intent_id, org_id, agent_id, category, sub_type, status,
         amount_minor, currency, idempotency_key, request_hash, mandate_version_id, environment
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        sandboxIntentId,
        orgId,
        sandboxAgentId,
        'PAYOUT',
        'standard',
        'APPROVED',
        '1000',
        'USD',
        idemKey,
        `hash_${idemKey}`,
        sandboxMandateVersionId,
        'SANDBOX',
      ],
    );

    // Attempt to access SAR with LIVE environment header
    const res = await fetch(`${appInfo.url}/api/v1/transactions/${sandboxIntentId}/sar`, {
      method: 'GET',
      headers: authHeaders({
        'x-environment': 'LIVE',
      }),
    });

    assert.equal(res.status, 404, 'Expected 404 NOT_FOUND for cross-environment SAR fetch');
    const body = await res.json();
    assert.equal(body.error?.code || body.code, 'NOT_FOUND');

    // Accessing with correct SANDBOX environment header succeeds
    const resValid = await fetch(`${appInfo.url}/api/v1/transactions/${sandboxIntentId}/sar`, {
      method: 'GET',
      headers: authHeaders({
        'x-environment': 'SANDBOX',
      }),
    });
    assert.equal(resValid.status, 200);
    const validBody = await resValid.json();
    assert.equal(validBody.ok, true);
    assert.equal(validBody.sar.intent_id, sandboxIntentId);
  });

  await t.test('test_provider_badge_live: Live transaction GET /:id returns provider = LIVE and blocks SANDBOX fetch', async () => {
    const liveIntentId = crypto.randomUUID();
    const idemKey = `idem_live_${crypto.randomBytes(4).toString('hex')}`;

    // Create a LIVE transaction
    await pool.query(
      `INSERT INTO transaction_intents (
         intent_id, org_id, agent_id, category, sub_type, status,
         amount_minor, currency, idempotency_key, request_hash, mandate_version_id, environment
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        liveIntentId,
        orgId,
        liveAgentId,
        'PAYOUT',
        'standard',
        'APPROVED',
        '2500',
        'USD',
        idemKey,
        `hash_${idemKey}`,
        liveMandateVersionId,
        'LIVE',
      ],
    );

    // 1. Fetch in LIVE mode
    const resLive = await fetch(`${appInfo.url}/api/v1/transactions/${liveIntentId}`, {
      method: 'GET',
      headers: authHeaders({
        'x-environment': 'LIVE',
      }),
    });

    assert.equal(resLive.status, 200);
    const bodyLive = await resLive.json();
    assert.equal(bodyLive.intent.environment, 'LIVE');
    assert.equal(bodyLive.intent.provider, 'LIVE', 'Provider must be dynamically set to LIVE, not hardcoded SANDBOX');

    // 2. Cross-environment fetch: Trying to fetch LIVE transaction using SANDBOX header must return 404
    const resCross = await fetch(`${appInfo.url}/api/v1/transactions/${liveIntentId}`, {
      method: 'GET',
      headers: authHeaders({
        'x-environment': 'SANDBOX',
      }),
    });

    assert.equal(resCross.status, 404, 'Expected 404 when querying LIVE transaction from SANDBOX');
  });

});
