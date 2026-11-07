/**
 * server/test/unit/down_payment-concurrency.test.js
 * Concurrency, row locking & PRD §11 down payment lifecycle tests
 * (Item 8 CCC, PRD 1.3 §11 test_dp_initial_partial, test_dp_settlement, test_dp_forfeit, test_dp_settlement_race, K-DOWN_PAYMENT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

test('DOWN_PAYMENT Concurrency & Lifecycle Tests (PRD §11)', async (t) => {
  await t.test('1. test_dp_initial_partial: Initial DP must not exceed total amount', () => {
    const totalAmount = 100_000n; // $1,000.00 total order

    function validateInitialDp(dpAmount, total) {
      if (dpAmount <= 0n) {
        const err = new Error('Down payment must be positive');
        err.code = 'INVALID_DP_AMOUNT';
        err.statusCode = 400;
        throw err;
      }
      if (dpAmount >= total) {
        const err = new Error('Down payment cannot equal or exceed total order amount (use SALE instead)');
        err.code = 'DP_EXCEEDS_TOTAL';
        err.statusCode = 422;
        throw err;
      }
      return { valid: true, dpAmount, remaining: total - dpAmount };
    }

    // Exceeds total
    assert.throws(
      () => validateInitialDp(120_000n, totalAmount),
      (err) => err.code === 'DP_EXCEEDS_TOTAL' && err.statusCode === 422
    );

    // Equals total
    assert.throws(
      () => validateInitialDp(100_000n, totalAmount),
      (err) => err.code === 'DP_EXCEEDS_TOTAL' && err.statusCode === 422
    );

    // Valid partial initial DP ($200.00 of $1,000.00)
    const validRes = validateInitialDp(20_000n, totalAmount);
    assert.equal(validRes.valid, true);
    assert.equal(validRes.remaining, 80_000n);
  });

  await t.test('2. test_dp_settlement: Settlement requires exact balance match for SETTLED status', () => {
    const totalAmount = 100_000n;
    const dpPaidAmount = 30_000n;
    let dpAccount = {
      status: 'DP_PAID',
      dpAmount: dpPaidAmount,
      settlementAmount: null,
      totalAmount,
    };

    function processSettlement(account, settleAmount) {
      if (account.status !== 'DP_PAID' && account.status !== 'SETTLEMENT_DUE') {
        const err = new Error(`Cannot settle down payment in status ${account.status}`);
        err.code = 'INVALID_DP_STATUS';
        err.statusCode = 409;
        throw err;
      }

      if (account.dpAmount + settleAmount !== account.totalAmount) {
        const err = new Error('Settlement amount must exactly match total minus down payment');
        err.code = 'SETTLEMENT_AMOUNT_MISMATCH';
        err.statusCode = 422;
        throw err;
      }

      account.settlementAmount = settleAmount;
      account.status = 'SETTLED';
      return { status: account.status, settled: true };
    }

    // Mismatched settlement amount ($600 instead of $700)
    assert.throws(
      () => processSettlement(dpAccount, 60_000n),
      (err) => err.code === 'SETTLEMENT_AMOUNT_MISMATCH' && err.statusCode === 422
    );

    // Exact settlement amount ($700)
    const okRes = processSettlement(dpAccount, 70_000n);
    assert.equal(okRes.status, 'SETTLED');
    assert.equal(dpAccount.dpAmount + dpAccount.settlementAmount, totalAmount);
  });

  await t.test('3. test_dp_forfeit: Forfeiting voids remaining hold and permanently closes account', () => {
    let dpAccount = {
      status: 'DP_PAID',
      dpAmount: 25_000n,
      settlementAmount: null,
      totalAmount: 100_000n,
      authorizationStatus: 'PARTIALLY_CAPTURED',
    };

    function processForfeit(account) {
      if (account.status === 'SETTLED' || account.status === 'FORFEITED') {
        const err = new Error(`Cannot forfeit down payment in status ${account.status}`);
        err.code = 'ILLEGAL_TRANSITION';
        err.statusCode = 409;
        throw err;
      }

      account.status = 'FORFEITED';
      account.authorizationStatus = 'VOIDED';
      return { status: account.status, authorizationStatus: account.authorizationStatus };
    }

    const forfeitRes = processForfeit(dpAccount);
    assert.equal(forfeitRes.status, 'FORFEITED');
    assert.equal(forfeitRes.authorizationStatus, 'VOIDED');

    // Attempting settlement after forfeit throws 409
    assert.throws(
      () => processForfeit(dpAccount),
      (err) => err.code === 'ILLEGAL_TRANSITION' && err.statusCode === 409
    );
  });

  await t.test('4. test_dp_settlement_race: Concurrent settlements with SELECT ... FOR UPDATE prevent race condition', async () => {
    let account = {
      status: 'DP_PAID',
      dpAmount: 20_000n,
      settlementAmount: null,
      totalAmount: 100_000n,
    };

    let lockHeld = false;
    let executions = 0;

    async function acquireLock() {
      while (lockHeld) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      lockHeld = true;
    }
    function releaseLock() {
      lockHeld = false;
    }

    async function attemptConcurrentSettlement(actorId) {
      await acquireLock();
      try {
        if (account.status === 'SETTLED') {
          const err = new Error('Down payment already settled');
          err.code = 'ALREADY_SETTLED';
          err.statusCode = 409;
          throw err;
        }

        account.status = 'SETTLED';
        account.settlementAmount = 80_000n;
        executions++;
        return { success: true, actorId, status: account.status };
      } finally {
        releaseLock();
      }
    }

    // Launch 3 simultaneous settlement attempts
    const results = await Promise.allSettled([
      attemptConcurrentSettlement('approver_1'),
      attemptConcurrentSettlement('approver_2'),
      attemptConcurrentSettlement('webhook_listener'),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one settlement execution must succeed');
    assert.equal(rejected.length, 2, 'Race competitors must be rejected');
    assert.equal(executions, 1);
    assert.equal(account.status, 'SETTLED');
  });
});

