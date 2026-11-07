/**
 * server/test/unit/split-sar.test.js
 * SAR v1.1 generation and integrity verification for SPLIT (Item 9 CCC, AD-02, AD-13, AD-17, T-13, T-14, K-SPLIT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';

test('SPLIT SAR v1.1 Generation and Integrity Verification', async (t) => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000099';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const payeeId = '00000000-0000-4000-8000-000000000004';

  await t.test('1. Generates SAR v1.1 for SPLIT / split with balanced legs and paypal_refs', () => {
    const legs = generateLedgerLegs({
      category: 'SPLIT',
      sub_type: 'split',
      amount_minor: 25000n, // $250.00
      platform_fee_bps: 200, // 2% = 500 minor units ($5.00)
      currency: 'USD',
      counterparty_id: payeeId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SPLIT',
        sub_type: 'split',
        status: 'COMPLETED',
        amount_minor: '25000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_split_sar_001',
      },
      legs,
      executions: [
        {
          providerRefs: {
            payoutBatchId: 'BATCH_SPLIT_5544',
            payoutItemId: 'ITEM_SPLIT_3322',
          },
        },
      ],
    });

    assert.equal(sar.sar_version, '1.1');
    assert.equal(sar.category, 'SPLIT');
    assert.equal(sar.sub_type, 'split');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '25000');
    assert.equal(sar.legs_summary.total_credit, '25000');
    assert.equal(sar.paypal_refs.payout_batch_id, 'BATCH_SPLIT_5544');
    assert.ok(sar.sar_hash);

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });

  await t.test('2. Detects any tamper to SPLIT SAR payload', () => {
    const legs = generateLedgerLegs({
      category: 'SPLIT',
      sub_type: 'collect',
      amount_minor: 50000n,
      currency: 'USD',
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SPLIT',
        sub_type: 'collect',
        status: 'COMPLETED',
        amount_minor: '50000',
        currency: 'USD',
      },
      legs,
    });

    // Tamper amount
    const tampered = { ...sar, amount_minor: '50001' };
    const verification = verifySar(tampered);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /SAR hash mismatch/i);
  });

  await t.test('3. Rejects unbalanced legs during SAR verification', () => {
    const unbalancedLegs = [
      { leg_type: 'DEBIT', account_ref: 'org:main', amount_minor: '25000' },
      { leg_type: 'CREDIT', account_ref: 'org:split_escrow', amount_minor: '24999' },
    ];

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SPLIT',
        sub_type: 'collect',
        status: 'COMPLETED',
        amount_minor: '25000',
        currency: 'USD',
      },
      legs: unbalancedLegs,
    });

    assert.equal(sar.legs_summary.balanced, false);
    assert.notEqual(sar.legs_summary.total_debit, sar.legs_summary.total_credit);

    const verification = verifySar(sar);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /unbalanced/i);
  });
});

