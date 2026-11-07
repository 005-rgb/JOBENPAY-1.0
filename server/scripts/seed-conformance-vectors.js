// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pool from '../src/db/pool.js';
import { createSignedSar } from '../src/services/verify_service.js';

// Deterministic Ed25519 keypair for vectors so keys are permanent and consistent
const seed = crypto.createHash('sha256').update('jobenpay-conformance-seed-v1').digest();
const pkcs8Der = Buffer.concat([
  Buffer.from('302e020100300506032b657004220420', 'hex'),
  seed,
]);
const privateKey = crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
const publicKey = crypto.createPublicKey(privateKey);
const rawPubBytes = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
const pubKeyBase64 = rawPubBytes.toString('base64');
const pubKeyX = rawPubBytes.toString('hex');

const TEST_KID = 'kid_01HX4Z8K9M2N3P4Q5R6S7T8V9W';
const TEST_ORG = 'org_01HX4Z8K9M2N3P4Q5R6S7T8V9W';

export async function seedConformanceVectors(dbPool = pool) {
  // Ensure public/vectors directory exists
  const vectorsDir = path.resolve(process.cwd(), 'public/vectors');
  fs.mkdirSync(vectorsDir, { recursive: true });

  // 1. Ensure partner_systems / issuer key exists for TEST_KID
  await dbPool.query(
    `DELETE FROM partner_systems WHERE partner_name = 'Jobenpay Conformance Test Suite'`,
  );
  await dbPool.query(
    `INSERT INTO partner_systems (
      partner_name, partner_type, base_url, public_key_jwk, status
    ) VALUES ($1, 'SIMULATED', 'https://jobenpay.io', $2, 'ACTIVE')`,
    [
      'Jobenpay Conformance Test Suite',
      JSON.stringify({
        kty: 'OKP',
        crv: 'Ed25519',
        kid: TEST_KID,
        x: pubKeyBase64,
      }),
    ],
  );

  // Base Valid Payout SAR
  const basePayoutSar = {
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
      document_sha256: 'sha256:e8f3a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
    },
    decision: {
      result: 'APPROVED',
      reason_codes: ['PAYEE_TRUSTED'],
      policy_version: 'pol_12',
      decided_at: '2026-11-07T10:00:00Z',
      approver_hmac: 'hmac:f2a9b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2',
    },
    ledger: {
      org_id: TEST_ORG,
      seq: 1042,
      entry_hash: 'sha256:9b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c',
      prev_hash: 'sha256:7d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e',
    },
  };

  const validPayout = createSignedSar(basePayoutSar, privateKey, TEST_KID);

  // Base Valid Down Payment SAR
  const baseDownPaymentSar = {
    ...basePayoutSar,
    sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8V9A',
    request: {
      ...basePayoutSar.request,
      request_id: 'req_01HX4Z8K9M2N3P4Q5R6S7T8V9A',
      category: 'DOWN_PAYMENT',
      sub_type: 'milestone_1',
      amount_minor: '150000',
    },
  };
  const validDownPayment = createSignedSar(baseDownPaymentSar, privateKey, TEST_KID);

  // Vector 3: invalid_signature
  const invalidSignature = {
    ...validPayout,
    signature: {
      ...validPayout.signature,
      sig: 'base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    },
  };

  // Vector 4: invalid_schema (missing mandate)
  const { mandate: _m, ...invalidSchema } = validPayout;

  // Vector 5: expired_mandate
  const expiredMandate = createSignedSar(
    {
      ...basePayoutSar,
      sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8V9B',
      mandate: {
        ...basePayoutSar.mandate,
        valid_from: '2020-01-01T00:00:00Z',
        valid_to: '2020-02-01T00:00:00Z',
      },
    },
    privateKey,
    TEST_KID,
  );

  // Vector 6: revoked_issuer_key
  const revokedIssuerKey = createSignedSar(
    {
      ...basePayoutSar,
      sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8V9C',
    },
    privateKey,
    'kid_01HX4Z8K9M2N3P4Q5R6S7T8REV',
  );

  // Vector 7: revoked_mandate
  const revokedMandate = createSignedSar(
    {
      ...basePayoutSar,
      sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8V9D',
      mandate: {
        ...basePayoutSar.mandate,
        mandate_id: 'mnd_01HX4Z8K9M2N3P4Q5R6S7T8REV',
      },
    },
    privateKey,
    TEST_KID,
  );

  // Vector 8: hash_mismatch_request
  const hashMismatchRequest = createSignedSar(
    {
      ...basePayoutSar,
      sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8V9E',
      request: {
        ...basePayoutSar.request,
        request_hash: 'sha256:mismatch00000000000000000000000000000000000000000000000000000000',
      },
    },
    privateKey,
    TEST_KID,
  );

  // Vector 9: hash_mismatch_policy
  const hashMismatchPolicy = createSignedSar(
    {
      ...basePayoutSar,
      sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8V9F',
      mandate: {
        ...basePayoutSar.mandate,
        policy_hash: 'sha256:mismatch00000000000000000000000000000000000000000000000000000000',
      },
    },
    privateKey,
    TEST_KID,
  );

  // Vector 10: registry_unavailable
  const registryUnavailable = {
    ...validPayout,
    sar_id: 'sar_01HX4Z8K9M2N3P4Q5R6S7T8REG',
    issuer: {
      ...validPayout.issuer,
      org_id: 'org_01HX4Z8K9M2N3P4Q5R6S7T8REG',
      issuer_key_id: 'kid_01HX4Z8K9M2N3P4Q5R6S7T8REG',
    },
  };

  const vectors = [
    {
      name: 'valid_payout',
      category: 'SIGNATURE',
      expected: 'VALID',
      reason: null,
      sar: validPayout,
    },
    {
      name: 'valid_down_payment',
      category: 'SIGNATURE',
      expected: 'VALID',
      reason: null,
      sar: validDownPayment,
    },
    {
      name: 'invalid_signature',
      category: 'SIGNATURE',
      expected: 'INVALID',
      reason: 'SIGNATURE_INVALID',
      sar: invalidSignature,
    },
    {
      name: 'invalid_schema',
      category: 'SCHEMA',
      expected: 'INVALID',
      reason: 'SCHEMA_INVALID',
      sar: invalidSchema,
    },
    {
      name: 'expired_mandate',
      category: 'EXPIRY',
      expected: 'INVALID',
      reason: 'MANDATE_EXPIRED',
      sar: expiredMandate,
    },
    {
      name: 'revoked_issuer_key',
      category: 'REVOCATION',
      expected: 'INVALID',
      reason: 'ISSUER_KEY_REVOKED',
      sar: revokedIssuerKey,
    },
    {
      name: 'revoked_mandate',
      category: 'REVOCATION',
      expected: 'INVALID',
      reason: 'MANDATE_REVOKED',
      sar: revokedMandate,
    },
    {
      name: 'hash_mismatch_request',
      category: 'HASH',
      expected: 'INVALID',
      reason: 'REQUEST_HASH_MISMATCH',
      sar: hashMismatchRequest,
    },
    {
      name: 'hash_mismatch_policy',
      category: 'HASH',
      expected: 'INVALID',
      reason: 'POLICY_HASH_MISMATCH',
      sar: hashMismatchPolicy,
    },
    {
      name: 'registry_unavailable',
      category: 'REVOCATION',
      expected: 'INDETERMINATE',
      reason: 'REGISTRY_UNAVAILABLE',
      sar: registryUnavailable,
    },
  ];

  for (const v of vectors) {
    // Write JSON file to public/vectors/
    const filePath = path.join(vectorsDir, `${v.name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(v.sar, null, 2), 'utf8');

    // Upsert to DB
    await dbPool.query(
      `INSERT INTO conformance_vectors (
        vector_name, sar_json, expected_result, expected_reason, category
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (vector_name) DO UPDATE SET
        sar_json = EXCLUDED.sar_json,
        expected_result = EXCLUDED.expected_result,
        expected_reason = EXCLUDED.expected_reason,
        category = EXCLUDED.category`,
      [v.name, JSON.stringify(v.sar), v.expected, v.reason, v.category],
    );
  }

  return { seeded: vectors.length };
}

// Standalone execution
if (process.argv[1]?.endsWith('seed-conformance-vectors.js')) {
  try {
    const res = await seedConformanceVectors();
    console.log(`Successfully seeded ${res.seeded} conformance vectors.`);
    process.exit(0);
  } catch (err) {
    console.error('Failed to seed conformance vectors:', err);
    process.exit(1);
  }
}
