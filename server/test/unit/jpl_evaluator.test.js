// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../src/services/jpl_evaluator.js';
import { compileCondition } from '../../src/services/jpl_compiler.js';

test('JPL Evaluator Unit Test Suite (PRD 1.8 §9.2)', async (t) => {
  const basePolicy = {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
    policy_name: 'Evaluator Test Policy',
    rules: [
      {
        rule_id: 'rule_deny_frozen',
        priority: 2,
        conditions: [{ field: 'org.frozen', operator: 'eq', value: true }],
        outcome: 'DENY',
        outcome_params: { reason_code: 'ORG_FROZEN' },
      },
      {
        rule_id: 'rule_permit_trusted',
        priority: 1,
        conditions: [{ field: 'counterparty.trust', operator: 'eq', value: 'TRUSTED' }],
        outcome: 'PERMIT',
        outcome_params: { reason_code: 'PAYEE_TRUSTED' },
      },
      {
        rule_id: 'rule_require_approval_high',
        priority: 5,
        conditions: [{ field: 'request.amount_minor', operator: 'gte', value: 100000 }],
        outcome: 'REQUIRE_APPROVAL',
        outcome_params: { reason_code: 'HIGH_AMOUNT' },
      },
      {
        rule_id: 'rule_escalate_risk',
        priority: 6,
        conditions: [{ field: 'agent.risk', operator: 'eq', value: 'HIGH' }],
        outcome: 'ESCALATE',
        outcome_params: { reason_code: 'AGENT_RISK' },
      },
    ],
    default_outcome: 'DENY',
  };

  await t.test('test_eval_permit: Outcome PERMIT', () => {
    const res = evaluate(basePolicy, { counterparty: { trust: 'TRUSTED' }, org: { frozen: false } });
    assert.equal(res.outcome, 'PERMIT');
    assert.equal(res.rule_id, 'rule_permit_trusted');
  });

  await t.test('test_eval_deny: Outcome DENY', () => {
    const res = evaluate(basePolicy, { counterparty: { trust: 'NEW' }, org: { frozen: true } });
    assert.equal(res.outcome, 'DENY');
    assert.equal(res.rule_id, 'rule_deny_frozen');
    assert.equal(res.reason_code, 'ORG_FROZEN');
  });

  await t.test('test_eval_require_approval: Outcome REQUIRE_APPROVAL', () => {
    const res = evaluate(basePolicy, { counterparty: { trust: 'UNKNOWN' }, request: { amount_minor: 150000 } });
    assert.equal(res.outcome, 'REQUIRE_APPROVAL');
    assert.equal(res.rule_id, 'rule_require_approval_high');
  });

  await t.test('test_eval_escalate: Outcome ESCALATE', () => {
    const res = evaluate(basePolicy, { counterparty: { trust: 'UNKNOWN' }, agent: { risk: 'HIGH' } });
    assert.equal(res.outcome, 'ESCALATE');
    assert.equal(res.rule_id, 'rule_escalate_risk');
  });

  await t.test('test_eval_default_outcome: Tidak ada rule cocok -> default', () => {
    const policyWithApprovalDefault = { ...basePolicy, default_outcome: 'REQUIRE_APPROVAL' };
    const res = evaluate(policyWithApprovalDefault, { counterparty: { trust: 'NONE' } });
    assert.equal(res.outcome, 'REQUIRE_APPROVAL');
    assert.equal(res.rule_id, null);
  });

  await t.test('test_eval_explicit_deny_precedence: DENY menang meskipun priority lebih rendah', () => {
    // Both rule_permit_trusted (priority 1) AND rule_deny_frozen (priority 2) match!
    const res = evaluate(basePolicy, { counterparty: { trust: 'TRUSTED' }, org: { frozen: true } });
    assert.equal(res.outcome, 'DENY');
    assert.equal(res.rule_id, 'rule_deny_frozen');
  });

  await t.test('test_eval_field_missing: Field tidak ada -> false', () => {
    const cond = compileCondition({ field: 'deep.missing.path', operator: 'eq', value: 'yes' });
    assert.equal(cond({ deep: {} }), false);
  });

  await t.test('test_eval_field_null: Field null -> false', () => {
    const cond = compileCondition({ field: 'counterparty.name', operator: 'eq', value: 'Acme' });
    assert.equal(cond({ counterparty: { name: null } }), false);
  });

  await t.test('test_eval_type_mismatch: Tipe salah -> false', () => {
    const cond = compileCondition({ field: 'request.amount_minor', operator: 'gt', value: 100 });
    assert.equal(cond({ request: { amount_minor: 'not_a_number' } }), false);
  });

  await t.test('test_eval_operator_eq: Operator eq benar', () => {
    const condEq = compileCondition({ field: 'category', operator: 'eq', value: 'PAYOUT' });
    assert.equal(condEq({ category: 'PAYOUT' }), true);
    assert.equal(condEq({ category: 'SALE' }), false);

    const condCaseInsensitive = compileCondition({ field: 'category', operator: 'eq', value: 'payout', case_sensitive: false });
    assert.equal(condCaseInsensitive({ category: 'PAYOUT' }), true);
  });

  await t.test('test_eval_operator_neq: Operator neq benar', () => {
    const condNeq = compileCondition({ field: 'category', operator: 'neq', value: 'PAYOUT' });
    assert.equal(condNeq({ category: 'SALE' }), true);
    assert.equal(condNeq({ category: 'PAYOUT' }), false);
  });

  await t.test('test_eval_operator_gt: Operator gt benar', () => {
    const cond = compileCondition({ field: 'amount', operator: 'gt', value: 50 });
    assert.equal(cond({ amount: 100 }), true);
    assert.equal(cond({ amount: 50 }), false);
    assert.equal(cond({ amount: 20 }), false);
  });

  await t.test('test_eval_operator_in: Operator in benar', () => {
    const cond = compileCondition({ field: 'tag', operator: 'in', value: ['alpha', 'beta', 'gamma'] });
    assert.equal(cond({ tag: 'beta' }), true);
    assert.equal(cond({ tag: 'omega' }), false);
  });

  await t.test('test_eval_operator_matches: Operator matches benar', () => {
    const cond = compileCondition({ field: 'sku', operator: 'matches', value: '^SKU-\\d{4}$' });
    assert.equal(cond({ sku: 'SKU-1234' }), true);
    assert.equal(cond({ sku: 'INVALID-SKU' }), false);
  });

  await t.test('test_eval_operator_between: Operator between benar', () => {
    const cond = compileCondition({ field: 'num', operator: 'between', value: [10, 20] });
    assert.equal(cond({ num: 10 }), true);
    assert.equal(cond({ num: 15 }), true);
    assert.equal(cond({ num: 20 }), true);
    assert.equal(cond({ num: 9 }), false);
    assert.equal(cond({ num: 21 }), false);
  });

  await t.test('test_eval_operator_subset_of: Operator subset_of benar', () => {
    const cond = compileCondition({ field: 'roles', operator: 'subset_of', value: ['ADMIN', 'OPERATOR', 'VIEWER'] });
    assert.equal(cond({ roles: ['ADMIN', 'VIEWER'] }), true);
    assert.equal(cond({ roles: ['ADMIN', 'SUPERUSER'] }), false);
  });

  await t.test('test_eval_operator_exists: Operator exists benar', () => {
    const condExists = compileCondition({ field: 'metadata.ip', operator: 'exists' });
    assert.equal(condExists({ metadata: { ip: '127.0.0.1' } }), true);
    assert.equal(condExists({ metadata: {} }), false);

    const condNotExists = compileCondition({ field: 'metadata.ip', operator: 'not_exists' });
    assert.equal(condNotExists({ metadata: {} }), true);
    assert.equal(condNotExists({ metadata: { ip: '127.0.0.1' } }), false);
  });

  await t.test('test_eval_fail_closed: Error -> DENY', () => {
    // Malformed input causing unexpected evaluation failure
    const res = evaluate(null, {});
    assert.equal(res.outcome, 'DENY');
    assert.equal(res.reason_code, 'EVALUATION_ERROR');
  });

  await t.test('test_eval_rule_eval_throws: Rule evaluation throws -> matched = false', () => {
    const brokenCompiled = {
      policy_id: 'pol_broken',
      policy_hash: 'sha256:000',
      default_outcome: 'DENY',
      rules: [
        {
          rule_id: 'rule_throwing',
          priority: 1,
          outcome: 'PERMIT',
          evaluate: () => { throw new Error('Simulated rule eval crash'); },
        },
      ],
    };
    const res = evaluate(brokenCompiled, {});
    assert.equal(res.outcome, 'DENY');
    assert.equal(res.rule_id, null);
  });

  await t.test('test_eval_without_outcome_params: Outcome PERMIT and DENY without outcome_params', () => {
    const policyNoParams = {
      ...basePolicy,
      rules: [
        {
          rule_id: 'rule_deny_no_params',
          priority: 1,
          conditions: [{ field: 'request.block', operator: 'eq', value: true }],
          outcome: 'DENY',
        },
        {
          rule_id: 'rule_permit_no_params',
          priority: 2,
          conditions: [{ field: 'request.allow', operator: 'eq', value: true }],
          outcome: 'PERMIT',
        },
      ],
    };
    const resDeny = evaluate(policyNoParams, { request: { block: true } });
    assert.equal(resDeny.outcome, 'DENY');
    assert.equal(resDeny.reason_code, null);
    assert.deepEqual(resDeny.outcome_params, {});

    const resPermit = evaluate(policyNoParams, { request: { allow: true } });
    assert.equal(resPermit.outcome, 'PERMIT');
    assert.equal(resPermit.reason_code, null);
    assert.deepEqual(resPermit.outcome_params, {});
  });
});
