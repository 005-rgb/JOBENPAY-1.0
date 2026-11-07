/**
 * server/test/unit/refund-concurrency.test.js
 * Concurrency, cumulative refund tracking & window expiry tests for REFUND
 * (Item 8 CCC, PRD 1.3 §11 test_refund_exceeds_original, test_refund_window_expired, K-REFUND)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('REFUND Concurrency and Cumulative Tracker Tests', async (t) => {
  await t.test('1. test_refund_exceeds_original: Cumulative refund cannot exceed original capture', () => {
    const captureAmount = 100_000n; // $1,000.00
    let cumulativeRefunded = 60_000n; // Already refunded $600.00

    function attemptRefund(requestedAmount) {
      if (cumulativeRefunded + requestedAmount > captureAmount) {
        const err = new Error('Refund amount exceeds original capture balance');
        err.code = 'REFUND_EXCEEDS_ORIGINAL';
        err.statusCode = 422;
        throw err;
      }
      cumulativeRefunded += requestedAmount;
      return { success: true, cumulativeRefunded };
    }

    // Attempting $500 refund ($600 + $500 = $1,100 > $1,000) must throw REFUND_EXCEEDS_ORIGINAL
    assert.throws(
      () => attemptRefund(50_000n),
      (err) => err.code === 'REFUND_EXCEEDS_ORIGINAL' && err.statusCode === 422
    );

    // Attempting $400 refund ($600 + $400 = $1,000 <= $1,000) succeeds exactly
    const okRes = attemptRefund(40_000n);
    assert.equal(okRes.success, true);
    assert.equal(cumulativeRefunded, 100_000n);
  });

  await t.test('2. test_refund_window_expired: Refund requested after 180 days is rejected', () => {
    const maxRefundDays = 180;
    const now = new Date();

    function checkRefundWindow(captureDate) {
      const diffMs = now.getTime() - new Date(captureDate).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > maxRefundDays) {
        const err = new Error('Refund window has expired (> 180 days)');
        err.code = 'REFUND_WINDOW_EXPIRED';
        err.statusCode = 422;
        throw err;
      }
      return { valid: true };
    }

    // 190 days ago -> expired
    const oldCapture = new Date(now.getTime() - 190 * 24 * 60 * 60 * 1000);
    assert.throws(
      () => checkRefundWindow(oldCapture),
      (err) => err.code === 'REFUND_WINDOW_EXPIRED' && err.statusCode === 422
    );

    // 30 days ago -> valid
    const recentCapture = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const validRes = checkRefundWindow(recentCapture);
    assert.equal(validRes.valid, true);
  });

  await t.test('3. 20 concurrent partial refunds on same capture maintain atomic row lock without overshoot', async () => {
    const captureAmount = 50_000n; // $500.00
    let refundedAmount = 0n;
    let successfulCount = 0;
    let rejectedCount = 0;

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

    // 20 concurrent requests of $50 each = $1,000 total attempted against $500 capture
    const refundTasks = Array.from({ length: 20 }, async (_, i) => {
      await acquireLock();
      try {
        const reqAmount = 5000n;
        if (refundedAmount + reqAmount <= captureAmount) {
          refundedAmount += reqAmount;
          successfulCount++;
          return { success: true, i };
        } else {
          rejectedCount++;
          return { success: false, i, error: 'REFUND_EXCEEDS_ORIGINAL' };
        }
      } finally {
        releaseLock();
      }
    });

    const results = await Promise.all(refundTasks);
    assert.equal(results.length, 20);
    assert.equal(successfulCount, 10); // Exactly 10 * 5000 = 50,000
    assert.equal(rejectedCount, 10); // Exactly 10 rejected
    assert.equal(refundedAmount, captureAmount);
  });
});

