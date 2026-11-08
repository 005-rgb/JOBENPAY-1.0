// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJplPolicy, JplPolicySchema } from '../../../shared/jpl_schema.js';
import { compile, computePolicyHash } from '../../src/services/jpl_compiler.js';
import { evaluate } from '../../src/services/jpl_evaluator.js';
import { verify } from '../../src/services/jpl_verifier.js';
import {
  evaluatePolicy,
  evaluateStageB,
  evaluateUnifiedDecision,
} from '../../src/services/decision_engine.js';
import { generateEd25519Keys, signEd25519 } from '../../src/lib/crypto.js';

test('PRD 2.0 §7.3 Fase 2: Policy Engine Test Suite', async (t) => {
  const validPolicy = {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9A',
    policy_name: 'Unified Production Safeguard Policy',
    metadata: {
      description: 'Test policy for PRD 2.0 Fase 2',
      author: 'Security Admin',
    },
    rules: [
      {
        rule_id: 'rule_deny_sanctioned',
        priority: 10,
        description: 'Deny sanctioned countries',
        conditions: [
          { field: 'payee.country', operator: 'in', value: ['KP', 'IR', 'SY'] },
        ],
        outcome: 'DENY',
        outcome_params: { reason_code: 'SANCTIONED_COUNTRY' },
      },
      {
        rule_id: 'rule_escalate_large_amount',
        priority: 5,
        description: 'Require approval if amount >= 100000',
        conditions: [
          { field: 'amount_minor', operator: 'gte', value: 100000 },
        ],
        outcome: 'REQUIRE_APPROVAL',
        outcome_params: { reason_code: 'LARGE_AMOUNT_ESCALATION' },
      },
      {
        rule_id: 'rule_permit_standard',
        priority: 1,
        description: 'Permit standard low value payouts',
        conditions: [
          { field: 'amount_minor', operator: 'lt', value: 50000 },
        ],
        outcome: 'PERMIT',
      },
    ],
    default_outcome: 'DENY',
  };

  // 1. test_jpl_schema_valid: Policy valid lolos schema
  await t.test('test_jpl_schema_valid', () => {
    const res = validateJplPolicy(validPolicy);
    assert.equal(res.valid, true);
    assert.ok(res.policy);
    assert.equal(res.policy.policy_id, validPolicy.policy_id);

    const parseRes = JplPolicySchema.safeParse(validPolicy);
    assert.equal(parseRes.success, true);
  });

  // 2. test_jpl_schema_invalid: Policy invalid -> error
  await t.test('test_jpl_schema_invalid', () => {
    const invalidPolicy = {
      ...validPolicy,
      policy_id: 'invalid-id-without-prefix',
      rules: [], // rules must have minItems: 1
    };
    const res = validateJplPolicy(invalidPolicy);
    assert.equal(res.valid, false);
    assert.ok(res.errors.length > 0);

    assert.throws(() => {
      compile(invalidPolicy);
    }, /INVALID_POLICY_SCHEMA/);
  });

  // 3. test_jpl_compile: Compile berfungsi
  await t.test('test_jpl_compile', () => {
    const compiled = compile(validPolicy);
    assert.ok(compiled);
    assert.equal(compiled.policy_id, validPolicy.policy_id);
    assert.equal(compiled.rules.length, 3);
    assert.ok(compiled.policy_hash.startsWith('sha256:'));
    // Priority order: 1 (permit), 5 (escalate), 10 (deny)
    assert.equal(compiled.rules[0].rule_id, 'rule_permit_standard');
    assert.equal(compiled.rules[1].rule_id, 'rule_escalate_large_amount');
    assert.equal(compiled.rules[2].rule_id, 'rule_deny_sanctioned');
  });

  // 4. test_jpl_evaluate: Evaluate berfungsi
  await t.test('test_jpl_evaluate', () => {
    const compiled = compile(validPolicy);

    // Context standard: amount 20000 -> PERMIT
    const resPermit = evaluate(compiled, { amount_minor: 20000, payee: { country: 'ID' } });
    assert.equal(resPermit.outcome, 'PERMIT');
    assert.equal(resPermit.rule_id, 'rule_permit_standard');

    // Context amount 150000 -> REQUIRE_APPROVAL
    const resEscalate = evaluate(compiled, { amount_minor: 150000, payee: { country: 'ID' } });
    assert.equal(resEscalate.outcome, 'REQUIRE_APPROVAL');
    assert.equal(resEscalate.rule_id, 'rule_escalate_large_amount');
    assert.equal(resEscalate.reason_code, 'LARGE_AMOUNT_ESCALATION');

    // Context unmatched -> default outcome (DENY)
    const resDefault = evaluate(compiled, { amount_minor: 75000, payee: { country: 'ID' } });
    assert.equal(resDefault.outcome, 'DENY');
    assert.equal(resDefault.rule_id, null);
  });

  // 5. test_jpl_verify: Verify berfungsi
  await t.test('test_jpl_verify', () => {
    const keys = generateEd25519Keys();
    const policyHash = computePolicyHash(validPolicy);
    const sig = signEd25519(keys.privateKey, policyHash);

    const signedPolicy = {
      ...validPolicy,
      signature: {
        alg: 'Ed25519',
        kid: 'key_ops_1',
        sig: `base64:${sig}`,
      },
    };

    const verifyResult = verify(signedPolicy, { publicKey: keys.publicKey });
    assert.equal(verifyResult.valid, true);
    assert.equal(verifyResult.policy_id, validPolicy.policy_id);
    assert.equal(verifyResult.policy_hash, policyHash);

    // Tampered policy fails
    const tampered = { ...signedPolicy, policy_name: 'Tampered Name' };
    const tamperedResult = verify(tampered, { publicKey: keys.publicKey });
    assert.equal(tamperedResult.valid, false);
  });

  // 6. test_jpl_explicit_deny: DENY selalu menang
  await t.test('test_jpl_explicit_deny', () => {
    // Both rule_permit_standard (priority 1) AND rule_deny_sanctioned (priority 10) match!
    // Explicit Deny Precedence: DENY MUST win unconditionally even with lower priority number
    const context = {
      amount_minor: 20000, // matches rule_permit_standard (priority 1)
      payee: { country: 'KP' }, // matches rule_deny_sanctioned (priority 10)
    };

    const res = evaluate(validPolicy, context);
    assert.equal(res.outcome, 'DENY');
    assert.equal(res.rule_id, 'rule_deny_sanctioned');
    assert.equal(res.reason_code, 'SANCTIONED_COUNTRY');
  });

  // 7. test_jpl_fail_closed: Error -> DENY
  await t.test('test_jpl_fail_closed', () => {
    // Malformed policy input to evaluator -> resolves to DENY with EVALUATION_ERROR
    const resError = evaluate(null, { amount_minor: 1000 });
    assert.equal(resError.outcome, 'DENY');
    assert.equal(resError.reason_code, 'EVALUATION_ERROR');

    // Thrown error during evaluatePolicy -> resolves to outcome: DENY, decision: REJECT, code: JPL_EVALUATION_ERROR
    const badInput = {
      get amount_minor() {
        throw new Error('Fatal getter error');
      },
    };
    const policyWithCondition = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9B',
      policy_name: 'Throwing Policy',
      rules: [
        {
          rule_id: 'rule_throw',
          priority: 1,
          conditions: [{ field: 'amount_minor', operator: 'gt', value: 10 }],
          outcome: 'PERMIT',
        },
      ],
      default_outcome: 'DENY',
    };
    // evaluate handles rule error fail-closed and falls back to default_outcome
    const evalThrowRes = evaluate(policyWithCondition, badInput);
    assert.equal(evalThrowRes.outcome, 'DENY');
  });

  // 8. test_jpl_integration: Terintegrasi di Tahap B
  await t.test('test_jpl_integration', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM entities')) {
          return {
            rowCount: 1,
            rows: [{ entity_type: 'ISSUER', status: 'ACTIVE', legal_entity_lei: '5493001KJTIIGC8Y1R12' }],
          };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    // Case 1: Transaction with JPL policy that permits -> Tahap B PASS -> APPROVED
    const permitTx = {
      amount_minor: 15000,
      payee: { country: 'ID' },
      intent_mandate_id: null,
      require_intent: false,
      dis_score: 95,
      cpl_score: 95,
      policy: validPolicy,
    };
    const permitRes = await evaluateUnifiedDecision('org_test_1', permitTx, {}, mockDb);
    assert.equal(permitRes.decision, 'APPROVE');
    assert.equal(permitRes.state, 'APPROVED');
    assert.equal(permitRes.tahapB.decision, 'PASS');
    assert.equal(permitRes.tahapB.policy.outcome, 'PERMIT');

    // Case 2: Transaction with JPL policy that denies -> Tahap B REJECT -> REJECTED
    const denyTx = {
      amount_minor: 15000,
      payee: { country: 'KP' }, // Sanctioned
      intent_mandate_id: null,
      require_intent: false,
      dis_score: 95,
      cpl_score: 95,
      policy: validPolicy,
    };
    const denyRes = await evaluateUnifiedDecision('org_test_1', denyTx, {}, mockDb);
    assert.equal(denyRes.decision, 'REJECT');
    assert.equal(denyRes.state, 'REJECTED');
    assert.equal(denyRes.tahapB.decision, 'REJECT');
    assert.equal(denyRes.tahapB.code, 'SANCTIONED_COUNTRY');
    assert.ok(denyRes.reason_codes.includes('SANCTIONED_COUNTRY'));

    // Case 3: Transaction with JPL policy that escalates -> Tahap B REQUIRE_APPROVAL -> NEEDS_APPROVAL
    const escalateTx = {
      amount_minor: 120000, // Large amount
      payee: { country: 'ID' },
      intent_mandate_id: null,
      require_intent: false,
      dis_score: 95,
      cpl_score: 95,
      policy: validPolicy,
    };
    const escalateRes = await evaluateUnifiedDecision('org_test_1', escalateTx, {}, mockDb);
    assert.equal(escalateRes.decision, 'REQUIRE_APPROVAL');
    assert.equal(escalateRes.state, 'NEEDS_APPROVAL');
    assert.equal(escalateRes.tahapB.decision, 'REQUIRE_APPROVAL');
    assert.ok(escalateRes.reason_codes.includes('LARGE_AMOUNT_ESCALATION'));

    // Case 4: Policy evaluation error fails-closed to REJECT
    const brokenTx = {
      amount_minor: 1000,
      intent_mandate_id: null,
      require_intent: false,
      dis_score: 95,
      cpl_score: 95,
      policy: 'invalid json string policy',
    };
    const brokenRes = await evaluateUnifiedDecision('org_test_1', brokenTx, {}, mockDb);
    assert.equal(brokenRes.decision, 'REJECT');
    assert.equal(brokenRes.state, 'REJECTED');
    assert.ok(brokenRes.reason_codes.includes('EVALUATION_ERROR') || brokenRes.reason_codes.includes('JPL_EVALUATION_ERROR') || brokenRes.reason_codes.includes('POLICY_DENY'));
  });
});
