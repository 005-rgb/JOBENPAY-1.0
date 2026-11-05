import assert from 'node:assert/strict';
import test from 'node:test';
import { runRealPreflight } from '../../src/services/realPreflight.js';
import { encrypt } from '../../src/lib/crypto.js';

const testOrgId = '00000000-0000-4000-8000-000000000001';
const encryptionKey = Buffer.alloc(32, 5).toString('base64');

function makeMockDb(customHandlers = {}) {
  return {
    async query(sql, params = []) {
      const sqlLower = sql.toLowerCase();

      for (const [key, handler] of Object.entries(customHandlers)) {
        if (sqlLower.includes(key.toLowerCase())) {
          return handler(params);
        }
      }

      if (sqlLower.includes('from paypal_connections')) {
        return {
          rows: [{
            org_id: testOrgId,
            status: 'CONNECTED',
            webhook_id: 'WH-123456789',
            webhook_token: 'wh-token-123',
            client_id_enc: encrypt({
              key: encryptionKey,
              plaintext: 'client_id_val',
              aad: `paypal_connections:client_id_enc:${testOrgId}`,
            }),
            client_secret_enc: encrypt({
              key: encryptionKey,
              plaintext: 'client_secret_val',
              aad: `paypal_connections:client_secret_enc:${testOrgId}`,
            }),
          }],
        };
      }

      if (sqlLower.includes('from organizations')) {
        return {
          rows: [{
            id: testOrgId,
            frozen_at: null,
            archived_at: null,
          }],
        };
      }

      if (sqlLower.includes('from agents')) {
        return {
          rows: [{
            id: '11111111-1111-4111-8111-111111111111',
            name: 'FinanceAgent',
            active_key_count: 1,
          }],
        };
      }

      if (sqlLower.includes('from mandates')) {
        return {
          rows: [{
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Sandbox Test Mandate',
            status: 'ACTIVE',
            current_version_id: '33333333-3333-4333-8333-333333333333',
            valid_from: '2020-01-01T00:00:00Z',
            valid_to: '2030-01-01T00:00:00Z',
            policy: {
              currency: 'USD',
              requireInvoice: false,
              schedule: {
                timezone: 'UTC',
                days: [1, 2, 3, 4, 5, 6, 7],
                startHour: 0,
                endHour: 24,
              },
              payees: {
                ids: ['44444444-4444-4444-8444-444444444444'],
              },
            },
          }],
        };
      }

      if (sqlLower.includes('from mandate_budget_periods')) {
        return {
          rows: [{
            limit_minor: '100000',
            reserved_minor: '0',
            spent_minor: '0',
            currency: 'USD',
          }],
        };
      }

      if (sqlLower.includes('from payees')) {
        return {
          rows: [{
            id: '44444444-4444-4444-8444-444444444444',
            display_name: 'Vendor One',
            kind: 'EMAIL',
            identifier_masked: 'v***@example.com',
            trust: 'TRUSTED',
          }],
        };
      }

      if (sqlLower.includes('from documents')) {
        return {
          rows: [{
            id: '55555555-5555-4555-8555-555555555555',
            status: 'EXTRACTED',
            payee_name: 'Vendor One',
            amount_minor: '500',
            currency: 'USD',
          }],
        };
      }

      if (sqlLower.includes('from ledger_heads') || sqlLower.includes('from ledger_entries')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };
}

function baseOptions(overrides = {}) {
  return {
    env: {
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://jobenpay.example.com',
    },
    publicBaseUrl: 'https://jobenpay.example.com',
    processorHealth: {
      workerHeartbeatAgeSec: 10,
      tickHeartbeatAgeSec: 20,
      oldestPendingJobAgeSec: 5,
      deadJobs: 0,
    },
    encryptionKey,
    now: new Date('2026-11-04T12:00:00Z'),
    paypalFor: () => ({
      testConnection: async () => true,
    }),
    verifyChain: async () => ({ valid: true, checkedEntries: 0 }),
    db: makeMockDb(),
    ...overrides,
  };
}

test('PF-01: environment check PASS and FAIL scenarios', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  const pf01Pass = passRes.checks.find((c) => c.id === 'PF-01');
  assert.equal(pf01Pass.status, 'PASS');

  // FAIL: non-production
  const devRes = await runRealPreflight(testOrgId, baseOptions({
    env: { NODE_ENV: 'development' },
  }));
  const pf01Dev = devRes.checks.find((c) => c.id === 'PF-01');
  assert.equal(pf01Dev.status, 'FAIL');
  assert.match(pf01Dev.detail, /development/);

  // FAIL: override set
  const overrideRes = await runRealPreflight(testOrgId, baseOptions({
    env: { NODE_ENV: 'production', PAYPAL_API_BASE_OVERRIDE: 'https://fake.local' },
  }));
  const pf01Override = overrideRes.checks.find((c) => c.id === 'PF-01');
  assert.equal(pf01Override.status, 'FAIL');
  assert.match(pf01Override.detail, /OVERRIDE/);
});

test('PF-02: paypal connection check PASS and FAIL scenarios', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  const pf02Pass = passRes.checks.find((c) => c.id === 'PF-02');
  assert.equal(pf02Pass.status, 'PASS');

  // FAIL: connection not found
  const noConnDb = makeMockDb({
    'from paypal_connections': () => ({ rows: [] }),
  });
  const noConnRes = await runRealPreflight(testOrgId, baseOptions({ db: noConnDb }));
  assert.equal(noConnRes.checks.find((c) => c.id === 'PF-02').status, 'FAIL');

  // FAIL: status not CONNECTED
  const untestDb = makeMockDb({
    'from paypal_connections': () => ({
      rows: [{
        status: 'UNTESTED',
        webhook_id: 'WH-1',
        webhook_token: 'tok-1',
      }],
    }),
  });
  const untestRes = await runRealPreflight(testOrgId, baseOptions({ db: untestDb }));
  assert.equal(untestRes.checks.find((c) => c.id === 'PF-02').status, 'FAIL');

  // FAIL: webhook URL is localhost / IP
  const localRes = await runRealPreflight(testOrgId, baseOptions({
    publicBaseUrl: 'https://localhost:3000',
  }));
  assert.equal(localRes.checks.find((c) => c.id === 'PF-02').status, 'FAIL');
});

test('PF-03: processor health check PASS and FAIL scenarios', async () => {
  // PASS via worker
  const passWorker = await runRealPreflight(testOrgId, baseOptions({
    processorHealth: { workerHeartbeatAgeSec: 15, tickHeartbeatAgeSec: null, oldestPendingJobAgeSec: 0, deadJobs: 0 },
  }));
  assert.equal(passWorker.checks.find((c) => c.id === 'PF-03').status, 'PASS');

  // PASS via tick
  const passTick = await runRealPreflight(testOrgId, baseOptions({
    processorHealth: { workerHeartbeatAgeSec: null, tickHeartbeatAgeSec: 60, oldestPendingJobAgeSec: 0, deadJobs: 0 },
  }));
  assert.equal(passTick.checks.find((c) => c.id === 'PF-03').status, 'PASS');

  // FAIL: both stale / missing
  const failRes = await runRealPreflight(testOrgId, baseOptions({
    processorHealth: { workerHeartbeatAgeSec: 45, tickHeartbeatAgeSec: 150, oldestPendingJobAgeSec: 0, deadJobs: 0 },
  }));
  const pf03 = failRes.checks.find((c) => c.id === 'PF-03');
  assert.equal(pf03.status, 'FAIL');
  assert.match(pf03.detail, /pasang cron tick\.js/i);
});

test('PF-04: queue dead jobs and oldest pending job scenarios', async () => {
  // PASS: 0 dead, 5s oldest
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passRes.checks.find((c) => c.id === 'PF-04').status, 'PASS');

  // WARN: dead jobs > 0
  const warnRes = await runRealPreflight(testOrgId, baseOptions({
    processorHealth: { workerHeartbeatAgeSec: 10, tickHeartbeatAgeSec: 20, oldestPendingJobAgeSec: 5, deadJobs: 3 },
  }));
  const pf04Warn = warnRes.checks.find((c) => c.id === 'PF-04');
  assert.equal(pf04Warn.status, 'WARN');
  assert.match(pf04Warn.detail, /3 dead job/);

  // FAIL: oldestPendingJobAgeSec >= 300
  const failRes = await runRealPreflight(testOrgId, baseOptions({
    processorHealth: { workerHeartbeatAgeSec: 10, tickHeartbeatAgeSec: 20, oldestPendingJobAgeSec: 350, deadJobs: 0 },
  }));
  const pf04Fail = failRes.checks.find((c) => c.id === 'PF-04');
  assert.equal(pf04Fail.status, 'FAIL');
  assert.match(pf04Fail.detail, /350s/);
});

test('PF-05: organization freeze and archived checks', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passRes.checks.find((c) => c.id === 'PF-05').status, 'PASS');

  // FAIL: frozen
  const frozenDb = makeMockDb({
    'from organizations': () => ({ rows: [{ id: testOrgId, frozen_at: new Date().toISOString(), archived_at: null }] }),
  });
  const frozenRes = await runRealPreflight(testOrgId, baseOptions({ db: frozenDb }));
  assert.equal(frozenRes.checks.find((c) => c.id === 'PF-05').status, 'FAIL');

  // FAIL: archived
  const archivedDb = makeMockDb({
    'from organizations': () => ({ rows: [{ id: testOrgId, frozen_at: null, archived_at: new Date().toISOString() }] }),
  });
  const archivedRes = await runRealPreflight(testOrgId, baseOptions({ db: archivedDb }));
  assert.equal(archivedRes.checks.find((c) => c.id === 'PF-05').status, 'FAIL');
});

test('PF-06: active agent and API key scenarios', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passRes.checks.find((c) => c.id === 'PF-06').status, 'PASS');

  // FAIL: no active agent
  const noAgentDb = makeMockDb({
    'from agents': () => ({ rows: [] }),
  });
  const noAgentRes = await runRealPreflight(testOrgId, baseOptions({ db: noAgentDb }));
  assert.equal(noAgentRes.checks.find((c) => c.id === 'PF-06').status, 'FAIL');
});

test('PF-07: active USD mandate, schedule window, and remaining budget', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passRes.checks.find((c) => c.id === 'PF-07').status, 'PASS');

  // FAIL: non-USD
  const eurDb = makeMockDb({
    'from mandates': () => ({
      rows: [{
        id: '22222222-2222-4222-8222-222222222222',
        name: 'EUR Mandate',
        status: 'ACTIVE',
        current_version_id: '33333333-3333-4333-8333-333333333333',
        valid_from: '2020-01-01T00:00:00Z',
        valid_to: '2030-01-01T00:00:00Z',
        policy: {
          currency: 'EUR',
          schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
        },
      }],
    }),
  });
  const eurRes = await runRealPreflight(testOrgId, baseOptions({ db: eurDb }));
  assert.equal(eurRes.checks.find((c) => c.id === 'PF-07').status, 'FAIL');

  // FAIL: expired
  const expDb = makeMockDb({
    'from mandates': () => ({
      rows: [{
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Expired Mandate',
        status: 'ACTIVE',
        current_version_id: '33333333-3333-4333-8333-333333333333',
        valid_from: '2020-01-01T00:00:00Z',
        valid_to: '2021-01-01T00:00:00Z',
        policy: {
          currency: 'USD',
          schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
        },
      }],
    }),
  });
  const expRes = await runRealPreflight(testOrgId, baseOptions({ db: expDb }));
  assert.equal(expRes.checks.find((c) => c.id === 'PF-07').status, 'FAIL');

  // FAIL: insufficient budget (< 100 minor)
  const lowBudgetDb = makeMockDb({
    'from mandate_budget_periods': () => ({
      rows: [{
        limit_minor: '1000',
        reserved_minor: '950',
        spent_minor: '0',
        currency: 'USD',
      }],
    }),
  });
  const lowBudgetRes = await runRealPreflight(testOrgId, baseOptions({ db: lowBudgetDb }));
  assert.equal(lowBudgetRes.checks.find((c) => c.id === 'PF-07').status, 'FAIL');
});

test('PF-08: trusted email payee allowlist check', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  const pf08Pass = passRes.checks.find((c) => c.id === 'PF-08');
  assert.equal(pf08Pass.status, 'PASS');
  assert.match(pf08Pass.detail, /v\*\*\*@example\.com/);

  // FAIL: no payees
  const noPayeeDb = makeMockDb({
    'from payees': () => ({ rows: [] }),
  });
  const noPayeeRes = await runRealPreflight(testOrgId, baseOptions({ db: noPayeeDb }));
  assert.equal(noPayeeRes.checks.find((c) => c.id === 'PF-08').status, 'FAIL');
});

test('PF-09: requireInvoice scenarios', async () => {
  // PASS when requireInvoice is false
  const passFalse = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passFalse.checks.find((c) => c.id === 'PF-09').status, 'PASS');

  // PASS when requireInvoice is true and document matches
  const invDbPass = makeMockDb({
    'from mandates': () => ({
      rows: [{
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Invoice Mandate',
        status: 'ACTIVE',
        current_version_id: '33333333-3333-4333-8333-333333333333',
        valid_from: '2020-01-01T00:00:00Z',
        valid_to: '2030-01-01T00:00:00Z',
        policy: {
          currency: 'USD',
          requireInvoice: true,
          schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
          payees: { ids: ['44444444-4444-4444-8444-444444444444'] },
        },
      }],
    }),
  });
  const passInvoice = await runRealPreflight(testOrgId, baseOptions({ db: invDbPass }));
  assert.equal(passInvoice.checks.find((c) => c.id === 'PF-09').status, 'PASS');

  // FAIL when requireInvoice is true but no extracted documents
  const invDbFail = makeMockDb({
    'from mandates': () => ({
      rows: [{
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Invoice Mandate',
        status: 'ACTIVE',
        current_version_id: '33333333-3333-4333-8333-333333333333',
        valid_from: '2020-01-01T00:00:00Z',
        valid_to: '2030-01-01T00:00:00Z',
        policy: {
          currency: 'USD',
          requireInvoice: true,
          schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
          payees: { ids: ['44444444-4444-4444-8444-444444444444'] },
        },
      }],
    }),
    'from documents': () => ({ rows: [] }),
  });
  const failInvoice = await runRealPreflight(testOrgId, baseOptions({ db: invDbFail }));
  const pf09 = failInvoice.checks.find((c) => c.id === 'PF-09');
  assert.equal(pf09.status, 'FAIL');
  assert.match(pf09.detail, /Petunjuk/i);
});

test('PF-10: verifyChain ledger integrity', async () => {
  // Valid ledger
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passRes.checks.find((c) => c.id === 'PF-10').status, 'PASS');

  // Broken ledger chain
  const failRes = await runRealPreflight(testOrgId, baseOptions({
    verifyChain: async () => ({ valid: false, checkedEntries: 2, firstBrokenSeq: 2, reason: 'hash mismatch' }),
  }));
  const pf10Fail = failRes.checks.find((c) => c.id === 'PF-10');
  assert.equal(pf10Fail.status, 'FAIL');
  assert.match(pf10Fail.detail, /hash mismatch/);
});

test('PF-11: stored credentials decrypt key match / mismatch', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passRes.checks.find((c) => c.id === 'PF-11').status, 'PASS');

  // FAIL: wrong key -> KEY_MISMATCH
  const wrongKey = Buffer.alloc(32, 9).toString('base64');
  const failRes = await runRealPreflight(testOrgId, baseOptions({ encryptionKey: wrongKey }));
  const pf11 = failRes.checks.find((c) => c.id === 'PF-11');
  assert.equal(pf11.status, 'FAIL');
  assert.match(pf11.detail, /KEY_MISMATCH/);
});

test('PF-12: paypal sandbox oauth connectivity test', async () => {
  // PASS
  const passRes = await runRealPreflight(testOrgId, baseOptions());
  assert.equal(passRes.checks.find((c) => c.id === 'PF-12').status, 'PASS');

  // FAIL: throws network error
  const failRes = await runRealPreflight(testOrgId, baseOptions({
    paypalFor: () => ({
      testConnection: async () => { throw new Error('Network timeout'); },
    }),
  }));
  const pf12 = failRes.checks.find((c) => c.id === 'PF-12');
  assert.equal(pf12.status, 'FAIL');
  assert.match(pf12.detail, /Network timeout/);
});
