/**
 * server/test/integration/intent_api.test.js
 * PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP6 Integration Test Suite)
 * Tests REST API routes for bounded human intent mandates via HTTP.
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
    [userId, `owner-${slug}@jobenpay.test`, 'dummy-hash', `Owner ${slugPrefix}`]
  );
  await pool.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, userId, 'OWNER', false]
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
      'Cookie': `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
    },
  };
}

test('PRD 1.4 Fase B: Intent REST API Integration Tests', async (t) => {
  const { server, url } = await startTestApp();

  t.after(async () => {
    await closeTestApp(server);
  });

  await t.test('POST /api/v1/intents -> 201 Created with valid hash, signature, and status', async () => {
    const fixture = await createOrgAndSession('intent-api-post');

    const res = await fetch(`${url}/api/v1/intents`, {
      method: 'POST',
      headers: fixture.headers,
      body: JSON.stringify({
        natural_language_input: 'Beli laptop untuk tim engineering, budget maks $2000, hanya dari vendor terdaftar',
        structured_intent: {
          purpose: 'equipment_purchase',
          amount_range: { min: 0, max: 200000 },
          vendor_categories: ['electronics', 'office_equipment'],
          deadline: '2026-12-31T23:59:59Z',
        },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.intent_id);
    assert.equal(body.status, 'ACTIVE');
    assert.ok(body.intent_hash.startsWith('sha256:'));
    assert.ok(body.signature.startsWith('ed25519:'));
  });

  await t.test('POST /api/v1/intents -> 400 Bad Request for invalid payload schema', async () => {
    const fixture = await createOrgAndSession('intent-api-bad');

    const res = await fetch(`${url}/api/v1/intents`, {
      method: 'POST',
      headers: fixture.headers,
      body: JSON.stringify({
        natural_language_input: '',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'VALIDATION_FAILED');
  });

  await t.test('POST /api/v1/intents/:intent_id/revoke -> 200 OK revokes mandate', async () => {
    const fixture = await createOrgAndSession('intent-api-revoke');

    const createRes = await fetch(`${url}/api/v1/intents`, {
      method: 'POST',
      headers: fixture.headers,
      body: JSON.stringify({
        natural_language_input: 'Intent to be revoked via API',
        structured_intent: {
          purpose: 'software_license',
          amount_range: { min: 0, max: 50000 },
          vendor_categories: ['saas'],
        },
      }),
    });
    assert.equal(createRes.status, 201);
    const created = await createRes.json();

    const revokeRes = await fetch(`${url}/api/v1/intents/${created.intent_id}/revoke`, {
      method: 'POST',
      headers: fixture.headers,
      body: JSON.stringify({}),
    });
    assert.equal(revokeRes.status, 200);
    const revoked = await revokeRes.json();
    assert.equal(revoked.status, 'REVOKED');

    const getRes = await fetch(`${url}/api/v1/intents/${created.intent_id}`, {
      headers: fixture.headers,
    });
    assert.equal(getRes.status, 200);
    const fetched = await getRes.json();
    assert.equal(fetched.status, 'REVOKED');
  });
});
