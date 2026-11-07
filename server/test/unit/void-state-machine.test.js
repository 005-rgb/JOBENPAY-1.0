/**
 * server/test/unit/void-state-machine.test.js
 * Data-driven state transition tests for VOID (Item 3 CCC, AD-06, AD-11, K-VOID)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_TRANSITIONS, isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('VOID State Machine Data-Driven Transitions', async (t) => {
  const voidAuthTransitions = getTransitions('VOID', 'authorization');
  const voidOrderTransitions = getTransitions('VOID', 'order');

  await t.test('1. Validates all declared legal transitions for both authorization and order sub-types', () => {
    assert.ok(voidAuthTransitions.length >= 10, 'Expected at least 10 transitions for VOID authorization');
    assert.ok(voidOrderTransitions.length >= 10, 'Expected at least 10 transitions for VOID order');

    for (const tr of [...voidAuthTransitions, ...voidOrderTransitions]) {
      assert.equal(tr.category, 'VOID');
      assert.ok(tr.subType === 'authorization' || tr.subType === 'order');
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('VOID', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} (${tr.subType}) must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the void state matrix', () => {
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
        isLegalTransition('VOID', 'authorization', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (authorization) must be rejected`
      );
      assert.equal(
        isLegalTransition('VOID', 'order', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (order) must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('VOID', 'authorization', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('VOID', 'authorization', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
    assert.equal(isLegalTransition('VOID', 'order', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('VOID', 'order', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
  });
});

