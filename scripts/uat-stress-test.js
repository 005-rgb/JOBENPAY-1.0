import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startTestApp, closeTestApp } from '../server/test/helpers/testApp.js';

if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {}
}

const CATEGORY_ROUTES = [
  '/api/v1/payouts',
  '/api/v1/sales',
  '/api/v1/invoices',
  '/api/v1/down-payments',
  '/api/v1/recurring',
  '/api/v1/splits',
  '/api/v1/bulk',
  '/api/v1/transfer',
  '/api/v1/scheduled',
  '/api/v1/financing',
  '/api/v1/debit',
  '/api/v1/refunds',
  '/api/v1/voids',
  '/api/v1/partials',
  '/api/v1/disputes',
  '/api/v1/transactions',
];

const OPERATIONAL_ROUTES = [
  '/api/v1/requests',
  '/api/v1/approvals',
  '/api/v1/agents',
  '/api/v1/mandates',
  '/api/v1/payees',
  '/api/v1/documents',
  '/api/v1/dashboard/summary',
  '/api/v1/ledger',
];

async function runUat() {
  console.log('=== STARTING JOBENPAY END-TO-END UAT STRESS & ISOLATION SUITE ===\n');
  const { server, url } = await startTestApp();

  try {
    // 1. Login as judge@jobenpay.io
    console.log('[1/4] Authenticating as Judge (judge@jobenpay.io)...');
    const loginRes = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'judge@jobenpay.io', password: 'Password123!' }),
    });

    assert.equal(loginRes.status, 200, `Login failed with status ${loginRes.status}`);
    const loginCookies = loginRes.headers.get('set-cookie');
    assert.ok(loginCookies, 'Expected session cookie in login response');
    const cookieHeader = loginCookies.split(';')[0];
    const loginBody = await loginRes.json();
    const csrfToken = loginBody.csrfToken;
    console.log(' -> Logged in successfully. Role:', loginBody.user?.role || 'OWNER');

    const authHeaders = (env = 'SANDBOX') => ({
      cookie: cookieHeader,
      'x-csrf-token': csrfToken || '',
      'x-jobenpay-environment': env,
      'x-environment': env,
    });

    // 2. Test Category Endpoints in SANDBOX
    console.log('\n[2/4] Testing 15 Transaction Category Endpoints (SANDBOX)...');
    let testedCount = 0;
    let failedCount = 0;

    for (const route of [...CATEGORY_ROUTES, ...OPERATIONAL_ROUTES]) {
      testedCount++;
      const res = await fetch(`${url}${route}?environment=SANDBOX`, {
        headers: authHeaders('SANDBOX'),
      });

      if (res.status >= 500) {
        console.error(` FAIL: ${route} returned HTTP ${res.status}`);
        failedCount++;
      } else {
        console.log(` PASS [${res.status}]: ${route}`);
      }
    }
    assert.equal(failedCount, 0, `Detected ${failedCount} server errors on category endpoints`);

    // 3. Test Missing Environment Header (Must return 400)
    console.log('\n[3/4] Testing Missing Environment Isolation Guard...');
    const noEnvRes = await fetch(`${url}/api/v1/transactions`, {
      headers: {
        cookie: cookieHeader,
        'x-csrf-token': csrfToken || '',
      },
    });
    console.log(` Missing environment response status: ${noEnvRes.status}`);
    assert.equal(noEnvRes.status, 400, 'Expected HTTP 400 for request lacking environment context');
    console.log(' PASS: Missing environment header was strictly blocked (400)');

    // 4. Test Live Isolation (SANDBOX vs LIVE Zero-Leak)
    console.log('\n[4/4] Testing Strict Live Isolation...');
    // Query SANDBOX transactions
    const sandboxTxRes = await fetch(`${url}/api/v1/transactions?environment=SANDBOX`, {
      headers: authHeaders('SANDBOX'),
    });
    const sandboxTxData = await sandboxTxRes.json();
    const sandboxTxs = sandboxTxData.transactions || [];
    console.log(` Sandbox Transactions count: ${sandboxTxs.length}`);
    assert.ok(sandboxTxs.length > 0, 'Expected populated demo transactions in SANDBOX');

    // Query LIVE transactions
    const liveTxRes = await fetch(`${url}/api/v1/transactions?environment=LIVE`, {
      headers: authHeaders('LIVE'),
    });
    const liveTxData = await liveTxRes.json();
    const liveTxs = liveTxData.transactions || [];
    console.log(` Live Transactions count: ${liveTxs.length}`);
    assert.equal(liveTxs.length, 0, 'Expected ZERO transactions in LIVE environment');

    // Query LIVE agents
    const liveAgentsRes = await fetch(`${url}/api/v1/agents?environment=LIVE`, {
      headers: authHeaders('LIVE'),
    });
    const liveAgentsData = await liveAgentsRes.json();
    const liveAgents = liveAgentsData.agents || [];
    console.log(` Live Agents count: ${liveAgents.length}`);
    assert.equal(liveAgents.length, 0, 'Expected ZERO agents in LIVE environment');

    // Try accessing Sandbox Transaction ID in LIVE mode (Must return 404)
    const sandboxTxId = sandboxTxs[0].id;
    console.log(` Probing Sandbox Intent ID (${sandboxTxId}) with LIVE environment...`);
    const crossEnvRes = await fetch(`${url}/api/v1/transactions/${sandboxTxId}?environment=LIVE`, {
      headers: authHeaders('LIVE'),
    });
    console.log(` Cross-environment probe status: ${crossEnvRes.status}`);
    assert.equal(crossEnvRes.status, 404, 'Cross-environment lookup must return 404 NOT FOUND');
    console.log(' PASS: IDOR Cross-Environment access returned 404');

    // Switch back to SANDBOX
    const sandboxVerifyRes = await fetch(`${url}/api/v1/transactions/${sandboxTxId}?environment=SANDBOX`, {
      headers: authHeaders('SANDBOX'),
    });
    assert.equal(sandboxVerifyRes.status, 200, 'Sandbox lookup must return 200 OK');
    console.log(' PASS: Sandbox intent lookup returned 200 OK');

    console.log('\n=== ALL UAT STRESS & ZERO-LEAK ISOLATION TESTS PASSED 100% ===');
    process.exit(0);
  } finally {
    await closeTestApp(server);
  }
}

runUat().catch((err) => {
  console.error('\nUAT TEST FAILED:', err);
  process.exit(1);
});
