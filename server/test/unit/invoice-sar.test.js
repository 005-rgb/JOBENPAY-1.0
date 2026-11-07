/**
 * server/test/unit/invoice-sar.test.js
 * Structured Audit Record (SAR v1.1) tests for INVOICE (Item 9 CCC, PRD 1.3 §0 Aturan Emas #4, K-INVOICE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar, SAR_VERSION } from '../../src/services/sar.js';

test('INVOICE SAR v1.1 Generation and Integrity Verification', async (t) => {
  const sampleIntent = {
    intent_id: 'e0000000-0000-4000-8000-000000000171',
    org_id: 'org_inv_sar_test',
    category: 'INVOICE',
    sub_type: 'standard',
    status: 'COMPLETED',
    amount_minor: 180000n,
    currency: 'USD',
    mandate_version_id: 'mandate_v2_inv',
    request_hash: 'inv_req_hash_12345',
  };

  const sampleLegs = [
    { legType: 'DEBIT', accountRef: 'buyer:client_001', amountMinor: 180000n, currency: 'USD' },
    { legType: 'CREDIT', accountRef: 'org:main', amountMinor: 180000n, currency: 'USD' },
  ];

  const sampleExecutions = [
    {
      providerRefs: {
        invoiceId: 'INV2-TEST-9988-ABC',
      },
    },
  ];

  await t.test('1. Generates SAR v1.1 for INVOICE with balanced legs and paypal_refs (invoice_id)', () => {
    const sar = generateSar({
      intent: sampleIntent,
      legs: sampleLegs,
      executions: sampleExecutions,
    });

    assert.equal(sar.sar_version, SAR_VERSION);
    assert.equal(sar.category, 'INVOICE');
    assert.equal(sar.sub_type, 'standard');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.amount_minor, '180000');
    assert.equal(sar.legs_summary.total_debit, '180000');
    assert.equal(sar.legs_summary.total_credit, '180000');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.invoice_id, 'INV2-TEST-9988-ABC');
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
      intent_id: 'e0000000-0000-4000-8000-000000000172',
      org_id: 'org_test',
      category: 'INVOICE',
      sub_type: 'standard',
      status: 'COMPLETED',
      amount_minor: '180000',
      currency: 'USD',
      legs_summary: {
        total_debit: '180000',
        total_credit: '120000', // Unbalanced!
        balanced: false,
        accounts: ['buyer:client_001', 'org:main'],
      },
      paypal_refs: {},
      sar_hash: 'dummy',
    };

    const verifyResult = verifySar(unbalancedSar);
    assert.equal(verifyResult.valid, false);
    assert.match(verifyResult.reason, /unbalanced legs/i);
  });
});

