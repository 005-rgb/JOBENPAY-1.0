/**
 * server/test/unit/down_payment-ledger.test.js
 * Double-entry ledger rules & property test for DOWN_PAYMENT (Item 4 CCC, PRD 1.3 §8, K-DOWN_PAYMENT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('DOWN_PAYMENT Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates down payment ledger rule specification for initial, settlement, and forfeit', () => {
    const initRule = getLedgerRule('DOWN_PAYMENT', 'initial');
    const settleRule = getLedgerRule('DOWN_PAYMENT', 'settlement');
    const forfeitRule = getLedgerRule('DOWN_PAYMENT', 'forfeit');

    assert.equal(initRule.ruleId, 'RULE_DOWN_PAYMENT_INITIAL');
    assert.equal(settleRule.ruleId, 'RULE_DOWN_PAYMENT_SETTLEMENT');
    assert.equal(forfeitRule.ruleId, 'RULE_DOWN_PAYMENT_FORFEIT');

    // Initial DP legs
    const sampleInit = {
      category: 'DOWN_PAYMENT',
      sub_type: 'initial',
      amount_minor: 25000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000011',
    };
    const initLegs = generateLedgerLegs(sampleInit);
    assert.equal(initLegs.length, 2);
    assert.equal(initLegs[0].legType, 'DEBIT');
    assert.equal(initLegs[0].accountRef, 'buyer:00000000-0000-4000-8000-000000000011');
    assert.equal(initLegs[1].legType, 'CREDIT');
    assert.equal(initLegs[1].accountRef, 'org:down_payment_escrow');
    assert.equal(initLegs[0].amountMinor, 25000n);
    assert.equal(initLegs[1].amountMinor, 25000n);

    // Settlement legs
    const sampleSettle = {
      category: 'DOWN_PAYMENT',
      sub_type: 'settlement',
      amount_minor: 75000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000011',
    };
    const settleLegs = generateLedgerLegs(sampleSettle);
    assert.equal(settleLegs.length, 2);
    assert.equal(settleLegs[0].legType, 'DEBIT');
    assert.equal(settleLegs[0].accountRef, 'buyer:00000000-0000-4000-8000-000000000011');
    assert.equal(settleLegs[1].legType, 'CREDIT');
    assert.equal(settleLegs[1].accountRef, 'org:main');
    assert.equal(settleLegs[0].amountMinor, 75000n);
    assert.equal(settleLegs[1].amountMinor, 75000n);

    // Forfeit legs
    const sampleForfeit = {
      category: 'DOWN_PAYMENT',
      sub_type: 'forfeit',
      amount_minor: 25000n,
      currency: 'USD',
      counterparty_id: '00000000-0000-4000-8000-000000000011',
    };
    const forfeitLegs = generateLedgerLegs(sampleForfeit);
    assert.equal(forfeitLegs.length, 2);
    assert.equal(forfeitLegs[0].legType, 'DEBIT');
    assert.equal(forfeitLegs[0].accountRef, 'org:down_payment_escrow');
    assert.equal(forfeitLegs[1].legType, 'CREDIT');
    assert.equal(forfeitLegs[1].accountRef, 'org:main');
    assert.equal(forfeitLegs[0].amountMinor, 25000n);
    assert.equal(forfeitLegs[1].amountMinor, 25000n);
  });

  await t.test('2. Property test: 1,000 randomized down payment amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];
    const subTypes = ['initial', 'settlement', 'forfeit'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 50_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const subType = subTypes[i % subTypes.length];
      const counterpartyId = `buyer_${i}`;

      const intent = {
        category: 'DOWN_PAYMENT',
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

