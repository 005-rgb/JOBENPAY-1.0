/**
 * server/test/unit/refund-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for REFUND (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-REFUND)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('REFUND SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: 'e0000000-0000-4000-8000-000000000091',
    org_id: 'org_refund_sar_test',
    category: 'REFUND',
    sub_type: 'partial',
    status: 'COMPLETED',
    amount_minor: 75000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_refund',
    request_hash: 'refund_req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'org:main', amountMinor: 75000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'buyer:buyer_001', amountMinor: 75000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        captureId: 'CAP-TEST-67890',
        refundId: 'REF-TEST-99999',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 with balanced legs and paypal_refs (capture_id, refund_id)', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'REFUND');
    assert.equal(sar.sub_type, 'partial');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '75000');
    assert.equal(sar.legs_summary.total_debit, '75000');
    assert.equal(sar.legs_summary.total_credit, '75000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.deepEqual(sar.legs_summary.accounts, ['buyer:buyer_001', 'org:main']);
    assert.equal(sar.paypal_refs.capture_id, 'CAP-TEST-67890');
    assert.equal(sar.paypal_refs.refund_id, 'REF-TEST-99999');
    assert.ok(sar.sar_hash, 'SAR hash must be generated');

    const verify = verifySar(sar);
    assert.equal(verify.valid, true);
  });

  await t.test('2. Detects any tamper to REFUND SAR payload', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    const tampered = { ...sar, amount_minor: '1' };
    const verify = verifySar(tampered);
    assert.equal(verify.valid, false);
    assert.ok(verify.reason.includes('tampered'));
  });

  await t.test('3. Rejects unbalanced legs in REFUND SAR verification', () => {
    const unbalancedSar = {
      sar_version: SAR_VERSION,
      category: 'REFUND',
      sub_type: 'partial',
      legs_summary: {
        total_debit: '5000',
        total_credit: '2000',
        balanced: false,
      },
      sar_hash: 'dummy',
    };

    const verify = verifySar(unbalancedSar);
    assert.equal(verify.valid, false);
    assert.ok(verify.reason.includes('Unbalanced legs'));
  });
});

