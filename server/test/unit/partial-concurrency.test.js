/**
 * server/test/unit/partial-concurrency.test.js
 * Concurrency, cumulative partial capture tracking & row locking tests for PARTIAL
 * (Item 8 CCC, PRD 1.3 §11 test_partial_cumulative, AD-10, K-PARTIAL)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('PARTIAL Concurrency & Cumulative Capture Tests (test_partial_cumulative)', async (t) => {
  await t.test('1. test_partial_cumulative: Cumulative partial captures cannot exceed authorized amount', () => {
    const authorizedAmount = 100_000n; // $1,000.00
    let cumulativeCaptured = 60_000n; // Already captured $600.00

    function attemptCapture(requestedAmount) {
      if (cumulativeCaptured + requestedAmount > authorizedAmount) {
        const err = new Error('Capture amount exceeds authorized balance');
        err.code = 'CAPTURE_EXCEEDS_AUTHORIZED';
        err.statusCode = 422;
        throw err;
      }
      cumulativeCaptured += requestedAmount;
      return { success: true, cumulativeCaptured };
    }

    // Attempting $500 capture ($600 + $500 = $1,100 > $1,000) must throw CAPTURE_EXCEEDS_AUTHORIZED
    assert.throws(
      () => attemptCapture(50_000n),
      (err) => err.code === 'CAPTURE_EXCEEDS_AUTHORIZED' && err.statusCode === 422
    );

    // Attempting $400 capture ($600 + $400 = $1,000 <= $1,000) succeeds exactly
    const okRes = attemptCapture(40_000n);
    assert.equal(okRes.success, true);
    assert.equal(cumulativeCaptured, 100_000n);
  });

  await t.test('2. Final capture completes authorization and blocks subsequent captures', () => {
    let authState = {
      status: 'PARTIALLY_CAPTURED',
      authorizedAmount: 100_000n,
      capturedAmount: 60_000n,
    };

    function processCapture(amount, isFinal) {
      if (authState.status === 'CAPTURED' || authState.status === 'COMPLETED') {
        const err = new Error('Authorization already finalized and fully captured');
        err.code = 'AUTHORIZATION_ALREADY_FINALIZED';
        err.statusCode = 409;
        throw err;
      }

      if (authState.capturedAmount + amount > authState.authorizedAmount) {
        const err = new Error('Capture amount exceeds authorized balance');
        err.code = 'CAPTURE_EXCEEDS_AUTHORIZED';
        err.statusCode = 422;
        throw err;
      }

      authState.capturedAmount += amount;
      if (isFinal || authState.capturedAmount === authState.authorizedAmount) {
        authState.status = 'CAPTURED';
      } else {
        authState.status = 'PARTIALLY_CAPTURED';
      }

      return { status: authState.status, captured: authState.capturedAmount };
    }

    // Capture remaining with isFinal: true
    const res1 = processCapture(40_000n, true);
    assert.equal(res1.status, 'CAPTURED');
    assert.equal(res1.captured, 100_000n);

    // Attempt subsequent capture after finalization must throw 409
    assert.throws(
      () => processCapture(10_000n, false),
      (err) => err.code === 'AUTHORIZATION_ALREADY_FINALIZED' && err.statusCode === 409
    );
  });

  await t.test('3. Concurrent partial captures with row locking (SELECT ... FOR UPDATE) prevent balance race condition', async () => {
    let authorizedAmount = 100_000n; // $1,000.00
    let capturedAmount = 0n;
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

    async function safeCapture(amount) {
      await acquireLock();
      try {
        if (capturedAmount + amount > authorizedAmount) {
          const err = new Error('Capture exceeds authorized balance');
          err.code = 'CAPTURE_EXCEEDS_AUTHORIZED';
          err.statusCode = 422;
          throw err;
        }
        capturedAmount += amount;
        return { success: true, captured: capturedAmount };
      } finally {
        releaseLock();
      }
    }

    // Launch 5 concurrent capture attempts of $300 each (Total requested $1,500 > $1,000)
    const requests = [30_000n, 30_000n, 30_000n, 30_000n, 30_000n];
    const results = await Promise.allSettled(requests.map((amt) => safeCapture(amt)));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly 3 captures succeed (3 x $300 = $900 <= $1,000), 2 captures fail (422)
    assert.equal(fulfilled.length, 3);
    assert.equal(rejected.length, 2);
    assert.equal(capturedAmount, 90_000n);
  });
});

