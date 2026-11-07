/**
 * server/test/integration/vlei_api.test.js
 * PRD 1.4 Trust Infrastructure (Fase A: vLEI Integration, WP7 Integration Tests)
 * Tests HTTP REST endpoints: POST /api/v1/trust/vlei/link and GET /api/v1/trust/vlei/status
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { canonicalJson } from '../../../shared/canonical.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';

function createTestVleiCredential(lei, options = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPubKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const publicKeyHex = rawPubKey.toString('hex');

  const now = new Date();
  const verifiedAt = options.verified_at || now.toISOString();
  const expiresAt = options.expires_at || new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();

  const unsignedData = {
    lei,
    legal_name: options.legal_name || 'Acme API Corp',
    jurisdiction: options.jurisdiction || 'US',
    verified_at: verifiedAt,
    expires_at: expiresAt,
    issuer: options.issuer || 'GLEIF',
  };

  const canonicalBytes = Buffer.from(canonicalJson(unsignedData), 'utf8');
  const signatureHex = options.invalid_signature
    ? 'deadbeef0102030405060708deadbeef0102030405060708deadbeef0102030405060708deadbeef0102030405060708deadbeef0102030405060708deadbeef01020304'
    : crypto.sign(null, canonicalBytes, privateKey).toString('hex');

  return {
    vlei_credential: {
      ...unsignedData,
      public_key: publicKeyHex,
      signature: signatureHex,
    },
    verified_at: verifiedAt,
    expires_at: expiresAt,
    legal_name: unsignedData.legal_name,
    jurisdiction: unsignedData.jurisdiction,
  };
}

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

function generateRandomLei() {
  return '549300' + crypto.randomBytes(7).toString('hex').toUpperCase();
}

test('PRD 1.4 Fase A: vLEI REST API Integration Tests', async (t) => {
  const { server, url } = await startTestApp();

  try {
    await t.test('POST /api/v1/trust/vlei/link -> 201 Created for valid vLEI credential', async () => {
      const { headers } = await createOrgAndSession('api-valid');
      const lei = generateRandomLei();
      const cred = createTestVleiCredential(lei);

      const res = await fetch(`${url}/api/v1/trust/vlei/link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lei,
          vlei_credential: cred.vlei_credential,
          vlei_issuer: 'GLEIF',
          verified_at: cred.verified_at,
          expires_at: cred.expires_at,
          legal_name: cred.legal_name,
          jurisdiction: cred.jurisdiction,
        }),
      });

      assert.equal(res.status, 201);
      const data = await res.json();
      assert.ok(data.identity_id);
      assert.equal(data.status, 'ACTIVE');
      assert.equal(data.lei, lei);
      assert.equal(data.legal_name, 'Acme API Corp');
    });

    await t.test('POST /api/v1/trust/vlei/link -> 400 Bad Request for invalid signature or format', async () => {
      const { headers } = await createOrgAndSession('api-invalid');
      const lei = generateRandomLei();
      const cred = createTestVleiCredential(lei, { invalid_signature: true });

      const res = await fetch(`${url}/api/v1/trust/vlei/link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lei,
          vlei_credential: cred.vlei_credential,
          vlei_issuer: 'GLEIF',
          verified_at: cred.verified_at,
          expires_at: cred.expires_at,
        }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code || data.code, 'VLEI_INVALID');
    });

    await t.test('GET /api/v1/trust/vlei/status -> 200 OK returns status of linked identity', async () => {
      const { headers } = await createOrgAndSession('api-status');
      const lei = generateRandomLei();
      const cred = createTestVleiCredential(lei);

      // Link first
      const linkRes = await fetch(`${url}/api/v1/trust/vlei/link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lei,
          vlei_credential: cred.vlei_credential,
          vlei_issuer: 'GLEIF',
          verified_at: cred.verified_at,
          expires_at: cred.expires_at,
        }),
      });
      assert.equal(linkRes.status, 201);

      // Query status
      const statusRes = await fetch(`${url}/api/v1/trust/vlei/status`, {
        method: 'GET',
        headers,
      });

      assert.equal(statusRes.status, 200);
      const statusData = await statusRes.json();
      assert.equal(statusData.status, 'ACTIVE');
      assert.equal(statusData.lei, lei);
      assert.ok(statusData.identity_id);
    });
  } finally {
    await closeTestApp(server);
  }
});
