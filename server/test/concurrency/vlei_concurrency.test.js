/**
 * server/test/concurrency/vlei_concurrency.test.js
 * PRD 1.4 Trust Infrastructure (Fase A: vLEI Integration, WP7 Concurrency Test)
 * Tests 100 concurrent link operations: guarantees idempotency, zero duplicates, and indexed lookups.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { canonicalJson } from '../../../shared/canonical.js';
import { linkVlei } from '../../src/services/vlei_service.js';

function createTestVleiCredential(lei) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPubKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const publicKeyHex = rawPubKey.toString('hex');

  const now = new Date();
  const verifiedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();

  const unsignedData = {
    lei,
    legal_name: 'Concurrent Corp',
    jurisdiction: 'DE',
    verified_at: verifiedAt,
    expires_at: expiresAt,
    issuer: 'GLEIF',
  };

  const canonicalBytes = Buffer.from(canonicalJson(unsignedData), 'utf8');
  const signatureHex = crypto.sign(null, canonicalBytes, privateKey).toString('hex');

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

function generateRandomLei() {
  return '549300' + crypto.randomBytes(7).toString('hex').toUpperCase();
}

test('PRD 1.4 Fase A: 100 Parallel vLEI Links Concurrency Suite', async (t) => {
  await t.test('100 concurrent link requests result in 0 duplicates and consistent ACTIVE identity', async () => {
    const orgId = crypto.randomUUID();
    const slug = `concurrent-org-${orgId.slice(0, 8)}`;
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Concurrent Org', slug]);

    const lei = generateRandomLei();
    const cred = createTestVleiCredential(lei);

    const payload = {
      lei,
      vlei_credential: cred.vlei_credential,
      vlei_issuer: 'GLEIF',
      verified_at: cred.verified_at,
      expires_at: cred.expires_at,
      legal_name: cred.legal_name,
      jurisdiction: cred.jurisdiction,
    };

    // Execute 100 parallel linkVlei invocations
    const promises = Array.from({ length: 100 }, () => linkVlei(orgId, payload));
    const results = await Promise.allSettled(promises);

    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(rejected.length, 0, `All 100 concurrent links should succeed, but got errors: ${rejected.map(r => r.reason?.message).join(', ')}`);

    const countRes = await pool.query('SELECT count(*)::int AS count FROM org_legal_identity WHERE org_id = $1', [orgId]);
    assert.equal(countRes.rows[0].count, 1, 'Exactly 1 legal identity record must exist (0 duplicates)');

    // Verify index scan requirement (PRD 1.4 §5.2) with enable_seqscan=off for small test tables
    await pool.query('BEGIN');
    await pool.query('SET LOCAL enable_seqscan = off');
    const explainRes = await pool.query('EXPLAIN ANALYZE SELECT * FROM org_legal_identity WHERE org_id = $1', [orgId]);
    await pool.query('COMMIT');

    const plan = explainRes.rows.map((r) => r['QUERY PLAN']).join('\n');
    assert.ok(
      plan.includes('Index Scan') || plan.includes('Bitmap Index Scan') || plan.includes('idx_org_legal_identity') || plan.includes('org_legal_identity_org_id_key'),
      `Query must use index: ${plan}`
    );
  });
});
