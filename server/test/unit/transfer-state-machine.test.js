/**
 * server/test/unit/transfer-state-machine.test.js
 * Data-driven state transition tests for TRANSFER (Item 3 CCC, AD-06, AD-17, T-18, K-TRANSFER)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('TRANSFER State Machine Data-Driven Transitions', async (t) => {
  const transitions = getTransitions('TRANSFER', 'p2p');

  await t.test('1. Validates all declared legal transitions for TRANSFER p2p', () => {
    assert.ok(transitions.length >= 10, 'Expected at least 10 transitions for TRANSFER p2p');

    for (const tr of transitions) {
      assert.equal(tr.category, 'TRANSFER');
      assert.equal(tr.subType, 'p2p');
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('TRANSFER', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the transfer state matrix', () => {
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
        isLegalTransition('TRANSFER', 'p2p', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('TRANSFER', 'p2p', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('TRANSFER', 'p2p', 'NEEDS_APPROVAL', 'APPROVED', 'APPROVER'), true);
    assert.equal(isLegalTransition('TRANSFER', 'p2p', 'APPROVED', 'EXECUTING', 'APPROVER'), false);
    assert.equal(isLegalTransition('TRANSFER', 'p2p', 'APPROVED', 'EXECUTING', 'SYSTEM'), true);
  });
});

