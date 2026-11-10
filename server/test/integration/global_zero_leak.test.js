// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { hashPassword } from '../../src/lib/crypto.js';
import { appendEntry, LEDGER_TYPES } from '../../src/services/ledger.js';
import { createDocument } from '../../src/repositories/documents.js';

test('PRD 3.0: Global Zero-Leak Isolation & Adversarial Integrity Suite', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const testPassword = 'Password123!Safe';
  let sessionToken = '';
  let csrfToken = '';

  t.before(async () => {
    appInfo = await startTestApp();

    // 1. Create Organization (Global entity)
    await pool.query(
      `INSERT INTO organizations (id, name, slug, display_name, legal_name, billing_email)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        'Global Zero Leak Corp',
        `zero-leak-${orgId.slice(0, 8)}`,
        'Global Zero Leak Corp',
        'Global Zero Leak Corporation Inc.',
        'billing@zeroleak.com',
      ],
    );

    // 2. Create User (Global entity)
    const pwdHash = await hashPassword(testPassword);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)`,
      [userId, `owner-${orgId.slice(0, 8)}@zeroleak.com`, pwdHash, 'Zero Leak Owner'],
    );

    // 3. Create Membership (Global entity)
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
    // Cleanup test data (note: ledger_entries is immutable by DB trigger)
    await pool.query('DELETE FROM transaction_intents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM documents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM payees WHERE org_id = $1', [orgId]);
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
      'content-type': 'application/json',
      ...extra,
    };
  }

  // Skenario 1: test_idor_ledger_blocked
  await t.test('1. test_idor_ledger_blocked: Sandbox ledger entry returns [] on LIVE query', async () => {
    // Buat ledger entry di SANDBOX
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await appendEntry(client, {
        orgId,
        type: LEDGER_TYPES.REQUEST_RECEIVED,
        subjectType: 'PAYMENT',
        subjectId: crypto.randomUUID(),
        payload: { amount: 100, reason: 'sandbox testing entry' },
        environment: 'SANDBOX',
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    // Panggil GET /api/v1/ledger dengan LIVE
    const resLive = await fetch(`${appInfo.url}/api/v1/ledger`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
    });
    assert.equal(resLive.status, 200);
    const dataLive = await resLive.json();
    assert.equal(dataLive.entries.length, 0, 'LIVE query must NOT return SANDBOX ledger entries (IDOR blocked)');

    // Panggil GET /api/v1/ledger dengan SANDBOX
    const resSandbox = await fetch(`${appInfo.url}/api/v1/ledger`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
    });
    assert.equal(resSandbox.status, 200);
    const dataSandbox = await resSandbox.json();
    assert.ok(dataSandbox.entries.length >= 1, 'SANDBOX query must return SANDBOX ledger entries');
  });

  // Skenario 2: test_idor_requests_blocked
  await t.test('2. test_idor_requests_blocked: Sandbox payment request returns 404 on LIVE call', async () => {
    const sandboxIntentId = crypto.randomUUID();

    // Buat transaction intent & payment request di SANDBOX
    await pool.query(
      `INSERT INTO transaction_intents (
        intent_id, org_id, agent_id, category, sub_type, status,
        amount_minor, currency, mandate_version_id, environment, idempotency_key, request_hash
      ) VALUES ($1, $2, $3, 'PAYOUT', 'standard', 'SUBMITTED', $4, $5, '00000000-0000-4000-8000-000000000000', 'SANDBOX', $6, $7)`,
      [
        sandboxIntentId,
        orgId,
        crypto.randomUUID(),
        1000n,
        'USD',
        `idem_sbx_${sandboxIntentId}`,
        `hash_sbx_${sandboxIntentId}`,
      ],
    );

    // Akses dari LIVE: Wajib 404 NOT_FOUND
    const resLive = await fetch(`${appInfo.url}/api/v1/requests/${sandboxIntentId}`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
    });
    assert.equal(resLive.status, 404, 'LIVE call to SANDBOX request must return 404 Not Found');

    // Akses dari SANDBOX: Wajib 200 OK
    const resSandbox = await fetch(`${appInfo.url}/api/v1/requests/${sandboxIntentId}`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
    });
    assert.equal(resSandbox.status, 200, 'SANDBOX call to SANDBOX request must return 200 OK');
    const dataSandbox = await resSandbox.json();
    assert.equal(dataSandbox.request.id, sandboxIntentId);
  });

  // Skenario 3: test_cross_env_mandate_blocked
  await t.test('3. test_cross_env_mandate_blocked: Assigning SANDBOX agent to LIVE mandate is rejected with 404 or 422', async () => {
    const sandboxAgentId = crypto.randomUUID();

    // Buat Agent di SANDBOX
    await pool.query(
      `INSERT INTO agents (id, agent_id, org_id, name, status, environment)
       VALUES ($1, $1, $2, $3, 'ACTIVE', 'SANDBOX')`,
      [sandboxAgentId, orgId, 'Sandbox Exclusive Agent'],
    );

    const validPolicy = {
      schemaVersion: 1,
      purpose: 'Pay cloud bills under cap',
      allowedActions: ['PAYOUT'],
      currency: 'USD',
      perTransactionCapMinor: 50000,
      budget: { period: 'MONTH', limitMinor: 200000 },
      rateLimit: { maxTransactions: 10, windowSeconds: 3600 },
      payees: { mode: 'ALLOW_ALL', ids: [] },
      requireHumanApprovalAboveMinor: 25000,
      validFrom: new Date().toISOString(),
      validTo: new Date(Date.now() + 86400000 * 30).toISOString(),
    };

    // Coba buat Mandate di LIVE dengan sandboxAgentId
    const res = await fetch(`${appInfo.url}/api/v1/mandates`, {
      method: 'POST',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
      body: JSON.stringify({
        agentId: sandboxAgentId,
        name: 'Malicious Cross-Env Mandate',
        policy: validPolicy,
      }),
    });

    // Karena agent di Sandbox, pencarian agent di LIVE tidak menemukannya -> 404 atau 422
    assert.ok(
      res.status === 404 || res.status === 422,
      `Cross-env mandate creation must fail with 404 or 422 (got ${res.status})`,
    );
    const body = await res.json();
    const errCode = body.error?.code || body.code;
    assert.ok(
      errCode === 'NOT_FOUND' || errCode === 'CROSS_ENVIRONMENT_MANDATE_BLOCKED',
      `Error code must be NOT_FOUND or CROSS_ENVIRONMENT_MANDATE_BLOCKED (got ${errCode})`,
    );
  });

  // Skenario 4: test_middleware_strictness
  await t.test('4. test_middleware_strictness: Calling operational routes without header returns 400 ENVIRONMENT_HEADER_MISSING', async () => {
    // 1. Payees
    const resPayees = await fetch(`${appInfo.url}/api/v1/payees`, {
      method: 'GET',
      headers: authHeaders(), // No X-Jobenpay-Environment
    });
    assert.equal(resPayees.status, 400);
    const bodyPayees = await resPayees.json();
    assert.equal(bodyPayees.error?.code || bodyPayees.code, 'ENVIRONMENT_HEADER_MISSING');

    // 2. Documents
    const resDocs = await fetch(`${appInfo.url}/api/v1/documents`, {
      method: 'GET',
      headers: authHeaders(), // No X-Jobenpay-Environment
    });
    assert.equal(resDocs.status, 400);
    const bodyDocs = await resDocs.json();
    assert.equal(bodyDocs.error?.code || bodyDocs.code, 'ENVIRONMENT_HEADER_MISSING');

    // 3. Approvals
    const resApprovals = await fetch(`${appInfo.url}/api/v1/approvals`, {
      method: 'GET',
      headers: authHeaders(), // No X-Jobenpay-Environment
    });
    assert.equal(resApprovals.status, 400);
    const bodyApprovals = await resApprovals.json();
    assert.equal(bodyApprovals.error?.code || bodyApprovals.code, 'ENVIRONMENT_HEADER_MISSING');

    // 4. Mandates
    const resMandates = await fetch(`${appInfo.url}/api/v1/mandates`, {
      method: 'GET',
      headers: authHeaders(), // No X-Jobenpay-Environment
    });
    assert.equal(resMandates.status, 400);
    const bodyMandates = await resMandates.json();
    assert.equal(bodyMandates.error?.code || bodyMandates.code, 'ENVIRONMENT_HEADER_MISSING');
  });

  // Skenario 5: test_cache_invalidation_isolation & Entity Isolation
  await t.test('5. test_cache_invalidation_isolation: Payee and Document isolation across environments', async () => {
    // 1. Buat Payee di SANDBOX via API
    const resCreatePayee = await fetch(`${appInfo.url}/api/v1/payees`, {
      method: 'POST',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
      body: JSON.stringify({
        displayName: 'Sandbox Exclusive Payee',
        kind: 'EMAIL',
        identifier: 'payee-sbx@example.com',
      }),
    });
    assert.equal(resCreatePayee.status, 201);
    const { payee: createdPayee } = await resCreatePayee.json();
    assert.ok(createdPayee.id);

    // Cek GET payee di LIVE -> Wajib 404
    const resPayeeLive = await fetch(`${appInfo.url}/api/v1/payees/${createdPayee.id}`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
    });
    assert.equal(resPayeeLive.status, 404, 'SANDBOX payee must return 404 in LIVE');

    // Cek GET payee di SANDBOX -> Wajib 200
    const resPayeeSbx = await fetch(`${appInfo.url}/api/v1/payees/${createdPayee.id}`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
    });
    assert.equal(resPayeeSbx.status, 200, 'SANDBOX payee must return 200 in SANDBOX');

    // 2. Buat Dokumen di SANDBOX
    const docSbx = await createDocument(orgId, {
      uploaderKind: 'USER',
      uploaderId: userId,
      filename: 'invoice-sandbox.pdf',
      mime: 'application/pdf',
      size: 1024,
      sha256: crypto.randomBytes(32).toString('hex'),
      storageKey: `docs/${orgId}/${crypto.randomUUID()}`,
      environment: 'SANDBOX',
    });

    // Cek GET document di LIVE -> Wajib 404
    const resDocLive = await fetch(`${appInfo.url}/api/v1/documents/${docSbx.id}`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'LIVE' }),
    });
    assert.equal(resDocLive.status, 404, 'SANDBOX document must return 404 in LIVE');

    // Cek GET document di SANDBOX -> Wajib 200
    const resDocSbx = await fetch(`${appInfo.url}/api/v1/documents/${docSbx.id}`, {
      method: 'GET',
      headers: authHeaders({ 'X-Jobenpay-Environment': 'SANDBOX' }),
    });
    assert.equal(resDocSbx.status, 200, 'SANDBOX document must return 200 in SANDBOX');
  });
});
