/**
 * server/test/unit/invoice-state-machine.test.js
 * Data-driven state transition tests for INVOICE (Item 3 CCC, AD-06, T-05, K-INVOICE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegalTransition, getTransitions } from '../../../shared/state-machines.js';

test('INVOICE State Machine Data-Driven Transitions', async (t) => {
  const invTransitions = getTransitions('INVOICE', 'standard');

  await t.test('1. Validates all declared legal transitions for INVOICE standard sub-type', () => {
    assert.ok(invTransitions.length >= 10, 'Expected at least 10 transitions for INVOICE standard');

    for (const tr of invTransitions) {
      assert.equal(tr.category, 'INVOICE');
      assert.equal(tr.subType, 'standard');
      assert.ok(tr.from);
      assert.ok(tr.to);
      assert.ok(tr.actor);

      assert.equal(
        isLegalTransition('INVOICE', tr.subType, tr.from, tr.to, tr.actor),
        true,
        `Legal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be recognized`
      );
    }
  });

  await t.test('2. Rejects illegal transitions across the invoice state matrix', () => {
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
        isLegalTransition('INVOICE', 'standard', tr.from, tr.to, tr.actor),
        false,
        `Illegal transition ${tr.from} -> ${tr.to} by ${tr.actor} must be rejected`
      );
    }
  });

  await t.test('3. Enforces strict actor roles per transition', () => {
    assert.equal(isLegalTransition('INVOICE', 'standard', 'NEEDS_APPROVAL', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('INVOICE', 'standard', 'APPROVED', 'EXECUTING', 'AGENT'), false);
    assert.equal(isLegalTransition('INVOICE', 'standard', 'EXECUTING', 'COMPLETED', 'AGENT'), false);
    assert.equal(isLegalTransition('INVOICE', 'standard', 'DRAFT', 'SUBMITTED', 'APPROVER'), false);
  });
});

