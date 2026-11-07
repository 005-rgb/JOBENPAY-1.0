/**
 * server/test/integration/pact_api.test.js
 * PRD 1.4 Trust Infrastructure (Fase C: PACT Arbitration & Bonding, WP6 Integration Tests)
 * Tests REST API routes for PACT contracts via HTTP.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { createSession } from '../../src/repositories/sessions.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';

async function createOrgAndSession(slugPrefix) {
  const orgId = crypto.randomUUID();
  const slug = `${slugPrefix}-${orgId.slice(0, 8)}`;
  await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, `Org ${slugPrefix}`, slug]);

  const userId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
    [userId, `owner-${slug}@jobenpay.test`, 'dummy-hash', `Owner ${slugPrefix}`],
  );
  await pool.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, userId, 'OWNER', false],
  );

  const csrfToken = crypto.randomUUID();
  const { token: sessionToken } = await createSession(orgId, {
    userId,
    currentOrgId: orgId,
    csrfSecret: csrfToken,
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
  });

  return {
    orgId,
    userId,
    headers: {
      'content-type': 'application/json',
      Cookie: `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
    },
  };
}

async function createIntentFixture(orgId) {
  const intentId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const mandateVerId = crypto.randomUUID();
  const reqHash = `sha256:${crypto.randomBytes(32).toString('hex')}`;
  const idemKey = `idem_${crypto.randomUUID()}`;

  await pool.query(
    `INSERT INTO transaction_intents (
       intent_id, org_id, agent_id, category, sub_type, status,
       amount_minor, currency, mandate_version_id, request_hash, idempotency_key
     ) VALUES ($1, $2, $3, 'SALE', 'standard', 'APPROVED', 50000, 'USD', $4, $5, $6)`,
    [intentId, orgId, agentId, mandateVerId, reqHash, idemKey],
  );
  return intentId;
}

test('PRD 1.4 Fase C: PACT REST API Integration Tests', async (t) => {
  const { server, url } = await startTestApp();

  try {
    const buyer = await createOrgAndSession('pact-api-buyer');
    const seller = await createOrgAndSession('pact-api-seller');
    const intentId = await createIntentFixture(buyer.orgId);

    let contractId;

    await t.test('POST /api/v1/pact/contracts -> 201 Created with status PROPOSED', async () => {
      const res = await fetch(`${url}/api/v1/pact/contracts`, {
        method: 'POST',
        headers: buyer.headers,
        body: JSON.stringify({
          buyer_intent_id: intentId,
          seller_org_id: seller.orgId,
          task_spec_hash: 'sha256:api-test-spec',
          price_minor: 50000,
          currency: 'USD',
          verification_tier: 'T0-reexec',
          seller_bond_minor: 5000,
          challenge_window_seconds: 3600,
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.ok(json.contract_id);
      assert.equal(json.status, 'PROPOSED');
      contractId = json.contract_id;
    });

    await t.test('GET /api/v1/pact/contracts/:id -> 200 OK', async () => {
      const res = await fetch(`${url}/api/v1/pact/contracts/${contractId}`, {
        method: 'GET',
        headers: buyer.headers,
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.contract_id, contractId);
      assert.equal(json.status, 'PROPOSED');
    });

    await t.test('POST /api/v1/pact/contracts/:id/fund -> 200 OK transitions to IN_PROGRESS', async () => {
      const res = await fetch(`${url}/api/v1/pact/contracts/${contractId}/fund`, {
        method: 'POST',
        headers: buyer.headers,
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.escrow_id);
      assert.equal(json.held_minor, 50000);
      assert.equal(json.status, 'FUNDED');
    });

    await t.test('POST /api/v1/pact/contracts/:id/deliver -> 200 OK transitions to DELIVERED', async () => {
      const res = await fetch(`${url}/api/v1/pact/contracts/${contractId}/deliver`, {
        method: 'POST',
        headers: seller.headers,
        body: JSON.stringify({
          work_attestation: { output: 'valid_api_work' },
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.status, 'DELIVERED');
    });

    await t.test('POST /api/v1/pact/contracts/:id/verify -> 200 OK transitions to VERIFIED', async () => {
      const res = await fetch(`${url}/api/v1/pact/contracts/${contractId}/verify`, {
        method: 'POST',
        headers: buyer.headers,
        body: JSON.stringify({
          verdict: 'PASS',
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.status, 'VERIFIED');
    });

    await t.test('POST /api/v1/pact/contracts/:id/settle -> 200 OK transitions to SETTLED', async () => {
      const res = await fetch(`${url}/api/v1/pact/contracts/${contractId}/settle`, {
        method: 'POST',
        headers: seller.headers,
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.status, 'SETTLED');
    });

    await t.test('POST /api/v1/pact/contracts -> 400 Bad Request on invalid schema', async () => {
      const res = await fetch(`${url}/api/v1/pact/contracts`, {
        method: 'POST',
        headers: buyer.headers,
        body: JSON.stringify({ price_minor: -1 }),
      });

      assert.equal(res.status, 400);
    });
  } finally {
    await closeTestApp(server);
  }
});
