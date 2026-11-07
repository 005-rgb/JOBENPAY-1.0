/**
 * server/test/unit/sale-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for SALE (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-SALE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('SALE SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: 'e0000000-0000-4000-8000-000000000001',
    org_id: 'org_sale_sar_test',
    category: 'SALE',
    sub_type: 'standard',
    status: 'COMPLETED',
    amount_minor: 250000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_sale',
    request_hash: 'sale_req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'buyer:buyer_001', amountMinor: 250000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'org:main', amountMinor: 250000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        orderId: 'ORD-TEST-12345',
        captureId: 'CAP-TEST-67890',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 with balanced legs and paypal_refs (order_id, capture_id)', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'SALE');
    assert.equal(sar.sub_type, 'standard');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '250000');
    assert.equal(sar.legs_summary.total_debit, '250000');
    assert.equal(sar.legs_summary.total_credit, '250000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.deepEqual(sar.legs_summary.accounts, ['buyer:buyer_001', 'org:main']);
    assert.equal(sar.paypal_refs.order_id, 'ORD-TEST-12345');
    assert.equal(sar.paypal_refs.capture_id, 'CAP-TEST-67890');
    assert.ok(sar.sar_hash, 'SAR hash must be generated');

    const verify = verifySar(sar);
    assert.equal(verify.valid, true);
  });

  await t.test('2. Detects any tamper to SAR payload', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    // Tamper with amount
    const tampered = { ...sar, amount_minor: '9999999' };
    const verify = verifySar(tampered);
    assert.equal(verify.valid, false);
    assert.ok(verify.reason.includes('tampered'));
  });

  await t.test('3. Rejects unbalanced legs in SAR verification', () => {
    const unbalancedSar = {
      sar_version: SAR_VERSION,
      category: 'SALE',
      sub_type: 'standard',
      legs_summary: {
        total_debit: '1000',
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

