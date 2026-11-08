// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compile,
  resolveFieldPath,
  compileCondition,
  computePolicyHash,
} from '../../src/services/jpl_compiler.js';
import { generateEd25519Keys } from '../../src/lib/crypto.js';

test('JPL Compiler Unit Test Suite (PRD 1.8 §9.1)', async (t) => {
  const basePolicy = {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
    policy_name: 'Test Compiler Policy',
    metadata: { author: 'Unit Test Runner', description: 'Compiler tests' },
    rules: [
      {
        rule_id: 'rule_allow_payout',
        priority: 10,
        description: 'Allow standard payouts',
        conditions: [{ field: 'request.amount_minor', operator: 'lt', value: 50000 }],
        outcome: 'PERMIT',
      },
      {
        rule_id: 'rule_block_frozen',
        priority: 1,
        description: 'Block if frozen',
        conditions: [{ field: 'org.frozen', operator: 'eq', value: true }],
        outcome: 'DENY',
        outcome_params: { reason_code: 'ORG_FROZEN' },
      },
    ],
    default_outcome: 'DENY',
  };

  await t.test('test_compiler_valid_policy: Compile policy valid -> success', () => {
    const compiled = compile(basePolicy);
    assert.ok(compiled);
    assert.equal(compiled.policy_id, basePolicy.policy_id);
    assert.equal(compiled.rules.length, 2);
    assert.ok(compiled.policy_hash.startsWith('sha256:'));
  });

  await t.test('test_compiler_invalid_schema: Compile policy invalid -> error', () => {
    assert.throws(() => {
      compile({ ...basePolicy, jpl_version: undefined });
    }, /INVALID_POLICY_SCHEMA/);

    assert.throws(() => {
      compile({ ...basePolicy, rules: [] });
    }, /INVALID_POLICY_SCHEMA/);
  });

  await t.test('test_compiler_deterministic: Compile 2x -> hash sama', () => {
    const comp1 = compile(basePolicy);
    const comp2 = compile(basePolicy);
    assert.equal(comp1.policy_hash, comp2.policy_hash);
    assert.equal(computePolicyHash(basePolicy), computePolicyHash(basePolicy));
  });

  await t.test('test_compiler_field_path_valid: Field path valid -> accessor', () => {
    const sample = { a: { b: { c: 42 } }, 'x': 'y' };
    assert.equal(resolveFieldPath(sample, 'a.b.c'), 42);
    assert.equal(resolveFieldPath(sample, 'x'), 'y');
    assert.equal(resolveFieldPath(sample, 'a.b.missing'), undefined);
    assert.equal(resolveFieldPath(null, 'a.b'), undefined);
  });

  await t.test('test_compiler_field_path_invalid: Field path invalid -> error', () => {
    assert.throws(() => {
      resolveFieldPath({ a: 1 }, '123_invalid');
    }, /INVALID_FIELD_PATH/);
    assert.throws(() => {
      resolveFieldPath({ a: 1 }, 'UPPERCASE.path');
    }, /INVALID_FIELD_PATH/);
  });

  await t.test('test_compiler_operator_valid: Operator valid -> evaluator', () => {
    const condFn = compileCondition({ field: 'request.amount_minor', operator: 'gt', value: 100 });
    assert.equal(condFn({ request: { amount_minor: 200 } }), true);
    assert.equal(condFn({ request: { amount_minor: 50 } }), false);
  });

  await t.test('test_compiler_operator_invalid: Operator invalid -> error', () => {
    assert.throws(() => {
      // @ts-ignore
      compileCondition({ field: 'request.amount_minor', operator: 'not_an_operator', value: 100 });
    }, /INVALID_OPERATOR/);
  });

  await t.test('test_compiler_duplicate_rule_id: Rule ID duplicate -> error', () => {
    const duplicateRulesPolicy = {
      ...basePolicy,
      rules: [
        {
          rule_id: 'rule_same_id',
          priority: 1,
          conditions: [{ field: 'request.amount_minor', operator: 'gt', value: 100 }],
          outcome: 'PERMIT',
        },
        {
          rule_id: 'rule_same_id',
          priority: 2,
          conditions: [{ field: 'request.amount_minor', operator: 'gt', value: 200 }],
          outcome: 'DENY',
        },
      ],
    };
    assert.throws(() => {
      compile(duplicateRulesPolicy);
    }, /DUPLICATE_RULE_ID/);
  });

  await t.test('test_compiler_priority_sort: Rules diurutkan berdasarkan priority', () => {
    const compiled = compile(basePolicy);
    assert.equal(compiled.rules[0].rule_id, 'rule_block_frozen');
    assert.equal(compiled.rules[0].priority, 1);
    assert.equal(compiled.rules[1].rule_id, 'rule_allow_payout');
    assert.equal(compiled.rules[1].priority, 10);
  });

  await t.test('test_compiler_json_string_input: String JSON parses correctly', () => {
    const compiled = compile(JSON.stringify(basePolicy));
    assert.equal(compiled.policy_id, basePolicy.policy_id);

    assert.throws(() => {
      compile('{ malformed json');
    }, /INVALID_POLICY_SCHEMA/);
  });

  await t.test('test_compiler_version_check: Unsupported version throws', () => {
    assert.throws(() => {
      compile({ ...basePolicy, jpl_version: '2.0' });
    }, /UNSUPPORTED_JPL_VERSION/);
  });

  await t.test('test_compiler_signature_check: Fails on invalid signature', () => {
    const keys = generateEd25519Keys();
    const policyWithSig = {
      ...basePolicy,
      signature: {
        alg: 'Ed25519',
        kid: 'key_1',
        sig: 'base64:' + Buffer.alloc(64, 1).toString('base64'),
      },
    };
    assert.throws(() => {
      compile(policyWithSig, { publicKey: keys.publicKey });
    }, /INVALID_POLICY_SIGNATURE/);
  });

  await t.test('test_compiler_all_operators: Full test of all 18 operators', () => {
    // 1. eq & neq
    assert.equal(compileCondition({ field: 'x', operator: 'eq', value: 10 })({ x: 10 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'eq', value: 10 })({ x: 20 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'eq', value: 'ABC', case_sensitive: false })({ x: 'abc' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'neq', value: 10 })({ x: 20 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'neq', value: 10 })({ x: 10 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'neq', value: 'ABC', case_sensitive: false })({ x: 'abc' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'neq', value: 'XYZ', case_sensitive: false })({ x: 'abc' }), true);

    // 2. gt, gte, lt, lte
    assert.equal(compileCondition({ field: 'x', operator: 'gt', value: 5 })({ x: 10 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'gt', value: 5 })({ x: 5 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'gte', value: 5 })({ x: 5 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'gte', value: 5 })({ x: 4 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'lt', value: 5 })({ x: 4 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'lt', value: 5 })({ x: 5 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'lte', value: 5 })({ x: 5 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'lte', value: 5 })({ x: 6 }), false);

    // 3. in & not_in
    assert.equal(compileCondition({ field: 'x', operator: 'in', value: ['a', 'b'] })({ x: 'a' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'in', value: ['a', 'b'] })({ x: 'c' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'in', value: 'not_arr' })({ x: 'a' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_in', value: ['a', 'b'] })({ x: 'c' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'not_in', value: ['a', 'b'] })({ x: 'a' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_in', value: 'not_arr' })({ x: 'a' }), false);

    // 4. contains & not_contains
    assert.equal(compileCondition({ field: 'x', operator: 'contains', value: 'WORLD', case_sensitive: false })({ x: 'Hello World' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'contains', value: 'World', case_sensitive: true })({ x: 'Hello World' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'contains', value: 'WORLD', case_sensitive: true })({ x: 'Hello World' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'contains', value: 'XYZ' })({ x: 'Hello World' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'contains', value: 42 })({ x: [10, 42, 99] }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'contains', value: 77 })({ x: [10, 42, 99] }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'contains', value: 'a' })({ x: 123 }), false);

    assert.equal(compileCondition({ field: 'x', operator: 'not_contains', value: 'XYZ' })({ x: 'Hello World' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'not_contains', value: 'WORLD', case_sensitive: false })({ x: 'Hello World' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_contains', value: 'World', case_sensitive: true })({ x: 'Hello World' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_contains', value: 77 })({ x: [10, 42, 99] }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'not_contains', value: 42 })({ x: [10, 42, 99] }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_contains', value: 'a' })({ x: 123 }), false);

    // 5. matches & not_matches
    assert.equal(compileCondition({ field: 'x', operator: 'matches', value: '^[A-Z0-9]+$' })({ x: 'ABC123' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'matches', value: '^[0-9]+$' })({ x: 'ABC123' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'matches', value: '^[0-9]+$' })({ x: 12345 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'matches', value: '[[' })({ x: 'test' }), false);

    assert.equal(compileCondition({ field: 'x', operator: 'not_matches', value: '^[0-9]+$' })({ x: 'ABC123' }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'not_matches', value: '^[A-Z0-9]+$' })({ x: 'ABC123' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_matches', value: '^[0-9]+$' })({ x: 12345 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_matches', value: '[[' })({ x: 'test' }), false);

    // 6. between & not_between
    assert.equal(compileCondition({ field: 'x', operator: 'between', value: [10, 50] })({ x: 25 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'between', value: [10, 50] })({ x: 5 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'between', value: [10, 50] })({ x: 'string' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'between', value: [10, 'bad'] })({ x: 25 }), false);

    assert.equal(compileCondition({ field: 'x', operator: 'not_between', value: [10, 50] })({ x: 5 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'not_between', value: [10, 50] })({ x: 60 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'not_between', value: [10, 50] })({ x: 25 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_between', value: [10, 50] })({ x: 'string' }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_between', value: [10, 'bad'] })({ x: 5 }), false);

    // 7. subset_of, superset_of, intersects
    assert.equal(compileCondition({ field: 'x', operator: 'subset_of', value: [1, 2, 3] })({ x: [1, 2] }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'subset_of', value: [1, 2, 3] })({ x: [1, 4] }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'subset_of', value: [1, 2, 3] })({ x: 'not_arr' }), false);

    assert.equal(compileCondition({ field: 'x', operator: 'superset_of', value: [1, 2] })({ x: [1, 2, 3] }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'superset_of', value: [1, 4] })({ x: [1, 2, 3] }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'superset_of', value: [1, 2] })({ x: 'not_arr' }), false);

    assert.equal(compileCondition({ field: 'x', operator: 'intersects', value: [2, 4, 6] })({ x: [1, 2, 3] }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'intersects', value: [4, 5, 6] })({ x: [1, 2, 3] }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'intersects', value: [2, 4] })({ x: 'not_arr' }), false);

    // 8. exists & not_exists
    assert.equal(compileCondition({ field: 'x', operator: 'exists', value: true })({ x: 0 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'exists', value: true })({ y: 1 }), false);
    assert.equal(compileCondition({ field: 'x', operator: 'not_exists', value: true })({ y: 1 }), true);
    assert.equal(compileCondition({ field: 'x', operator: 'not_exists', value: true })({ x: 'val' }), false);

    // 9. Fail-closed on throwing getter
    const throwingInput = {
      get x() {
        throw new Error('Getter error');
      },
    };
    assert.equal(compileCondition({ field: 'x', operator: 'eq', value: 10 })(throwingInput), false);

    // 10. Invalid field format in compileCondition throws INVALID_FIELD_PATH
    assert.throws(() => {
      compileCondition({ field: '123_invalid', operator: 'eq', value: 1 });
    }, /INVALID_FIELD_PATH/);
  });
});
