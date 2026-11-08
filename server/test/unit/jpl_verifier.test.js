// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { verify } from '../../src/services/jpl_verifier.js';
import { computePolicyHash } from '../../src/services/jpl_compiler.js';
import { generateEd25519Keys, signEd25519 } from '../../src/lib/crypto.js';

test('JPL Verifier Unit Test Suite (PRD 1.8 §9.3)', async (t) => {
  const keys = generateEd25519Keys();

  const basePolicy = {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
    policy_name: 'Verifier Test Policy',
    rules: [
      {
        rule_id: 'rule_sample',
        priority: 1,
        conditions: [{ field: 'request.category', operator: 'eq', value: 'PAYOUT' }],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  };

  const hash = computePolicyHash(basePolicy);
  const signatureBase64 = signEd25519(keys.privateKey, hash);
  const signedPolicy = {
    ...basePolicy,
    signature: {
      alg: 'Ed25519',
      kid: 'kid_test_verifier',
      sig: `base64:${signatureBase64}`,
    },
  };

  await t.test('test_verify_valid_signature: Signature valid -> true', () => {
    const res = verify(signedPolicy, { publicKey: keys.publicKey, expectedHash: hash });
    assert.equal(res.valid, true);
    assert.equal(res.policy_hash, hash);
  });

  await t.test('test_verify_invalid_signature: Signature invalid -> false', () => {
    const corruptedPolicy = {
      ...signedPolicy,
      signature: {
        ...signedPolicy.signature,
        sig: 'base64:' + Buffer.alloc(64, 0xaa).toString('base64'),
      },
    };
    const res = verify(corruptedPolicy, { publicKey: keys.publicKey });
    assert.equal(res.valid, false);
    const sigCheck = res.checks.find((c) => c.name === 'SIGNATURE_VERIFICATION');
    assert.equal(sigCheck?.passed, false);
  });

  await t.test('test_verify_hash_match: Hash cocok -> true', () => {
    const res = verify(basePolicy, { expectedHash: hash });
    assert.equal(res.valid, true);
    const hashCheck = res.checks.find((c) => c.name === 'HASH_VERIFICATION');
    assert.equal(hashCheck?.passed, true);
  });

  await t.test('test_verify_hash_mismatch: Hash berbeda -> false', () => {
    const res = verify(basePolicy, { expectedHash: 'sha256:' + '0'.repeat(64) });
    assert.equal(res.valid, false);
    const hashCheck = res.checks.find((c) => c.name === 'HASH_VERIFICATION');
    assert.equal(hashCheck?.passed, false);
  });

  await t.test('test_verify_no_signature: Tanpa signature -> valid (opsional)', () => {
    const res = verify(basePolicy);
    assert.equal(res.valid, true);
    assert.ok(res.checks.some((c) => c.name === 'SIGNATURE_PRESENT'));
  });

  await t.test('test_verify_string_input: JSON string valid dan invalid', () => {
    const validJsonRes = verify(JSON.stringify(basePolicy));
    assert.equal(validJsonRes.valid, true);

    const invalidJsonRes = verify('{ bad json');
    assert.equal(invalidJsonRes.valid, false);
    assert.equal(invalidJsonRes.checks[0].name, 'JSON_SYNTAX');
  });

  await t.test('test_verify_schema_invalid: Skema tidak valid -> false', () => {
    const res = verify({ jpl_version: '9.9' });
    assert.equal(res.valid, false);
    assert.equal(res.checks[0].name, 'SCHEMA_VALIDATION');
  });

  await t.test('test_verify_unsupported_alg_and_bad_length: Format signature invalid', () => {
    const unsupportedAlg = {
      ...basePolicy,
      signature: {
        alg: 'RS256',
        kid: 'key_1',
        sig: 'base64:abcd',
      },
    };
    const resAlg = verify(unsupportedAlg);
    assert.equal(resAlg.valid, false);
    assert.ok(resAlg.checks.some((c) => c.name === 'SIGNATURE_ALGORITHM' && !c.passed));

    const badLengthSig = {
      ...basePolicy,
      signature: {
        alg: 'Ed25519',
        kid: 'key_1',
        sig: 'base64:' + Buffer.alloc(32).toString('base64'), // 32 bytes instead of 64
      },
    };
    const resLen = verify(badLengthSig);
    assert.equal(resLen.valid, false);
    assert.ok(resLen.checks.some((c) => c.name === 'SIGNATURE_FORMAT' && !c.passed));
  });

  await t.test('test_verify_signature_without_public_key: Valid format tanpa public key', () => {
    const res = verify(signedPolicy);
    assert.equal(res.valid, true);
    const sigCheck = res.checks.find((c) => c.name === 'SIGNATURE_VERIFICATION');
    assert.equal(sigCheck?.passed, true);
  });
});
