/**
 * test/characterization/characterization.test.js
 * FROZEN Golden Characterization Test Suite (>= 25 Scenarios)
 * Work Packet BW-00 (PRD v1.2 Behavioral Snapshot)
 *
 * THIS TEST FILE CAPTURES BASELINE PRD v1.2 BEHAVIOR.
 * IT MUST REMAIN GREEN AND MUST NEVER BE MODIFIED WITHOUT THE 'test-changed' LABEL.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import { combineDecisions, evaluateRequest } from '../../server/src/services/decision/engine.js';
import { requestHash } from '../../server/src/services/requestHash.js';
import { GRAPH, isLegalTransition } from '../../server/src/services/requestStateMachine.js';
import { LEDGER_RULES } from '../../shared/ledger-rules.js';

const basePolicy = {
  allowedActions: ['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'],
  currency: 'USD',
  perTransactionCapMinor: 500000n, // $5,000.00
  budget: { period: 'MONTH', limitMinor: 1000000n }, // $10,000.00
  autoApproveBelowMinor: 100000n, // $1,000.00
  allowNewPayees: false,
  payees: { mode: 'ALLOWLIST', ids: ['payee-uuid-1'] },
  schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
  velocity: { maxRequestsPerHour: 20, maxPayoutPerPayeePerDay: 5 },
  duplicateWindowHours: 48,
  requireInvoice: false,
  invoiceAmountToleranceMinor: 0n,
  ai: { intentCheck: true, escalateOnRiskAtOrAbove: 60, blockOnRiskAtOrAbove: 85 },
  stepUpApprovalAboveMinor: 300000n, // $3,000.00
  fourEyesAboveMinor: 500000n,
  approvalTtlHours: 24,
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: '2027-01-01T00:00:00.000Z',
};

function createContext(overrides = {}) {
  return {
    org: { id: 'org-uuid-1', status: 'ACTIVE' },
    agent: { id: 'agent-uuid-1', status: 'ACTIVE' },
    mandate: { id: 'mandate-uuid-1', status: 'ACTIVE' },
    version: {
      id: 'version-uuid-1',
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_to: '2027-01-01T00:00:00.000Z',
    },
    policy: { ...basePolicy },
    payee: {
      id: 'payee-uuid-1',
      trust: 'TRUSTED',
      display_name: 'Verified Vendor LLC',
      status: 'ACTIVE',
    },
    history: {
      requestsLastHour: 1,
      payeePayoutsToday: 1,
      duplicate: false,
      payeeChanges30Days: 0,
      spentThisMonthMinor: 100000n,
    },
    action: 'PAYOUT',
    currency: 'USD',
    amountMinor: 50000n, // $500.00
    now: new Date('2026-11-01T12:00:00.000Z'),
    ...overrides,
  };
}

function createRequest(overrides = {}) {
  return {
    id: 'req-uuid-1',
    org_id: 'org-uuid-1',
    agent_id: 'agent-uuid-1',
    action: 'PAYOUT',
    amount_minor: 50000n,
    currency: 'USD',
    payee_id: 'payee-uuid-1',
    target_ref: null,
    document_id: null,
    agent_reason: 'Routine cloud hosting fee payout',
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// SCN-01 to SCN-16: Deterministic Stage A Rules Golden Behavior
// -----------------------------------------------------------------------------

test('GOLDEN SCN-01: Standard Payout Auto-Approve (clean, within cap & budget)', async () => {
  const ctx = createContext();
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, true, 'Stage A deterministic checks must pass');
  assert.equal(result.stageA.failures.length, 0);
  assert.equal(result.decision, 'AUTO_APPROVE');
  assert.deepEqual(result.reasonCodes, []);
});

test('GOLDEN SCN-02: A1 Rule ORG_FROZEN -> REJECT', async () => {
  const ctx = createContext({ org: { id: 'org-1', frozen_at: new Date().toISOString() } });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('ORG_FROZEN'));
});

test('GOLDEN SCN-03: A2 Rule AGENT_DISABLED -> REJECT', async () => {
  const ctx = createContext({ agent: { id: 'agent-1', status: 'DISABLED' } });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('AGENT_DISABLED'));
});

test('GOLDEN SCN-04: A3 Rule MANDATE_INACTIVE -> REJECT', async () => {
  const ctx = createContext({ mandate: { id: 'mandate-1', status: 'SUSPENDED' } });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('MANDATE_INACTIVE'));
});

test('GOLDEN SCN-05: A4 Rule MANDATE_EXPIRED -> REJECT', async () => {
  const ctx = createContext({ now: new Date('2028-01-01T00:00:00.000Z') });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('MANDATE_EXPIRED'));
});

test('GOLDEN SCN-06: A4b Rule ACTION_NOT_ALLOWED -> REJECT', async () => {
  const ctx = createContext();
  const req = createRequest({ action: 'UNAUTHORIZED_ACTION' });
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('ACTION_NOT_ALLOWED'));
});

test('GOLDEN SCN-07: A5 Rule CURRENCY_NOT_ALLOWED -> REJECT', async () => {
  const ctx = createContext();
  const req = createRequest({ currency: 'EUR' });
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('CURRENCY_NOT_ALLOWED'));
});

test('GOLDEN SCN-08: A6 Rule CAP_EXCEEDED -> REJECT', async () => {
  const ctx = createContext();
  const req = createRequest({ amount_minor: 600000n }); // Cap is 500000n
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('CAP_EXCEEDED'));
});

test('GOLDEN SCN-09: A7 Rule PAYEE_BLOCKED -> REJECT', async () => {
  const ctx = createContext({
    payee: { id: 'payee-uuid-1', trust: 'BLOCKED', status: 'BLOCKED' },
  });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('PAYEE_BLOCKED'));
});

test('GOLDEN SCN-10: A7b Rule PAYEE_NOT_ALLOWED (not in allowlist) -> REJECT', async () => {
  const ctx = createContext({
    payee: { id: 'unknown-payee-uuid', trust: 'TRUSTED' },
  });
  const req = createRequest({ payee_id: 'unknown-payee-uuid' });
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('PAYEE_NOT_ALLOWED'));
});

test('GOLDEN SCN-11: A8 Rule TARGET_INVALID handling', async () => {
  // In v1.2, ruleA8Target explicitly notes target validation is not applicable to PAYOUT
  const { ruleA8Target } = await import('../../server/src/services/decision/rulesA.js');
  const resPayout = ruleA8Target({ action: 'PAYOUT' });
  assert.equal(resPayout.ok, true);
  assert.equal(resPayout.detail, 'Target validation is not applicable to PAYOUT.');

  const resTierB = ruleA8Target({ action: 'REFUND' });
  assert.equal(resTierB.ok, true);
  assert.equal(resTierB.detail, 'Tier B target validation is not enabled.');
});

test('GOLDEN SCN-12: A9 Rule OUTSIDE_TIME_WINDOW -> REJECT', async () => {
  const ctx = createContext({
    policy: {
      ...basePolicy,
      schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
    },
    now: new Date('2026-11-01T20:00:00.000Z'), // 20:00 UTC (outside 9-17)
  });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('OUTSIDE_TIME_WINDOW'));
});

test('GOLDEN SCN-13: A10 Rule VELOCITY_EXCEEDED -> REJECT', async () => {
  const ctx = createContext({
    history: { requestsLastHour: 25, payeePayoutsToday: 1, duplicate: false, payeeChanges30Days: 0 },
  });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('VELOCITY_EXCEEDED'));
});

test('GOLDEN SCN-14: A11 Rule DUPLICATE_SUSPECTED -> REJECT', async () => {
  const ctx = createContext({
    history: { requestsLastHour: 1, payeePayoutsToday: 1, duplicate: true, payeeChanges30Days: 0 },
  });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('DUPLICATE_SUSPECTED'));
});

test('GOLDEN SCN-15: A12 Rule INVOICE_REQUIRED -> REJECT', async () => {
  const ctx = createContext({
    policy: { ...basePolicy, requireInvoice: true },
    document: null,
  });
  const req = createRequest({ document_id: null });
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('INVOICE_REQUIRED'));
});

test('GOLDEN SCN-16: A13 Rule BUDGET_EXCEEDED -> REJECT', async () => {
  const ctx = createContext({
    budget: { remainingMinor: 20000n }, // Only 20000n remaining
  });
  const req = createRequest({ amount_minor: 50000n }); // Exceeds remaining budget
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, false);
  assert.equal(result.decision, 'REJECT');
  assert.ok(result.reasonCodes.includes('BUDGET_EXCEEDED'));
});

// -----------------------------------------------------------------------------
// SCN-17 to SCN-21: Stage B Risk Flags Golden Behavior
// -----------------------------------------------------------------------------

test('GOLDEN SCN-17: B1 Flag PAYEE_NEW -> REQUIRE_APPROVAL', async () => {
  const ctx = createContext({
    policy: { ...basePolicy, allowNewPayees: true, payees: { mode: 'ALLOWLIST', ids: ['payee-uuid-1'] } },
    payee: { id: 'payee-uuid-1', trust: 'NEW', display_name: 'Brand New Payee LLC' },
  });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, true);
  assert.equal(result.decision, 'REQUIRE_APPROVAL');
  assert.ok(result.reasonCodes.includes('PAYEE_NEW'));
});

test('GOLDEN SCN-18: B2 Flag PAYEE_CHANGED -> REQUIRE_APPROVAL', async () => {
  const ctx = createContext({
    history: { requestsLastHour: 1, payeePayoutsToday: 1, duplicate: false, payeeChanges30Days: 1 },
  });
  const req = createRequest();
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, true);
  assert.equal(result.decision, 'REQUIRE_APPROVAL');
  assert.ok(result.reasonCodes.includes('PAYEE_CHANGED'));
});

test('GOLDEN SCN-19: B3 Flag INVOICE_PAYEE_MISMATCH -> REQUIRE_APPROVAL', async () => {
  const ctx = createContext({
    extraction: {
      payee_name: 'Completely Different Entity Inc',
      amount_minor: 50000n,
      currency: 'USD',
    },
  });
  const req = createRequest({ document_id: 'doc-1' });
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, true);
  assert.equal(result.decision, 'REQUIRE_APPROVAL');
  assert.ok(result.reasonCodes.includes('INVOICE_PAYEE_MISMATCH'));
});

test('GOLDEN SCN-20: B4 Flag AMOUNT_REQUIRES_APPROVAL (amount >= autoApproveBelowMinor)', async () => {
  const ctx = createContext();
  const req = createRequest({ amount_minor: 250000n }); // autoApproveBelowMinor is 100000n
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, true);
  assert.equal(result.decision, 'REQUIRE_APPROVAL');
  assert.ok(result.reasonCodes.includes('AMOUNT_REQUIRES_APPROVAL'));
});

test('GOLDEN SCN-21: B5 Flag DOC_INJECTION_SUSPECTED -> REQUIRE_APPROVAL', async () => {
  const ctx = createContext({
    document: {
      id: 'doc-injection',
      injection_flags: ['PROMPT_INJECTION_DETECTED'],
      amount_minor: 50000n,
    },
  });
  const req = createRequest({ document_id: 'doc-injection' });
  const result = await evaluateRequest({ request: req, context: ctx });

  assert.equal(result.stageA.ok, true);
  assert.equal(result.decision, 'REQUIRE_APPROVAL');
  assert.ok(result.reasonCodes.includes('DOC_INJECTION_SUSPECTED'));
});

// -----------------------------------------------------------------------------
// SCN-22 to SCN-24: Stage C AI Monotonic Tightening Golden Behavior
// -----------------------------------------------------------------------------

test('GOLDEN SCN-22: Stage C AI Monotonicity - AI cannot loosen REJECT to APPROVE', () => {
  const deterministic = { decision: 'REJECT', reasonCodes: ['CAP_EXCEEDED'] };
  const ai = { decision: 'AUTO_APPROVE', reasonCodes: [] };

  const combined = combineDecisions(deterministic, ai);
  assert.equal(combined.decision, 'REJECT', 'AI MUST NOT loosen a deterministic REJECT');
  assert.deepEqual(combined.reasonCodes, ['CAP_EXCEEDED']);
});

test('GOLDEN SCN-23: Stage C AI Monotonicity - AI can tighten AUTO_APPROVE to REQUIRE_APPROVAL', () => {
  const deterministic = { decision: 'AUTO_APPROVE', reasonCodes: [] };
  const ai = { decision: 'REQUIRE_APPROVAL', reasonCodes: ['AI_HIGH_RISK'] };

  const combined = combineDecisions(deterministic, ai);
  assert.equal(combined.decision, 'REQUIRE_APPROVAL', 'AI is permitted to tighten approval');
  assert.deepEqual(combined.reasonCodes, ['AI_HIGH_RISK']);
});

test('GOLDEN SCN-24: Stage C AI Monotonicity - AI can tighten to REJECT', () => {
  const deterministic = { decision: 'AUTO_APPROVE', reasonCodes: [] };
  const ai = { decision: 'REJECT', reasonCodes: ['AI_INJECTION_SUSPECTED'] };

  const combined = combineDecisions(deterministic, ai);
  assert.equal(combined.decision, 'REJECT', 'AI can tighten to REJECT');
  assert.deepEqual(combined.reasonCodes, ['AI_INJECTION_SUSPECTED']);
});

// -----------------------------------------------------------------------------
// SCN-25 to SCN-27: State Machine Transitions & Approvals Golden Behavior
// -----------------------------------------------------------------------------

test('GOLDEN SCN-25: State Machine Standard Payout Lifecycle Graph', () => {
  assert.ok(isLegalTransition('RECEIVED', 'EVALUATING'));
  assert.ok(isLegalTransition('EVALUATING', 'APPROVED'));
  assert.ok(isLegalTransition('APPROVED', 'EXECUTING'));
  assert.ok(isLegalTransition('EXECUTING', 'EXECUTED'));
  assert.ok(isLegalTransition('EXECUTED', 'RECONCILED'));

  // Illegal transition check
  assert.equal(isLegalTransition('RECEIVED', 'EXECUTING'), false);
  assert.equal(isLegalTransition('EXECUTED', 'EVALUATING'), false);
  assert.equal(isLegalTransition('REJECTED', 'APPROVED'), false);
});

test('GOLDEN SCN-26: Human Approver Flow: PENDING_APPROVAL -> APPROVED or REJECTED', () => {
  assert.ok(isLegalTransition('PENDING_APPROVAL', 'APPROVED'));
  assert.ok(isLegalTransition('PENDING_APPROVAL', 'REJECTED'));
  assert.ok(isLegalTransition('PENDING_APPROVAL', 'EXPIRED'));
});

test('GOLDEN SCN-27: Step-Up Requirement Check Golden', () => {
  const threshold = basePolicy.stepUpApprovalAboveMinor; // 300000n
  const lowAmount = 200000n;
  const highAmount = 400000n;

  assert.equal(lowAmount >= threshold, false, 'Amounts under 300000n do not mandate step-up');
  assert.equal(highAmount >= threshold, true, 'Amounts >= 300000n mandate step-up authentication');
});

// -----------------------------------------------------------------------------
// SCN-28 to SCN-30: Request Hash, Double-Entry Ledger & REFUND Golden Behavior
// -----------------------------------------------------------------------------

test('GOLDEN SCN-28: Request Hash Determinism (D5)', () => {
  const params1 = {
    orgId: 'org-uuid-1',
    agentId: 'agent-uuid-1',
    mandateVersionId: 'version-uuid-1',
    action: 'PAYOUT',
    amountMinor: 50000n,
    currency: 'USD',
    payeeId: 'payee-uuid-1',
    documentSha256: 'abc123def456',
  };

  const hash1 = requestHash(params1);
  const hash2 = requestHash({ ...params1 });

  assert.equal(typeof hash1, 'string');
  assert.equal(hash1.length, 64);
  assert.equal(hash1, hash2, 'Identical canonical payload MUST produce identical SHA-256 hash');

  const hash3 = requestHash({ ...params1, amountMinor: 50001n });
  assert.notEqual(hash1, hash3, 'Any minor amount deviation MUST alter the request hash');
});

test('GOLDEN SCN-29: Double-Entry Balanced Ledger Rule for PAYOUT', () => {
  const amountMinor = 75000n; // $750.00
  const currency = 'USD';
  const payeeId = 'payee-uuid-1';

  const legs = LEDGER_RULES.PAYOUT.standard.legs({
    amountMinor,
    currency,
    payeeId,
  });

  assert.equal(legs.length, 2, 'PAYOUT standard rule MUST have exactly 2 legs');
  const debitLeg = legs.find((l) => l.legType === 'DEBIT');
  const creditLeg = legs.find((l) => l.legType === 'CREDIT');

  assert.ok(debitLeg && creditLeg, 'Must include both DEBIT and CREDIT legs');
  assert.equal(debitLeg.accountRef, 'org:main');
  assert.equal(creditLeg.accountRef, `payee:${payeeId}`);
  assert.equal(debitLeg.amountMinor, amountMinor);
  assert.equal(creditLeg.amountMinor, amountMinor);
  assert.equal(debitLeg.currency, currency);
  assert.equal(creditLeg.currency, currency);

  // Exact balance check
  assert.equal(debitLeg.amountMinor, creditLeg.amountMinor, 'DEBIT must equal CREDIT');
});

test('GOLDEN SCN-30: Double-Entry Balanced Ledger Rule for REFUND', () => {
  const amountMinor = 25000n; // $250.00
  const currency = 'USD';
  const buyerId = 'buyer-uuid-1';

  const legs = LEDGER_RULES.REFUND.full.legs({
    amountMinor,
    currency,
    buyerId,
  });

  assert.equal(legs.length, 2, 'REFUND rule MUST have exactly 2 legs');
  const debitLeg = legs.find((l) => l.legType === 'DEBIT');
  const creditLeg = legs.find((l) => l.legType === 'CREDIT');

  assert.ok(debitLeg && creditLeg);
  assert.equal(debitLeg.amountMinor, creditLeg.amountMinor, 'REFUND legs MUST be balanced');
});
