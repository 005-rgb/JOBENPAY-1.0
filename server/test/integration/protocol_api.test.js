// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';
import { createSignedSar } from '../../src/services/verify_service.js';
import { seedConformanceVectors } from '../../scripts/seed-conformance-vectors.js';

test('PRD 1.5 — Open Trust Exchange HTTP API Integration Tests', async (t) => {
  const { server, url } = await startTestApp();

  let testOrgId;
  let testUserId;
  let testHeaders;
  let testPrivKey;
  let validSar;

  const TEST_KID = 'kid_01HX4Z8K9M2N3P4Q5R6S7T8V9W';
  const TEST_ORG = 'org_01HX4Z8K9M2N3P4Q5R6S7T8V9W';

  await t.test('Setup test org, user, session, and SAR', async () => {
    await seedConformanceVectors(pool);

    testOrgId = crypto.randomUUID();
    const slug = `proto-org-${testOrgId.slice(0, 8)}`;
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [testOrgId, 'Protocol Org', slug]);

    testUserId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
      [testUserId, `owner-${slug}@jobenpay.test`, 'dummy-hash', 'Protocol Owner'],
    );

    await pool.query(
      'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
      [testOrgId, testUserId, 'OWNER', false],
    );

    const csrfToken = crypto.randomUUID();
    const { token: sessionToken } = await createSession(testOrgId, {
      userId: testUserId,
      currentOrgId: testOrgId,
      csrfSecret: csrfToken,
      expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
    });

    testHeaders = {
      'content-type': 'application/json',
      'Cookie': `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
    };

    // Deterministic key
    const seed = crypto.createHash('sha256').update('jobenpay-conformance-seed-v1').digest();
    const pkcs8Der = Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed,
    ]);
    testPrivKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });

    validSar = createSignedSar(
      {
        sar_version: '1.0',
        sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
        issuer: {
          org_id: TEST_ORG,
          issuer_key_id: TEST_KID,
          display_name: 'Acme Test Corp',
          legal_entity_lei: '5493001KJTIIGC8Y1R12',
        },
        mandate: {
          mandate_id: 'mnd_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
          mandate_version: 1,
          policy_hash: 'sha256:a3f5a8c9e2b1d4f6a3f5a8c9e2b1d4f6a3f5a8c9e2b1d4f6a3f5a8c9e2b1d4f6',
          valid_from: '2026-01-01T00:00:00Z',
          valid_to: '2027-12-31T23:59:59Z',
        },
        request: {
          request_id: 'req_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
          request_hash: 'sha256:b7e2c4d6a8f1e3b5b7e2c4d6a8f1e3b5b7e2c4d6a8f1e3b5b7e2c4d6a8f1e3b5',
          category: 'PAYOUT',
          sub_type: 'standard',
          amount_minor: '45000',
          currency: 'USD',
          payee_id_hmac: 'hmac:c4d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1',
        },
        decision: {
          result: 'APPROVED',
          reason_codes: ['PAYEE_TRUSTED'],
          policy_version: 'pol_12',
          decided_at: '2026-11-07T10:00:00Z',
        },
        ledger: {
          org_id: TEST_ORG,
          seq: 1042,
          entry_hash: 'sha256:9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
          prev_hash: 'sha256:7d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e',
        },
      },
      testPrivKey,
      TEST_KID,
    );
  });

  await t.test('POST /v1/verify/receipt returns 200 VERIFIED for valid SAR', async () => {
    const res = await fetch(`${url}/v1/verify/receipt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sar: validSar, mode: 'online' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.valid, true);
    assert.equal(body.status, 'VERIFIED');
  });

  await t.test('POST /v1/verify/batch returns batch results', async () => {
    const res = await fetch(`${url}/v1/verify/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ receipts: [validSar] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.results.length, 1);
    assert.equal(body.results[0].status, 'VERIFIED');
  });

  await t.test('POST /v1/handshake/initiate and GET /v1/handshake/:id', async () => {
    const initRes = await fetch(`${url}/v1/handshake/initiate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requester_org_id: testOrgId,
        target_org_id: testOrgId,
        agent_id: crypto.randomUUID(),
        request_intent: { category: 'PAYOUT', amount_minor: '1000', currency: 'USD' },
      }),
    });
    assert.equal(initRes.status, 201);
    const initBody = await initRes.json();
    assert.ok(initBody.handshake_id);
    assert.equal(initBody.status, 'PENDING');

    const getRes = await fetch(`${url}/v1/handshake/${initBody.handshake_id}`);
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.handshake_id, initBody.handshake_id);
  });

  await t.test('GET /v1/revocations returns cursor pagination', async () => {
    const res = await fetch(`${url}/v1/revocations?limit=5`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.events));
    assert.ok(typeof body.has_more === 'boolean');
  });

  await t.test('GET /protocol serves HTML protocol documentation', async () => {
    const res = await fetch(`${url}/protocol`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type')?.includes('text/html'));
    const text = await res.text();
    assert.ok(text.includes('JOBENPAY Open Trust Exchange'));
  });

  await t.test('GET /v1/protocol/versions returns active version 1.0', async () => {
    const res = await fetch(`${url}/v1/protocol/versions`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.versions.length >= 1);
    assert.equal(body.versions[0].protocol_version, '1.0');
  });

  await t.test('GET /v1/protocol/conformance/vectors returns 10 vectors', async () => {
    const res = await fetch(`${url}/v1/protocol/conformance/vectors`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.vectors.length, 10);
  });

  await t.test('POST /api/v1/proofs creates proof, GET /proof/:id serves HTML and JSON', async () => {
    const createRes = await fetch(`${url}/api/v1/proofs`, {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify({
        sar_id: validSar.sar_id,
        sar_json: validSar,
        expires_in_days: 30,
      }),
    });
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.ok(createBody.proof_id);

    // HTML view
    const htmlRes = await fetch(`${url}/proof/${createBody.proof_id}`, {
      headers: { 'Accept': 'text/html' },
    });
    assert.equal(htmlRes.status, 200);
    const htmlText = await htmlRes.text();
    assert.ok(htmlText.includes('Proof of Authorization'));
    assert.ok(htmlText.includes('VERIFIED'));

    // JSON view
    const jsonRes = await fetch(`${url}/proof/${createBody.proof_id}`, {
      headers: { 'Accept': 'application/json' },
    });
    assert.equal(jsonRes.status, 200);
    const jsonBody = await jsonRes.json();
    assert.equal(jsonBody.verification.status, 'VERIFIED');
  });

  closeTestApp(server);
});
