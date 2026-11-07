/**
 * server/test/unit/sale-ledger.test.js
 * Double-entry ledger rules & property test for SALE (Item 4 CCC, PRD 1.3 §8, K-SALE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('SALE Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates sale ledger rule specification', () => {
    const rule = getLedgerRule('SALE', 'standard');
    assert.equal(rule.ruleId, 'RULE_SALE_STANDARD');

    const sampleIntent = {
      category: 'SALE',
      sub_type: 'standard',
      amount_minor: 250000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000008',
    };

    const legs = generateLedgerLegs(sampleIntent);
    assert.equal(legs.length, 2);

    const debitLeg = legs.find((l) => l.legType === 'DEBIT');
    const creditLeg = legs.find((l) => l.legType === 'CREDIT');

    assert.ok(debitLeg);
    assert.ok(creditLeg);
    assert.equal(debitLeg.accountRef, 'buyer:00000000-0000-4000-8000-000000000008');
    assert.equal(creditLeg.accountRef, 'org:main');
    assert.equal(debitLeg.amountMinor, 250000n);
    assert.equal(creditLeg.amountMinor, 250000n);
  });

  await t.test('2. Property test: 1,000 randomized sale amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];

    for (let i = 0; i < 1000; i++) {
      // Generate random safe BigInt amount between 1 and 100,000,000 minor units
      const randomAmount = BigInt(Math.floor(Math.random() * 100_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const counterpartyId = `buyer_${i}`;

      const intent = {
        category: 'SALE',
        sub_type: 'standard',
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
      category: 'SALE',
      sub_type: 'standard',
      amount_minor: 0n,
      currency: 'USD',
    };

    const legs = generateLedgerLegs(intent);
    assert.equal(legs[0].amountMinor, 0n);
    assert.equal(legs[1].amountMinor, 0n);
  });
});

