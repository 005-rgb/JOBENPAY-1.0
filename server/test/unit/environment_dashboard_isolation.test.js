import test from 'node:test';
import assert from 'node:assert/strict';
import { listAgents } from '../../src/repositories/agents.js';
import { getDashboardSummary } from '../../src/repositories/dashboard.js';
import { createMandate } from '../../src/services/mandates.js';

test('Dashboard and Agent/Mandate Environment Isolation Unit Tests', async (t) => {
  const dummyOrgId = '00000000-0000-4000-8000-000000000001';
  const dummyAgentId = '00000000-0000-4000-8000-000000000002';

  await t.test('listAgents in repository requires environment parameter', async () => {
    // Missing environment
    await assert.rejects(
      async () => listAgents(dummyOrgId, undefined, null),
      (err) => err.code === 'ENVIRONMENT_REQUIRED',
    );

    await assert.rejects(
      async () => listAgents(dummyOrgId, undefined, ''),
      (err) => err.code === 'ENVIRONMENT_REQUIRED',
    );

    // With environment, queries correctly
    let capturedSql = '';
    let capturedParams = [];
    const mockDb = {
      async query(sql, params) {
        capturedSql = sql;
        capturedParams = params;
        return { rows: [] };
      },
    };

    const res = await listAgents(dummyOrgId, mockDb, 'LIVE');
    assert.deepEqual(res, []);
    assert.ok(capturedSql.includes('environment = $2'));
    assert.equal(capturedParams[0], dummyOrgId);
    assert.equal(capturedParams[1], 'LIVE');
  });

  await t.test('getDashboardSummary returns isPaypalConnected and respects environment', async () => {
    let capturedSql = '';
    let capturedParams = [];
    const mockDb = {
      async query(sql, params) {
        capturedSql = sql;
        capturedParams = params;
        return {
          rows: [{
            remaining_budget_minor: '1000',
            currency: 'USD',
            budget_used_pct: 10,
            requests: 5,
            auto_approved: 4,
            held: 1,
            blocked: 0,
            reconciled: 4,
            has_active_budget: true,
            paypal_connected: true,
            has_agent: true,
            total_agents: 2,
            has_active_mandate: true,
            active_mandates: 1,
            recent_transactions: [],
          }],
        };
      },
    };

    const summary = await getDashboardSummary(dummyOrgId, mockDb, 'LIVE');
    assert.equal(summary.environment, 'LIVE');
    assert.equal(summary.isPaypalConnected, true);
    assert.equal(summary.paypalConnected, true);
    assert.equal(summary.setupReadiness.isPaypalConnected, true);
    assert.equal(summary.setupReadiness.paypalConnected, true);
    assert.equal(capturedParams[1], 'LIVE');
  });

  await t.test('createMandate rejects cross-environment assignment with 422', async () => {
    const mockTx = {
      async query(sql, params) {
        if (sql.includes('SELECT environment FROM agents')) {
          // Agent is in SANDBOX
          return {
            rows: [{ environment: 'SANDBOX' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    };

    await assert.rejects(
      async () => createMandate(mockTx, {
        orgId: dummyOrgId,
        agentId: dummyAgentId,
        name: 'Live Mandate',
        policy: {
          schemaVersion: '1.0',
          limits: [{ amountMinor: '1000', currency: 'USD', period: 'MONTHLY' }],
        },
        purposeText: 'Live ops',
        environment: 'LIVE',
      }),
      (err) => err.code === 'CROSS_ENVIRONMENT_MANDATE_BLOCKED' && (err.status === 422 || err.statusCode === 422),
    );
  });
});
