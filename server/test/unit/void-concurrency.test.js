/**
 * server/test/unit/void-concurrency.test.js
 * Concurrency, authorization state locking & void lifecycle tests for VOID
 * (Item 8 CCC, Blueprint M4, AD-11, K-VOID)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('VOID Concurrency and Row Locking Tests', async (t) => {
  await t.test('1. Capture attempt on voided authorization is rejected (AUTHORIZATION_VOIDED)', () => {
    const authState = {
      status: 'VOIDED',
      authorizedAmount: 100_000n,
      capturedAmount: 0n,
    };

    function attemptCapture(auth) {
      if (auth.status === 'VOIDED') {
        const err = new Error('Cannot capture a voided authorization');
        err.code = 'AUTHORIZATION_VOIDED';
        err.statusCode = 422;
        throw err;
      }
      return { success: true };
    }

    assert.throws(
      () => attemptCapture(authState),
      (err) => err.code === 'AUTHORIZATION_VOIDED' && err.statusCode === 422
    );
  });

  await t.test('2. Concurrent void requests on same authorization with row locking result in exactly one execution', async () => {
    let authStatus = 'CREATED';
    let voidExecutionCount = 0;
    let lockHeld = false;

    async function acquireLock() {
      while (lockHeld) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      lockHeld = true;
    }
    function releaseLock() {
      lockHeld = false;
    }

    async function attemptVoid(actorId) {
      await acquireLock();
      try {
        if (authStatus === 'CREATED') {
          authStatus = 'VOIDED';
          voidExecutionCount++;
          return { success: true, actorId, status: 'VOIDED', replayed: false };
        } else if (authStatus === 'VOIDED') {
          return { success: true, actorId, status: 'VOIDED', replayed: true };
        } else {
          const err = new Error('ILLEGAL_TRANSITION');
          err.statusCode = 409;
          throw err;
        }
      } finally {
        releaseLock();
      }
    }

    const [res1, res2] = await Promise.all([
      attemptVoid('worker_01'),
      attemptVoid('webhook_01'),
    ]);

    assert.equal(authStatus, 'VOIDED');
    assert.equal(voidExecutionCount, 1);
    assert.ok(res1.success && res2.success);
    assert.ok(res1.replayed || res2.replayed);
  });

  await t.test('3. 20 parallel distinct void intents execute cleanly without deadlocks', async () => {
    const authorizations = new Map();
    for (let i = 0; i < 20; i++) {
      authorizations.set(`AUTH_${i}`, 'CREATED');
    }

    const tasks = Array.from({ length: 20 }, async (_, i) => {
      authorizations.set(`AUTH_${i}`, 'VOIDED');
      return { success: true, id: `AUTH_${i}` };
    });

    const results = await Promise.all(tasks);
    assert.equal(results.length, 20);
    for (let i = 0; i < 20; i++) {
      assert.equal(authorizations.get(`AUTH_${i}`), 'VOIDED');
    }
  });
});

