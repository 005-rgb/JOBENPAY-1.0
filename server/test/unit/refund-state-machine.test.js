/**
 * server/test/unit/refund-state-machine.test.js
 * Data-driven state transition tests for REFUND (Item 3 CCC, AD-06, K-REFUND)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_TRANSITIONS, isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('REFUND State Machine Data-Driven Transitions', async (t) => {
  const refundFullTransitions = getTransitions('REFUND', 'full');
  const refundPartialTransitions = getTransitions('REFUND', 'partial');

  await t.test('1. Validates all declared legal transitions for both full and partial sub-types', () => {
    assert.ok(refundFullTransitions.length >= 10, 'Expected at least 10 transitions for full refund');
    assert.ok(refundPartialTransitions.length >= 10, 'Expected at least 10 transitions for partial refund');

    for (const tr of [...refundFullTransitions, ...refundPartialTransitions]) {
      assert.equal(tr.category, 'REFUND');
      assert.ok(tr.subType === 'full' || tr.subType === 'partial');
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('REFUND', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} (${tr.subType}) must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the refund state matrix', () => {
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
        isLegalTransition('REFUND', 'full', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be rejected`
      );
      assert.equal(
        isLegalTransition('REFUND', 'partial', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (partial) must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('REFUND', 'full', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('REFUND', 'full', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
    assert.equal(isLegalTransition('REFUND', 'partial', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('REFUND', 'partial', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
  });
});

