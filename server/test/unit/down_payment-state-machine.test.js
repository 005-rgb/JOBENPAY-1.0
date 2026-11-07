/**
 * server/test/unit/down_payment-state-machine.test.js
 * Data-driven state transition tests for DOWN_PAYMENT (Item 3 CCC, AD-06, AD-26, K-DOWN_PAYMENT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('DOWN_PAYMENT State Machine Data-Driven Transitions', async (t) => {
  const dpInitTransitions = getTransitions('DOWN_PAYMENT', 'initial');
  const dpSettleTransitions = getTransitions('DOWN_PAYMENT', 'settlement');
  const dpForfeitTransitions = getTransitions('DOWN_PAYMENT', 'forfeit');

  await t.test('1. Validates all declared legal transitions for initial, settlement, and forfeit sub-types', () => {
    assert.ok(dpInitTransitions.length >= 10, 'Expected at least 10 transitions for DOWN_PAYMENT initial');
    assert.ok(dpSettleTransitions.length >= 10, 'Expected at least 10 transitions for DOWN_PAYMENT settlement');
    assert.ok(dpForfeitTransitions.length >= 10, 'Expected at least 10 transitions for DOWN_PAYMENT forfeit');

    for (const tr of [...dpInitTransitions, ...dpSettleTransitions, ...dpForfeitTransitions]) {
      assert.equal(tr.category, 'DOWN_PAYMENT');
      assert.ok(['initial', 'settlement', 'forfeit'].includes(tr.subType));
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('DOWN_PAYMENT', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} (${tr.subType}) must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the down payment state matrix', () => {
    const illegalTransitions = [
      { from: 'DRAFT', to: 'COMPLETED', actor: 'AGENT' },
      { from: 'SUBMITTED', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'EVALUATING', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'NEEDS_APPROVAL', to: 'COMPLETED', actor: 'APPROVER' },
      { from: 'APPROVED', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'COMPLETED', to: 'EXECUTING', actor: 'SYSTEM' },
      { from: 'FAILED', to: 'APPROVED', actor: 'APPROVER' },
      { from: 'COMPLETED', to: 'DRAFT', actor: 'AGENT' },
    ];

    for (const tr of illegalTransitions) {
      assert.equal(
        isLegalTransition('DOWN_PAYMENT', 'initial', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (initial) must be rejected`
      );
      assert.equal(
        isLegalTransition('DOWN_PAYMENT', 'settlement', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (settlement) must be rejected`
      );
      assert.equal(
        isLegalTransition('DOWN_PAYMENT', 'forfeit', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (forfeit) must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('DOWN_PAYMENT', 'initial', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('DOWN_PAYMENT', 'initial', 'APPROVED', 'EXECUTING', 'AGENT'), false);
    assert.equal(isLegalTransition('DOWN_PAYMENT', 'settlement', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('DOWN_PAYMENT', 'forfeit', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
  });
});

