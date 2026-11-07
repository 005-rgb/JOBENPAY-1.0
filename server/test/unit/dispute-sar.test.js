/**
 * server/test/unit/dispute-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for DISPUTE (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-DISPUTE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('DISPUTE SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: 'e0000000-0000-4000-8000-000000000211',
    org_id: 'org_disp_sar_test',
    category: 'DISPUTE',
    sub_type: 'chargeback',
    status: 'COMPLETED',
    amount_minor: 75000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_disp',
    request_hash: 'disp_req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'org:main', amountMinor: 75000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'buyer:buyer_001', amountMinor: 75000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        disputeId: 'DISP-SANDBOX-001',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 for DISPUTE with balanced legs and paypal_refs (dispute_id)', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'DISPUTE');
    assert.equal(sar.sub_type, 'chargeback');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '75000');
    assert.equal(sar.legs_summary.total_debit, '75000');
    assert.equal(sar.legs_summary.total_credit, '75000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.dispute_id, 'DISP-SANDBOX-001');
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
      intent_id: 'e0000000-0000-4000-8000-000000000212',
      org_id: 'org_test',
      category: 'DISPUTE',
      sub_type: 'chargeback',
      status: 'COMPLETED',
      amount_minor: '75000',
      currency: 'USD',
      legs_summary: {
        total_debit: '75000',
        total_credit: '50000', // Unbalanced!
        balanced: false,
        accounts: ['org:main', 'buyer:01'],
      },
      paypal_refs: {},
      sar_hash: 'dummy',
    };

    const verifyResult = verifySar(unbalancedSar);
    assert.equal(verifyResult.valid, false);
    assert.match(verifyResult.reason, /unbalanced legs/i);
  });
});

