/**
 * server/test/unit/partial-state-machine.test.js
 * Data-driven state transition tests for PARTIAL (Item 3 CCC, AD-06, AD-10, AD-27, K-PARTIAL)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('PARTIAL State Machine Data-Driven Transitions', async (t) => {
  const partialPayTransitions = getTransitions('PARTIAL', 'payment');
  const partialRefTransitions = getTransitions('PARTIAL', 'refund');

  await t.test('1. Validates all declared legal transitions for both payment and refund sub-types', () => {
    assert.ok(partialPayTransitions.length >= 10, 'Expected at least 10 transitions for PARTIAL payment');
    assert.ok(partialRefTransitions.length >= 10, 'Expected at least 10 transitions for PARTIAL refund');

    for (const tr of [...partialPayTransitions, ...partialRefTransitions]) {
      assert.equal(tr.category, 'PARTIAL');
      assert.ok(tr.subType === 'payment' || tr.subType === 'refund');
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('PARTIAL', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} (${tr.subType}) must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the partial state matrix', () => {
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
        isLegalTransition('PARTIAL', 'payment', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (payment) must be rejected`
      );
      assert.equal(
        isLegalTransition('PARTIAL', 'refund', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (refund) must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('PARTIAL', 'payment', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('PARTIAL', 'payment', 'APPROVED', 'EXECUTING', 'AGENT'), false);
    assert.equal(isLegalTransition('PARTIAL', 'payment', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
    assert.equal(isLegalTransition('PARTIAL', 'payment', 'DRAFT', 'SUBMITTED', 'APPROVER'), false);

    assert.equal(isLegalTransition('PARTIAL', 'refund', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('PARTIAL', 'refund', 'APPROVED', 'EXECUTING', 'AGENT'), false);
  });
});

