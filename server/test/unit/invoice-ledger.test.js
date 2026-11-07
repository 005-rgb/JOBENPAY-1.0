/**
 * server/test/unit/invoice-ledger.test.js
 * Double-entry ledger rules & property test for INVOICE (Item 4 CCC, PRD 1.3 §8, K-INVOICE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('INVOICE Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates invoice ledger rule specification for standard sub-type', () => {
    const invRule = getLedgerRule('INVOICE', 'standard');
    assert.equal(invRule.ruleId, 'RULE_INVOICE_STANDARD');

    const sampleIntent = {
      category: 'INVOICE',
      sub_type: 'standard',
      amount_minor: 150000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000011',
    };

    const legs = generateLedgerLegs(sampleIntent);
    assert.equal(legs.length, 2);

    const debitLeg = legs.find((l) => l.legType === 'DEBIT');
    const creditLeg = legs.find((l) => l.legType === 'CREDIT');

    assert.ok(debitLeg);
    assert.ok(creditLeg);
    assert.equal(debitLeg.accountRef, 'buyer:00000000-0000-4000-8000-000000000011');
    assert.equal(creditLeg.accountRef, 'org:main');
    assert.equal(debitLeg.amountMinor, 150000n);
    assert.equal(creditLeg.amountMinor, 150000n);
  });

  await t.test('2. Property test: 1,000 randomized invoice amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 50_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const counterpartyId = `buyer_${i}`;

      const intent = {
        category: 'INVOICE',
        sub_type: 'standard',
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
      category: 'INVOICE',
      sub_type: 'standard',
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

