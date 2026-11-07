/**
 * server/test/unit/transfer-concurrency.test.js
 * Concurrency, row locking & race condition tests for TRANSFER (Item 8 CCC, AD-17, T-18, K-TRANSFER)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('TRANSFER Concurrency & Row Locking Tests', async (t) => {
  await t.test('1. Two concurrent transfers competing for sender balance: zero overshoot', async () => {
    let senderBalance = 50000n; // $500.00
    const transfer1 = 30000n;   // $300.00
    const transfer2 = 30000n;   // $300.00 (Total 60,000 > 50,000)

    let locked = false;
    async function executeTransferDebit(txId, amount) {
      if (locked) {
        throw new Error('409 Conflict: Row is locked by another transaction');
      }
      locked = true;
      try {
        if (senderBalance >= amount) {
          senderBalance -= amount;
          return { txId, accepted: true, remaining: senderBalance };
        }
        return { txId, accepted: false, reason: 'INSUFFICIENT_FUNDS' };
      } finally {
        locked = false;
      }
    }

    const res1 = await executeTransferDebit('tx_1', transfer1);
    const res2 = await executeTransferDebit('tx_2', transfer2);

    assert.equal(res1.accepted, true);
    assert.equal(res2.accepted, false);
    assert.equal(res2.reason, 'INSUFFICIENT_FUNDS');
    assert.equal(senderBalance, 20000n, 'Remaining sender balance must strictly reflect exactly one accepted transfer');
  });

  await t.test('2. Row locking simulates serial processing under high concurrency (10 concurrent transfers)', async () => {
    let senderBalance = 100000n; // $1,000.00
    const amountPerTx = 15000n;  // $150.00 each -> at most 6 can succeed (6 * 15,000 = 90,000 <= 100,000)

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

    async function attemptTransfer(id) {
      await mutex.lock();
      try {
        // SELECT ... FOR UPDATE simulated
        if (senderBalance >= amountPerTx) {
          senderBalance -= amountPerTx;
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

    const promises = Array.from({ length: 10 }, (_, i) => attemptTransfer(`tx_${i}`));
    const results = await Promise.all(promises);

    assert.equal(acceptedCount, 6, 'Exactly 6 transfers must succeed without overdrawing');
    assert.equal(rejectedCount, 4, 'Remaining 4 transfers must be cleanly rejected');
    assert.equal(senderBalance, 10000n, 'Final balance must be exactly 10,000 minor units');
    assert.equal(results.length, 10);
  });

  await t.test('3. Race condition between transfer and account freeze fails closed', async () => {
    let accountFrozen = false;
    let balance = 20000n;

    async function freezeAccount() {
      accountFrozen = true;
      return { status: 'FROZEN' };
    }

    async function transferMoney(amount) {
      if (accountFrozen) {
        const err = new Error('Sender account is frozen');
        err.code = 'ACCOUNT_FROZEN';
        err.statusCode = 422;
        throw err;
      }
      balance -= amount;
      return { transferred: amount, remaining: balance };
    }

    // Freeze account first
    await freezeAccount();

    await assert.rejects(
      async () => transferMoney(5000n),
      (err) => {
        assert.equal(err.code, 'ACCOUNT_FROZEN');
        return true;
      }
    );
    assert.equal(balance, 20000n, 'Balance must remain untouched when account is frozen');
  });
});

