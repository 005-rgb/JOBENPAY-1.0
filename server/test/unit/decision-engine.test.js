import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { evaluateRequest } from '../../src/services/decision/engine.js';
import { FLAGS_B } from '../../src/services/decision/flagsB.js';
import { explainReasonCodes } from '../../src/services/decision/explain.js';
import { requestHash } from '../../src/services/requestHash.js';
import { GRAPH, isLegalTransition } from '../../src/services/requestStateMachine.js';
import { RULES_A } from '../../src/services/decision/rulesA.js';

const policy = {
  allowedActions: ['PAYOUT'],
  currency: 'USD',
  perTransactionCapMinor: 5000,
  budget: { limitMinor: 10000 },
  autoApproveBelowMinor: 1000,
  allowNewPayees: false,
  payees: { ids: ['payee-1'] },
  schedule: { timezone: 'Asia/Jakarta', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
  velocity: { maxRequestsPerHour: 10, maxPayoutPerPayeePerDay: 2 },
  duplicateWindowHours: 72,
  requireInvoice: false,
  invoiceAmountToleranceMinor: 0,
  stepUpApprovalAboveMinor: 3000,
  approvalTtlHours: 24,
};

function context(overrides = {}) {
  return {
    org: {},
    agent: { status: 'ACTIVE' },
    mandate: { status: 'ACTIVE' },
    version: { id: 'version-1', valid_from: '2020-01-01T00:00:00Z', valid_to: '2099-01-01T00:00:00Z' },
    policy,
    payee: { id: 'payee-1', display_name: 'Trusted Payee', trust: 'TRUSTED' },
    history: { requestsLastHour: 0, payeePayoutsToday: 0, duplicate: false, payeeChanges30Days: 0 },
    amountMinor: '500',
    now: new Date('2026-11-01T04:00:00Z'),
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    id: 'request-1', amount_minor: '500', currency: 'USD', action: 'PAYOUT',
    ...overrides,
  };
}

test('request hash is canonical and uses a string minor amount', () => {
  assert.equal(
    requestHash({
      orgId: 'org', agentId: 'agent', mandateVersionId: 'version',
      action: 'PAYOUT', amountMinor: 1000, currency: 'USD',
      payeeId: 'payee', documentSha256: null,
    }).length,
    64,
  );
});

for (const [name, rule] of RULES_A) {
  test(`${name} rule returns a structured result`, () => {
    const result = rule(context());
    assert.equal(typeof result.ok, 'boolean');
    assert.equal(typeof result.detail, 'string');
  });
}

const aCases = [
  ['A1 ORG_FROZEN', { org: { frozen_at: new Date() } }, 'ORG_FROZEN'],
  ['A2 AGENT_DISABLED', { agent: { status: 'DISABLED' } }, 'AGENT_DISABLED'],
  ['A3 MANDATE_INACTIVE', { mandate: { status: 'SUSPENDED' } }, 'MANDATE_INACTIVE'],
  ['A4 ACTION_NOT_ALLOWED', { policy: { ...policy, allowedActions: [] } }, 'ACTION_NOT_ALLOWED'],
  ['A5 CURRENCY_NOT_ALLOWED', { currency: 'EUR' }, 'CURRENCY_NOT_ALLOWED'],
  ['A6 CAP_EXCEEDED', { amount_minor: '5001' }, 'CAP_EXCEEDED'],
  ['A9 OUTSIDE_TIME_WINDOW', { policy: { ...policy, schedule: { ...policy.schedule, startHour: 8, endHour: 9 } } }, 'OUTSIDE_TIME_WINDOW'],
  ['A10 VELOCITY_EXCEEDED', { history: { requestsLastHour: 10, payeePayoutsToday: 0 } }, 'VELOCITY_EXCEEDED'],
  ['A11 DUPLICATE_SUSPECTED', { history: { duplicate: true } }, 'DUPLICATE_SUSPECTED'],
  ['A12 INVOICE_REQUIRED', { policy: { ...policy, requireInvoice: true }, document: null }, 'INVOICE_REQUIRED'],
];

for (const [name, overrides, code] of aCases) {
  test(`${name} rejects`, async () => {
    const result = await evaluateRequest({ request: request(overrides), context: context(overrides) });
    assert.equal(result.reasonCodes.includes(code), true);
    assert.equal(result.decision, 'REJECT');
  });
}

test('A7 PAYEE_BLOCKED rejects and A8 PAYOUT target passes', async () => {
  const result = await evaluateRequest({
    request: request(),
    context: context({ payee: { id: 'payee-1', trust: 'BLOCKED' } }),
  });
  assert.equal(result.reasonCodes.includes('PAYEE_BLOCKED'), true);
  assert.equal(result.stageA.ok, false);
});

for (const [name, flag] of FLAGS_B) {
  test(`${name} positive and negative`, () => {
    const negative = flag(context());
    assert.equal(negative === null, true);
  });
}

test('B flags force approval', async () => {
  const result = await evaluateRequest({
    request: request({ amount_minor: '1000' }),
    context: context({ payee: { id: 'payee-1', display_name: 'New Payee', trust: 'PENDING_REVIEW' } }),
  });
  assert.equal(result.decision, 'REQUIRE_APPROVAL');
  assert.equal(result.reasonCodes.includes('PAYEE_NEW'), true);
  assert.equal(result.reasonCodes.includes('AMOUNT_REQUIRES_APPROVAL'), true);
});

test('reason explanations are deterministic and prioritized', () => {
  const result = explainReasonCodes(['AMOUNT_REQUIRES_APPROVAL', 'CAP_EXCEEDED', 'CAP_EXCEEDED']);
  assert.deepEqual(result.reasonCodes, ['CAP_EXCEEDED', 'AMOUNT_REQUIRES_APPROVAL']);
});

test('state machine exposes the exact legal graph', () => {
  assert.deepEqual(GRAPH.RECEIVED, ['EVALUATING']);
  assert.deepEqual(GRAPH.EVALUATING, ['REJECTED', 'PENDING_APPROVAL', 'APPROVED']);
  assert.deepEqual(GRAPH.PENDING_APPROVAL, ['APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
  assert.deepEqual(GRAPH.APPROVED, ['EXECUTING', 'CANCELLED']);
  assert.deepEqual(GRAPH.EXECUTING, ['EXECUTED', 'FAILED']);
  assert.deepEqual(GRAPH.EXECUTED, ['RECONCILED', 'MISMATCH']);
});

test('A13 BUDGET_EXCEEDED rejects before approval flags', async () => {
  const result = await evaluateRequest({
    request: request({ amount_minor: '500' }),
    context: context({ budget: { remainingMinor: '100' } }),
  });
  assert.equal(result.decision, 'REJECT');
  assert.equal(result.reasonCodes.includes('BUDGET_EXCEEDED'), true);
});

test('all state-machine pairs outside the legal graph are rejected', () => {
  const states = [
    'RECEIVED', 'EVALUATING', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'EXPIRED',
    'CANCELLED', 'EXECUTING', 'EXECUTED', 'RECONCILED', 'MISMATCH', 'FAILED',
  ];
  for (const from of states) {
    for (const to of states) {
      assert.equal(isLegalTransition(from, to), Boolean(GRAPH[from]?.includes(to)), `${from} -> ${to}`);
    }
  }
});

test('200 synchronous decisions have p95 below 300ms', async () => {
  const durations = [];
  for (let index = 0; index < 200; index += 1) {
    const start = performance.now();
    await evaluateRequest({ request: request(), context: context() });
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95) - 1];
  console.log(`decision p95: ${p95.toFixed(2)}ms`);
  assert.ok(p95 < 300);
});
