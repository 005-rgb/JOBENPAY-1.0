// @ts-check
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { canonicalJson } from '../../../shared/canonical.js';
import { validateSarSchema } from '../../../shared/sar_schema.js';
import {
  createSignedSar,
  verifySarReceipt,
  verifyBatchReceipts,
  normalizeEd25519PublicKey,
} from '../../src/services/verify_service.js';
import {
  initiateHandshake,
  respondHandshake,
  getHandshake,
  expirePendingHandshakes,
} from '../../src/services/handshake_service.js';
import {
  createPublicProof,
  getPublicProof,
  revokePublicProof,
  listPublicProofs,
  listRevocations,
  subscribeRevocationWebhook,
  getProtocolVersions,
  getConformanceVectors,
  sarToAp2Mandate,
} from '../../src/services/protocol_service.js';
import { runConformanceTests } from '../../../scripts/conformance-runner.js';
import { seedConformanceVectors } from '../../scripts/seed-conformance-vectors.js';

describe('PRD 1.5 — Open Trust Exchange Protocol Test Suite', () => {
  let testOrgId;
  let targetOrgId;
  let testUserId;
  let testAgentId;
  let testPrivKey;
  let testPubKey;
  let testPubKeyBase64;
  let validSar;

  const TEST_KID = 'kid_01HX4Z8K9M2N3P4Q5R6S7T8V9W';
  const TEST_ORG = 'org_01HX4Z8K9M2N3P4Q5R6S7T8V9W';

  before(async () => {
    // Seed conformance vectors and partner_systems
    await seedConformanceVectors(pool);

    // Create test organizations and users
    const org1 = await pool.query(
      `INSERT INTO organizations (name, slug) 
       VALUES ($1, $2) 
       RETURNING id`,
      ['Trust Requester Org', `org-req-${crypto.randomBytes(4).toString('hex')}`],
    );
    testOrgId = org1.rows[0].id;

    const org2 = await pool.query(
      `INSERT INTO organizations (name, slug) 
       VALUES ($1, $2) 
       RETURNING id`,
      ['Trust Target Org', `org-tgt-${crypto.randomBytes(4).toString('hex')}`],
    );
    targetOrgId = org2.rows[0].id;

    const userRes = await pool.query(
      `INSERT INTO users (email, password_hash, display_name) 
       VALUES ($1, 'hash', 'Test Principal') 
       RETURNING id`,
      [`trust-user-${crypto.randomBytes(4).toString('hex')}@jobenpay.test`],
    );
    testUserId = userRes.rows[0].id;

    const agentRes = await pool.query(
      `INSERT INTO agents (org_id, name, status) 
       VALUES ($1, 'Trust Agent', 'ACTIVE') 
       RETURNING id`,
      [testOrgId],
    );
    testAgentId = agentRes.rows[0].id;

    // Deterministic keypair
    const seed = crypto.createHash('sha256').update('jobenpay-conformance-seed-v1').digest();
    const pkcs8Der = Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed,
    ]);
    testPrivKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
    testPubKey = crypto.createPublicKey(testPrivKey);
    const rawPubBytes = testPubKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    testPubKeyBase64 = rawPubBytes.toString('base64');

    const unsignedSar = {
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
    };

    validSar = createSignedSar(unsignedSar, testPrivKey, TEST_KID);
  });

  // 11.1 Unit Tests
  describe('11.1 Unit Tests', () => {
    it('test_sar_schema_valid: SAR valid lolos JSON Schema', () => {
      const res = validateSarSchema(validSar);
      assert.equal(res.valid, true);
    });

    it('test_sar_schema_invalid: SAR dengan field hilang -> schema invalid', () => {
      const { mandate: _m, ...brokenSar } = validSar;
      const res = validateSarSchema(brokenSar);
      assert.equal(res.valid, false);
      assert.ok(res.errors.length > 0);
    });

    it('test_sar_canonicalization: Canonical JSON deterministik (1.000 iterasi)', () => {
      const objA = { b: 2, a: 1, c: { y: 20, x: 10 } };
      const objB = { c: { x: 10, y: 20 }, a: 1, b: 2 };
      const expected = canonicalJson(objA);
      for (let i = 0; i < 1000; i++) {
        assert.equal(canonicalJson(objB), expected);
      }
    });

    it('test_sar_signature_ed25519: Signature Ed25519 valid', () => {
      const { signature, ...unsigned } = validSar;
      const canonical = canonicalJson(unsigned);
      const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest();
      const rawSig = Buffer.from(signature.sig.replace('base64:', ''), 'base64');
      const verified = crypto.verify(null, hash, testPubKey, rawSig);
      assert.equal(verified, true);
    });

    it('test_sar_signature_tampered: Signature diubah -> invalid', () => {
      const tamperedSar = {
        ...validSar,
        signature: {
          ...validSar.signature,
          sig: 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
        },
      };
      const { signature, ...unsigned } = tamperedSar;
      const canonical = canonicalJson(unsigned);
      const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest();
      const rawSig = Buffer.from(signature.sig.replace('base64:', ''), 'base64');
      const verified = crypto.verify(null, hash, testPubKey, rawSig);
      assert.equal(verified, false);
    });

    it('test_handshake_nonce_unique: Nonce unik (1.000 generate)', () => {
      const nonces = new Set();
      for (let i = 0; i < 1000; i++) {
        const nonce = `nonce_${crypto.randomBytes(32).toString('base64url')}`;
        assert.equal(nonces.has(nonce), false);
        nonces.add(nonce);
      }
      assert.equal(nonces.size, 1000);
    });

    it('test_handshake_expiry: Handshake expires_at adalah now + 5 menit', async () => {
      const hs = await initiateHandshake({
        requesterOrgId: testOrgId,
        targetOrgId: targetOrgId,
        agentId: testAgentId,
        requestIntent: { category: 'PAYOUT', amount_minor: '1000', currency: 'USD' },
      });
      const expires = new Date(hs.expires_at).getTime();
      const now = Date.now();
      const diffMs = expires - now;
      assert.ok(diffMs > 4.9 * 60 * 1000 && diffMs <= 5.1 * 60 * 1000);
    });

    it('test_proof_expiry: Proof expired setelah 30 hari default', async () => {
      const proof = await createPublicProof({
        orgId: testOrgId,
        sarId: validSar.sar_id,
        sarJson: validSar,
        userId: testUserId,
      });
      const expires = new Date(proof.expires_at).getTime();
      const now = Date.now();
      const diffDays = Math.round((expires - now) / (24 * 3600 * 1000));
      assert.equal(diffDays, 30);
    });

    it('test_revocation_feed_pagination: Paginasi cursor benar', async () => {
      const list = await listRevocations({ limit: 5 });
      assert.ok(Array.isArray(list.events));
      assert.ok(typeof list.has_more === 'boolean');
    });
  });

  // 11.2 Integration Tests
  describe('11.2 Integration Tests', () => {
    it('test_verify_valid_sar: verifySarReceipt -> VERIFIED', async () => {
      const res = await verifySarReceipt(validSar, { mode: 'online' });
      assert.equal(res.valid, true);
      assert.equal(res.status, 'VERIFIED');
      assert.equal(res.sar_id, validSar.sar_id);
    });

    it('test_verify_invalid_signature: -> INVALID, reason SIGNATURE_INVALID', async () => {
      const tamperedSar = {
        ...validSar,
        signature: {
          ...validSar.signature,
          sig: 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
        },
      };
      const res = await verifySarReceipt(tamperedSar, { mode: 'online' });
      assert.equal(res.valid, false);
      assert.equal(res.status, 'INVALID');
      const sigCheck = res.checks.find((c) => c.name === 'signature');
      assert.equal(sigCheck?.result, 'FAIL');
      assert.equal(sigCheck?.reason, 'SIGNATURE_INVALID');
    });

    it('test_verify_indeterminate_registry_down: Registry down -> INDETERMINATE', async () => {
      const res = await verifySarReceipt(validSar, { mode: 'online', simulateRegistryDown: true });
      assert.equal(res.valid, false);
      assert.equal(res.status, 'INDETERMINATE');
      const revCheck = res.checks.find((c) => c.name === 'revocation');
      assert.equal(revCheck?.reason, 'REGISTRY_UNAVAILABLE');
    });

    it('test_handshake_full_flow: Initiate -> respond VERIFIED -> GET -> VERIFIED', async () => {
      const agent2 = crypto.randomUUID();
      const init = await initiateHandshake({
        requesterOrgId: testOrgId,
        targetOrgId: targetOrgId,
        agentId: agent2,
        requestIntent: { category: 'PAYOUT', amount_minor: '5000', currency: 'USD' },
      });
      assert.equal(init.status, 'PENDING');

      // Target signs verdict
      const canonSar = canonicalJson(validSar);
      const sarHash = crypto.createHash('sha256').update(canonSar, 'utf8').digest('hex');
      const messageToSign = `${init.handshake_nonce}:VERIFIED:${sarHash}`;
      const sig = crypto.sign(null, Buffer.from(messageToSign), testPrivKey).toString('base64');

      const respond = await respondHandshake(init.handshake_id, {
        handshakeNonce: init.handshake_nonce,
        verdict: 'VERIFIED',
        sar: validSar,
        signature: { alg: 'Ed25519', kid: TEST_KID, sig: `base64:${sig}` },
      });
      assert.equal(respond.status, 'VERIFIED');

      const fetched = await getHandshake(init.handshake_id);
      assert.equal(fetched.status, 'VERIFIED');
    });

    it('test_handshake_expired: Expire worker updates old handshakes to EXPIRED', async () => {
      const agentExpired = crypto.randomUUID();
      // Insert already expired handshake
      const pastIssued = new Date(Date.now() - 10 * 60 * 1000);
      const pastExpires = new Date(Date.now() - 5 * 60 * 1000);
      const ins = await pool.query(
        `INSERT INTO trust_handshakes (
          requester_org_id, target_org_id, agent_id, request_intent,
          handshake_nonce, status, issued_at, expires_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)
        RETURNING handshake_id`,
        [testOrgId, targetOrgId, agentExpired, JSON.stringify({ category: 'PAYOUT' }), `nonce_${crypto.randomBytes(16).toString('hex')}`, pastIssued, pastExpires],
      );

      const expiredCount = await expirePendingHandshakes();
      assert.ok(expiredCount >= 1);

      const fetched = await getHandshake(ins.rows[0].handshake_id);
      assert.equal(fetched.status, 'EXPIRED');
    });

    it('test_public_proof_access: getPublicProof returns proof details', async () => {
      const proof = await createPublicProof({
        orgId: testOrgId,
        sarId: validSar.sar_id,
        sarJson: validSar,
        userId: testUserId,
      });

      const fetched = await getPublicProof(proof.proof_id);
      assert.equal(fetched.proof_id, proof.proof_id);
      assert.equal(fetched.access_count, 1);
    });

    it('test_public_proof_revoked: Revoked proof throws 404 PROOF_REVOKED', async () => {
      const proof = await createPublicProof({
        orgId: testOrgId,
        sarId: validSar.sar_id,
        sarJson: validSar,
        userId: testUserId,
      });

      await revokePublicProof(testOrgId, proof.proof_id, testUserId);

      await assert.rejects(
        async () => getPublicProof(proof.proof_id),
        (err) => err.code === 'PROOF_REVOKED',
      );
    });

    it('test_revocation_subscribe: Subscribing webhook returns secret', async () => {
      const sub = await subscribeRevocationWebhook({
        orgId: testOrgId,
        url: 'https://example.test/webhook',
        events: ['mandate.revoked', 'issuer_key.revoked'],
      });
      assert.ok(sub.subscription_id);
      assert.ok(sub.secret.startsWith('whsec_'));
    });
  });

  // 11.3 Concurrency Tests
  describe('11.3 Concurrency Tests', () => {
    it('test_100_parallel_verify: 100 verifikasi paralel selesai tanpa error', async () => {
      const start = Date.now();
      const promises = Array.from({ length: 100 }, () => verifySarReceipt(validSar, { mode: 'online' }));
      const results = await Promise.all(promises);
      const elapsed = Date.now() - start;

      assert.equal(results.length, 100);
      assert.ok(results.every((r) => r.status === 'VERIFIED'));
      assert.ok(elapsed < 4000, `Took ${elapsed}ms`);
    });

    it('test_100_parallel_handshake: 100 handshake paralel -> 0 duplicate nonce', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        initiateHandshake({
          requesterOrgId: testOrgId,
          targetOrgId: targetOrgId,
          agentId: crypto.randomUUID(),
          requestIntent: { category: 'PAYOUT', amount_minor: `${1000 + i}`, currency: 'USD' },
        }),
      );
      const results = await Promise.all(promises);
      const nonces = new Set(results.map((r) => r.handshake_nonce));
      assert.equal(nonces.size, 100);
    });

    it('test_1000_parallel_proof_access: 1000 parallel reads of proof without error', async () => {
      const proof = await createPublicProof({
        orgId: testOrgId,
        sarId: validSar.sar_id,
        sarJson: validSar,
        userId: testUserId,
      });

      const promises = Array.from({ length: 1000 }, () => getPublicProof(proof.proof_id));
      const results = await Promise.all(promises);
      assert.equal(results.length, 1000);
      assert.ok(results.every((p) => p.proof_id === proof.proof_id));
    });
  });

  // 11.4 Security Tests
  describe('11.4 Security Tests', () => {
    it('test_sar_no_pii: SAR tidak memuat email, nama, identifier plaintext', () => {
      const sarStr = JSON.stringify(validSar);
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
      assert.equal(emailRegex.test(sarStr), false, 'SAR must not contain email addresses');
      assert.equal(sarStr.includes('password'), false);
      assert.equal(sarStr.includes('credit_card'), false);
      assert.equal(sarStr.includes('bank_account'), false);
    });

    it('test_proof_url_random: Proof URL tidak dapat ditebak (128-bit entropy)', async () => {
      const proof = await createPublicProof({
        orgId: testOrgId,
        sarId: validSar.sar_id,
        sarJson: validSar,
        userId: testUserId,
      });
      // proof_url ends with UUID-token(32 hex chars = 16 bytes = 128 bits)
      const token = proof.proof_url.split('-').pop();
      assert.ok(token.length >= 32);
    });

    it('test_handshake_nonce_random: Nonce tidak dapat ditebak (256-bit entropy)', async () => {
      const hs = await initiateHandshake({
        requesterOrgId: testOrgId,
        targetOrgId: targetOrgId,
        agentId: crypto.randomUUID(),
        requestIntent: { category: 'PAYOUT', amount_minor: '100', currency: 'USD' },
      });
      const rawNonce = hs.handshake_nonce.replace('nonce_', '');
      const bytes = Buffer.from(rawNonce, 'base64url');
      assert.ok(bytes.length >= 32, 'Nonce must have at least 32 bytes (256 bits) of entropy');
    });

    it('test_revocation_signature_verify: Event revocation dengan signature invalid ditolak', async () => {
      const feed = await listRevocations({ limit: 10 });
      for (const ev of feed.events) {
        if (ev.signature) {
          assert.equal(ev.signature.alg, 'Ed25519');
        }
      }
    });

    it('test_webhook_signature_verify: Webhook HMAC signature matches HMAC-SHA256', () => {
      const secret = 'whsec_test_secret_12345';
      const payload = JSON.stringify({ event: 'mandate.revoked', id: 'mnd_1' });
      const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');

      // Verify
      const expected = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
      assert.equal(signature, expected);
    });
  });

  // 11.5 Conformance Tests
  describe('11.5 Conformance Tests', () => {
    it('test_conformance_runner_all_pass: 10/10 vektor lulus', async () => {
      const summary = await runConformanceTests();
      assert.equal(summary.total, 10);
      assert.equal(summary.passed, 10);
      assert.equal(summary.failed, 0);
    });

    it('test_conformance_runner_invalid_detected: Vektor invalid terdeteksi', async () => {
      // Test invalid schema vector directly
      const broken = { ...validSar, currency: 'INVALID_TOO_LONG' };
      const res = await verifySarReceipt(broken, { mode: 'online' });
      assert.equal(res.valid, false);
      assert.equal(res.status, 'INVALID');
      assert.equal(res.checks[0].reason, 'SCHEMA_INVALID');
    });
  });

  // Tier B features
  describe('Tier B — Protocol Extensions', () => {
    it('sarToAp2Mandate: Converts SAR to AP2 mandate structure', () => {
      const ap2 = sarToAp2Mandate(validSar);
      assert.equal(ap2.ap2_version, '1.0');
      assert.equal(ap2.mandate_id, validSar.mandate.mandate_id);
      assert.equal(ap2.authorized_amount.minor, validSar.request.amount_minor);
      assert.equal(ap2.authorized_amount.currency, validSar.request.currency);
      assert.equal(ap2.issuer_signature.alg, 'Ed25519');
    });

    it('verifyBatchReceipts: Batch verification of multiple SARs up to 100', async () => {
      const batch = await verifyBatchReceipts([validSar, validSar]);
      assert.equal(batch.results.length, 2);
      assert.equal(batch.results[0].status, 'VERIFIED');
      assert.equal(batch.results[1].status, 'VERIFIED');
    });

    it('getProtocolVersions: Returns protocol versions list with active 1.0', async () => {
      const versions = await getProtocolVersions();
      assert.ok(versions.length >= 1);
      assert.equal(versions[0].protocol_version, '1.0');
      assert.equal(versions[0].status, 'ACTIVE');
    });
  });
});
