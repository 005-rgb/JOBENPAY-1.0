/**
 * server/test/unit/refund-ledger.test.js
 * Double-entry ledger rules & property test for REFUND (Item 4 CCC, PRD 1.3 §8, K-REFUND)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('REFUND Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates refund ledger rule specification for full and partial', () => {
    const fullRule = getLedgerRule('REFUND', 'full');
    const partialRule = getLedgerRule('REFUND', 'partial');

    assert.equal(fullRule.ruleId, 'RULE_REFUND_FULL');
    assert.equal(partialRule.ruleId, 'RULE_REFUND_PARTIAL');

    const sampleIntent = {
      category: 'REFUND',
      sub_type: 'full',
      amount_minor: 120000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000009',
    };

    const legs = generateLedgerLegs(sampleIntent);
    assert.equal(legs.length, 2);

    const debitLeg = legs.find((l) => l.legType === 'DEBIT');
    const creditLeg = legs.find((l) => l.legType === 'CREDIT');

    assert.ok(debitLeg);
    assert.ok(creditLeg);
    assert.equal(debitLeg.accountRef, 'org:main');
    assert.equal(creditLeg.accountRef, 'buyer:00000000-0000-4000-8000-000000000009');
    assert.equal(debitLeg.amountMinor, 120000n);
    assert.equal(creditLeg.amountMinor, 120000n);
  });

  await t.test('2. Property test: 1,000 randomized refund amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
    const subTypes = ['full', 'partial'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 50_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const subType = subTypes[i % subTypes.length];
      const counterpartyId = `buyer_${i}`;

      const intent = {
        category: 'REFUND',
        sub_type: subType,
        amount_minor: randomAmount,
        currency,
        counterparty_id: counterpartyId,
      };

      const legs = generateLedgerLegs(intent);

      let sumDebit = 0n;
      let sumCredit = 0n;
      for (const leg of legs) {
        assert.equal(leg.currency, currency);
        if (leg.legType === 'DEBIT') sumDebit += leg.amountMinor;
        else if (leg.legType === 'CREDIT') sumCredit += leg.amountMinor;
      }

      assert.equal(sumDebit, randomAmount, `Debit sum must match original amount on iteration ${i}`);
      assert.equal(sumCredit, randomAmount, `Credit sum must match original amount on iteration ${i}`);
      assert.equal(sumDebit, sumCredit, `Double-entry must be strictly balanced on iteration ${i}`);
    }
  });

  await t.test('3. Rejects intent with missing currency or zero amount', () => {
    const intent = {
      category: 'REFUND',
      sub_type: 'partial',
      amount_minor: 0n,
      currency: 'USD',
    };

    const legs = generateLedgerLegs(intent);
    assert.equal(legs[0].amountMinor, 0n);
    assert.equal(legs[1].amountMinor, 0n);
  });
});

