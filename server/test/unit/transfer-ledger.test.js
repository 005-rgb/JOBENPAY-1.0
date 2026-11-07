/**
 * server/test/unit/transfer-ledger.test.js
 * Double-entry ledger rules & property test for TRANSFER (Item 4 CCC, PRD 1.3 §8, K-TRANSFER)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';

test('TRANSFER Ledger Balanced Double-Entry & Property Testing', async (t) => {
  await t.test('1. Validates transfer p2p ledger rule specification', () => {
    const rule = getLedgerRule('TRANSFER', 'p2p');
    assert.equal(rule.ruleId, 'RULE_TRANSFER_P2P');

    const sample = {
      category: 'TRANSFER',
      sub_type: 'p2p',
      amount_minor: 8000n,
      currency: 'USD',
      sender_counterparty_id: '00000000-0000-4000-8000-000000000001',
      receiver_counterparty_id: '00000000-0000-4000-8000-000000000002',
    };

    const legs = generateLedgerLegs(sample);
    assert.equal(legs.length, 2);

    const debit = legs.find((l) => l.legType === 'DEBIT');
    const credit = legs.find((l) => l.legType === 'CREDIT');

    assert.equal(debit.accountRef, 'payee:00000000-0000-4000-8000-000000000001');
    assert.equal(credit.accountRef, 'payee:00000000-0000-4000-8000-000000000002');
    assert.equal(debit.amountMinor, 8000n);
    assert.equal(credit.amountMinor, 8000n);
  });

  await t.test('2. Property test: 1,000 randomized transfer amounts maintain SUM(DEBIT) = SUM(CREDIT)', () => {
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];

    for (let i = 0; i < 1000; i++) {
      const randomAmount = BigInt(Math.floor(Math.random() * 20_000_000) + 1);
      const currency = currencies[i % currencies.length];
      const senderId = `sender_${i}`;
      const receiverId = `receiver_${i}`;

      const intent = {
        category: 'TRANSFER',
        sub_type: 'p2p',
        amount_minor: randomAmount,
        currency,
        sender_counterparty_id: senderId,
        receiver_counterparty_id: receiverId,
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
      category: 'TRANSFER',
      sub_type: 'p2p',
      amount_minor: 15000n,
      currency: 'USD',
      sender_counterparty_id: 'sender_idem',
      receiver_counterparty_id: 'receiver_idem',
    };

    const run1 = generateLedgerLegs(sample);
    const run2 = generateLedgerLegs(sample);

    assert.deepEqual(run1, run2);
    assert.equal(run1.length, 2);
  });
});

