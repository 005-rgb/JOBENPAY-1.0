/**
 * server/test/unit/scheduled-ledger.test.js
 * Double-entry ledger rules & property test for SCHEDULED (Item 4 CCC, PRD 1.3 §8, K-SCHEDULED)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('SCHEDULED Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates scheduled payout and charge ledger rule specifications', () => {
    const payoutRule = getLedgerRule('SCHEDULED', 'payout');
    assert.equal(payoutRule.ruleId, 'RULE_SCHEDULED_PAYOUT');

    const chargeRule = getLedgerRule('SCHEDULED', 'charge');
    assert.equal(chargeRule.ruleId, 'RULE_SCHEDULED_CHARGE');

    const samplePayout = {
      category: 'SCHEDULED',
      sub_type: 'payout',
      amount_minor: 50000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000099',
    };

    const payoutLegs = generateLedgerLegs(samplePayout);
    assert.equal(payoutLegs.length, 2);
    const pDebit = payoutLegs.find((l) => l.legType === 'DEBIT');
    const pCredit = payoutLegs.find((l) => l.legType === 'CREDIT');
    assert.equal(pDebit.accountRef, 'org:main');
    assert.equal(pCredit.accountRef, 'payee:00000000-0000-4000-8000-000000000099');
    assert.equal(pDebit.amountMinor, 50000n);
    assert.equal(pCredit.amountMinor, 50000n);

    const sampleCharge = {
      category: 'SCHEDULED',
      sub_type: 'charge',
      amount_minor: 25000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000077',
    };

    const chargeLegs = generateLedgerLegs(sampleCharge);
    assert.equal(chargeLegs.length, 2);
    const cDebit = chargeLegs.find((l) => l.legType === 'DEBIT');
    const cCredit = chargeLegs.find((l) => l.legType === 'CREDIT');
    assert.equal(cDebit.accountRef, 'buyer:00000000-0000-4000-8000-000000000077');
    assert.equal(cCredit.accountRef, 'org:main');
    assert.equal(cDebit.amountMinor, 25000n);
    assert.equal(cCredit.amountMinor, 25000n);
  });

  await t.test('2. Property test: 1,000 randomized scheduled amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
    const subTypes = ['payout', 'charge'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 10_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const subType = subTypes[i % subTypes.length];
      const counterpartyId = `cp_${i}`;

      const intent = {
        category: 'SCHEDULED',
        sub_type: subType,
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

  await t.test('3. Idempotency: generating legs repeatedly for the same intent produces identical output', () => {
    const sample = {
      category: 'SCHEDULED',
      sub_type: 'payout',
      amount_minor: 10000n,
      currency: 'USD',
      counterparty_id: 'cp_idem_123',
    };

    const run1 = generateLedgerLegs(sample);
    const run2 = generateLedgerLegs(sample);

    assert.deepEqual(run1, run2);
    assert.equal(run1.length, 2);
  });
});
