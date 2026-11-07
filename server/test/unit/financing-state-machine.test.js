/**
 * server/test/unit/financing-state-machine.test.js
 * Data-driven state machine transition tests for FINANCING (K-FINANCING, AD-17, PRD 1.3 §3)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getTransitions, isLegalTransition } from '../../../shared/state-machines.js';

test('Financing State Machine Transitions', async (t) => {
  const subTypes = ['po', 'invoice'];

  for (const subType of subTypes) {
    await t.test(`1. Legal domain transitions for FINANCING/${subType}`, () => {
      const transitions = getTransitions('FINANCING', subType);
      assert(transitions.length >= 20, `Expected at least 20 transitions for FINANCING/${subType}, got ${transitions.length}`);

      // Verify domain lifecycle path
      assert.equal(isLegalTransition('FINANCING', subType, 'DRAFT', 'REQUESTED', 'AGENT'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'REQUESTED', 'UNDERWRITING', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'UNDERWRITING', 'APPROVED', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'UNDERWRITING', 'REJECTED', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'APPROVED', 'DISBURSED', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'APPROVED', 'CANCELLED', 'APPROVER'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'DISBURSED', 'REPAYING', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'REPAYING', 'SETTLED', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'REPAYING', 'SETTLED', 'WEBHOOK'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'REPAYING', 'DEFAULTED', 'SYSTEM'), true);

      // Verify standard pipeline path
      assert.equal(isLegalTransition('FINANCING', subType, 'DRAFT', 'SUBMITTED', 'AGENT'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'SUBMITTED', 'EVALUATING', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'EVALUATING', 'NEEDS_APPROVAL', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'NEEDS_APPROVAL', 'APPROVED', 'APPROVER'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'APPROVED', 'EXECUTING', 'SYSTEM'), true);
      assert.equal(isLegalTransition('FINANCING', subType, 'EXECUTING', 'COMPLETED', 'SYSTEM'), true);
    });

    await t.test(`2. Rejects illegal transitions for FINANCING/${subType}`, () => {
      // Direct jump from DRAFT to DISBURSED or SETTLED
      assert.equal(isLegalTransition('FINANCING', subType, 'DRAFT', 'DISBURSED', 'AGENT'), false);
      assert.equal(isLegalTransition('FINANCING', subType, 'DRAFT', 'SETTLED', 'AGENT'), false);
      assert.equal(isLegalTransition('FINANCING', subType, 'REQUESTED', 'SETTLED', 'SYSTEM'), false);

      // Backward transitions
      assert.equal(isLegalTransition('FINANCING', subType, 'SETTLED', 'REPAYING', 'SYSTEM'), false);
      assert.equal(isLegalTransition('FINANCING', subType, 'DISBURSED', 'UNDERWRITING', 'SYSTEM'), false);

      // Actor mismatch (AGENT cannot self-approve or self-disburse)
      assert.equal(isLegalTransition('FINANCING', subType, 'UNDERWRITING', 'APPROVED', 'AGENT'), false);
      assert.equal(isLegalTransition('FINANCING', subType, 'APPROVED', 'DISBURSED', 'AGENT'), false);
    });
  }
});

