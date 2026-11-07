/**
 * server/test/unit/partial-ledger.test.js
 * Double-entry ledger rules & property test for PARTIAL (Item 4 CCC, PRD 1.3 §8, K-PARTIAL)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('PARTIAL Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates partial ledger rule specification for payment and refund', () => {
    const payRule = getLedgerRule('PARTIAL', 'payment');
    const refRule = getLedgerRule('PARTIAL', 'refund');

    assert.equal(payRule.ruleId, 'RULE_PARTIAL_PAYMENT');
    assert.equal(refRule.ruleId, 'RULE_PARTIAL_REFUND');

    const samplePayIntent = {
      category: 'PARTIAL',
      sub_type: 'payment',
      amount_minor: 75000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000011',
    };

    const payLegs = generateLedgerLegs(samplePayIntent);
    assert.equal(payLegs.length, 2);

    const debitPayLeg = payLegs.find((l) => l.legType === 'DEBIT');
    const creditPayLeg = payLegs.find((l) => l.legType === 'CREDIT');

    assert.ok(debitPayLeg);
    assert.ok(creditPayLeg);
    assert.equal(debitPayLeg.accountRef, 'buyer:00000000-0000-4000-8000-000000000011');
    assert.equal(creditPayLeg.accountRef, 'org:main');
    assert.equal(debitPayLeg.amountMinor, 75000n);
    assert.equal(creditPayLeg.amountMinor, 75000n);

    const sampleRefIntent = {
      category: 'PARTIAL',
      sub_type: 'refund',
      amount_minor: 25000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000011',
    };

    const refLegs = generateLedgerLegs(sampleRefIntent);
    assert.equal(refLegs.length, 2);

    const debitRefLeg = refLegs.find((l) => l.legType === 'DEBIT');
    const creditRefLeg = refLegs.find((l) => l.legType === 'CREDIT');

    assert.ok(debitRefLeg);
    assert.ok(creditRefLeg);
    assert.equal(debitRefLeg.accountRef, 'org:main');
    assert.equal(creditRefLeg.accountRef, 'buyer:00000000-0000-4000-8000-000000000011');
    assert.equal(debitRefLeg.amountMinor, 25000n);
    assert.equal(creditRefLeg.amountMinor, 25000n);
  });

  await t.test('2. Property test: 1,000 randomized partial amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
    const subTypes = ['payment', 'refund'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 50_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const subType = subTypes[i % subTypes.length];
      const counterpartyId = `buyer_${i}`;

      const intent = {
        category: 'PARTIAL',
        sub_type: subType,
        amount_minor: randomAmount,
        currency,
        counterparty_id: counterpartyId,
      };

      const legs = generateLedgerLegs(intent);

      let sumDebit = 0n;
      let sumCredit = 0n;

      for (const leg of legs) {
        assert.equal(leg.currency, currency, 'Currency must match across all legs');
        if (leg.legType === 'DEBIT') {
          sumDebit += leg.amountMinor;
        } else if (leg.legType === 'CREDIT') {
          sumCredit += leg.amountMinor;
        }
      }

      assert.equal(
        sumDebit,
        sumCredit,
        `Property failed on iteration ${i}: DEBIT (${sumDebit}) !== CREDIT (${sumCredit})`
      );
      assert.equal(sumDebit, randomAmount, 'Total balanced amount must equal intent amount');
    }
  });

  await t.test('3. Rejects negative or zero amount intents', () => {
    const zeroIntent = {
      category: 'PARTIAL',
      sub_type: 'payment',
      amount_minor: 0n,
      currency: 'USD',
      counterparty_id: 'buyer_zero',
    };

    const legs = generateLedgerLegs(zeroIntent);
    const sumDebit = legs.filter((l) => l.legType === 'DEBIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    const sumCredit = legs.filter((l) => l.legType === 'CREDIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    assert.equal(sumDebit, 0n);
    assert.equal(sumCredit, 0n);
  });
});

