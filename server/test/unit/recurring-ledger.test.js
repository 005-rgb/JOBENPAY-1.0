/**
 * server/test/unit/recurring-ledger.test.js
 * Double-entry balanced ledger rules & property tests for RECURRING (Item 4 CCC, PRD 1.3 §0.1, AD-17, T-08, K-RECURRING)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';
import { validateRecurringSchedule } from '../../../shared/recurring.js';

test('RECURRING Double-Entry Balanced Ledger & Property Tests', async (t) => {
  const subscriberId = '00000000-0000-4000-8000-000000000004';

  await t.test('1. test_recurring_limit: Enforces cycle amount ceiling and remaining cycle limits', () => {
    // Valid within limits ($50.00 <= $100.00 ceiling, 12 remaining cycles)
    assert.equal(
      validateRecurringSchedule({
        frequency: 'MONTHLY',
        intervalCount: 1,
        amountMinor: 5000n,
        currency: 'USD',
        maxCycleAmount: 10000n,
        remainingCycles: 12,
      }),
      true
    );

    // Exceeds maxCycleAmount ($120.00 > $100.00)
    assert.throws(
      () =>
        validateRecurringSchedule({
          frequency: 'MONTHLY',
          intervalCount: 1,
          amountMinor: 12000n,
          currency: 'USD',
          maxCycleAmount: 10000n,
          remainingCycles: 12,
        }),
      (err) => err.code === 'RECURRING_LIMIT_EXCEEDED' && err.statusCode === 422
    );

    // Cycles expired (remainingCycles: 0)
    assert.throws(
      () =>
        validateRecurringSchedule({
          frequency: 'MONTHLY',
          intervalCount: 1,
          amountMinor: 5000n,
          currency: 'USD',
          remainingCycles: 0,
        }),
      (err) => err.code === 'RECURRING_CYCLES_EXPIRED' && err.statusCode === 422
    );
  });

  await t.test('2. Generates balanced double-entry legs for RECURRING / charge', () => {
    const legs = generateLedgerLegs({
      category: 'RECURRING',
      sub_type: 'charge',
      amount_minor: 7500n, // $75.00
      currency: 'USD',
      counterparty_id: subscriberId,
    });

    assert.equal(legs.length, 2);
    assert.equal(legs[0].legType, 'DEBIT');
    assert.equal(legs[0].accountRef, 'org:main');
    assert.equal(legs[0].amountMinor, 7500n);

    assert.equal(legs[1].legType, 'CREDIT');
    assert.equal(legs[1].accountRef, `payee:${subscriberId}`);
    assert.equal(legs[1].amountMinor, 7500n);

    const totalDebit = legs.filter((l) => l.legType === 'DEBIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    const totalCredit = legs.filter((l) => l.legType === 'CREDIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    assert.equal(totalDebit, totalCredit);
  });

  await t.test('3. Generates balanced double-entry legs for RECURRING / init and cancel', () => {
    const initLegs = generateLedgerLegs({
      category: 'RECURRING',
      sub_type: 'init',
      amount_minor: 5000n,
      currency: 'USD',
      counterparty_id: subscriberId,
    });
    assert.equal(initLegs.length, 2);
    assert.equal(initLegs[0].amountMinor, initLegs[1].amountMinor);

    const cancelLegs = generateLedgerLegs({
      category: 'RECURRING',
      sub_type: 'cancel',
      amount_minor: 5000n,
      currency: 'USD',
      counterparty_id: subscriberId,
    });
    assert.equal(cancelLegs.length, 2);
    assert.equal(cancelLegs[0].amountMinor, cancelLegs[1].amountMinor);
  });

  await t.test('4. 1,000 property tests: generateLedgerLegs is ALWAYS strictly balanced for all RECURRING sub-types', () => {
    const subTypes = ['init', 'charge', 'cancel'];
    const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'JPY'];

    for (let i = 0; i < 1000; i++) {
      const subType = subTypes[i % subTypes.length];
      const currency = currencies[i % currencies.length];
      const amount = BigInt(Math.floor(Math.random() * 5000000) + 1);

      const legs = generateLedgerLegs({
        category: 'RECURRING',
        sub_type: subType,
        amount_minor: amount,
        currency,
        counterparty_id: subscriberId,
      });

      let totalDebit = 0n;
      let totalCredit = 0n;

      for (const leg of legs) {
        assert.equal(leg.currency, currency);
        if (leg.legType === 'DEBIT') totalDebit += leg.amountMinor;
        if (leg.legType === 'CREDIT') totalCredit += leg.amountMinor;
      }

      assert.equal(
        totalDebit,
        totalCredit,
        `RECURRING ${subType} must be balanced. Debit=${totalDebit}, Credit=${totalCredit}`
      );
    }
  });
});

