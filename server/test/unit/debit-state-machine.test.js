/**
 * server/test/unit/debit-state-machine.test.js
 * Data-driven state machine transition tests for DEBIT (K-DEBIT, AD-17, PRD 1.3 §3)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getTransitions, isLegalTransition } from '../../../shared/state-machines.js';

test('Debit State Machine Transitions', async (t) => {
  await t.test('1. Legal transitions for DEBIT/direct', () => {
    const transitions = getTransitions('DEBIT', 'direct');
    assert(transitions.length >= 10, `Expected at least 10 transitions for DEBIT/direct, got ${transitions.length}`);

    assert.equal(isLegalTransition('DEBIT', 'direct', 'DRAFT', 'SUBMITTED', 'AGENT'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'SUBMITTED', 'EVALUATING', 'SYSTEM'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EVALUATING', 'APPROVED', 'SYSTEM'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EVALUATING', 'NEEDS_APPROVAL', 'SYSTEM'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EVALUATING', 'REJECTED', 'SYSTEM'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'NEEDS_APPROVAL', 'APPROVED', 'APPROVER'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'NEEDS_APPROVAL', 'REJECTED', 'APPROVER'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'APPROVED', 'EXECUTING', 'SYSTEM'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'APPROVED', 'CANCELLED', 'APPROVER'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EXECUTING', 'COMPLETED', 'SYSTEM'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EXECUTING', 'COMPLETED', 'WEBHOOK'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EXECUTING', 'FAILED', 'SYSTEM'), true);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EXECUTING', 'FAILED', 'WEBHOOK'), true);
  });

  await t.test('2. Rejects illegal transitions for DEBIT/direct', () => {
    // Direct jumps
    assert.equal(isLegalTransition('DEBIT', 'direct', 'DRAFT', 'COMPLETED', 'AGENT'), false);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'SUBMITTED', 'COMPLETED', 'SYSTEM'), false);

    // Backward transitions
    assert.equal(isLegalTransition('DEBIT', 'direct', 'COMPLETED', 'EXECUTING', 'SYSTEM'), false);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'FAILED', 'APPROVED', 'SYSTEM'), false);

    // Actor constraints
    assert.equal(isLegalTransition('DEBIT', 'direct', 'EVALUATING', 'APPROVED', 'AGENT'), false);
    assert.equal(isLegalTransition('DEBIT', 'direct', 'APPROVED', 'EXECUTING', 'AGENT'), false);
  });
});

