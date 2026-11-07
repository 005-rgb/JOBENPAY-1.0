/**
 * server/test/unit/void-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for VOID (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-VOID)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('VOID SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: 'e0000000-0000-4000-8000-000000000031',
    org_id: 'org_void_sar_test',
    category: 'VOID',
    sub_type: 'authorization',
    status: 'COMPLETED',
    amount_minor: 150000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_void',
    request_hash: 'void_req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'buyer:buyer_001', amountMinor: 150000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'org:authorized_holds', amountMinor: 150000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        authorizationId: 'AUTH-TEST-12345',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 for VOID with balanced legs and paypal_refs (authorization_id)', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'VOID');
    assert.equal(sar.sub_type, 'authorization');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '150000');
    assert.equal(sar.legs_summary.total_debit, '150000');
    assert.equal(sar.legs_summary.total_credit, '150000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.deepEqual(sar.legs_summary.accounts, ['buyer:buyer_001', 'org:authorized_holds']);
    assert.equal(sar.paypal_refs.authorization_id, 'AUTH-TEST-12345');
    assert.ok(sar.sar_hash, 'SAR hash must be generated');

    const verify = verifySar(sar);
    assert.equal(verify.valid, true);
  });

  await t.test('2. Detects any tamper to VOID SAR payload', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    const tampered = { ...sar, amount_minor: '999' };
    const verify = verifySar(tampered);
    assert.equal(verify.valid, false);
    assert.ok(verify.reason.includes('tampered'));
  });

  await t.test('3. Rejects unbalanced legs in VOID SAR verification', () => {
    const unbalancedSar = {
      sar_version: SAR_VERSION,
      category: 'VOID',
      sub_type: 'authorization',
      legs_summary: {
        total_debit: '1000',
        total_credit: '5000',
        balanced: false,
      },
      sar_hash: 'dummy',
    };

    const verify = verifySar(unbalancedSar);
    assert.equal(verify.valid, false);
    assert.ok(verify.reason.includes('Unbalanced legs'));
  });
});

