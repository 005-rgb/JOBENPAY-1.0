/**
 * server/test/unit/payout-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for PAYOUT (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-PAYOUT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('PAYOUT SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: '11111111-2222-4333-8444-555555555555',
    org_id: 'org_payout_sar_test',
    category: 'PAYOUT',
    sub_type: 'standard',
    status: 'COMPLETED',
    amount_minor: 75000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_payout',
    request_hash: 'req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'org:main', amountMinor: 75000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'payee:0001', amountMinor: 75000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        payoutBatchId: 'batch_paypal_123',
        payoutItemId: 'item_paypal_456',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 with balanced legs and paypal_refs', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'PAYOUT');
    assert.equal(sar.sub_type, 'standard');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '75000');
    assert.equal(sar.legs_summary.total_debit, '75000');
    assert.equal(sar.legs_summary.total_credit, '75000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.deepEqual(sar.legs_summary.accounts, ['org:main', 'payee:0001']);
    assert.equal(sar.paypal_refs.payout_batch_id, 'batch_paypal_123');
    assert.equal(sar.paypal_refs.payout_item_id, 'item_paypal_456');
    assert.ok(sar.sar_hash, 'SAR hash must be generated');

    const verify = verifySar(sar);
    assert.equal(verify.valid, true);
  });

  await t.test('2. Verification fails when SAR is tampered with', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    // 1. Tampering with amount_minor
    const tamperedAmount = { ...sar, amount_minor: '80000' };
    const res1 = verifySar(tamperedAmount);
    assert.equal(res1.valid, false);
    assert.match(res1.reason, /SAR hash mismatch/i);

    // 2. Tampering with payout_batch_id
    const tamperedRefs = {
      ...sar,
      paypal_refs: { ...sar.paypal_refs, payout_batch_id: 'fake_batch' },
    };
    const res2 = verifySar(tamperedRefs);
    assert.equal(res2.valid, false);
    assert.match(res2.reason, /SAR hash mismatch/i);

    // 3. Unbalanced legs in SAR
    const unbalancedSar = {
      ...sar,
      legs_summary: { ...sar.legs_summary, total_credit: '50000' },
    };
    const res3 = verifySar(unbalancedSar);
    assert.equal(res3.valid, false);
    assert.match(res3.reason, /Unbalanced legs/i);
  });
});

