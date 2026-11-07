/**
 * server/test/unit/recurring-sar.test.js
 * SAR v1.1 generation and integrity verification for RECURRING (Item 9 CCC, AD-02, AD-17, T-08, K-RECURRING)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSar, verifySar } from '../../src/services/sar.js';
import { generateLedgerLegs } from '../../../shared/ledger-rules.js';

test('RECURRING SAR v1.1 Generation and Integrity Verification', async (t) => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const intentId = '00000000-0000-4000-8000-000000000111';
  const mandateVersionId = '00000000-0000-4000-8000-000000000003';
  const subscriberId = '00000000-0000-4000-8000-000000000004';

  await t.test('1. Generates SAR v1.1 for RECURRING / charge with balanced legs and paypal_refs', () => {
    const legs = generateLedgerLegs({
      category: 'RECURRING',
      sub_type: 'charge',
      amount_minor: 4900n, // $49.00
      currency: 'USD',
      counterparty_id: subscriberId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'RECURRING',
        sub_type: 'charge',
        status: 'COMPLETED',
        amount_minor: '4900',
        currency: 'USD',
        mandate_version_id: mandateVersionId,
        request_hash: 'hash_recurring_sar_001',
      },
      legs,
      executions: [
        {
          providerRefs: {
            planId: 'PLAN-RECUR-7788',
            subscriptionId: 'I-SUB-RECUR-9988',
          },
        },
      ],
    });

    assert.equal(sar.sar_version, '1.1');
    assert.equal(sar.category, 'RECURRING');
    assert.equal(sar.sub_type, 'charge');
    assert.equal(sar.status, 'COMPLETED');
    assert.equal(sar.legs_summary.balanced, true);
    assert.equal(sar.legs_summary.total_debit, '4900');
    assert.equal(sar.legs_summary.total_credit, '4900');
    assert.ok(sar.sar_hash);

    const verification = verifySar(sar);
    assert.equal(verification.valid, true);
  });

  await t.test('2. Detects any tamper to RECURRING SAR payload', () => {
    const legs = generateLedgerLegs({
      category: 'RECURRING',
      sub_type: 'init',
      amount_minor: 4900n,
      currency: 'USD',
      counterparty_id: subscriberId,
    });

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'RECURRING',
        sub_type: 'init',
        status: 'COMPLETED',
        amount_minor: '4900',
        currency: 'USD',
      },
      legs,
    });

    // Tamper amount
    const tampered = { ...sar, amount_minor: '4901' };
    const verification = verifySar(tampered);
    assert.equal(verification.valid, false);
    assert.match(verification.reason, /SAR hash mismatch/i);
  });

  await t.test('3. Rejects unbalanced legs during SAR verification', () => {
    const unbalancedLegs = [
      { leg_type: 'DEBIT', account_ref: 'org:main', amount_minor: '4900' },
      { leg_type: 'CREDIT', account_ref: `payee:${subscriberId}`, amount_minor: '4899' },
    ];

    const sar = generateSar({
      intent: {
        intent_id: intentId,
        org_id: orgId,
        category: 'RECURRING',
        sub_type: 'charge',
        status: 'COMPLETED',
        amount_minor: '4900',
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

