/**
 * server/test/unit/split-ledger.test.js
 * Double-entry balanced ledger rules & property tests for SPLIT (Item 4 CCC, PRD 1.3 §0.1, AD-13, AD-17, T-13, T-14, K-SPLIT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLedgerLegs, getLedgerRule } from '../../../shared/ledger-rules.js';
import { calculateSplitShares } from '../../../shared/split.js';
import { splitFee, mulBpsFloor } from '../../../shared/money.js';

test('SPLIT Double-Entry Balanced Ledger & Property Tests', async (t) => {
  const payeeId = '00000000-0000-4000-8000-000000000004';

  await t.test('1. test_split_fee_calculation: 1,000 property tests verifying fee + payee === total with zero diff', () => {
    for (let i = 0; i < 1000; i++) {
      // Random minor amount from 1 to 10,000,000 (up to $100,000.00)
      const totalAmountMinor = BigInt(Math.floor(Math.random() * 10000000) + 1);
      // Random bps from 0 to 10,000 (0% to 100%)
      const platformFeeBps = Math.floor(Math.random() * 10001);

      const { fee, payee } = splitFee(totalAmountMinor, platformFeeBps);

      assert.equal(
        fee + payee,
        totalAmountMinor,
        `Property failed: fee (${fee}) + payee (${payee}) != total (${totalAmountMinor}) at bps=${platformFeeBps}`
      );
      assert.ok(fee >= 0n, 'Fee must be non-negative');
      assert.ok(payee >= 0n, 'Payee share must be non-negative');
    }
  });

  await t.test('2. Multi-recipient split fee calculation preserves exact zero-diff conservation', () => {
    for (let i = 0; i < 500; i++) {
      const total = BigInt(Math.floor(Math.random() * 5000000) + 100);
      const bps = Math.floor(Math.random() * 2500); // 0 to 25%

      const recipientCount = Math.floor(Math.random() * 5) + 1; // 1 to 5 recipients
      const recipients = Array.from({ length: recipientCount }, (_, idx) => ({
        counterpartyId: `00000000-0000-4000-8000-00000000000${idx + 1}`,
      }));

      const result = calculateSplitShares({
        totalAmountMinor: total,
        platformFeeBps: bps,
        recipients,
      });

      let sumShares = 0n;
      for (const s of result.shares) {
        sumShares += s.amountMinor;
      }

      assert.equal(
        sumShares + result.platformFeeMinor,
        total,
        `Sum of recipient shares + fee must equal total. Total=${total}, Sum=${sumShares}, Fee=${result.platformFeeMinor}`
      );
    }
  });

  await t.test('3. Generates balanced double-entry legs for SPLIT / collect', () => {
    const legs = generateLedgerLegs({
      category: 'SPLIT',
      sub_type: 'collect',
      amount_minor: 50000n,
      currency: 'USD',
    });

    assert.equal(legs.length, 2);
    assert.equal(legs[0].legType, 'DEBIT');
    assert.equal(legs[0].accountRef, 'org:main');
    assert.equal(legs[0].amountMinor, 50000n);

    assert.equal(legs[1].legType, 'CREDIT');
    assert.equal(legs[1].accountRef, 'org:split_escrow');
    assert.equal(legs[1].amountMinor, 50000n);
  });

  await t.test('4. Generates balanced double-entry legs for SPLIT / split with platform fee', () => {
    const legs = generateLedgerLegs({
      category: 'SPLIT',
      sub_type: 'split',
      amount_minor: 10000n, // $100.00
      currency: 'USD',
      platform_fee_bps: 250, // 2.5% = $2.50 = 250 minor units
      counterparty_id: payeeId,
    });

    assert.equal(legs.length, 3);
    // Debit split escrow 10000
    assert.equal(legs[0].legType, 'DEBIT');
    assert.equal(legs[0].accountRef, 'org:split_escrow');
    assert.equal(legs[0].amountMinor, 10000n);

    // Credit org main 250 (platform fee)
    assert.equal(legs[1].legType, 'CREDIT');
    assert.equal(legs[1].accountRef, 'org:main');
    assert.equal(legs[1].amountMinor, 250n);

    // Credit payee 9750 (net share)
    assert.equal(legs[2].legType, 'CREDIT');
    assert.equal(legs[2].accountRef, `payee:${payeeId}`);
    assert.equal(legs[2].amountMinor, 9750n);

    const totalDebit = legs.filter((l) => l.legType === 'DEBIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    const totalCredit = legs.filter((l) => l.legType === 'CREDIT').reduce((acc, l) => acc + l.amountMinor, 0n);
    assert.equal(totalDebit, totalCredit);
  });

  await t.test('5. Generates balanced double-entry legs for SPLIT / hold and payout', () => {
    // Hold
    const holdLegs = generateLedgerLegs({
      category: 'SPLIT',
      sub_type: 'hold',
      amount_minor: 9750n,
      currency: 'USD',
      counterparty_id: payeeId,
    });
    assert.equal(holdLegs.length, 2);
    assert.equal(holdLegs[0].legType, 'DEBIT');
    assert.equal(holdLegs[0].accountRef, `payee:${payeeId}`);
    assert.equal(holdLegs[1].legType, 'CREDIT');
    assert.equal(holdLegs[1].accountRef, 'org:split_escrow');

    // Payout
    const payoutLegs = generateLedgerLegs({
      category: 'SPLIT',
      sub_type: 'payout',
      amount_minor: 9750n,
      currency: 'USD',
      counterparty_id: payeeId,
    });
    assert.equal(payoutLegs.length, 2);
    assert.equal(payoutLegs[0].legType, 'DEBIT');
    assert.equal(payoutLegs[0].accountRef, 'org:split_escrow');
    assert.equal(payoutLegs[1].legType, 'CREDIT');
    assert.equal(payoutLegs[1].accountRef, `payee:${payeeId}`);
  });

  await t.test('6. 1,000 property tests: generateLedgerLegs is ALWAYS strictly balanced for all SPLIT sub-types', () => {
    const subTypes = ['collect', 'split', 'hold', 'payout'];
    const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'JPY'];

    for (let i = 0; i < 1000; i++) {
      const subType = subTypes[i % subTypes.length];
      const currency = currencies[i % currencies.length];
      const amount = BigInt(Math.floor(Math.random() * 5000000) + 1);
      const bps = Math.floor(Math.random() * 5000); // 0 to 50%

      const legs = generateLedgerLegs({
        category: 'SPLIT',
        sub_type: subType,
        amount_minor: amount,
        currency,
        platform_fee_bps: bps,
        counterparty_id: payeeId,
      });

      let totalDebit = 0n;
      let totalCredit = 0n;

      for (const leg of legs) {
        assert.equal(leg.currency, currency);
        if (leg.legType === 'DEBIT') totalDebit += leg.amountMinor;
        if (leg.legType === 'CREDIT') totalCredit += leg.amountMinor;
      }

      assert.equal(
        totalDebit,
        totalCredit,
        `SPLIT ${subType} must be balanced. Debit=${totalDebit}, Credit=${totalCredit}`
      );
    }
  });
});

