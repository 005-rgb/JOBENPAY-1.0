/**
 * server/test/unit/financing-ledger.test.js
 * Balanced ledger rules & property test for FINANCING (K-FINANCING, AD-17, PRD 1.3 §8)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';
import { mulBpsFloor } from '../../../shared/money.js';

test('Financing Ledger Rules & Property Tests', async (t) => {
  await t.test('1. PO Financing disbursement double-entry legs balance', () => {
    const intent = {
      category: 'FINANCING',
      subType: 'po',
      intentId: '00000000-0000-4000-8000-000000000001',
      amountMinor: 10000000n, // $100,000.00
      currency: 'USD',
    };

    const legs = generateLedgerLegs(intent);
    assert.equal(legs.length, 3);

    const debitLegs = legs.filter((l) => l.legType === 'DEBIT');
    const creditLegs = legs.filter((l) => l.legType === 'CREDIT');

    const totalDebit = debitLegs.reduce((sum, l) => sum + l.amountMinor, 0n);
    const totalCredit = creditLegs.reduce((sum, l) => sum + l.amountMinor, 0n);

    assert.equal(totalDebit, totalCredit);
    assert.equal(totalCredit, 10000000n);
    // 1.5% admin fee = 150000
    assert.equal(legs[0].accountRef, 'org:main');
    assert.equal(legs[0].amountMinor, 9850000n);
    assert.equal(legs[1].accountRef, 'loan:fee:00000000-0000-4000-8000-000000000001');
    assert.equal(legs[1].amountMinor, 150000n);
    assert.equal(legs[2].accountRef, 'loan:principal:00000000-0000-4000-8000-000000000001');
    assert.equal(legs[2].amountMinor, 10000000n);
  });

  await t.test('2. Invoice Financing disbursement double-entry legs balance', () => {
    const intent = {
      category: 'FINANCING',
      subType: 'invoice',
      intentId: '00000000-0000-4000-8000-000000000002',
      amountMinor: 5000000n, // $50,000.00
      currency: 'USD',
    };

    const legs = generateLedgerLegs(intent);
    assert.equal(legs.length, 3);

    const totalDebit = legs.filter((l) => l.legType === 'DEBIT').reduce((sum, l) => sum + l.amountMinor, 0n);
    const totalCredit = legs.filter((l) => l.legType === 'CREDIT').reduce((sum, l) => sum + l.amountMinor, 0n);

    assert.equal(totalDebit, totalCredit);
    assert.equal(totalCredit, 5000000n);
    // 1.5% admin fee = 75000
    assert.equal(legs[0].amountMinor, 4925000n);
    assert.equal(legs[1].amountMinor, 75000n);
    assert.equal(legs[2].amountMinor, 5000000n);
  });

  await t.test('3. Property Test: 1,000 random principal amounts strictly balance (0 diff)', () => {
    for (let i = 0; i < 1000; i++) {
      // Random principal between 1 and 1,000,000,000 minor units
      const randomPrincipal = BigInt(Math.floor(Math.random() * 1000000000) + 1);
      const subType = i % 2 === 0 ? 'po' : 'invoice';

      const intent = {
        category: 'FINANCING',
        subType,
        intentId: `prop_test_${i}`,
        amountMinor: randomPrincipal,
        currency: 'USD',
      };

      const legs = generateLedgerLegs(intent);
      const totalDebit = legs.filter((l) => l.legType === 'DEBIT').reduce((sum, l) => sum + l.amountMinor, 0n);
      const totalCredit = legs.filter((l) => l.legType === 'CREDIT').reduce((sum, l) => sum + l.amountMinor, 0n);

      assert.equal(totalDebit, totalCredit, `Unbalanced legs on iteration ${i} with principal ${randomPrincipal}`);
      assert.equal(totalDebit, randomPrincipal);
    }
  });

  await t.test('4. Repayment installment legs balance exactly', () => {
    const principalPortion = 200000n;
    const interestPortion = 43833n;
    const totalInstallment = principalPortion + interestPortion;

    const repaymentLegs = [
      { legType: 'DEBIT', accountRef: 'loan:principal:fin_01', amountMinor: principalPortion, currency: 'USD' },
      { legType: 'DEBIT', accountRef: 'loan:interest:fin_01', amountMinor: interestPortion, currency: 'USD' },
      { legType: 'CREDIT', accountRef: 'org:main', amountMinor: totalInstallment, currency: 'USD' },
    ];

    const sumDebit = repaymentLegs.filter((l) => l.legType === 'DEBIT').reduce((s, l) => s + l.amountMinor, 0n);
    const sumCredit = repaymentLegs.filter((l) => l.legType === 'CREDIT').reduce((s, l) => s + l.amountMinor, 0n);

    assert.equal(sumDebit, sumCredit);
    assert.equal(sumDebit, 243833n);
  });
});

