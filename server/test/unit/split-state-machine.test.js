/**
 * server/test/unit/split-state-machine.test.js
 * Data-driven state transition tests for SPLIT (Item 3 CCC, AD-06, AD-13, AD-17, T-13, T-14, K-SPLIT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('SPLIT State Machine Data-Driven Transitions', async (t) => {
  const subTypes = ['collect', 'split', 'hold', 'payout'];

  for (const subType of subTypes) {
    await t.test(`Validates declared legal transitions for SPLIT / ${subType}`, () => {
      const transitions = getTransitions('SPLIT', subType);
      assert.ok(transitions.length >= 10, `Expected at least 10 transitions for SPLIT / ${subType}`);

      for (const tr of transitions) {
        assert.equal(tr.category, 'SPLIT');
        assert.equal(tr.subType, subType);
        assert.ok(tr.from);
        assert.ok(tr.to);
        assert.ok(tr.actor);

        assert.equal(
          isLegalTransition('SPLIT', tr.subType, tr.from, tr.to, tr.actor),
          true,
          `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be recognized`
        );
      }
    });
  }

  await t.test('Rejects illegal transitions across the split state matrix', () => {
    const illegalTransitions = [
      { subType: 'collect', from: 'DRAFT', to: 'COMPLETED', actor: 'AGENT' },
      { subType: 'collect', from: 'SUBMITTED', to: 'COMPLETED', actor: 'SYSTEM' },
      { subType: 'split', from: 'EVALUATING', to: 'COMPLETED', actor: 'SYSTEM' },
      { subType: 'split', from: 'NEEDS_APPROVAL', to: 'COMPLETED', actor: 'APPROVER' },
      { subType: 'hold', from: 'APPROVED', to: 'COMPLETED', actor: 'SYSTEM' },
      { subType: 'hold', from: 'COMPLETED', to: 'EXECUTING', actor: 'SYSTEM' },
      { subType: 'payout', from: 'FAILED', to: 'APPROVED', actor: 'APPROVER' },
      { subType: 'payout', from: 'COMPLETED', to: 'DRAFT', actor: 'AGENT' },
    ];

    for (const tr of illegalTransitions) {
      assert.equal(
        isLegalTransition('SPLIT', tr.subType, tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be rejected`
      );
    }
  });

  await t.test('Enforces strict actor roles per transition in SPLIT', () => {
    assert.equal(isLegalTransition('SPLIT', 'split', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('SPLIT', 'split', 'NEEDS_APPROVAL', 'APPROVED', 'APPROVER'), true);
    assert.equal(isLegalTransition('SPLIT', 'collect', 'APPROVED', 'EXECUTING', 'APPROVER'), false);
    assert.equal(isLegalTransition('SPLIT', 'collect', 'APPROVED', 'EXECUTING', 'SYSTEM'), true);
  });
});

