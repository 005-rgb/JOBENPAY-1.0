/**
 * server/test/unit/bulk-state-machine.test.js
 * Data-driven state transition tests for BULK (Item 3 CCC, AD-06, AD-17, T-19, K-BULK)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('BULK State Machine Data-Driven Transitions', async (t) => {
  const transitions = getTransitions('BULK', 'payout');

  await t.test('1. Validates all declared legal transitions for BULK payout', () => {
    assert.ok(transitions.length >= 10, 'Expected at least 10 transitions for BULK payout');

    for (const tr of transitions) {
      assert.equal(tr.category, 'BULK');
      assert.equal(tr.subType, 'payout');
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('BULK', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be recognized`
      );
    }
  });

  await t.test('2. Supports PARTIALLY_COMPLETED parent terminal state', () => {
    assert.equal(isLegalTransition('BULK', 'payout', 'EXECUTING', 'PARTIALLY_COMPLETED', 'SYSTEM'), true);
    assert.equal(isLegalTransition('BULK', 'payout', 'EXECUTING', 'PARTIALLY_COMPLETED', 'WEBHOOK'), true);
    assert.equal(isLegalTransition('BULK', 'payout', 'EXECUTING', 'COMPLETED', 'SYSTEM'), true);
    assert.equal(isLegalTransition('BULK', 'payout', 'EXECUTING', 'FAILED', 'SYSTEM'), true);
  });

  await t.test('3. Rejects illegal transitions across the bulk state matrix', () => {
    const illegalTransitions = [
      { from: 'DRAFT', to: 'COMPLETED', actor: 'AGENT' },
      { from: 'SUBMITTED', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'EVALUATING', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'NEEDS_APPROVAL', to: 'COMPLETED', actor: 'APPROVER' },
      { from: 'APPROVED', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'COMPLETED', to: 'EXECUTING', actor: 'SYSTEM' },
      { from: 'PARTIALLY_COMPLETED', to: 'EXECUTING', actor: 'SYSTEM' },
      { from: 'FAILED', to: 'APPROVED', actor: 'APPROVER' },
      { from: 'COMPLETED', to: 'DRAFT', actor: 'AGENT' },
    ];

    for (const tr of illegalTransitions) {
      assert.equal(
        isLegalTransition('BULK', 'payout', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be rejected`
      );
    }
  });

  await t.test('4. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('BULK', 'payout', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('BULK', 'payout', 'NEEDS_APPROVAL', 'APPROVED', 'APPROVER'), true);
    assert.equal(isLegalTransition('BULK', 'payout', 'APPROVED', 'EXECUTING', 'APPROVER'), false);
    assert.equal(isLegalTransition('BULK', 'payout', 'APPROVED', 'EXECUTING', 'SYSTEM'), true);
  });
});

