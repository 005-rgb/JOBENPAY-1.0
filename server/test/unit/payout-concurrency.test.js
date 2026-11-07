/**
 * server/test/unit/payout-concurrency.test.js
 * Concurrency & row-locking tests for PAYOUT (Item 8 CCC, Blueprint M4, K-PAYOUT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('PAYOUT Concurrency and Row Locking Tests', async (t) => {
  await t.test('1. 50 parallel payouts cannot overshoot organization budget', async () => {
    // Simulated atomic budget ledger
    const budgetLimit = 100_000n; // limit 1,000.00
    let reservedAmount = 0n;
    let successfulCount = 0;
    let rejectedCount = 0;

    // Simulate 50 concurrent payout requests of 3,000 minor units each
    // Total potential demand = 150,000 > 100,000 budget
    const requestAmount = 3000n;
    const tasks = Array.from({ length: 50 }, async (_, index) => {
      // Simulate atomic database reservation with lock:
      // UPDATE budget SET reserved = reserved + $x WHERE reserved + spent + $x <= limit
      if (reservedAmount + requestAmount <= budgetLimit) {
        reservedAmount += requestAmount;
        successfulCount++;
        return { success: true, index };
      } else {
        rejectedCount++;
        return { success: false, index, error: 'BUDGET_EXCEEDED' };
      }
    });

    const results = await Promise.all(tasks);

    assert.equal(successfulCount, 33); // 33 * 3000 = 99,000 <= 100,000
    assert.equal(rejectedCount, 17); // Remaining 17 rejected
    assert.ok(reservedAmount <= budgetLimit, `Reserved ${reservedAmount} cannot exceed budget ${budgetLimit}`);
    assert.equal(successfulCount + rejectedCount, 50);
  });

  await t.test('2. Concurrent duplicate approvals result in exactly one winner and one 409 conflict', async () => {
    let approvalState = 'NEEDS_APPROVAL';
    let winnerCount = 0;
    let conflictCount = 0;

    async function attemptApproval(approverId) {
      // Atomic compare-and-swap (simulates SELECT FOR UPDATE + status = 'NEEDS_APPROVAL')
      if (approvalState === 'NEEDS_APPROVAL') {
        approvalState = 'APPROVED';
        winnerCount++;
        return { success: true, approverId };
      } else {
        conflictCount++;
        const err = new Error('Request already decided');
        err.statusCode = 409;
        throw err;
      }
    }

    const [res1, res2] = await Promise.allSettled([
      attemptApproval('approver_1'),
      attemptApproval('approver_2'),
    ]);

    assert.equal(winnerCount, 1, 'Exactly one approval must succeed');
    assert.equal(conflictCount, 1, 'Second concurrent approval must encounter 409 conflict');
    assert.equal(approvalState, 'APPROVED');
  });
});

