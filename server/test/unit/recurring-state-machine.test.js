/**
 * server/test/unit/recurring-state-machine.test.js
 * Data-driven state transition tests for RECURRING (Item 3 CCC, AD-06, AD-17, T-08, K-RECURRING)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('RECURRING State Machine Data-Driven Transitions', async (t) => {
  const subTypes = ['init', 'charge', 'cancel'];

  for (const subType of subTypes) {
    await t.test(`Validates declared legal transitions for RECURRING / ${subType}`, () => {
      const transitions = getTransitions('RECURRING', subType);
      assert.ok(transitions.length >= 6, `Expected transitions for RECURRING / ${subType}`);

      for (const tr of transitions) {
        assert.equal(tr.category, 'RECURRING');
        assert.equal(tr.subType, subType);
        assert.ok(tr.from);
        assert.ok(tr.to);
        assert.ok(tr.actor);

        assert.equal(
          isLegalTransition('RECURRING', tr.subType, tr.from, tr.to, tr.actor),
          true,
          `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be recognized`
        );
      }
    });
  }

  await t.test('Rejects illegal transitions across the recurring state matrix', () => {
    const illegalTransitions = [
      { subType: 'init', from: 'DRAFT', to: 'COMPLETED', actor: 'AGENT' },
      { subType: 'init', from: 'SUBMITTED', to: 'COMPLETED', actor: 'SYSTEM' },
      { subType: 'charge', from: 'EVALUATING', to: 'COMPLETED', actor: 'SYSTEM' },
      { subType: 'charge', from: 'NEEDS_APPROVAL', to: 'COMPLETED', actor: 'APPROVER' },
      { subType: 'cancel', from: 'APPROVED', to: 'FAILED', actor: 'SYSTEM' },
      { subType: 'charge', from: 'COMPLETED', to: 'EXECUTING', actor: 'SYSTEM' },
      { subType: 'charge', from: 'FAILED', to: 'APPROVED', actor: 'APPROVER' },
    ];

    for (const tr of illegalTransitions) {
      assert.equal(
        isLegalTransition('RECURRING', tr.subType, tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be rejected`
      );
    }
  });

  await t.test('Enforces strict actor roles per transition in RECURRING', () => {
    assert.equal(isLegalTransition('RECURRING', 'charge', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('RECURRING', 'charge', 'NEEDS_APPROVAL', 'APPROVED', 'APPROVER'), true);
    assert.equal(isLegalTransition('RECURRING', 'init', 'APPROVED', 'EXECUTING', 'APPROVER'), false);
    assert.equal(isLegalTransition('RECURRING', 'init', 'APPROVED', 'EXECUTING', 'SYSTEM'), true);
  });
});

