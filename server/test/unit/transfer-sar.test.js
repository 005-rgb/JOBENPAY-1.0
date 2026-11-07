/**
 * server/test/unit/transfer-sar.test.js
 * SAR v1.1 generation and integrity verification for TRANSFER (Item 9 CCC, AD-02, AD-17, T-18, K-TRANSFER)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';

test('TRANSFER SAR v1.1 Generation and Integrity Verification', async (t) => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000088';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const senderId = '00000000-0000-4000-8000-000000000044';
  const receiverId = '00000000-0000-4000-8000-000000000055';

  await t.test('1. Generates SAR v1.1 for TRANSFER p2p with balanced legs and paypal_refs (payout_batch_id)', () => {
    const legs = generateLedgerLegs({
      category: 'TRANSFER',
      sub_type: 'p2p',
      amount_minor: 35000n,
      currency: 'USD',
      sender_counterparty_id: senderId,
      receiver_counterparty_id: receiverId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'TRANSFER',
        sub_type: 'p2p',
        status: 'COMPLETED',
        amount_minor: '35000',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_transfer_p2p_001',
      },
      legs,
      executions: [
        {
          providerRefs: {
            payoutBatchId: 'BATCH_TRANSFER_7788',
            payoutItemId: 'ITEM_TRANSFER_9900',
          },
        },
      ],
    });

    assert.equal(sar.sar_version, '1.1');
    assert.equal(sar.category, 'TRANSFER');
    assert.equal(sar.sub_type, 'p2p');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '35000');
    assert.equal(sar.legs_summary.total_credit, '35000');
    assert.equal(sar.paypal_refs.payout_batch_id, 'BATCH_TRANSFER_7788');
    assert.ok(sar.sar_hash);

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });

  await t.test('2. Detects any tamper to TRANSFER SAR payload', () => {
    const legs = generateLedgerLegs({
      category: 'TRANSFER',
      sub_type: 'p2p',
      amount_minor: 35000n,
      currency: 'USD',
      sender_counterparty_id: senderId,
      receiver_counterparty_id: receiverId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'TRANSFER',
        sub_type: 'p2p',
        status: 'COMPLETED',
        amount_minor: '35000',
        currency: 'USD',
      },
      legs,
    });

    // Tamper with the amount
    const tampered = { ...sar, amount_minor: '35001' };
    const verification = verifySar(tampered);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /SAR hash mismatch/i);
  });

  await t.test('3. Rejects unbalanced legs during SAR verification', () => {
    const unbalancedLegs = [
      { leg_type: 'DEBIT', account_ref: `payee:${senderId}`, amount_minor: '35000' },
      { leg_type: 'CREDIT', account_ref: `payee:${receiverId}`, amount_minor: '34999' },
    ];

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'TRANSFER',
        sub_type: 'p2p',
        status: 'COMPLETED',
        amount_minor: '35000',
        currency: 'USD',
      },
      legs: unbalancedLegs,
    });

    assert.equal(sar.legs_summary.balanced, false);
    assert.notEqual(sar.legs_summary.total_debit, sar.legs_summary.total_credit);

    const verification = verifySar(sar);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /unbalanced/i);
  });
});
