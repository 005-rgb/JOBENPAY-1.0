/**
 * server/test/unit/bulk-sar.test.js
 * SAR v1.1 generation and integrity verification for BULK (Item 9 CCC, AD-02, AD-17, T-19, K-BULK)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';

test('BULK SAR v1.1 Generation and Integrity Verification', async (t) => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000077';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const counterpartyId = '00000000-0000-4000-8000-000000000004';

  await t.test('1. Generates SAR v1.1 for BULK payout with balanced legs and paypal_refs (payout_batch_id)', () => {
    const legs = generateLedgerLegs({
      category: 'BULK',
      sub_type: 'payout',
      amount_minor: 50000n,
      currency: 'USD',
      counterparty_id: counterpartyId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'BULK',
        sub_type: 'payout',
        status: 'COMPLETED',
        amount_minor: '50000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_bulk_payout_001',
      },
      legs,
      executions: [
        {
          providerRefs: {
            payoutBatchId: 'BATCH_BULK_4455',
            payoutItemId: 'ITEM_BULK_6677',
          },
        },
      ],
    });

    assert.equal(sar.sar_version, '1.1');
    assert.equal(sar.category, 'BULK');
    assert.equal(sar.sub_type, 'payout');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '50000');
    assert.equal(sar.legs_summary.total_credit, '50000');
    assert.equal(sar.paypal_refs.payout_batch_id, 'BATCH_BULK_4455');
    assert.ok(sar.sar_hash);

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });

  await t.test('2. Detects any tamper to BULK SAR payload', () => {
    const legs = generateLedgerLegs({
      category: 'BULK',
      sub_type: 'payout',
      amount_minor: 50000n,
      currency: 'USD',
      counterparty_id: counterpartyId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'BULK',
        sub_type: 'payout',
        status: 'COMPLETED',
        amount_minor: '50000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_bulk_payout_001',
      },
      legs,
    });

    // Tamper amount
    const tampered = { ...sar, amount_minor: '9999999' };
    const verification = verifySar(tampered);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /SAR hash mismatch/i);
  });

  await t.test('3. Rejects unbalanced legs in BULK SAR verification', () => {
    const unbalancedSar = {
      sar_version: '1.1',
      intent_id: intentId,
      org_id: orgId,
      category: 'BULK',
      sub_type: 'payout',
      status: 'COMPLETED',
      amount_minor: '50000',
      currency: 'USD',
      legs_summary: {
        total_debit: '50000',
        total_credit: '40000', // Unbalanced
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

