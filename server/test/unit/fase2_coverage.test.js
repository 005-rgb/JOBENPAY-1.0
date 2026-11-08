// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCondition } from '../../src/services/jpl_compiler.js';
import { evaluate } from '../../src/services/jpl_evaluator.js';
import {
  evaluatePolicy,
  evaluateStageB,
  evaluateUnifiedDecision,
  finalDecision,
} from '../../src/services/decision_engine.js';

test('Fase 2: 100% Comprehensive Coverage Suite', async (t) => {
  // 1. jpl_compiler.js condition operator branches
  await t.test('jpl_compiler branches for neq, contains, not_contains, matches, not_matches', () => {
    // neq null and undefined
    const neqCond = compileCondition({ field: 'x', operator: 'neq', value: 'foo' });
    assert.equal(neqCond({ x: null }), false);
    assert.equal(neqCond({ x: undefined }), false);
    assert.equal(neqCond({ x: 'bar' }), true);

    // neq with non-string and case_sensitive: false
    const neqNonString = compileCondition({ field: 'x', operator: 'neq', value: 123, case_sensitive: false });
    assert.equal(neqNonString({ x: 456 }), true);
    assert.equal(neqNonString({ x: 123 }), false);

    // contains null and undefined
    const containsCond = compileCondition({ field: 'x', operator: 'contains', value: 'foo' });
    assert.equal(containsCond({ x: null }), false);
    assert.equal(containsCond({ x: undefined }), false);

    // not_contains null and undefined
    const notContainsCond = compileCondition({ field: 'x', operator: 'not_contains', value: 'foo' });
    assert.equal(notContainsCond({ x: null }), false);
    assert.equal(notContainsCond({ x: undefined }), false);

    // matches with case_sensitive: false
    const matchesInsensitive = compileCondition({ field: 'x', operator: 'matches', value: '^hello$', case_sensitive: false });
    assert.equal(matchesInsensitive({ x: 'HELLO' }), true);
    assert.equal(matchesInsensitive({ x: 'WORLD' }), false);

    // not_matches with case_sensitive: false
    const notMatchesInsensitive = compileCondition({ field: 'x', operator: 'not_matches', value: '^hello$', case_sensitive: false });
    assert.equal(notMatchesInsensitive({ x: 'HELLO' }), false);
    assert.equal(notMatchesInsensitive({ x: 'WORLD' }), true);
  });

  // 2. jpl_evaluator.js outcome_params branches without reason_code and precompiled rules without outcome_params
  await t.test('jpl_evaluator branches for outcome_params without reason_code', () => {
    // Deny match with outcome_params having no reason_code
    const policyDenyNoReason = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9C',
      policy_name: 'Deny Without Reason',
      rules: [
        {
          rule_id: 'rule_deny_no_reason',
          priority: 1,
          conditions: [{ field: 'x', operator: 'eq', value: 1 }],
          outcome: 'DENY',
          outcome_params: { approver_role: 'ADMIN' }, // no reason_code
        },
      ],
      default_outcome: 'PERMIT',
    };
    const resDeny = evaluate(policyDenyNoReason, { x: 1 });
    assert.equal(resDeny.outcome, 'DENY');
    assert.equal(resDeny.reason_code, null);
    assert.equal(resDeny.outcome_params.approver_role, 'ADMIN');

    // First candidate (REQUIRE_APPROVAL) with outcome_params having no reason_code
    const policyCandidateNoReason = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9D',
      policy_name: 'Approval Without Reason',
      rules: [
        {
          rule_id: 'rule_approval_no_reason',
          priority: 1,
          conditions: [{ field: 'x', operator: 'eq', value: 1 }],
          outcome: 'REQUIRE_APPROVAL',
          outcome_params: { approver_role: 'MANAGER' }, // no reason_code
        },
      ],
      default_outcome: 'DENY',
    };
    const resCandidate = evaluate(policyCandidateNoReason, { x: 1 });
    assert.equal(resCandidate.outcome, 'REQUIRE_APPROVAL');
    assert.equal(resCandidate.reason_code, null);
    assert.equal(resCandidate.outcome_params.approver_role, 'MANAGER');

    // Precompiled DENY rule with no outcome_params property (tests denyMatch.outcome_params || {})
    const precompiledDenyNoParams = {
      rules: [
        {
          rule_id: 'rule_pre_deny',
          priority: 1,
          evaluate: () => true,
          outcome: 'DENY',
        },
      ],
      default_outcome: 'PERMIT',
    };
    const resPreDeny = evaluate(precompiledDenyNoParams, {});
    assert.equal(resPreDeny.outcome, 'DENY');
    assert.deepEqual(resPreDeny.outcome_params, {});

    // Precompiled PERMIT rule with no outcome_params property (tests firstCandidate.outcome_params || {})
    const precompiledPermitNoParams = {
      rules: [
        {
          rule_id: 'rule_pre_permit',
          priority: 1,
          evaluate: () => true,
          outcome: 'PERMIT',
        },
      ],
      default_outcome: 'DENY',
    };
    const resPrePermit = evaluate(precompiledPermitNoParams, {});
    assert.equal(resPrePermit.outcome, 'PERMIT');
    assert.deepEqual(resPrePermit.outcome_params, {});
  });

  // 3. decision_engine.js evaluatePolicy branches
  await t.test('decision_engine evaluatePolicy empty, array, multiple and error branches', () => {
    // null or undefined policy
    const resNull = evaluatePolicy(null);
    assert.equal(resNull.outcome, 'PERMIT');
    assert.equal(resNull.decision, 'PASS');

    // empty array of policies
    const resEmpty = evaluatePolicy([]);
    assert.equal(resEmpty.outcome, 'PERMIT');
    assert.equal(resEmpty.decision, 'PASS');

    // Multiple policies: first is PERMIT, second is REQUIRE_APPROVAL
    const polPermit = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9E',
      policy_name: 'Permit Policy',
      rules: [
        {
          rule_id: 'rule_p1',
          priority: 1,
          conditions: [{ field: 'x', operator: 'eq', value: 1 }],
          outcome: 'PERMIT',
        },
      ],
      default_outcome: 'PERMIT',
    };
    const polEscalate = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9F',
      policy_name: 'Escalate Policy',
      rules: [
        {
          rule_id: 'rule_p2',
          priority: 1,
          conditions: [{ field: 'x', operator: 'eq', value: 1 }],
          outcome: 'ESCALATE',
          outcome_params: { reason_code: 'ESCALATION_REQUIRED' },
        },
      ],
      default_outcome: 'PERMIT',
    };

    const resMulti = evaluatePolicy([polPermit, polEscalate], { x: 1 });
    assert.equal(resMulti.outcome, 'REQUIRE_APPROVAL');
    assert.equal(resMulti.decision, 'REQUIRE_APPROVAL');
    assert.equal(resMulti.rule_id, 'rule_p2');
    assert.equal(resMulti.reason_code, 'ESCALATION_REQUIRED');

    // Multiple policies where one is DENY
    const polDeny = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9G',
      policy_name: 'Deny Policy',
      rules: [
        {
          rule_id: 'rule_p3',
          priority: 1,
          conditions: [{ field: 'x', operator: 'eq', value: 1 }],
          outcome: 'DENY',
          outcome_params: { reason_code: 'EXPLICIT_DENY' },
        },
      ],
      default_outcome: 'DENY',
    };
    const resMultiDeny = evaluatePolicy([polPermit, polDeny], { x: 1 });
    assert.equal(resMultiDeny.outcome, 'DENY');
    assert.equal(resMultiDeny.decision, 'REJECT');
    assert.equal(resMultiDeny.reason_code, 'EXPLICIT_DENY');

    // Single policy with array in policies field
    const stageBArray = evaluateStageB({ policies: [polPermit] }, { x: 1 });
    assert.equal(stageBArray.decision, 'PASS');

    // Single policy that denies without reason code in outcome_params
    const polDenyNoParam = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9H',
      policy_name: 'Deny Default Param Policy',
      rules: [
        {
          rule_id: 'rule_p4',
          priority: 1,
          conditions: [{ field: 'x', operator: 'eq', value: 1 }],
          outcome: 'DENY',
        },
      ],
      default_outcome: 'DENY',
    };
    const resDenyDefaultParam = evaluatePolicy(polDenyNoParam, { x: 1 });
    assert.equal(resDenyDefaultParam.outcome, 'DENY');
    assert.equal(resDenyDefaultParam.decision, 'REJECT');
    assert.equal(resDenyDefaultParam.reason_code, 'POLICY_DENY');

    // Error in evaluatePolicy catch block: array element getter throws
    const throwingArray = [null];
    Object.defineProperty(throwingArray, '0', {
      get() {
        throw new Error('Fatal policy access error');
      },
    });
    const resCatch = evaluatePolicy(throwingArray, {});
    assert.equal(resCatch.outcome, 'DENY');
    assert.equal(resCatch.decision, 'REJECT');
    assert.equal(resCatch.reason_code, 'JPL_EVALUATION_ERROR');
  });

  // 4. decision_engine.js DIP and CPL REQUIRE_APPROVAL with Stage B REJECT
  await t.test('decision_engine DIP and CPL REQUIRE_APPROVAL combined with Stage B REJECT', async () => {
    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM entities')) {
          return { rowCount: 1, rows: [{ entity_type: 'ISSUER', status: 'ACTIVE', legal_entity_lei: '5493001KJTIIGC8Y1R12' }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };

    const polDeny = {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9M',
      policy_name: 'Deny All Policy',
      rules: [
        {
          rule_id: 'rule_deny_always',
          priority: 1,
          conditions: [{ field: 'amount_minor', operator: 'gt', value: 0 }],
          outcome: 'DENY',
          outcome_params: { reason_code: 'STAGE_B_DENIED' },
        },
      ],
      default_outcome: 'DENY',
    };

    // 4.1 DIP decision is REQUIRE_APPROVAL (dis_score: 65), but Stage B policy is REJECT
    const dipApprovalTx = {
      amount_minor: 1000,
      dis_score: 65,
      require_intent: false,
      policy: polDeny,
    };
    const dipRejectRes = await evaluateUnifiedDecision('org_test_1', dipApprovalTx, {}, mockDb);
    assert.equal(dipRejectRes.decision, 'REJECT');
    assert.equal(dipRejectRes.state, 'REJECTED');
    assert.equal(dipRejectRes.tahapB.decision, 'REJECT');
    assert.ok(dipRejectRes.reason_codes.includes('STAGE_B_DENIED'));

    // 4.2 CPL decision is REQUIRE_APPROVAL (cpl_score: 75, DIP >= 80), but Stage B policy is REJECT
    const cplApprovalTx = {
      amount_minor: 1000,
      dis_score: 95,
      cpl_score: 75,
      require_intent: false,
      policy: polDeny,
    };
    const cplRejectRes = await evaluateUnifiedDecision('org_test_1', cplApprovalTx, {}, mockDb);
    assert.equal(cplRejectRes.decision, 'REJECT');
    assert.equal(cplRejectRes.state, 'REJECTED');
    assert.equal(cplRejectRes.tahapB.decision, 'REJECT');
    assert.ok(cplRejectRes.reason_codes.includes('STAGE_B_DENIED'));
  });

  // 5. finalDecision Tahap B branch coverage
  await t.test('finalDecision Tahap B branch coverage for code and reason_code', () => {
    // tahapB.decision === 'REJECT' with separate code and reason_code
    const resRejectWithCodes = finalDecision(
      { decision: 'PASS' },
      { decision: 'REJECT', code: 'REJECT_CODE', reason_code: 'REJECT_REASON' },
      null
    );
    assert.equal(resRejectWithCodes.decision, 'REJECT');
    assert.ok(resRejectWithCodes.reason_codes.includes('REJECT_CODE'));
    assert.ok(resRejectWithCodes.reason_codes.includes('REJECT_REASON'));

    // tahapB.decision === 'REQUIRE_APPROVAL' with code and reason_code
    const resApprovalWithCodes = finalDecision(
      { decision: 'PASS' },
      { decision: 'REQUIRE_APPROVAL', code: 'APPROVAL_CODE', reason_code: 'APPROVAL_REASON', markers: ['M1'] },
      null
    );
    assert.equal(resApprovalWithCodes.decision, 'REQUIRE_APPROVAL');
    assert.ok(resApprovalWithCodes.reason_codes.includes('APPROVAL_CODE'));
    assert.ok(resApprovalWithCodes.reason_codes.includes('APPROVAL_REASON'));
    assert.ok(resApprovalWithCodes.reason_codes.includes('M1'));
  });
});
