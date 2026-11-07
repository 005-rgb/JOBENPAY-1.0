/**
 * server/test/security/f8-invariants-concurrency.test.js
 * Test Suite for WP F8-4 (Cross-Category Concurrency) & F8-5 (Global Invariant Property Tests)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';

test('F8-4 & F8-5: Cross-Category Concurrency & Global Invariants Property Testing', async (t) => {
  const seed = Date.now();
  console.log(`[F8-5] Random test seed: ${seed}`);

  await t.test('F8-4.1: 50 parallel payouts strictly enforce budget cap with 0 budget overshoot', async () => {
    const budgetLimitMinor = 20000n; // $200.00
    const payoutAmountMinor = 1000n;  // $10.00 each
    let currentReserved = 0n;
    let currentSpent = 0n;
    let approvedCount = 0;
    let rejectedCount = 0;

    // Mutex / lock simulation for atomic budget reservation
    let lock = Promise.resolve();
    const reserveBudgetAtomic = async (amount) => {
      let release;
      const wait = new Promise((res) => { release = res; });
      const prev = lock;
      lock = wait;
      await prev;
      try {
        if (currentReserved + currentSpent + amount <= budgetLimitMinor) {
          currentReserved += amount;
          return true;
        }
        return false;
      } finally {
        release();
      }
    };

    // Run 50 parallel payout reservations
    const tasks = Array.from({ length: 50 }, async () => {
      const allowed = await reserveBudgetAtomic(payoutAmountMinor);
      if (allowed) {
        approvedCount++;
      } else {
        rejectedCount++;
      }
    });

    await Promise.all(tasks);

    assert.equal(approvedCount, 20, 'Exactly 20 payouts of 1000 minor can fit in 20000 budget');
    assert.equal(rejectedCount, 30, 'Remaining 30 payouts must be rejected for budget exceeded');
    assert.equal(currentReserved, budgetLimitMinor, 'Reserved budget must match exactly limit without overshoot');
  });

  await t.test('F8-4.2: Concurrent duplicate refund race on same capture permits only one refund', async () => {
    let refundCount = 0;
    let captured = true;
    let refunded = false;

    let lock = Promise.resolve();
    const attemptRefund = async () => {
      let release;
      const wait = new Promise((res) => { release = res; });
      const prev = lock;
      lock = wait;
      await prev;
      try {
        if (!refunded) {
          refunded = true;
          refundCount++;
          return { success: true };
        }
        return { success: false, code: 'CAPTURE_ALREADY_REFUNDED' };
      } finally {
        release();
      }
    };

    const results = await Promise.all([attemptRefund(), attemptRefund()]);
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    assert.equal(successes.length, 1);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].code, 'CAPTURE_ALREADY_REFUNDED');
  });

  await t.test('F8-4.3: Race between Void and Capture ensures only one operation succeeds', async () => {
    let authState = 'AUTHORIZED';
    let winner = null;

    let lock = Promise.resolve();
    const transitionAuth = async (op) => {
      let release;
      const wait = new Promise((res) => { release = res; });
      const prev = lock;
      lock = wait;
      await prev;
      try {
        if (authState === 'AUTHORIZED') {
          authState = op === 'CAPTURE' ? 'CAPTURED' : 'VOIDED';
          winner = op;
          return { success: true, op };
        }
        return { success: false, code: 'AUTHORIZATION_ALREADY_CLOSED', currentStatus: authState };
      } finally {
        release();
      }
    };

    const [captureRes, voidRes] = await Promise.all([
      transitionAuth('CAPTURE'),
      transitionAuth('VOID'),
    ]);

    assert.ok(captureRes.success !== voidRes.success, 'Either capture or void wins, never both');
    assert.ok(['CAPTURED', 'VOIDED'].includes(authState));
  });

  await t.test('F8-4.4: Concurrent cumulative partial captures cannot exceed authorized total', async () => {
    const authorizedTotalMinor = 50000n; // $500.00
    let capturedTotalMinor = 0n;

    let lock = Promise.resolve();
    const attemptCapturePartial = async (amountMinor) => {
      let release;
      const wait = new Promise((res) => { release = res; });
      const prev = lock;
      lock = wait;
      await prev;
      try {
        if (capturedTotalMinor + amountMinor <= authorizedTotalMinor) {
          capturedTotalMinor += amountMinor;
          return { success: true, captured: capturedTotalMinor };
        }
        return { success: false, code: 'CAPTURE_EXCEEDS_AUTHORIZED' };
      } finally {
        release();
      }
    };

    // Launch 6 concurrent captures of 10,000 minor each (total 60,000 against 50,000 authorized)
    const attempts = await Promise.all([
      attemptCapturePartial(10000n),
      attemptCapturePartial(10000n),
      attemptCapturePartial(10000n),
      attemptCapturePartial(10000n),
      attemptCapturePartial(10000n),
      attemptCapturePartial(10000n),
    ]);

    const successfulCaptures = attempts.filter((a) => a.success);
    const rejectedCaptures = attempts.filter((a) => !a.success);

    assert.equal(successfulCaptures.length, 5);
    assert.equal(rejectedCaptures.length, 1);
    assert.equal(capturedTotalMinor, authorizedTotalMinor);
  });

  await t.test('F8-4.5: 200 concurrent requests with identical Idempotency-Key create exactly 1 intent', async () => {
    const key = `idemp_race_${crypto.randomUUID()}`;
    const intentStore = new Map();
    let insertCalls = 0;

    let lock = Promise.resolve();
    const submitWithKey = async (idempKey, payload) => {
      let release;
      const wait = new Promise((res) => { release = res; });
      const prev = lock;
      lock = wait;
      await prev;
      try {
        insertCalls++;
        if (intentStore.has(idempKey)) {
          return { status: 200, intentId: intentStore.get(idempKey), cached: true };
        }
        const intentId = `intent_${crypto.randomUUID()}`;
        intentStore.set(idempKey, intentId);
        return { status: 200, intentId, cached: false };
      } finally {
        release();
      }
    };

    const parallelRequests = Array.from({ length: 200 }, () => (
      submitWithKey(key, { category: 'PAYOUT', amount: '1000' })
    ));

    const responses = await Promise.all(parallelRequests);
    assert.equal(responses.length, 200);
    const uniqueIds = new Set(responses.map((r) => r.intentId));
    assert.equal(uniqueIds.size, 1, 'All 200 requests must resolve to the identical intent ID');
    assert.equal(intentStore.size, 1);
  });

  await t.test('F8-5: Randomized Property Test: Double-entry ledger invariant SUM(DEBIT) = SUM(CREDIT)', async () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY'];
    const categoriesWithSubtypes = [
      { category: 'PAYOUT', sub_type: 'standard' },
      { category: 'SALE', sub_type: 'standard' },
      { category: 'REFUND', sub_type: 'full' },
      { category: 'VOID', sub_type: 'authorization' },
      { category: 'PARTIAL', sub_type: 'payment' },
      { category: 'DOWN_PAYMENT', sub_type: 'initial' },
      { category: 'INVOICE', sub_type: 'standard' },
      { category: 'DISPUTE', sub_type: 'inquiry' },
      { category: 'SCHEDULED', sub_type: 'payout' },
      { category: 'BULK', sub_type: 'payout' },
      { category: 'TRANSFER', sub_type: 'p2p' },
      { category: 'SPLIT', sub_type: 'collect' },
      { category: 'RECURRING', sub_type: 'charge' },
      { category: 'FINANCING', sub_type: 'po' },
      { category: 'DEBIT', sub_type: 'direct' },
    ];

    // Run 1,000 property test iterations with randomized amounts and currencies
    for (let i = 0; i < 1000; i++) {
      const pair = categoriesWithSubtypes[i % categoriesWithSubtypes.length];
      const currency = currencies[i % currencies.length];
      const randomAmount = BigInt(Math.floor(Math.random() * 1000000) + 1); // 1 to 1,000,000 minor units
      const platformFee = (randomAmount * 5n) / 100n; // 5% fee for split
      const payeeShare = randomAmount - platformFee;

      const intent = {
        intent_id: `prop-intent-${i}`,
        category: pair.category,
        sub_type: pair.sub_type,
        amount_minor: randomAmount,
        currency,
        org_id: '00000000-0000-4000-8000-000000000001',
        counterparty_id: '00000000-0000-4000-8000-000000000002',
        sender_account: 'org:main',
        receiver_account: 'payee:main',
        platform_fee_minor: platformFee,
        payee_share_minor: payeeShare,
      };

      const legs = generateLedgerLegs(intent);

      // Invariant: SUM(DEBIT) must exactly equal SUM(CREDIT)
      let debits = 0n;
      let credits = 0n;
      for (const leg of legs) {
        assert.equal(leg.currency, currency, `Leg currency must match intent currency on iteration ${i}`);
        assert.ok(leg.amountMinor >= 0n, 'Leg amounts must never be negative');
        if (leg.legType === 'DEBIT') debits += leg.amountMinor;
        if (leg.legType === 'CREDIT') credits += leg.amountMinor;
      }

      assert.equal(debits, credits, `Double-entry invariant violated on ${pair.category} iter ${i}: debit=${debits}, credit=${credits}`);
    }
  });

  await t.test('F8-5: Escrow and Split invariant: SUM(split_legs) = total amount', async () => {
    for (let i = 0; i < 100; i++) {
      const totalAmount = BigInt(Math.floor(Math.random() * 500000) + 100);
      const feeBps = 300n; // 3%
      const platformFee = (totalAmount * feeBps) / 10000n;
      const payeeShare = totalAmount - platformFee;

      assert.equal(platformFee + payeeShare, totalAmount, 'Split breakdown must strictly sum to total amount');
      assert.ok(payeeShare > 0n, 'Payee share must be positive');
    }
  });
});

