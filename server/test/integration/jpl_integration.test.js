// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate, verify } from '../../../shared/jpl/index.js';
import { generateEd25519Keys, signEd25519 } from '../../src/lib/crypto.js';

test('JPL Integration Test Suite (PRD 1.8 §9.5)', async (t) => {
  const keys = generateEd25519Keys();

  const policy = {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
    policy_name: 'E2E Payout Policy',
    rules: [
      {
        rule_id: 'rule_deny_frozen',
        priority: 1,
        conditions: [{ field: 'org.frozen', operator: 'eq', value: true }],
        outcome: 'DENY',
        outcome_params: { reason_code: 'ORG_FROZEN' },
      },
      {
        rule_id: 'rule_permit_standard',
        priority: 10,
        conditions: [
          { field: 'request.category', operator: 'eq', value: 'PAYOUT' },
          { field: 'request.amount_minor', operator: 'lte', value: 50000 },
        ],
        outcome: 'PERMIT',
        outcome_params: { reason_code: 'PAYOUT_ALLOWED' },
      },
    ],
    default_outcome: 'DENY',
  };

  await t.test('test_e2e_compile_evaluate: Policy -> compile -> evaluate -> outcome benar', () => {
    const compiled = compile(policy);
    const res = evaluate(compiled, {
      request: { category: 'PAYOUT', amount_minor: 25000 },
      org: { frozen: false },
    });
    assert.equal(res.outcome, 'PERMIT');
    assert.equal(res.reason_code, 'PAYOUT_ALLOWED');
  });

  await t.test('test_e2e_verify_evaluate: Policy -> verify -> compile -> evaluate -> outcome benar', () => {
    const verResult = verify(policy);
    assert.equal(verResult.valid, true);

    const compiled = compile(policy);
    const res = evaluate(compiled, {
      request: { category: 'PAYOUT', amount_minor: 25000 },
      org: { frozen: true }, // Should trigger priority 1 DENY
    });
    assert.equal(res.outcome, 'DENY');
    assert.equal(res.reason_code, 'ORG_FROZEN');
  });

  await t.test('test_e2e_with_signature: Policy bertanda tangan -> verify -> evaluate', () => {
    const verified = verify(policy);
    const sig = signEd25519(keys.privateKey, verified.policy_hash);
    const signedPolicy = {
      ...policy,
      signature: {
        alg: 'Ed25519',
        kid: 'kid_test_e2e',
        sig: `base64:${sig}`,
      },
    };

    const verRes = verify(signedPolicy, { publicKey: keys.publicKey });
    assert.equal(verRes.valid, true);

    const compiled = compile(signedPolicy, { publicKey: keys.publicKey });
    const res = evaluate(compiled, {
      request: { category: 'PAYOUT', amount_minor: 10000 },
      org: { frozen: false },
    });
    assert.equal(res.outcome, 'PERMIT');
  });
});
