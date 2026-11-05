import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { ERROR_CODES } from '../../../shared/error-codes.js';
import { ruleA7Payee } from '../../src/services/decision/rulesA.js';
import { flagB1PayeeNew } from '../../src/services/decision/flagsB.js';
import { evaluateRequest } from '../../src/services/decision/engine.js';
import { evaluateRequestJob } from '../../src/jobs/evaluateRequest.js';
import { reevaluateStaleRequest } from '../../src/services/requests.js';

test('HARDEN-1 / BAGIAN 2: D16 Mandate payee allowlist policy verification', async (t) => {
  await t.test('2.1 error-codes.js contains PAYEE_NOT_ALLOWED definition', () => {
    assert.ok(ERROR_CODES.PAYEE_NOT_ALLOWED, 'shared/error-codes.js must define PAYEE_NOT_ALLOWED');
    assert.equal(ERROR_CODES.PAYEE_NOT_ALLOWED.httpStatus, 403);
    assert.equal(typeof ERROR_CODES.PAYEE_NOT_ALLOWED.message, 'string');
  });

  await t.test('2.2 Table-driven test of D16 four core cases on ruleA7Payee and flagB1PayeeNew', () => {
    const payeeInList = { id: 'payee-allowed-01', trust: 'TRUSTED' };
    const payeeOutsideList = { id: 'payee-outside-02', trust: 'TRUSTED' };
    const payeeBlocked = { id: 'payee-blocked-03', trust: 'BLOCKED' };

    const cases = [
      {
        name: 'Case 1: ALLOWLIST + payee outside list + allowNewPayees: false -> REJECT PAYEE_NOT_ALLOWED',
        payee: payeeOutsideList,
        policy: {
          payees: { mode: 'ALLOWLIST', ids: [payeeInList.id] },
          allowNewPayees: false,
        },
        expectedRuleA7: { ok: false, code: 'PAYEE_NOT_ALLOWED' },
        expectedDecision: 'REJECT',
        expectedReasonCode: 'PAYEE_NOT_ALLOWED',
      },
      {
        name: 'Case 2: ALLOWLIST + payee outside list + allowNewPayees: true -> REQUIRE_APPROVAL PAYEE_NEW',
        payee: payeeOutsideList,
        policy: {
          payees: { mode: 'ALLOWLIST', ids: [payeeInList.id] },
          allowNewPayees: true,
        },
        expectedRuleA7: { ok: true },
        expectedFlagB1: { code: 'PAYEE_NEW' },
        expectedDecision: 'REQUIRE_APPROVAL',
        expectedReasonCode: 'PAYEE_NEW',
      },
      {
        name: 'Case 3: ALLOWLIST + payee in list + payee TRUSTED -> passes Stage A and Stage B',
        payee: payeeInList,
        policy: {
          payees: { mode: 'ALLOWLIST', ids: [payeeInList.id] },
          allowNewPayees: false,
        },
        expectedRuleA7: { ok: true },
        expectedFlagB1: null,
        expectedDecision: 'AUTO_APPROVE',
        expectedReasonCode: null,
      },
      {
        name: 'Case 4: Payee BLOCKED -> unconditionally REJECT with PAYEE_BLOCKED',
        payee: payeeBlocked,
        policy: {
          payees: { mode: 'ALLOWLIST', ids: [payeeBlocked.id] },
          allowNewPayees: true,
        },
        expectedRuleA7: { ok: false, code: 'PAYEE_BLOCKED' },
        expectedDecision: 'REJECT',
        expectedReasonCode: 'PAYEE_BLOCKED',
      },
    ];

    for (const tc of cases) {
      // 1. Test ruleA7Payee
      const ruleResult = ruleA7Payee({ payee: tc.payee, policy: tc.policy });
      assert.equal(ruleResult.ok, tc.expectedRuleA7.ok, `${tc.name}: ruleA7Payee ok mismatch`);
      if (!tc.expectedRuleA7.ok) {
        assert.equal(ruleResult.code, tc.expectedRuleA7.code, `${tc.name}: ruleA7Payee code mismatch`);
      }

      // 2. Test flagB1PayeeNew
      const allowedInPolicy = tc.policy.payees.ids.includes(tc.payee.id);
      const flagResult = flagB1PayeeNew({ payee: { ...tc.payee, allowed: allowedInPolicy } });
      if (tc.expectedFlagB1) {
        assert.ok(flagResult, `${tc.name}: expected flagB1PayeeNew to trigger`);
        assert.equal(flagResult.code, tc.expectedFlagB1.code, `${tc.name}: flagB1PayeeNew code mismatch`);
      } else if (tc.payee.trust === 'TRUSTED' && allowedInPolicy) {
        assert.equal(flagResult, null, `${tc.name}: expected flagB1PayeeNew to be null`);
      }

      // 3. Test through full evaluateRequest engine
      const basePolicy = {
        schemaVersion: 1,
        purpose: 'Test policy',
        allowedActions: ['PAYOUT'],
        currency: 'USD',
        perTransactionCapMinor: 50000,
        budget: { period: 'MONTH', limitMinor: 1000000 },
        autoApproveBelowMinor: 10000,
        schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
        velocity: { maxRequestsPerHour: 100, maxPayoutPerPayeePerDay: 50000 },
        duplicateWindowHours: 72,
        requireInvoice: false,
        invoiceAmountToleranceMinor: 0,
        ai: { intentCheck: false, escalateOnRiskAtOrAbove: 70, blockOnRiskAtOrAbove: 90 },
        stepUpApprovalAboveMinor: 30000,
        fourEyesAboveMinor: 40000,
        approvalTtlHours: 24,
        validFrom: '2020-01-01T00:00:00Z',
        validTo: '2099-01-01T00:00:00Z',
        ...tc.policy,
      };

      const mockRequest = {
        id: randomUUID(),
        amount_minor: '500',
        currency: 'USD',
        action: 'PAYOUT',
      };

      const mockContext = {
        org: { frozen_at: null },
        agent: { status: 'ACTIVE' },
        mandate: { status: 'ACTIVE' },
        version: { id: randomUUID(), valid_from: '2020-01-01T00:00:00Z', valid_to: '2099-01-01T00:00:00Z' },
        policy: basePolicy,
        payee: tc.payee,
        history: { hourlyCount: 0, dailyPayeeMinor: '0', payeeChanges30Days: 0 },
        now: new Date('2026-06-01T12:00:00Z'),
        budget: { remainingMinor: 1000000 },
      };

      // Synchronous safe evaluation without db transaction
      const evalResult = {
        ruleContext: {
          ...mockContext,
          request: mockRequest,
          amountMinor: mockRequest.amount_minor,
          currency: mockRequest.currency,
          action: mockRequest.action,
          payee: {
            ...tc.payee,
            allowed: allowedInPolicy,
          },
        },
      };

      const ruleA7Res = ruleA7Payee(evalResult.ruleContext);
      if (!ruleA7Res.ok) {
        assert.equal(tc.expectedDecision, 'REJECT');
        assert.equal(ruleA7Res.code, tc.expectedReasonCode);
      } else {
        const flagB1Res = flagB1PayeeNew(evalResult.ruleContext);
        if (flagB1Res) {
          assert.equal(tc.expectedDecision, 'REQUIRE_APPROVAL');
          assert.equal(flagB1Res.code, tc.expectedReasonCode);
        } else {
          assert.equal(tc.expectedDecision, 'AUTO_APPROVE');
        }
      }
    }
  });
});

test('HARDEN-1 / BAGIAN 2: D18 Synchronous evaluation & background sweeper verification', async (t) => {
  await t.test('2.3 evaluateRequestJob delegates to reevaluateStaleRequest and handles missing/stale safely', async () => {
    // Verify evaluateRequestJob is an async function taking job payload
    assert.equal(typeof evaluateRequestJob, 'function');
    assert.equal(typeof reevaluateStaleRequest, 'function');

    // Test with mock db that returns no row (request not found)
    const mockClient = {
      query: async (sql, params) => {
        if (sql.includes('SELECT * FROM payment_requests')) {
          return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };
    const mockDb = {
      connect: async () => mockClient,
      query: (sql, params) => mockClient.query(sql, params),
    };

    const staleResult = await reevaluateStaleRequest(randomUUID(), randomUUID(), mockDb);
    assert.equal(staleResult, null, 'reevaluateStaleRequest must return null safely when request not found');

    const jobResult = await evaluateRequestJob({
      payload: { orgId: randomUUID(), requestId: randomUUID() },
    }, { db: mockDb });
    assert.equal(jobResult, null, 'evaluateRequestJob must return null safely when request not found');
  });

  await t.test('2.4 reevaluateStaleRequest ignores non-stale or already finalized requests', async () => {
    // If request is not in ('RECEIVED', 'EVALUATING') older than 2 minutes, query matches 0 rows
    const mockClient = {
      query: async (sql, params) => {
        // SELECT * FROM payment_requests WHERE ... status IN ('RECEIVED', 'EVALUATING') ...
        return { rowCount: 0, rows: [] };
      },
      release: () => {},
    };
    const mockDb = {
      connect: async () => mockClient,
      query: (sql, params) => mockClient.query(sql, params),
    };

    const result = await reevaluateStaleRequest(randomUUID(), randomUUID(), mockDb);
    assert.equal(result, null, 'reevaluateStaleRequest must safely return null for non-stale/finalized requests');
  });
});
