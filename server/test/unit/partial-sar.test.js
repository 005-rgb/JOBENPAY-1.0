/**
 * server/test/unit/partial-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for PARTIAL (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-PARTIAL)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('PARTIAL SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: 'e0000000-0000-4000-8000-000000000031',
    org_id: 'org_partial_sar_test',
    category: 'PARTIAL',
    sub_type: 'payment',
    status: 'COMPLETED',
    amount_minor: 120000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_partial',
    request_hash: 'partial_req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'buyer:buyer_001', amountMinor: 120000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'org:main', amountMinor: 120000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        authorizationId: 'AUTH-TEST-12345',
        captureId: 'CAP-PARTIAL-67890',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 for PARTIAL with balanced legs and paypal_refs (authorization_id, capture_id)', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'PARTIAL');
    assert.equal(sar.sub_type, 'payment');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '120000');
    assert.equal(sar.legs_summary.total_debit, '120000');
    assert.equal(sar.legs_summary.total_credit, '120000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.authorization_id, 'AUTH-TEST-12345');
    assert.equal(sar.paypal_refs.capture_id, 'CAP-PARTIAL-67890');
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
      intent_id: 'e0000000-0000-4000-8000-000000000032',
      org_id: 'org_test',
      category: 'PARTIAL',
      sub_type: 'payment',
      status: 'COMPLETED',
      amount_minor: '100000',
      currency: 'USD',
      legs_summary: {
        total_debit: '100000',
        total_credit: '80000', // Unbalanced!
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

