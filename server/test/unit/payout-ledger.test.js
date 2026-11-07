/**
 * server/test/unit/payout-ledger.test.js
 * Double-entry ledger rules & property test for PAYOUT (Item 4 CCC, PRD 1.3 §8, K-PAYOUT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('PAYOUT Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates payout ledger rule specification', () => {
    const rule = getLedgerRule('PAYOUT', 'standard');
    assert.equal(rule.ruleId, 'RULE_PAYOUT_STANDARD');

    const sampleIntent = {
      category: 'PAYOUT',
      sub_type: 'standard',
      amount_minor: 150000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000005',
    };

    const legs = generateLedgerLegs(sampleIntent);
    assert.equal(legs.length, 2);

    const debitLeg = legs.find((l) => l.legType === 'DEBIT');
    const creditLeg = legs.find((l) => l.legType === 'CREDIT');

    assert.ok(debitLeg);
    assert.ok(creditLeg);
    assert.equal(debitLeg.accountRef, 'org:main');
    assert.equal(creditLeg.accountRef, 'payee:00000000-0000-4000-8000-000000000005');
    assert.equal(debitLeg.amountMinor, 150000n);
    assert.equal(creditLeg.amountMinor, 150000n);
  });

  await t.test('2. Property test: 1,000 randomized payout amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];

    for (let i = 0; i < 1000; i++) {
      // Generate random safe BigInt amount between 1 and 100,000,000 minor units
      const randomAmount = BigInt(Math.floor(Math.random() * 100_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const counterpartyId = `cp_${i}`;

      const intent = {
        category: 'PAYOUT',
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
        if (leg.legType === 'CREDIT') sumCredit += leg.amountMinor;
      }

      assert.equal(sumDebit, randomAmount);
      assert.equal(sumCredit, randomAmount);
      assert.equal(sumDebit, sumCredit, 'SUM(DEBIT) must exactly equal SUM(CREDIT)');
    }
  });

  await t.test('3. Idempotency: generating legs repeatedly for the same intent produces identical output', () => {
    const intent = {
      category: 'PAYOUT',
      sub_type: 'standard',
      amount_minor: 50000n,
      currency: 'USD',
      counterparty_id: 'cp_idemp_1',
    };

    const run1 = generateLedgerLegs(intent);
    const run2 = generateLedgerLegs(intent);

    assert.deepEqual(run1, run2);
  });
});

