/**
 * server/test/unit/vlei_service.test.js
 * PRD 1.4 Trust Infrastructure (Fase A: vLEI Integration, WP7 Unit Test Suite)
 * Tests 100% coverage of vlei_service logic: verification, status, lifecycle, and SAR.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { canonicalJson } from '../../../shared/canonical.js';
import {
  linkVlei,
  getVleiStatus,
  hasActiveVlei,
  verifyCredentialSignature,
  parseEd25519PublicKey,
} from '../../src/services/vlei_service.js';
import { generateSar, buildSarWithVlei, verifySar, SAR_VERSION } from '../../src/services/sar.js';
import { evaluateRequest } from '../../src/services/decision/engine.js';
import { AppError } from '../../src/lib/errors.js';
import { postVleiLink, getVleiStatusHandler } from '../../src/controllers/vlei_controller.js';

function createTestVleiCredential(lei, options = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const rawPubKey = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
  const publicKeyHex = rawPubKey.toString('hex');

  const now = new Date();
  const verifiedAt = options.verified_at || now.toISOString();
  const expiresAt = options.expires_at || new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();

  const unsignedData = {
    lei,
    legal_name: options.legal_name || 'Acme Global Corp',
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

async function createOrgFixture(namePrefix) {
  const orgId = crypto.randomUUID();
  const slug = `${namePrefix}-${orgId.slice(0, 8)}`;
  await pool.query(
    'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)',
    [orgId, `Org ${namePrefix}`, slug]
  );
  return orgId;
}

function generateRandomLei() {
  return '549300' + crypto.randomBytes(7).toString('hex').toUpperCase();
}

test('PRD 1.4 Fase A: vLEI Service Unit Tests', async (t) => {
  await t.test('test_vlei_valid_credential: links valid credential and verifies active status', async () => {
    const orgId = await createOrgFixture('vlei-valid');
    const lei1 = generateRandomLei();
    const cred = createTestVleiCredential(lei1);

    const result = await linkVlei(orgId, {
      lei: lei1,
      vlei_credential: cred.vlei_credential,
      vlei_issuer: 'GLEIF',
      verified_at: cred.verified_at,
      expires_at: cred.expires_at,
      legal_name: cred.legal_name,
      jurisdiction: cred.jurisdiction,
    });

    assert.ok(result.identity_id);
    assert.equal(result.status, 'ACTIVE');
    assert.equal(result.lei, lei1);
    assert.equal(result.legal_name, 'Acme Global Corp');

    const status = await getVleiStatus(orgId);
    assert.equal(status.status, 'ACTIVE');
    assert.equal(status.lei, lei1);

    const active = await hasActiveVlei(orgId);
    assert.equal(active, true);
  });

  await t.test('test_vlei_invalid_signature: rejects invalid signature with 400 VLEI_INVALID', async () => {
    const orgId = await createOrgFixture('vlei-invalidsig');
    const lei = generateRandomLei();
    const cred = createTestVleiCredential(lei, { invalid_signature: true });

    await assert.rejects(
      async () => {
        await linkVlei(orgId, {
          lei,
          vlei_credential: cred.vlei_credential,
          vlei_issuer: 'GLEIF',
          verified_at: cred.verified_at,
          expires_at: cred.expires_at,
        });
      },
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'VLEI_INVALID');
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  await t.test('test_vlei_expired: rejects credential with past expires_at with 400 VLEI_EXPIRED', async () => {
    const orgId = await createOrgFixture('vlei-expired');
    const lei = generateRandomLei();
    const past = new Date(Date.now() - 1000 * 3600 * 24).toISOString();
    const pastVerified = new Date(Date.now() - 1000 * 3600 * 48).toISOString();
    const cred = createTestVleiCredential(lei, { verified_at: pastVerified, expires_at: past });

    await assert.rejects(
      async () => {
        await linkVlei(orgId, {
          lei,
          vlei_credential: cred.vlei_credential,
          vlei_issuer: 'GLEIF',
          verified_at: cred.verified_at,
          expires_at: cred.expires_at,
        });
      },
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'VLEI_EXPIRED');
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  });

  await t.test('test_vlei_duplicate_lei: rejects duplicate LEI across organizations with 409 LEI_ALREADY_LINKED', async () => {
    const org1 = await createOrgFixture('vlei-dup-1');
    const org2 = await createOrgFixture('vlei-dup-2');
    const duplicateLei = generateRandomLei();
    const cred = createTestVleiCredential(duplicateLei);

    await linkVlei(org1, {
      lei: duplicateLei,
      vlei_credential: cred.vlei_credential,
      vlei_issuer: 'GLEIF',
      verified_at: cred.verified_at,
      expires_at: cred.expires_at,
    });

    await assert.rejects(
      async () => {
        await linkVlei(org2, {
          lei: duplicateLei,
          vlei_credential: cred.vlei_credential,
          vlei_issuer: 'GLEIF',
          verified_at: cred.verified_at,
          expires_at: cred.expires_at,
        });
      },
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.code, 'LEI_ALREADY_LINKED');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });

  await t.test('test_vlei_sar_includes_lei: SAR payload includes legal_entity_lei and vlei_verified', async () => {
    const orgId = await createOrgFixture('vlei-sar');
    const sarLei = generateRandomLei();
    const cred = createTestVleiCredential(sarLei);

    await linkVlei(orgId, {
      lei: sarLei,
      vlei_credential: cred.vlei_credential,
      vlei_issuer: 'GLEIF',
      verified_at: cred.verified_at,
      expires_at: cred.expires_at,
    });

    const sar = await buildSarWithVlei({
      orgId,
      intent: {
        intent_id: crypto.randomUUID(),
        org_id: orgId,
        category: 'PAYOUT',
        sub_type: 'standard',
        status: 'COMPLETED',
        amount_minor: 50000n,
        currency: 'USD',
        request_hash: 'req_hash_sar_vlei_test',
      },
      legs: [
        { legType: 'DEBIT', accountRef: 'org:main', amountMinor: 50000n },
        { legType: 'CREDIT', accountRef: 'payee:supplier', amountMinor: 50000n },
      ],
      executions: [],
    });

    assert.equal(sar.legal_entity_lei, sarLei);
    assert.equal(sar.vlei_verified, true);
    assert.equal(verifySar(sar).valid, true);
  });

  await t.test('test_vlei_inactive_rejects_transaction: Decision Engine rejects when vLEI is inactive/expired', async () => {
    const orgId = await createOrgFixture('vlei-de-inactive');
    const inactiveContext = {
      org: { id: orgId },
      agent: { id: crypto.randomUUID(), status: 'ACTIVE' },
      mandate: { id: crypto.randomUUID(), status: 'ACTIVE' },
      version: {
        id: crypto.randomUUID(),
        valid_from: '2020-01-01T00:00:00Z',
        valid_to: '2099-01-01T00:00:00Z',
      },
      policy: {
        allowedActions: ['PAYOUT'],
        currency: 'USD',
        perTransactionCapMinor: 10000,
        budget: { limitMinor: 50000 },
        autoApproveBelowMinor: 5000,
        payees: { ids: ['payee-test'] },
        schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
        velocity: { maxRequestsPerHour: 10, maxPayoutPerPayeePerDay: 5 },
      },
      payee: { id: 'payee-test', display_name: 'Test Payee', trust: 'TRUSTED' },
      history: { requestsLastHour: 0, payeePayoutsToday: 0, duplicate: false },
      vlei: {
        identity_id: crypto.randomUUID(),
        lei: '5493001KJTIIGC8Y1R12',
        status: 'EXPIRED',
      },
    };

    const evaluation = await evaluateRequest({
      request: {
        amount_minor: 1000n,
        currency: 'USD',
        action: 'PAYOUT',
      },
      context: inactiveContext,
    });

    assert.equal(evaluation.stageA.ok, false);
    assert.ok(evaluation.stageA.failures.some((f) => f.code === 'VLEI_INACTIVE'));
    assert.equal(evaluation.decision, 'REJECT');
  });

  await t.test('test_vlei_helper_edge_cases: coverage for parseEd25519PublicKey and helpers', () => {
    assert.equal(parseEd25519PublicKey(null), null);
    assert.equal(parseEd25519PublicKey('invalid-format'), null);
    assert.equal(verifyCredentialSignature({}), false);
    assert.equal(verifyCredentialSignature({ signature: 'abc', public_key: null }), false);

    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const jwk = publicKey.export({ format: 'jwk' });
    assert.ok(parseEd25519PublicKey(jwk));

    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    assert.ok(parseEd25519PublicKey(pem));

    // parse base64 32-byte key
    const raw32 = publicKey.export({ type: 'spki', format: 'der' }).subarray(12);
    assert.ok(parseEd25519PublicKey(raw32.toString('base64')));

    // parse full DER spki key (>32 bytes)
    const derSpki = publicKey.export({ type: 'spki', format: 'der' });
    assert.ok(parseEd25519PublicKey(derSpki.toString('base64')));

    // base64 signature
    assert.equal(verifyCredentialSignature({ public_key: pem, signature: Buffer.alloc(64).toString('base64') }), false);

    // catch block in verifyCredentialSignature via circular object in unsignedData
    const circ = { public_key: pem, signature: 'deadbeef' };
    circ.loop = circ;
    assert.equal(verifyCredentialSignature(circ), false);
  });

  await t.test('test_vlei_coverage_edge_cases: covers 100% of branches and error paths', async () => {
    // null orgId
    await assert.rejects(() => linkVlei(null, {}), (err) => err.code === 'UNAUTHORIZED');
    assert.equal(await getVleiStatus(null), null);
    assert.equal(await hasActiveVlei(null), false);

    // non-existent org
    const freshOrg = crypto.randomUUID();
    const inactive = await getVleiStatus(freshOrg);
    assert.equal(inactive.status, 'INACTIVE');
    assert.equal(await hasActiveVlei(freshOrg), false);

    // invalid schema body
    await assert.rejects(() => linkVlei(freshOrg, { lei: 'too-short' }), (err) => err.code === 'VLEI_INVALID');

    // LEI mismatch
    const leiA = generateRandomLei();
    const leiB = generateRandomLei();
    const credA = createTestVleiCredential(leiA);
    credA.vlei_credential.lei = leiB;
    await assert.rejects(
      () => linkVlei(freshOrg, { lei: leiA, vlei_credential: credA.vlei_credential }),
      (err) => err.code === 'LEI_MISMATCH' && err.statusCode === 422
    );

    // missing expiry
    const credNoExpiry = createTestVleiCredential(leiA);
    delete credNoExpiry.vlei_credential.expires_at;
    delete credNoExpiry.expires_at;
    await assert.rejects(
      () => linkVlei(freshOrg, { lei: leiA, vlei_credential: credNoExpiry.vlei_credential }),
      (err) => err.code === 'VLEI_INVALID' && err.statusCode === 400
    );

    // expires_at <= verified_at
    const now = new Date();
    const credBadOrder = createTestVleiCredential(leiA, {
      verified_at: new Date(now.getTime() + 100000).toISOString(),
      expires_at: new Date(now.getTime() + 50000).toISOString(),
    });
    await assert.rejects(
      () => linkVlei(freshOrg, {
        lei: leiA,
        vlei_credential: credBadOrder.vlei_credential,
        verified_at: new Date(now.getTime() + 100000).toISOString(),
        expires_at: new Date(now.getTime() + 50000).toISOString(),
      }),
      (err) => err.code === 'VLEI_INVALID' && err.statusCode === 400
    );

    // keyObject null check in verifyCredentialSignature
    assert.equal(verifyCredentialSignature({ public_key: 'not-valid-pubkey', signature: 'deadbeef' }), false);

    // linkVlei with credential-level verified_at/legal_name/jurisdiction
    const credOrg = await createOrgFixture('vlei-cred-level');
    const credLei = generateRandomLei();
    const credLevel = createTestVleiCredential(credLei, {
      legal_name: 'Cred Level Corp',
      jurisdiction: 'GB',
    });
    const credRes = await linkVlei(credOrg, {
      lei: credLei,
      vlei_credential: credLevel.vlei_credential,
    });
    assert.equal(credRes.legal_name, 'Cred Level Corp');

    // linkVlei with default fallbacks (no verified_at, legal_name, jurisdiction anywhere)
    const fallbackOrg = await createOrgFixture('vlei-fallback');
    const fallbackLei = generateRandomLei();
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
    const pubHex = publicKey.export({ type: 'spki', format: 'der' }).subarray(12).toString('hex');
    const nowIso = new Date().toISOString();
    const futureIso = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    const bareData = { lei: fallbackLei, expires_at: futureIso };
    const bareSig = crypto.sign(null, Buffer.from(canonicalJson(bareData), 'utf8'), privateKey).toString('hex');
    const fbRes = await linkVlei(fallbackOrg, {
      lei: fallbackLei,
      vlei_credential: { ...bareData, public_key: pubHex, signature: bareSig },
    });
    assert.equal(fbRes.legal_name, 'Verified Legal Entity');

    // effectiveStatus 'EXPIRED' branch in getVleiStatus with CHECK (expires_at > verified_at) satisfied
    await pool.query(
      "UPDATE org_legal_identity SET verified_at = now() - interval '2 days', expires_at = now() - interval '1 day' WHERE org_id = $1",
      [fallbackOrg]
    );
    const expiredStatus = await getVleiStatus(fallbackOrg);
    assert.equal(expiredStatus.status, 'EXPIRED');
  });

  await t.test('test_vlei_controller_edge_cases: coverage for controller error handling', async () => {
    let nextErr = null;
    await postVleiLink({ org: null, session: null, user: null, body: {} }, {}, (err) => { nextErr = err; });
    assert.ok(nextErr);

    let nextErr2 = null;
    let handledJson = null;
    await getVleiStatusHandler(
      { org: { id: crypto.randomUUID() } },
      { status: () => ({ json: (d) => { handledJson = d; } }) },
      (err) => { nextErr2 = err; }
    );
    assert.equal(nextErr2, null);
    assert.ok(handledJson);

    // trigger catch block in getVleiStatusHandler by passing throwing req object
    let statusErr = null;
    const throwingReq = {
      get org() { throw new Error('simulated error'); }
    };
    await getVleiStatusHandler(throwingReq, {}, (err) => { statusErr = err; });
    assert.ok(statusErr);

    // test resolveOrgId branches (session and user)
    await postVleiLink({ session: { current_org_id: crypto.randomUUID() }, body: {} }, {}, () => {});
    await postVleiLink({ user: { org_id: crypto.randomUUID() }, body: {} }, {}, () => {});
  });
});
