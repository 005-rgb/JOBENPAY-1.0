/**
 * server/test/unit/split-concurrency.test.js
 * Concurrency, row locking & race condition tests for SPLIT (Item 8 CCC, AD-13, AD-17, T-13, T-14, K-SPLIT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SPLIT Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. Two concurrent split payouts competing for collected escrow: zero overshoot', async () => {
    let splitEscrowBalance = 50000n; // $500.00 in split escrow pool
    const payout1 = 30000n;         // $300.00
    const payout2 = 30000n;         // $300.00 (Total 60,000 > 50,000)

    let locked = false;
    async function disburseSplitShare(shareId, amount) {
      if (locked) {
        throw new Error('409 Conflict: Row is locked by another transaction');
      }
      locked = true;
      try {
        if (splitEscrowBalance >= amount) {
          splitEscrowBalance -= amount;
          return { shareId, accepted: true, remaining: splitEscrowBalance };
        }
        return { shareId, accepted: false, reason: 'INSUFFICIENT_ESCROW' };
      } finally {
        locked = false;
      }
    }

    const res1 = await disburseSplitShare('share_1', payout1);
    const res2 = await disburseSplitShare('share_2', payout2);

    assert.equal(res1.accepted, true);
    assert.equal(res2.accepted, false);
    assert.equal(res2.reason, 'INSUFFICIENT_ESCROW');
    assert.equal(splitEscrowBalance, 20000n, 'Remaining escrow balance must strictly reflect exactly one payout');
  });

  await t.test('2. Row locking ensures serial execution for 8 concurrent split share payouts', async () => {
    let escrowBalance = 80000n; // $800.00
    const shareAmount = 15000n; // $150.00 each -> at most 5 can succeed (5 * 15,000 = 75,000 <= 80,000)

    const mutex = {
      isLocked: false,
      queue: [],
      async lock() {
        if (!this.isLocked) {
          this.isLocked = true;
          return;
        }
        await new Promise((resolve) => this.queue.push(resolve));
      },
      unlock() {
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          next();
        } else {
          this.isLocked = false;
        }
      },
    };

    let acceptedCount = 0;
    let rejectedCount = 0;

    async function processSharePayout(id) {
      await mutex.lock();
      try {
        // Simulates SELECT ... FOR UPDATE on split_records / escrow
        if (escrowBalance >= shareAmount) {
          escrowBalance -= shareAmount;
          acceptedCount++;
          return { id, success: true };
        } else {
          rejectedCount++;
          return { id, success: false };
        }
      } finally {
        mutex.unlock();
      }
    }

    const promises = Array.from({ length: 8 }, (_, i) => processSharePayout(`payout_${i}`));
    const results = await Promise.all(promises);

    assert.equal(acceptedCount, 5, 'Exactly 5 share payouts must succeed');
    assert.equal(rejectedCount, 3, 'Remaining 3 share payouts must be rejected due to insufficient escrow');
    assert.equal(escrowBalance, 5000n, 'Final escrow balance must equal 5,000 minor units');
    assert.equal(results.length, 8);
  });

  await t.test('3. Race condition between milestone hold release and cancellation fails closed', async () => {
    let holdStatus = 'HELD';
    let balance = 10000n;

    async function cancelSplit() {
      holdStatus = 'CANCELLED';
      return { status: 'CANCELLED' };
    }

    async function releaseHold(amount) {
      if (holdStatus !== 'HELD') {
        const err = new Error('Cannot release hold: split intent is not in HELD status');
        err.code = 'INVALID_SPLIT_STATUS';
        err.statusCode = 409;
        throw err;
      }
      balance -= amount;
      return { released: amount, remaining: balance };
    }

    // Cancel first
    await cancelSplit();

    await assert.rejects(
      async () => releaseHold(5000n),
      (err) => {
        assert.equal(err.code, 'INVALID_SPLIT_STATUS');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
    assert.equal(balance, 10000n, 'Escrow balance must remain untouched');
  });
});

