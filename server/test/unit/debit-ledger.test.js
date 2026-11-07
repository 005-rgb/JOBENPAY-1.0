/**
 * server/test/unit/debit-ledger.test.js
 * Balanced ledger rules & property test for DEBIT (K-DEBIT, AD-17, PRD 1.3 §8)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';

test('Debit Ledger Rules & Property Tests', async (t) => {
  await t.test('1. Direct debit collection double-entry legs balance', () => {
    const intent = {
      category: 'DEBIT',
      subType: 'direct',
      intentId: '00000000-0000-4000-8000-000000000001',
      counterpartyId: '00000000-0000-4000-8000-000000000002',
      amountMinor: 250000n, // $2,500.00
      currency: 'USD',
    };

    const legs = generateLedgerLegs(intent);
    assert.equal(legs.length, 2);

    const debitLeg = legs.find((l) => l.legType === 'DEBIT');
    const creditLeg = legs.find((l) => l.legType === 'CREDIT');

    assert.equal(debitLeg.accountRef, 'org:main');
    assert.equal(debitLeg.amountMinor, 250000n);
    assert.equal(creditLeg.accountRef, 'counterparty:debit:00000000-0000-4000-8000-000000000002');
    assert.equal(creditLeg.amountMinor, 250000n);
    assert.equal(debitLeg.amountMinor, creditLeg.amountMinor);
  });

  await t.test('2. Property Test: 1,000 random debit amounts strictly balance (0 diff)', () => {
    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 1000000000) + 1);

      const intent = {
        category: 'DEBIT',
        subType: 'direct',
        intentId: `deb_prop_${i}`,
        counterpartyId: `cp_${i}`,
        amountMinor: randomAmount,
        currency: 'USD',
      };

      const legs = generateLedgerLegs(intent);
      const totalDebit = legs.filter((l) => l.legType === 'DEBIT').reduce((sum, l) => sum + l.amountMinor, 0n);
      const totalCredit = legs.filter((l) => l.legType === 'CREDIT').reduce((sum, l) => sum + l.amountMinor, 0n);

      assert.equal(totalDebit, totalCredit, `Unbalanced debit legs on iteration ${i}`);
      assert.equal(totalDebit, randomAmount);
    }
  });
});

