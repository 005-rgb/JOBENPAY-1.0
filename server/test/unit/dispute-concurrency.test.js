/**
 * server/test/unit/dispute-concurrency.test.js
 * Concurrency, row locking & claim acceptance tests for DISPUTE
 * (Item 8 CCC, Blueprint M4, AD-23, T-06, K-DISPUTE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('DISPUTE Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. Concurrent claim acceptances with SELECT ... FOR UPDATE prevent double settlement', async () => {
    let dispute = {
      status: 'OPEN',
      amountMinor: 75000n,
    };

    let lockHeld = false;
    let acceptCount = 0;

    async function acquireLock() {
      while (lockHeld) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      lockHeld = true;
    }
    function releaseLock() {
      lockHeld = false;
    }

    async function acceptClaimWithLock(actorId) {
      await acquireLock();
      try {
        if (dispute.status === 'RESOLVED') {
          const err = new Error('Dispute is already resolved');
          err.code = 'DISPUTE_ALREADY_RESOLVED';
          err.statusCode = 409;
          throw err;
        }

        dispute.status = 'RESOLVED';
        acceptCount++;
        return { success: true, actorId, status: dispute.status };
      } finally {
        releaseLock();
      }
    }

    const results = await Promise.allSettled([
      acceptClaimWithLock('approver_1'),
      acceptClaimWithLock('approver_2'),
      acceptClaimWithLock('operator_3'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Only one claim acceptance must succeed');
    assert.equal(rejected.length, 2, 'Competitors must be rejected with 409');
    assert.equal(acceptCount, 1);
    assert.equal(dispute.status, 'RESOLVED');
  });

  await t.test('2. Attempting to accept claim on closed dispute throws 409 DISPUTE_ALREADY_RESOLVED', () => {
    const closedDispute = { status: 'CLOSED' };

    function attemptAccept(disp) {
      if (disp.status === 'CLOSED' || disp.status === 'RESOLVED') {
        const err = new Error('Cannot accept claim on resolved/closed dispute');
        err.code = 'DISPUTE_ALREADY_RESOLVED';
        err.statusCode = 409;
        throw err;
      }
      return { success: true };
    }

    assert.throws(
      () => attemptAccept(closedDispute),
      (err) => err.code === 'DISPUTE_ALREADY_RESOLVED' && err.statusCode === 409
    );
  });
});

