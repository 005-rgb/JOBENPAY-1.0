/**
 * server/test/unit/bulk-ledger.test.js
 * Double-entry ledger rules & property test for BULK (Item 4 CCC, PRD 1.3 §8, K-BULK)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('BULK Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates bulk payout ledger rule specification', () => {
    const rule = getLedgerRule('BULK', 'payout');
    assert.equal(rule.ruleId, 'RULE_BULK_PAYOUT');

    const sample = {
      category: 'BULK',
      sub_type: 'payout',
      amount_minor: 75000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000088',
    };

    const legs = generateLedgerLegs(sample);
    assert.equal(legs.length, 2);

    const debit = legs.find((l) => l.legType === 'DEBIT');
    const credit = legs.find((l) => l.legType === 'CREDIT');

    assert.equal(debit.accountRef, 'org:main');
    assert.equal(credit.accountRef, 'payee:00000000-0000-4000-8000-000000000088');
    assert.equal(debit.amountMinor, 75000n);
    assert.equal(credit.amountMinor, 75000n);
  });

  await t.test('2. Property test: 1,000 randomized bulk item amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 50_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const counterpartyId = `bulk_payee_${i}`;

      const intent = {
        category: 'BULK',
        sub_type: 'payout',
        amount_minor: randomAmount,
        currency,
        counterparty_id: counterpartyId,
      };

      const legs = generateLedgerLegs(intent);
      assert.equal(legs.length, 2);

      let debitSum = 0n;
      let creditSum = 0n;
      for (const leg of legs) {
        if (leg.legType === 'DEBIT') debitSum += leg.amountMinor;
        if (leg.legType === 'CREDIT') creditSum += leg.amountMinor;
        assert.equal(leg.currency, currency);
      }

      assert.equal(debitSum, creditSum);
      assert.equal(debitSum, randomAmount);
    }
  });

  await t.test('3. Idempotency: generating legs repeatedly for same intent produces identical output', () => {
    const sample = {
      category: 'BULK',
      sub_type: 'payout',
      amount_minor: 40000n,
      currency: 'USD',
      counterparty_id: 'cp_bulk_idem',
    };

    const run1 = generateLedgerLegs(sample);
    const run2 = generateLedgerLegs(sample);

    assert.deepEqual(run1, run2);
    assert.equal(run1.length, 2);
  });
});

