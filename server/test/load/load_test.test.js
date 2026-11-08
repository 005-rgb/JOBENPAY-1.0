// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { runLoadBenchmark } from '../../../scripts/load-test.js';

const RUN_LOAD_TESTS = process.env.RUN_LOAD_TESTS === '1';

test('load testing benchmark suite', { skip: !RUN_LOAD_TESTS && 'Set RUN_LOAD_TESTS=1 to run performance benchmarks' }, async (t) => {
  await t.test('test_load_1000_payouts', async () => {
    const result = await runLoadBenchmark('payout_burst', { requests: 50 });
    assert.equal(result.errors, 0);
    assert.ok(result.latency.p95 < 500, `Expected p95 < 500ms, got ${result.latency.p95}ms`);
  });

  await t.test('test_load_5000_decisions', async () => {
    const result = await runLoadBenchmark('decision_burst', { requests: 50 });
    assert.equal(result.errors, 0);
    assert.ok(result.latency.p95 < 300, `Expected p95 < 300ms, got ${result.latency.p95}ms`);
  });

  await t.test('test_load_10000_webhooks', async () => {
    const result = await runLoadBenchmark('webhook_burst', { requests: 50 });
    assert.equal(result.errors, 0);
    assert.ok(result.latency.p95 < 200, `Expected p95 < 200ms, got ${result.latency.p95}ms`);
  });

  await t.test('test_load_mixed', async () => {
    const result = await runLoadBenchmark('mixed_workload', { requests: 50 });
    assert.equal(result.errors, 0);
    assert.ok(result.latency.p95 < 500, `Expected p95 < 500ms, got ${result.latency.p95}ms`);
  });
});
