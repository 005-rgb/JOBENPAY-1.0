import test from 'node:test';
import assert from 'node:assert/strict';
import { getDashboardSummary } from '../../src/repositories/dashboard.js';

test('getDashboardSummary: throws if orgId is missing', async () => {
  await assert.rejects(
    async () => getDashboardSummary(null),
    /orgId is required/
  );
});

test('getDashboardSummary: isolates data between SANDBOX and LIVE environments', async () => {
  const orgId = '00000000-0000-4000-8000-000000000001';

  // Mock DB that inspects SQL and environment parameter ($2)
  const mockDb = {
    async query(sql, params) {
      assert.equal(params[0], orgId);
      const requestedEnv = params[1];

      if (requestedEnv === 'LIVE') {
        return {
          rows: [{
            remaining_budget_minor: '0',
            currency: 'USD',
            budget_used_pct: 0,
            requests: 0,
            auto_approved: 0,
            held: 0,
            blocked: 0,
            reconciled: 0,
            has_active_budget: false,
            paypal_connected: false,
            has_agent: false,
            total_agents: 0,
            has_active_mandate: false,
            active_mandates: 0,
            recent_transactions: [],
          }],
        };
      }

      // SANDBOX
      return {
        rows: [{
          remaining_budget_minor: '50000',
          currency: 'USD',
          budget_used_pct: 25,
          requests: 12,
          auto_approved: 8,
          held: 2,
          blocked: 1,
          reconciled: 7,
          has_active_budget: true,
          paypal_connected: true,
          has_agent: true,
          total_agents: 3,
          has_active_mandate: true,
          active_mandates: 2,
          recent_transactions: [
            {
              id: 'tx-sbx-1',
              category: 'PAYOUT',
              sub_type: 'STANDARD',
              amount_minor: '5000',
              currency: 'USD',
              status: 'COMPLETED',
              created_at: new Date().toISOString(),
            },
          ],
        }],
      };
    },
  };

  // 1. Call with SANDBOX
  const sbxSummary = await getDashboardSummary(orgId, mockDb, 'SANDBOX');
  assert.equal(sbxSummary.environment, 'SANDBOX');
  assert.equal(sbxSummary.paypalConnected, true);
  assert.equal(sbxSummary.hasAgent, true);
  assert.equal(sbxSummary.totalAgents, 3);
  assert.equal(sbxSummary.hasActiveMandate, true);
  assert.equal(sbxSummary.activeMandates, 2);
  assert.equal(sbxSummary.counts.requests, 12);
  assert.equal(sbxSummary.counts.held, 2);
  assert.equal(sbxSummary.pendingApprovals, 2);
  assert.equal(sbxSummary.recentTransactions.length, 1);
  assert.equal(sbxSummary.setupReadiness.completedCount, 3);
  assert.equal(sbxSummary.setupReadiness.isReady, true);

  // 2. Call with LIVE
  const liveSummary = await getDashboardSummary(orgId, mockDb, 'LIVE');
  assert.equal(liveSummary.environment, 'LIVE');
  assert.equal(liveSummary.paypalConnected, false);
  assert.equal(liveSummary.hasAgent, false);
  assert.equal(liveSummary.totalAgents, 0);
  assert.equal(liveSummary.hasActiveMandate, false);
  assert.equal(liveSummary.activeMandates, 0);
  assert.equal(liveSummary.counts.requests, 0);
  assert.equal(liveSummary.counts.held, 0);
  assert.equal(liveSummary.pendingApprovals, 0);
  assert.equal(liveSummary.recentTransactions.length, 0);
  assert.equal(liveSummary.setupReadiness.completedCount, 0);
  assert.equal(liveSummary.setupReadiness.isReady, false);
});

test('getDashboardSummary: supports 2-argument signature (orgId, environment)', async () => {
  const orgId = '00000000-0000-4000-8000-000000000002';
  let passedEnv = null;

  const mockDb = {
    async query(sql, params) {
      passedEnv = params[1];
      return {
        rows: [{
          remaining_budget_minor: '0',
          currency: 'USD',
          budget_used_pct: 0,
          requests: 0,
          auto_approved: 0,
          held: 0,
          blocked: 0,
          reconciled: 0,
          has_active_budget: false,
          paypal_connected: false,
          has_agent: false,
          total_agents: 0,
          has_active_mandate: false,
          active_mandates: 0,
          recent_transactions: [],
        }],
      };
    },
  };

  const res = await getDashboardSummary(orgId, mockDb, 'LIVE');
  assert.equal(res.environment, 'LIVE');
  assert.equal(passedEnv, 'LIVE');
});
