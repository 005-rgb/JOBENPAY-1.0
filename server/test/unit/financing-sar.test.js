/**
 * server/test/unit/financing-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for FINANCING (Item 9 CCC, PRD 1.3 §0.4, AD-02, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, computeSarHash, SAR_VERSION } from '../../src/services/sar.js';

test('FINANCING SAR v1.1 Generation & Verification', async (t) => {
  const intent = {
    intent_id: '00000000-0000-4000-8000-000000000001',
    org_id: '00000000-0000-4000-8000-000000000010',
    category: 'FINANCING',
    sub_type: 'po',
    status: 'COMPLETED',
    amount_minor: '10000000',
    currency: 'USD',
  };

  const legs = [
    { legType: 'DEBIT', accountRef: 'org:main', amountMinor: 9850000n, currency: 'USD' },
    { legType: 'DEBIT', accountRef: 'loan:fee:00000000-0000-4000-8000-000000000001', amountMinor: 150000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'loan:principal:00000000-0000-4000-8000-000000000001', amountMinor: 10000000n, currency: 'USD' },
  ];

  const executions = [
    {
      provider: 'simulated',
      provider_refs: {
        payoutBatchId: 'sim_disb_00000000-0000-4000-8000-000000000001',
        provider: 'simulated',
      },
    },
  ];

  await t.test('1. Generates compliant SAR v1.1 with balanced legs summary', () => {
    const sar = generateSar({ intent, legs, executions });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'FINANCING');
    assert.equal(sar.sub_type, 'po');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '10000000');
    assert.equal(sar.legs_summary.total_credit, '10000000');
    assert.equal(sar.legs_summary.accounts.length, 3);
    assert.equal(sar.paypal_refs.payout_batch_id, 'sim_disb_00000000-0000-4000-8000-000000000001');

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });

  await t.test('2. Unbalanced legs correctly flag balanced: false in SAR', () => {
    const unbalancedLegs = [
      { legType: 'DEBIT', accountRef: 'org:main', amountMinor: 5000000n, currency: 'USD' },
      { legType: 'CREDIT', accountRef: 'loan:principal:fin_1', amountMinor: 10000000n, currency: 'USD' },
    ];

    const sar = generateSar({ intent, legs: unbalancedLegs, executions });
    assert.equal(sar.legs_summary.balanced, false);
    assert.notEqual(sar.legs_summary.total_debit, sar.legs_summary.total_credit);
  });

  await t.test('3. Tampering with SAR payload invalidates SHA-256 hash', () => {
    const sar = generateSar({ intent, legs, executions });
    const originalHash = sar.sar_hash;

    // Tamper with amount
    const tampered = { ...sar, amount_minor: '99999999' };
    const verification = verifySar(tampered);
    assert.equal(verification.valid, false);
    assert.notEqual(computeSarHash(tampered), originalHash);
  });
});
