/**
 * server/test/unit/dispute-state-machine.test.js
 * Data-driven state transition tests for DISPUTE (Item 3 CCC, AD-06, AD-23, T-06, K-DISPUTE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('DISPUTE State Machine Data-Driven Transitions', async (t) => {
  const cbTransitions = getTransitions('DISPUTE', 'chargeback');
  const inqTransitions = getTransitions('DISPUTE', 'inquiry');

  await t.test('1. Validates all declared legal transitions for chargeback and inquiry sub-types', () => {
    assert.ok(cbTransitions.length >= 10, 'Expected at least 10 transitions for DISPUTE chargeback');
    assert.ok(inqTransitions.length >= 10, 'Expected at least 10 transitions for DISPUTE inquiry');

    for (const tr of [...cbTransitions, ...inqTransitions]) {
      assert.equal(tr.category, 'DISPUTE');
      assert.ok(['chargeback', 'inquiry'].includes(tr.subType));
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('DISPUTE', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} (${tr.subType}) must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the dispute state matrix', () => {
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
        isLegalTransition('DISPUTE', 'chargeback', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (chargeback) must be rejected`
      );
      assert.equal(
        isLegalTransition('DISPUTE', 'inquiry', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} (inquiry) must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('DISPUTE', 'chargeback', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('DISPUTE', 'chargeback', 'APPROVED', 'EXECUTING', 'AGENT'), false);
    assert.equal(isLegalTransition('DISPUTE', 'chargeback', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
    assert.equal(isLegalTransition('DISPUTE', 'chargeback', 'DRAFT', 'SUBMITTED', 'APPROVER'), false);
  });
});

