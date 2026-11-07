/**
 * server/test/unit/scheduled-state-machine.test.js
 * Data-driven state transition tests for SCHEDULED (Item 3 CCC, AD-06, AD-14, T-01, K-SCHEDULED)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('SCHEDULED State Machine Data-Driven Transitions', async (t) => {
  const payoutTransitions = getTransitions('SCHEDULED', 'payout');
  const chargeTransitions = getTransitions('SCHEDULED', 'charge');

  await t.test('1. Validates all declared legal transitions for payout and charge sub-types', () => {
    assert.ok(payoutTransitions.length >= 10, 'Expected at least 10 transitions for SCHEDULED payout');
    assert.ok(chargeTransitions.length >= 10, 'Expected at least 10 transitions for SCHEDULED charge');

    for (const tr of [...payoutTransitions, ...chargeTransitions]) {
      assert.equal(tr.category, 'SCHEDULED');
      assert.ok(['payout', 'charge'].includes(tr.subType));
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('SCHEDULED', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} (${tr.subType}) must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the scheduled state matrix', () => {
    const illegalTransitions = [
      { from: 'DRAFT', to: 'COMPLETED', actor: 'AGENT' },
      { from: 'SUBMITTED', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'EVALUATING', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'NEEDS_APPROVAL', to: 'COMPLETED', actor: 'APPROVER' },
      { from: 'SCHEDULED', to: 'COMPLETED', actor: 'SYSTEM' },
      { from: 'COMPLETED', to: 'EXECUTING', actor: 'SYSTEM' },
      { from: 'FAILED', to: 'SCHEDULED', actor: 'APPROVER' },
      { from: 'CANCELLED', to: 'EXECUTING', actor: 'SYSTEM' },
      { from: 'COMPLETED', to: 'DRAFT', actor: 'AGENT' },
    ];

    for (const tr of illegalTransitions) {
      assert.equal(
        isLegalTransition('SCHEDULED', 'payout', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (payout) must be rejected`
      );
      assert.equal(
        isLegalTransition('SCHEDULED', 'charge', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (charge) must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    // Only APPROVER or SYSTEM can approve / schedule or cancel
    assert.equal(isLegalTransition('SCHEDULED', 'payout', 'NEEDS_APPROVAL', 'SCHEDULED', 'AGENT'), false);
    assert.equal(isLegalTransition('SCHEDULED', 'payout', 'NEEDS_APPROVAL', 'SCHEDULED', 'APPROVER'), true);
    assert.equal(isLegalTransition('SCHEDULED', 'payout', 'SCHEDULED', 'CANCELLED', 'AGENT'), false);
    assert.equal(isLegalTransition('SCHEDULED', 'payout', 'SCHEDULED', 'CANCELLED', 'APPROVER'), true);
    assert.equal(isLegalTransition('SCHEDULED', 'payout', 'SCHEDULED', 'CANCELLED', 'SYSTEM'), true);
    // Worker / SYSTEM fires SCHEDULED -> EXECUTING
    assert.equal(isLegalTransition('SCHEDULED', 'payout', 'SCHEDULED', 'EXECUTING', 'SYSTEM'), true);
    assert.equal(isLegalTransition('SCHEDULED', 'payout', 'SCHEDULED', 'EXECUTING', 'APPROVER'), false);
  });
});

