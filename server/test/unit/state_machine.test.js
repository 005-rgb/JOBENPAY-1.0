import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGGREGATE_STATES,
  AGGREGATE_TRANSITIONS,
  isValidTransition,
  transition,
  TAHAP_A_MAPPING,
} from '../../../shared/state-machine.js';

test('test_state_machine_all_transitions', () => {
  // Test each transition in AGGREGATE_TRANSITIONS
  for (const t of AGGREGATE_TRANSITIONS) {
    assert.equal(isValidTransition(t.from, t.to, t.actor), true, `Transition ${t.from} -> ${t.to} by ${t.actor} must be valid`);
    const nextState = transition(t.from, t.to, t.actor);
    assert.equal(nextState, t.to, `transition(${t.from}, ${t.to}) must return ${t.to}`);
  }
});

test('test_state_machine_illegal', () => {
  const illegalCases = [
    { from: 'DRAFT', to: 'EXECUTING', actor: 'worker' },
    { from: 'DRAFT', to: 'RECONCILED', actor: 'worker' },
    { from: 'SUBMITTED', to: 'EXECUTED', actor: 'worker' },
    { from: 'REJECTED', to: 'APPROVED', actor: 'approver' },
    { from: 'REJECTED', to: 'EXECUTING', actor: 'worker' },
    { from: 'APPROVED', to: 'DRAFT', actor: 'user' },
    { from: 'EXECUTED', to: 'DRAFT', actor: 'agent' },
  ];

  for (const c of illegalCases) {
    assert.equal(isValidTransition(c.from, c.to, c.actor), false);
    assert.throws(
      () => transition(c.from, c.to, c.actor),
      (err) => {
        return (err.code === 'ILLEGAL_TRANSITION' || err.statusCode === 409 || err.httpStatus === 409);
      },
      `Illegal transition ${c.from} -> ${c.to} must throw 409 ILLEGAL_TRANSITION`,
    );
  }
});

test('test_tahap_a_mapping_structure', () => {
  assert.equal(TAHAP_A_MAPPING.A1_vLEI.failState, 'REJECTED');
  assert.equal(TAHAP_A_MAPPING.A1_vLEI.failCode, 'VLEI_INACTIVE');
  assert.equal(TAHAP_A_MAPPING.A2_Intent.failState, 'REJECTED');
  assert.equal(TAHAP_A_MAPPING.A3_DIP.rejectBelow, 50);
  assert.equal(TAHAP_A_MAPPING.A3_DIP.escalateBelow, 80);
  assert.equal(TAHAP_A_MAPPING.A4_CPL.rejectBelow, 70);
  assert.equal(TAHAP_A_MAPPING.A4_CPL.escalateBelow, 90);
});
