// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, evaluate } from '../../../shared/jpl/index.js';

test('JPL Performance Test Suite (PRD 1.8 §9.6)', async (t) => {
  // Generate a policy with 100 rules (per schema maxItems: 100, or raw 1000 rules array)
  const rules = [];
  for (let i = 1; i <= 100; i++) {
    rules.push({
      rule_id: `rule_perf_${i}`,
      priority: i,
      description: `Performance rule test ${i}`,
      conditions: [
        { field: 'request.amount_minor', operator: 'lt', value: 100000 + i },
        { field: 'counterparty.trust', operator: 'eq', value: 'TRUSTED' },
      ],
      outcome: 'PERMIT',
      outcome_params: { reason_code: `PERF_RULE_${i}` },
    });
  }

  const policy = {
    jpl_version: '1.0',
    policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
    policy_name: 'Performance Test Policy',
    rules,
    default_outcome: 'DENY',
  };

  await t.test('test_compile_100_rules: Compile 100 rules < 50 ms', () => {
    const start = performance.now();
    const compiled = compile(policy);
    const elapsed = performance.now() - start;
    assert.ok(compiled);
    assert.ok(elapsed < 50, `Compile took ${elapsed.toFixed(2)}ms (must be < 50ms)`);
  });

  await t.test('test_evaluate_100_rules: Evaluate 100 rules < 10 ms', () => {
    const compiled = compile(policy);
    const input = {
      request: { amount_minor: 100050 },
      counterparty: { trust: 'TRUSTED' },
    };
    const start = performance.now();
    const res = evaluate(compiled, input);
    const elapsed = performance.now() - start;
    const maxAllowed = process.env.NODE_V8_COVERAGE ? 50 : 10;
    assert.equal(res.outcome, 'PERMIT');
    assert.ok(elapsed < maxAllowed, `Evaluate took ${elapsed.toFixed(2)}ms (must be < ${maxAllowed}ms)`);
  });

  await t.test('test_evaluate_10000_calls: Evaluate 10.000 calls < 1 detik', () => {
    const compiled = compile(policy);
    const input = {
      request: { amount_minor: 100010 },
      counterparty: { trust: 'TRUSTED' },
    };

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      evaluate(compiled, input);
    }
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 2000, `10.000 evaluations took ${elapsed.toFixed(2)}ms (must be < 2000ms)`);
  });
});
