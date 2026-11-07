/**
 * server/test/unit/dispute-ledger.test.js
 * Double-entry ledger rules & property test for DISPUTE (Item 4 CCC, PRD 1.3 §8, K-DISPUTE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('DISPUTE Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates dispute ledger rule specification for chargeback and inquiry', () => {
    const cbRule = getLedgerRule('DISPUTE', 'chargeback');
    const inqRule = getLedgerRule('DISPUTE', 'inquiry');

    assert.equal(cbRule.ruleId, 'RULE_DISPUTE_CHARGEBACK');
    assert.equal(inqRule.ruleId, 'RULE_DISPUTE_INQUIRY');

    const sampleCb = {
      category: 'DISPUTE',
      sub_type: 'chargeback',
      amount_minor: 75000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000011',
    };

    const cbLegs = generateLedgerLegs(sampleCb);
    assert.equal(cbLegs.length, 2);
    assert.equal(cbLegs[0].legType, 'DEBIT');
    assert.equal(cbLegs[0].accountRef, 'org:main');
    assert.equal(cbLegs[1].legType, 'CREDIT');
    assert.equal(cbLegs[1].accountRef, 'buyer:00000000-0000-4000-8000-000000000011');
    assert.equal(cbLegs[0].amountMinor, 75000n);
    assert.equal(cbLegs[1].amountMinor, 75000n);

    const sampleInq = {
      category: 'DISPUTE',
      sub_type: 'inquiry',
      amount_minor: 75000n,
      currency: 'USD',
    };

    const inqLegs = generateLedgerLegs(sampleInq);
    assert.equal(inqLegs.length, 2);
    assert.equal(inqLegs[0].amountMinor, inqLegs[1].amountMinor);
  });

  await t.test('2. Property test: 1,000 randomized dispute amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
    const subTypes = ['chargeback', 'inquiry'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 50_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const subType = subTypes[i % subTypes.length];
      const counterpartyId = `buyer_${i}`;

      const intent = {
        category: 'DISPUTE',
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
});

