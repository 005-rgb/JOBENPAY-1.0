/**
 * server/test/unit/down_payment-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for DOWN_PAYMENT (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-DOWN_PAYMENT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('DOWN_PAYMENT SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: 'e0000000-0000-4000-8000-000000000131',
    org_id: 'org_dp_sar_test',
    category: 'DOWN_PAYMENT',
    sub_type: 'initial',
    status: 'COMPLETED',
    amount_minor: 25000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_dp',
    request_hash: 'dp_req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'buyer:buyer_001', amountMinor: 25000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'org:down_payment_escrow', amountMinor: 25000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        authorizationId: 'AUTH-TEST-DP-12345',
        captureId: 'CAP-DP-INITIAL-67890',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 for DOWN_PAYMENT with balanced legs and paypal_refs (authorization_id, capture_id)', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'DOWN_PAYMENT');
    assert.equal(sar.sub_type, 'initial');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '25000');
    assert.equal(sar.legs_summary.total_debit, '25000');
    assert.equal(sar.legs_summary.total_credit, '25000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.authorization_id, 'AUTH-TEST-DP-12345');
    assert.equal(sar.paypal_refs.capture_id, 'CAP-DP-INITIAL-67890');
    assert.ok(sar.sar_hash, 'SAR hash must be generated');

    const verifyResult = verifySar(sar);
    assert.equal(verifyResult.valid, true);
  });

  await t.test('2. Tamper detection: modifying payload invalidates sar_hash', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    // Tamper with amount
    const tampered = { ...sar, amount_minor: '999999' };
    const verifyResult = verifySar(tampered);

    assert.equal(verifyResult.valid, false);
    assert.match(verifyResult.reason, /tampered/i);
  });

  await t.test('3. Rejects unbalanced legs in SAR verification', () => {
    const unbalancedSar = {
      sar_version: SAR_VERSION,
      intent_id: 'e0000000-0000-4000-8000-000000000132',
      org_id: 'org_test',
      category: 'DOWN_PAYMENT',
      sub_type: 'settlement',
      status: 'COMPLETED',
      amount_minor: '75000',
      currency: 'USD',
      legs_summary: {
        total_debit: '75000',
        total_credit: '50000', // Unbalanced!
        balanced: false,
        accounts: ['buyer:01', 'org:main'],
      },
      paypal_refs: {},
      sar_hash: 'dummy',
    };

    const verifyResult = verifySar(unbalancedSar);
    assert.equal(verifyResult.valid, false);
    assert.match(verifyResult.reason, /unbalanced legs/i);
  });
});

