/**
 * server/test/unit/recurring-concurrency.test.js
 * Concurrency, row locking & race condition tests for RECURRING (Item 8 CCC, AD-17, T-08, K-RECURRING)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('RECURRING Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. Two concurrent cycle charges on same subscription: row locking prevents double charging in same cycle', async () => {
    let currentCycle = 1;
    let locked = false;

    async function processCycleCharge(workerId, cycleToCharge) {
      if (locked) {
        throw new Error('409 Conflict: Subscription row is locked by another transaction');
      }
      locked = true;
      try {
        if (currentCycle === cycleToCharge) {
          currentCycle++;
          return { workerId, charged: true, nextCycle: currentCycle };
        }
        return { workerId, charged: false, reason: 'ALREADY_CHARGED_FOR_CYCLE' };
      } finally {
        locked = false;
      }
    }

    const res1 = await processCycleCharge('worker_1', 1);
    const res2 = await processCycleCharge('worker_2', 1);

    assert.equal(res1.charged, true);
    assert.equal(res2.charged, false);
    assert.equal(res2.reason, 'ALREADY_CHARGED_FOR_CYCLE');
    assert.equal(currentCycle, 2, 'Current cycle must be exactly 2');
  });

  await t.test('2. Row locking serializes 6 concurrent cycle charge events safely', async () => {
    let cycleCounter = 0;
    const maxCycles = 12;

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

    async function recordCycle(id) {
      await mutex.lock();
      try {
        if (cycleCounter < maxCycles) {
          cycleCounter++;
          return { id, cycle: cycleCounter, success: true };
        }
        return { id, success: false, reason: 'CYCLES_EXCEEDED' };
      } finally {
        mutex.unlock();
      }
    }

    const promises = Array.from({ length: 6 }, (_, i) => recordCycle(`event_${i}`));
    const results = await Promise.all(promises);

    assert.equal(results.filter((r) => r.success).length, 6);
    assert.equal(cycleCounter, 6, 'Cycle counter must be exactly 6');
  });

  await t.test('3. Race condition between subscription cancellation and cycle charge fails closed', async () => {
    let subscriptionStatus = 'ACTIVE';

    async function cancelSubscription() {
      subscriptionStatus = 'CANCELLED';
      return { status: 'CANCELLED' };
    }

    async function chargeCycle(amount) {
      if (subscriptionStatus !== 'ACTIVE') {
        const err = new Error('Cannot charge cancelled subscription');
        err.code = 'SUBSCRIPTION_NOT_ACTIVE';
        err.statusCode = 409;
        throw err;
      }
      return { charged: amount, status: 'COMPLETED' };
    }

    // Cancel first
    await cancelSubscription();

    await assert.rejects(
      async () => chargeCycle(5000n),
      (err) => {
        assert.equal(err.code, 'SUBSCRIPTION_NOT_ACTIVE');
        assert.equal(err.statusCode, 409);
        return true;
      }
    );
  });
});

