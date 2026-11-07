/**
 * server/test/unit/payout-state-machine.test.js
 * Data-driven state transition tests for PAYOUT (Item 3 CCC, AD-06, K-PAYOUT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_TRANSITIONS, isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('PAYOUT State Machine Data-Driven Transitions', async (t) => {
  const payoutTransitions = getTransitions('PAYOUT', 'standard');

  await t.test('1. Validates all declared legal transitions in shared/state-machines.js', () => {
    assert.ok(payoutTransitions.length >= 10, 'Expected at least 10 transitions for PAYOUT pipeline');

    for (const tr of payoutTransitions) {
      assert.equal(tr.category, 'PAYOUT');
      assert.equal(tr.subType, 'standard');
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('PAYOUT', 'standard', tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the state matrix', () => {
    const illegalTransitions = [
      { from: 'DRAFT', to: 'COMPLETED', actor: 'AGENT' },
      { from: 'SUBMITTED', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'EVALUATING', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'NEEDS_APPROVAL', to: 'COMPLETED', actor: 'APPROVER' },
      { from: 'APPROVED', to: 'COMPLETED', actor: 'SYSTEM' }, // Must go through EXECUTING first
      { from: 'COMPLETED', to: 'EXECUTING', actor: 'SYSTEM' }, // Final state cannot transition backwards
      { from: 'FAILED', to: 'APPROVED', actor: 'APPROVER' },  // Failed state is terminal
      { from: 'COMPLETED', to: 'DRAFT', actor: 'AGENT' },
    ];

    for (const tr of illegalTransitions) {
      assert.equal(
        isLegalTransition('PAYOUT', 'standard', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    // AGENT cannot execute transition from NEEDS_APPROVAL to APPROVED (only APPROVER)
    assert.equal(isLegalTransition('PAYOUT', 'standard', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    // AGENT cannot trigger COMPLETED (only SYSTEM/WEBHOOK)
    assert.equal(isLegalTransition('PAYOUT', 'standard', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
  });
});

