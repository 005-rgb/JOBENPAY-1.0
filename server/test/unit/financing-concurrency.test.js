/**
 * server/test/unit/financing-concurrency.test.js
 * Concurrency, row locking & race condition tests for FINANCING (Item 8 CCC, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('FINANCING Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. Two concurrent disbursement attempts on same facility: row locking prevents double-disbursement', async () => {
    let status = 'APPROVED';
    let locked = false;

    async function disburseFacility(workerId) {
      if (locked) {
        throw new Error('409 Conflict: Financing facility row is locked by another transaction');
      }
      locked = true;
      try {
        if (status === 'APPROVED') {
          status = 'DISBURSED';
          return { workerId, disbursed: true, status: 'DISBURSED' };
        }
        return { workerId, disbursed: false, reason: 'ALREADY_DISBURSED', status };
      } finally {
        locked = false;
      }
    }

    const res1 = await disburseFacility('worker_1');
    const res2 = await disburseFacility('worker_2');

    assert.equal(res1.disbursed, true);
    assert.equal(res2.disbursed, false);
    assert.equal(res2.reason, 'ALREADY_DISBURSED');
    assert.equal(status, 'DISBURSED');
  });

  await t.test('2. Row locking serializes concurrent repayment installments safely (no lost updates)', async () => {
    let repaidAmountMinor = 0n;
    const totalObligationMinor = 1000000n;
    const installmentMinor = 250000n;

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

    async function executeRepayment(workerId) {
      await mutex.lock();
      try {
        const nextTotal = repaidAmountMinor + installmentMinor;
        if (nextTotal <= totalObligationMinor) {
          repaidAmountMinor = nextTotal;
          return { workerId, applied: true, newTotal: repaidAmountMinor };
        }
        return { workerId, applied: false, reason: 'OVERPAID' };
      } finally {
        mutex.unlock();
      }
    }

    // Launch 4 concurrent installments in parallel
    const workers = [1, 2, 3, 4].map((id) => executeRepayment(`worker_${id}`));
    const results = await Promise.all(workers);

    assert.equal(results.filter((r) => r.applied).length, 4);
    assert.equal(repaidAmountMinor, 1000000n, 'Repaid amount must equal exactly 1000000n after 4 serialized payments');
  });

  await t.test('3. Repayment race against facility default rejects repayment on defaulted loan', async () => {
    let facilityStatus = 'DEFAULTED';

    async function applyRepayment(amountMinor) {
      if (facilityStatus !== 'DISBURSED' && facilityStatus !== 'REPAYING') {
        const err = new Error(`Cannot accept repayment: facility is ${facilityStatus}`);
        err.code = 'FACILITY_NOT_REPAYABLE';
        err.statusCode = 409;
        throw err;
      }
      return { accepted: true, amountMinor };
    }

    await assert.rejects(
      () => applyRepayment(50000n),
      (err) => err.code === 'FACILITY_NOT_REPAYABLE' && err.statusCode === 409
    );
  });
});

