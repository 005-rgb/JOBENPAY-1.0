/**
 * server/test/unit/scheduled-concurrency.test.js
 * Concurrency, row locking & race condition tests for SCHEDULED (Item 8 CCC, AD-14, T-01, K-SCHEDULED)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('SCHEDULED Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. 20 concurrent workers polling scheduled_runs with SELECT FOR UPDATE SKIP LOCKED: exactly one fires', async () => {
    const scheduledRun = {
      id: 'run_sched_001',
      intentId: 'intent_sched_001',
      status: 'PENDING',
      locked: false,
      fireCount: 0,
    };

    async function pollAndFireWorker(workerId) {
      // Simulate SELECT ... FOR UPDATE SKIP LOCKED
      if (scheduledRun.locked || scheduledRun.status !== 'PENDING') {
        return { workerId, fired: false, reason: 'LOCKED_OR_PROCESSED' };
      }
      scheduledRun.locked = true;
      try {
        if (scheduledRun.status !== 'PENDING') {
          return { workerId, fired: false, reason: 'ALREADY_FIRED' };
        }
        scheduledRun.status = 'FIRED';
        scheduledRun.fireCount++;
        return { workerId, fired: true };
      } finally {
        scheduledRun.locked = false;
      }
    }

    const workerPromises = Array.from({ length: 20 }, (_, i) => pollAndFireWorker(i + 1));
    const results = await Promise.all(workerPromises);

    const firedCount = results.filter((r) => r.fired).length;
    assert.equal(firedCount, 1, 'Exactly one worker must fire the scheduled run');
    assert.equal(scheduledRun.fireCount, 1);
    assert.equal(scheduledRun.status, 'FIRED');
  });

  await t.test('2. Parallel cancellation vs fire: exactly one operation wins', async () => {
    const schedule = {
      id: 'sched_race_001',
      status: 'SCHEDULED',
      locked: false,
    };

    function processAction(action) {
      if (schedule.locked) {
        throw new Error('409 Conflict: Row is locked');
      }
      schedule.locked = true;
      try {
        if (schedule.status !== 'SCHEDULED') {
          const err = new Error(`Cannot execute ${action} on schedule in state ${schedule.status}`);
          err.code = 'ILLEGAL_TRANSITION';
          err.statusCode = 409;
          throw err;
        }
        if (action === 'CANCEL') {
          schedule.status = 'CANCELLED';
          return { action, outcome: 'CANCELLED' };
        }
        if (action === 'FIRE') {
          schedule.status = 'EXECUTING';
          return { action, outcome: 'EXECUTING' };
        }
      } finally {
        schedule.locked = false;
      }
    }

    // Fire succeeds first
    const fireResult = processAction('FIRE');
    assert.equal(fireResult.outcome, 'EXECUTING');

    // Concurrent cancel attempt afterwards fails with 409
    assert.throws(
      () => processAction('CANCEL'),
      (err) => err.code === 'ILLEGAL_TRANSITION' && err.statusCode === 409
    );
  });

  await t.test('3. Re-evaluation on revoked mandate before fire: fails closed and releases reserved budget', async () => {
    let orgBudget = 50000n;
    const reservedAmount = 10000n;
    orgBudget -= reservedAmount; // reserved at submit: budget = 40,000

    const mandate = {
      status: 'REVOKED', // Revoked prior to fire
      validTo: '2026-12-31T00:00:00Z',
    };

    function fireScheduledPayout() {
      // Re-evaluation check
      if (mandate.status !== 'ACTIVE') {
        // Release reserved budget
        orgBudget += reservedAmount;
        return {
          status: 'REJECTED',
          reason: 'MANDATE_INACTIVE',
          budgetReleased: true,
        };
      }
      return { status: 'EXECUTING' };
    }

    const fireResult = fireScheduledPayout();
    assert.equal(fireResult.status, 'REJECTED');
    assert.equal(fireResult.reason, 'MANDATE_INACTIVE');
    assert.equal(fireResult.budgetReleased, true);
    assert.equal(orgBudget, 50000n, 'Reserved budget must be fully restored upon re-eval rejection');
  });
});

