/**
 * server/test/unit/scheduled-sar.test.js
 * SAR v1.1 generation and integrity verification for SCHEDULED (Item 9 CCC, AD-02, AD-14, K-SCHEDULED)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';

test('SCHEDULED SAR v1.1 Generation and Integrity Verification', async (t) => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000066';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const counterpartyId = '00000000-0000-4000-8000-000000000004';

  await t.test('1. Generates SAR v1.1 for SCHEDULED payout with balanced legs and paypal_refs', () => {
    const legs = generateLedgerLegs({
      category: 'SCHEDULED',
      sub_type: 'payout',
      amount_minor: 12000n,
      currency: 'USD',
      counterparty_id: counterpartyId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SCHEDULED',
        sub_type: 'payout',
        status: 'COMPLETED',
        amount_minor: '12000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_sched_payout_001',
      },
      legs,
      executions: [
        {
          providerRefs: {
            payoutBatchId: 'BATCH_SCHED_7788',
            payoutItemId: 'ITEM_SCHED_9900',
          },
        },
      ],
    });

    assert.equal(sar.sar_version, '1.1');
    assert.equal(sar.category, 'SCHEDULED');
    assert.equal(sar.sub_type, 'payout');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '12000');
    assert.equal(sar.legs_summary.total_credit, '12000');
    assert.equal(sar.paypal_refs.payout_batch_id, 'BATCH_SCHED_7788');
    assert.ok(sar.sar_hash);

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });

  await t.test('2. Generates SAR v1.1 for SCHEDULED charge with balanced legs and order/capture refs', () => {
    const legs = generateLedgerLegs({
      category: 'SCHEDULED',
      sub_type: 'charge',
      amount_minor: 8500n,
      currency: 'USD',
      counterparty_id: counterpartyId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SCHEDULED',
        sub_type: 'charge',
        status: 'COMPLETED',
        amount_minor: '8500',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_sched_charge_001',
      },
      legs,
      executions: [
        {
          providerRefs: {
            orderId: 'ORDER_SCHED_1122',
            captureId: 'CAP_SCHED_3344',
          },
        },
      ],
    });

    assert.equal(sar.sar_version, '1.1');
    assert.equal(sar.category, 'SCHEDULED');
    assert.equal(sar.sub_type, 'charge');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.paypal_refs.order_id, 'ORDER_SCHED_1122');
    assert.equal(sar.paypal_refs.capture_id, 'CAP_SCHED_3344');

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });

  await t.test('3. Detects any tamper to SCHEDULED SAR payload', () => {
    const legs = generateLedgerLegs({
      category: 'SCHEDULED',
      sub_type: 'payout',
      amount_minor: 12000n,
      currency: 'USD',
      counterparty_id: counterpartyId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'SCHEDULED',
        sub_type: 'payout',
        status: 'COMPLETED',
        amount_minor: '12000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_sched_payout_001',
      },
      legs,
    });

    // Tamper amount
    const tampered = { ...sar, amount_minor: '999999' };
    const verification = verifySar(tampered);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /SAR hash mismatch/i);
  });

  await t.test('4. Rejects unbalanced legs in SCHEDULED SAR verification', () => {
    const unbalancedSar = {
      sar_version: '1.1',
      intent_id: intentId,
      org_id: orgId,
      category: 'SCHEDULED',
      sub_type: 'payout',
      status: 'COMPLETED',
      amount_minor: '12000',
      currency: 'USD',
      legs_summary: {
        total_debit: '12000',
        total_credit: '10000', // Unbalanced
        balanced: false,
        accounts: ['org:main', 'payee:customer'],
      },
      paypal_refs: {},
      sar_hash: 'dummy_hash',
    };

    const verification = verifySar(unbalancedSar);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /unbalanced/i);
  });
});

