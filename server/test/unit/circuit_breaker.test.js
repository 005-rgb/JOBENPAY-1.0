// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, getCircuitBreaker, getAllCircuitBreakers } from '../../src/lib/circuit-breaker.js';

test('test_circuit_breaker_closed', async () => {
  const breaker = new CircuitBreaker('test_closed', {
    failureThreshold: 3,
    timeout: 1000,
  });

  assert.equal(breaker.state, 'CLOSED');
  const result = await breaker.execute(async () => 'success_data');
  assert.equal(result, 'success_data');
  assert.equal(breaker.state, 'CLOSED');
  assert.equal(breaker.failures, 0);
});

test('test_circuit_breaker_open', async () => {
  const breaker = new CircuitBreaker('test_open', {
    failureThreshold: 2,
    timeout: 500,
    resetTimeout: 10000,
  });

  // Fail 1
  await assert.rejects(
    async () => breaker.execute(async () => { throw new Error('fail 1'); }),
    /fail 1/,
  );
  assert.equal(breaker.state, 'CLOSED');
  assert.equal(breaker.failures, 1);

  // Fail 2 -> reaches failureThreshold
  await assert.rejects(
    async () => breaker.execute(async () => { throw new Error('fail 2'); }),
    /fail 2/,
  );
  assert.equal(breaker.state, 'OPEN');
  assert.equal(breaker.failures, 2);

  // Next call fails immediately with Circuit is OPEN without running the function
  let functionCalled = false;
  await assert.rejects(
    async () => breaker.execute(async () => {
      functionCalled = true;
      return 'should not run';
    }),
    /Circuit test_open is OPEN/,
  );
  assert.equal(functionCalled, false);
});

test('test_circuit_breaker_half_open', async () => {
  const breaker = new CircuitBreaker('test_half_open', {
    failureThreshold: 2,
    successThreshold: 2,
    timeout: 500,
    resetTimeout: 50, // 50ms reset timeout
  });

  // Trip to OPEN
  await assert.rejects(async () => breaker.execute(async () => { throw new Error('err'); }));
  await assert.rejects(async () => breaker.execute(async () => { throw new Error('err'); }));
  assert.equal(breaker.state, 'OPEN');

  // Wait for resetTimeout to expire
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Next execution transitions to HALF_OPEN
  let executedInHalfOpen = false;
  const res = await breaker.execute(async () => {
    executedInHalfOpen = true;
    return 'half_open_success';
  });

  assert.equal(executedInHalfOpen, true);
  assert.equal(res, 'half_open_success');
  // First success in HALF_OPEN, requires 2 successes to close
  assert.equal(breaker.state, 'HALF_OPEN');
  assert.equal(breaker.successes, 1);
});

test('test_circuit_breaker_reset', async () => {
  const breaker = new CircuitBreaker('test_reset', {
    failureThreshold: 2,
    successThreshold: 2,
    timeout: 500,
    resetTimeout: 50,
  });

  // Trip to OPEN
  await assert.rejects(async () => breaker.execute(async () => { throw new Error('err'); }));
  await assert.rejects(async () => breaker.execute(async () => { throw new Error('err'); }));
  assert.equal(breaker.state, 'OPEN');

  // Wait past resetTimeout
  await new Promise((resolve) => setTimeout(resolve, 60));

  // Success 1
  await breaker.execute(async () => 'ok1');
  assert.equal(breaker.state, 'HALF_OPEN');
  assert.equal(breaker.successes, 1);

  // Success 2 -> resets back to CLOSED
  await breaker.execute(async () => 'ok2');
  assert.equal(breaker.state, 'CLOSED');
  assert.equal(breaker.successes, 0);
  assert.equal(breaker.failures, 0);

  // Test manual reset()
  breaker.onFailure();
  assert.equal(breaker.failures, 1);
  breaker.reset();
  assert.equal(breaker.state, 'CLOSED');
  assert.equal(breaker.failures, 0);
});

test('test_circuit_breaker_timeout_and_registry', async () => {
  // Test constructor defaults
  const defaultBreaker = new CircuitBreaker('default_options');
  assert.equal(defaultBreaker.failureThreshold, 5);
  assert.equal(defaultBreaker.successThreshold, 2);
  assert.equal(defaultBreaker.timeout, 30000);
  assert.equal(defaultBreaker.resetTimeout, 60000);

  // Test function execution timeout
  const breaker = new CircuitBreaker('test_timeout', {
    failureThreshold: 3,
    timeout: 40,
  });

  await assert.rejects(
    async () => breaker.execute(async () => new Promise((resolve) => setTimeout(resolve, 100))),
    /Timeout/,
  );
  assert.equal(breaker.failures, 1);

  // Test ignored errors do not increment failure count
  const ignoredBreaker = new CircuitBreaker('test_ignored', { failureThreshold: 2 });
  const ignoredErr = new Error('Client error 400');
  // @ts-ignore
  ignoredErr.isCircuitBreakerIgnored = true;
  await assert.rejects(async () => ignoredBreaker.execute(async () => { throw ignoredErr; }));
  assert.equal(ignoredBreaker.failures, 0);

  // Test registry functions
  const registered = getCircuitBreaker('custom_registered_breaker', { failureThreshold: 5 });
  const same = getCircuitBreaker('custom_registered_breaker');
  assert.equal(registered, same);

  const all = getAllCircuitBreakers();
  assert.ok(Array.isArray(all));
  assert.ok(all.some((b) => b.name === 'custom_registered_breaker'));
  const state = registered.getState();
  assert.equal(state.name, 'custom_registered_breaker');
  assert.equal(state.state, 'CLOSED');
});
