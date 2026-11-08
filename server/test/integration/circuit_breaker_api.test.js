// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { pool } from '../../src/db/pool.js';
import { getCircuitBreaker } from '../../src/lib/circuit-breaker.js';

test('circuit breaker api integration', async (t) => {
  let appInfo;

  t.before(async () => {
    // Ensure standard breakers exist in registry
    getCircuitBreaker('paypal');
    getCircuitBreaker('ai');
    appInfo = await startTestApp();
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.end();
  });

  await t.test('test_circuit_breaker_endpoint', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/circuit-breakers`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.breakers));
    assert.ok(data.breakers.length >= 2);
    
    const paypal = data.breakers.find((b) => b.name === 'paypal');
    assert.ok(paypal);
    assert.equal(paypal.state, 'CLOSED');
    assert.equal(typeof paypal.failures, 'number');
    assert.ok(paypal.next_attempt);

    const ai = data.breakers.find((b) => b.name === 'ai');
    assert.ok(ai);
    assert.equal(ai.state, 'CLOSED');
  });
});
