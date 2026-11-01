import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import { createFakePaypalServer } from '../server/test/helpers/fake-paypal.js';
import { recordingPath } from '../server/src/ai/replay.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(root, 'web', 'package.json'));
const { chromium, expect } = requireWeb('@playwright/test');
const password = process.env.SEED_OWNER_PASSWORD || crypto.randomBytes(24).toString('base64');

function assertEnvironment() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must point to a dedicated E2E PostgreSQL database.');
  }
  if (password.length < 12) {
    throw new Error('The E2E owner password must contain at least 12 characters.');
  }
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitForApp(child, url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming ready with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error('Server did not become ready in time.');
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

function runJudgeSmokeScript(baseUrl, password) {
  return new Promise((resolve, reject) => {
    const smoke = spawn(process.execPath, ['scripts/judge-smoke.js'], {
      cwd: root,
      env: {
        ...process.env,
        JUDGE_SMOKE_URL: baseUrl,
        JUDGE_SMOKE_EMAIL: 'judge@jobenpay.test',
        JUDGE_SMOKE_PASSWORD: password,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    smoke.stdout.setEncoding('utf8');
    smoke.stderr.setEncoding('utf8');
    smoke.stdout.on('data', (chunk) => { output += chunk; });
    smoke.stderr.on('data', (chunk) => { output += chunk; });
    smoke.once('error', reject);
    smoke.once('close', (code) => {
      if (code === 0) {
        process.stdout.write(output);
        resolve();
      } else {
        reject(new Error(`judge-smoke.js exited with code ${code}: ${output}`));
      }
    });
  });
}

async function main() {
  assertEnvironment();
  process.chdir(root);
  const schema = `f03_e2e_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const isolatedUrl = new URL(process.env.TEST_DATABASE_URL);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema},public`);
  process.env.DATABASE_URL = isolatedUrl.toString();
  process.env.NODE_ENV = 'test';
  process.env.JOBENPAY_ENC_KEY ||= crypto.randomBytes(32).toString('base64');
  process.env.JOBENPAY_LEDGER_SIGNING_KEY ||= crypto.generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  process.env.JOBENPAY_HMAC_PEPPER ||= crypto.randomBytes(32).toString('base64');
  process.env.AI_PROVIDER = 'replay';
  process.env.SEED_OWNER_PASSWORD = password;
  process.env.SEED_JUDGE_PASSWORD ||= crypto.randomBytes(24).toString('base64');

  let pool;
  let fakePaypal;
  let appProcess;
  let browser;
  let e2eRecording;

  try {
    const { runMigrations } = await import('../server/scripts/migrate.js');
    const { seedDemoData } = await import('../server/scripts/seed.js');
    const { hashPassword } = await import('../server/src/lib/crypto.js');
    pool = (await import('../server/src/db/pool.js')).default;
    const { verifyChain } = await import('../server/src/services/ledger.js');
    await runMigrations(process.env.DATABASE_URL);
    await seedDemoData(pool, { write: () => {} });
    await pool.query(
      `UPDATE users SET password_hash = $1, failed_login_count = 0, locked_until = NULL
       WHERE lower(email) = lower($2)`,
      [await hashPassword(password), 'owner@jobenpay.test'],
    );
    await pool.query("DELETE FROM rate_limit_buckets WHERE key LIKE 'login:%'");
    const demoOrg = await pool.query("SELECT id FROM organizations WHERE slug = 'jobenpay-demo' LIMIT 1");
    if (demoOrg.rows[0]) {
      await pool.query('DELETE FROM paypal_connections WHERE org_id = $1', [demoOrg.rows[0].id]);
    }
    fakePaypal = await createFakePaypalServer();

    const port = await availablePort();
    const appUrl = `http://127.0.0.1:${port}`;
    appProcess = spawn(process.execPath, ['server/src/server.js'], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        PUBLIC_BASE_URL: appUrl,
        PAYPAL_API_BASE_OVERRIDE: fakePaypal.baseUrl,
        WORKER_ENABLED: '0',
        AI_PROVIDER: 'replay',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let serverOutput = '';
    appProcess.stdout.setEncoding('utf8');
    appProcess.stderr.setEncoding('utf8');
    appProcess.stdout.on('data', (chunk) => { serverOutput += chunk; });
    appProcess.stderr.on('data', (chunk) => { serverOutput += chunk; });
    try {
      await waitForApp(appProcess, `${appUrl}/login`);
    } catch (error) {
      throw new Error(`${error.message} ${serverOutput}`);
    }

    const launchOptions = { headless: true };
    if (process.env.CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    }
    browser = await chromium.launch(launchOptions);
    const page = await browser.newPage();
    const cspViolations = [];
    await page.addInitScript(() => {
      globalThis.__cspViolations = [];
      globalThis.document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__cspViolations.push({
          effectiveDirective: event.effectiveDirective,
          violatedDirective: event.violatedDirective,
          blockedURI: event.blockedURI,
          sample: event.sample,
        });
      });
    });
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy|violates the following/i.test(message.text())) {
        const location = message.location();
        cspViolations.push(`${message.text()} (${location.url}:${location.lineNumber})`);
      }
    });
    await page.goto(`${appUrl}/login`);
    await page.getByLabel('Email').fill('owner@jobenpay.test');
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByTestId('page-title')).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByTestId('create-button').click();
    await expect(page.getByRole('menu')).toBeVisible();
    if (cspViolations.length) {
      const details = await page.evaluate(() => globalThis.__cspViolations);
      throw new Error(`Dropdown CSP violation: ${cspViolations.join('; ')} ${JSON.stringify(details)}`);
    }
    await page.keyboard.press('Escape');
    await page.getByTestId('notification-button').click();
    await expect(page.getByText('Notifications', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    if (cspViolations.length) throw new Error(`Popover CSP violation: ${cspViolations.join('; ')}`);

    const journeySuffix = crypto.randomUUID().slice(0, 8);
    const agentName = `E2E Agent ${journeySuffix}`;
    const payeeName = `E2E Payee ${journeySuffix}`;
    await page.getByRole('button', { name: 'Business Tools' }).click();
    await page.getByTestId('nav-list').getByRole('link', { name: 'PayPal Sandbox' }).click();
    await expect(page).toHaveURL(/\/settings\/paypal$/);
    await page.getByLabel('Client ID').waitFor({ timeout: 10000 }).catch(async () => {
      const body = await page.locator('body').innerText();
      throw new Error(`PayPal settings form did not load at ${page.url()}: ${body.slice(0, 1000)}`);
    });
    await page.getByLabel('Client ID').fill('test-client');
    await page.getByLabel('Client secret').fill('test-secret');
    await page.getByLabel('Webhook ID').fill('test-webhook');
    await page.getByRole('button', { name: 'Save connection' }).click();
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByText('CONNECTED', { exact: true }).first()).toBeVisible();

    const agentsNavigation = page.getByRole('button', { name: 'Agents & Mandates' });
    if (await agentsNavigation.getAttribute('aria-expanded') !== 'true') await agentsNavigation.click();
    await page.getByRole('link', { name: 'Agents', exact: true }).click();
    await page.getByRole('button', { name: 'New agent' }).click();
    await page.getByLabel('Agent name').fill(agentName);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: agentName })).toBeVisible();
    await page.getByRole('button', { name: 'Create API key' }).click();
    await expect(page.locator('code').filter({ hasText: 'jp_sbx_' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Pay & Get Paid' }).click();
    await page.getByRole('link', { name: 'Payees', exact: true }).click();
    await page.getByRole('button', { name: 'New payee' }).click();
    await page.getByLabel('Display name').fill(payeeName);
    await page.getByLabel('Identifier').fill(`e2e-${journeySuffix}@synthetic.test`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('link', { name: payeeName })).toBeVisible();

    const ownerOrg = await pool.query(
      `SELECT m.org_id FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE lower(u.email) = lower($1) ORDER BY m.created_at LIMIT 1`,
      ['owner@jobenpay.test'],
    );
    const e2eOrgId = ownerOrg.rows[0]?.org_id;
    const e2eAgent = await pool.query(
      'SELECT id FROM agents WHERE org_id = $1 AND name = $2 ORDER BY created_at DESC LIMIT 1',
      [e2eOrgId, agentName],
    );
    const e2ePayee = await pool.query(
      'SELECT id FROM payees WHERE org_id = $1 AND display_name = $2 ORDER BY created_at DESC LIMIT 1',
      [e2eOrgId, payeeName],
    );
    const existingPayees = await pool.query(
      'SELECT id, display_name FROM payees WHERE org_id = $1 ORDER BY created_at DESC, id',
      [e2eOrgId],
    );
    const purposeText = `Pay listed suppliers max USD 500 per transaction, monthly budget USD 3,000, invoice optional ${journeySuffix}`;
    const draftInput = {
      purposeText,
      existingPayees: existingPayees.rows.map((payee) => ({ id: payee.id, displayName: payee.display_name })),
    };
    e2eRecording = recordingPath('mandateDraft', draftInput);
    await mkdir(path.dirname(e2eRecording), { recursive: true });
    const now = new Date();
    const validTo = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    await writeFile(e2eRecording, JSON.stringify({
      result: {
        schemaVersion: 1,
        purpose: purposeText,
        allowedActions: ['PAYOUT'],
        currency: 'USD',
        perTransactionCapMinor: 50000,
        budget: { period: 'MONTH', limitMinor: 300000 },
        autoApproveBelowMinor: 1000,
        payees: { mode: 'ALLOWLIST', ids: [e2ePayee.rows[0].id] },
        allowNewPayees: false,
        schedule: { timezone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
        velocity: { maxRequestsPerHour: 10, maxPayoutPerPayeePerDay: 3 },
        duplicateWindowHours: 24,
        requireInvoice: false,
        invoiceAmountToleranceMinor: 0,
        ai: { intentCheck: true, escalateOnRiskAtOrAbove: 50, blockOnRiskAtOrAbove: 80 },
        stepUpApprovalAboveMinor: 1500,
        fourEyesAboveMinor: 300000,
        approvalTtlHours: 24,
        validFrom: now.toISOString(),
        validTo: validTo.toISOString(),
      },
      usage: { inputTokens: 0, outputTokens: 0 },
    }));

    const mandatesNavigation = page.getByRole('button', { name: 'Agents & Mandates' });
    if (await mandatesNavigation.getAttribute('aria-expanded') !== 'true') await mandatesNavigation.click();
    await page.getByRole('link', { name: 'Mandates', exact: true }).click();
    await page.getByRole('link', { name: 'New mandate' }).click();
    await page.getByLabel('Agent').selectOption({ label: agentName });
    await page.getByLabel('Purpose in natural language').fill(purposeText);
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect(page.getByRole('heading', { name: 'Draft preview and diff' })).toBeVisible();
    await page.getByLabel('Require invoice').uncheck();
    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.getByRole('heading', { name: purposeText })).toBeVisible();
    await page.getByRole('button', { name: 'Activate' }).click();
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('ACTIVE', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Budget usage' })).toBeVisible();

    const proposal = spawn(process.execPath, [
      'server/scripts/propose.js',
      '--agent', e2eAgent.rows[0].id,
      '--payee', e2ePayee.rows[0].id,
      '--amount', '1000',
      '--currency', 'USD',
    ], { cwd: root, env: { ...process.env, ORG_ID: e2eOrgId }, stdio: ['ignore', 'pipe', 'pipe'] });
    let proposalOutput = '';
    proposal.stdout.setEncoding('utf8');
    proposal.stderr.setEncoding('utf8');
    proposal.stdout.on('data', (chunk) => { proposalOutput += chunk; });
    proposal.stderr.on('data', (chunk) => { proposalOutput += chunk; });
    const proposalExit = await new Promise((resolve) => proposal.once('close', resolve));
    if (proposalExit !== 0) throw new Error(`J4 proposal failed: ${proposalOutput}`);
    const proposalResult = JSON.parse(proposalOutput);
    if (proposalResult.decision !== 'REQUIRE_APPROVAL') {
      throw new Error(`J4 proposal expected REQUIRE_APPROVAL, received ${proposalResult.decision}.`);
    }

    await page.goto(`${appUrl}/approvals`);
    const approvalLink = page.getByRole('link', { name: new RegExp(proposalResult.requestId) });
    await expect(approvalLink).toBeVisible();
    await approvalLink.click();
    await expect(page.getByRole('heading', { name: 'Review request' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approval approved.')).toBeVisible();
    await page.goto(`${appUrl}/requests/${proposalResult.requestId}`);
    await expect(page.getByText('APPROVED', { exact: true }).first()).toBeVisible();
    const executionJob = await pool.query(
      `SELECT count(*)::integer AS count FROM jobs
       WHERE org_id = $1 AND type = 'execute_request' AND dedupe_key = $2`,
      [e2eOrgId, `exec:${proposalResult.requestId}`],
    );
    if (executionJob.rows[0].count !== 1) throw new Error('J4 approval did not enqueue its execute_request job.');

    await page.goto(`${appUrl}/ledger`);
    const verifyResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/v1/ledger/verify'));
    await page.getByRole('button', { name: 'Verify ledger' }).click();
    const verifyResponse = await verifyResponsePromise;
    const verifyResult = await verifyResponse.json();
    if (!verifyResponse.ok() || !verifyResult.valid) {
      throw new Error(`J6 ledger verification failed: ${JSON.stringify(verifyResult)}`);
    }
    await expect(page.getByText('Ledger verified')).toBeVisible();
    await expect(page.getByText(/\d+ entries checked/)).toBeVisible();
    const ledgerDownloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export JSON' }).click();
    const ledgerDownload = await ledgerDownloadPromise;
    if (ledgerDownload.suggestedFilename() !== 'ledger.json') throw new Error('Ledger export did not stream a JSON download.');

    await page.goto(`${appUrl}/audit`);
    await expect(page.getByRole('heading', { name: 'Audit', level: 2 })).toBeVisible();

    await page.goto(`${appUrl}/simulator`);
    await page.getByRole('button', { name: 'Run legit invoice' }).click();
    await expect(page.getByText('PASS', { exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset demo budget' }).click();
    await expect(page.getByText(/Demo budget reset/)).toBeVisible();
    await page.getByRole('button', { name: 'Run attack pack' }).click();
    await expect(page.getByText('PASS', { exact: true })).toHaveCount(2);
    await page.getByRole('button', { name: 'Reset demo budget' }).click();
    await expect(page.getByText(/Demo budget reset/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'View' }).first()).toBeVisible();

    await page.goto(`${appUrl}/developer`);
    await expect(page.getByRole('heading', { name: 'MCP server' })).toBeVisible();
    await expect(page.getByText(/\/mcp/).first()).toBeVisible();
    for (const tool of ['propose_payout', 'get_request_status', 'get_budget_status']) {
      await expect(page.getByText(tool, { exact: true })).toBeVisible();
    }
    await runJudgeSmokeScript(appUrl, process.env.SEED_JUDGE_PASSWORD);

    const businessTools = page.getByRole('button', { name: 'Business Tools' });
    if (await businessTools.getAttribute('aria-expanded') !== 'true') await businessTools.click();
    await page.getByTestId('nav-list').getByRole('link', { name: 'Security', exact: true }).click();
    await page.getByRole('button', { name: 'Freeze organization' }).click();
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: 'Kill switch active' })).toBeVisible();
    await page.goto(`${appUrl}/simulator`);
    const frozenRunResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/v1/simulator/run'));
    await page.getByRole('button', { name: 'Run attack pack' }).click();
    const frozenRunResponse = await frozenRunResponsePromise;
    const frozenRunResult = await frozenRunResponse.json();
    const frozenReasonCodes = frozenRunResult.results?.flatMap((result) => result.reasonCodes ?? []) ?? [];
    if (!frozenRunResponse.ok() || frozenReasonCodes.filter((code) => code === 'ORG_FROZEN').length !== 2) {
      throw new Error(`J8 frozen simulator proposal did not return ORG_FROZEN: ${JSON.stringify(frozenRunResult)}`);
    }
    await page.goto(`${appUrl}/settings/security`);
    await page.getByRole('button', { name: 'Unfreeze organization' }).click();
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: 'Kill switch active' })).toHaveCount(0);

    const oldOrg = await page.evaluate(async () => fetch('/api/v1/auth/me').then((response) => response.json()));
    const oldOrgId = oldOrg.org?.id;
    if (!oldOrgId) throw new Error(`Could not load the active demo organization: ${JSON.stringify(oldOrg)}`);
    await page.goto(`${appUrl}/simulator`);
    await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
    const resetDialog = page.getByRole('dialog');
    await expect(resetDialog).toBeVisible();
    const resetResponsePromise = page.waitForResponse((response) => response.url().endsWith('/api/v1/admin/demo-reset'));
    await resetDialog.getByRole('button', { name: 'Reset demo data', exact: true }).click();
    const resetResponse = await resetResponsePromise;
    const resetResult = await resetResponse.json();
    if (!resetResponse.ok() || resetResult.archivedOrganizationId !== oldOrgId
      || resetResult.organizationId === oldOrgId) {
      throw new Error(`Demo reset did not create and archive distinct organizations: ${JSON.stringify(resetResult)}`);
    }
    const newOrg = await page.evaluate(async () => fetch('/api/v1/auth/me').then((response) => response.json()));
    if (newOrg.org.id !== resetResult.organizationId || newOrg.role !== 'OWNER') {
      throw new Error('Owner session did not move to the new demo organization.');
    }
    const archivedLedger = await verifyChain(oldOrgId);
    if (!archivedLedger.valid) throw new Error('Archived organization ledger no longer verifies.');
    const resetLedger = await pool.query(
      'SELECT 1 FROM ledger_entries WHERE org_id = $1 AND type = $2 LIMIT 1',
      [resetResult.organizationId, 'DEMO_RESET'],
    );
    if (!resetLedger.rowCount) throw new Error('New organization ledger is missing DEMO_RESET.');

    const archivedSessionId = crypto.randomUUID();
    const archivedSessionToken = crypto.randomBytes(32).toString('hex');
    const archivedCsrfToken = crypto.randomBytes(32).toString('hex');
    const ownerUser = await pool.query(
      'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
      ['owner@jobenpay.test'],
    );
    await pool.query(
      `INSERT INTO sessions (id, id_hash, user_id, current_org_id, csrf_secret, expires_at)
       VALUES ($1,$2,$3,$4,$5,now() + interval '1 hour')`,
      [
        archivedSessionId,
        crypto.createHash('sha256').update(archivedSessionToken).digest('hex'),
        ownerUser.rows[0].id,
        oldOrgId,
        archivedCsrfToken,
      ],
    );
    try {
      const archivedMutation = await fetch(`${appUrl}/api/v1/feedback`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `jp_sid=${archivedSessionToken}`,
          'x-csrf-token': archivedCsrfToken,
        },
        body: JSON.stringify({ message: 'archived write probe' }),
      });
      if (archivedMutation.status !== 409 || (await archivedMutation.json()).error?.code !== 'ORG_ARCHIVED') {
        throw new Error('Archived organization accepted a mutation.');
      }
    } finally {
      await pool.query('DELETE FROM sessions WHERE id = $1', [archivedSessionId]);
    }
    for (const secret of [password, process.env.SEED_JUDGE_PASSWORD, 'test-client', 'test-secret']) {
      if (secret && serverOutput.includes(secret)) {
        throw new Error('Server log output included a configured credential.');
      }
    }
  } finally {
    if (browser) await browser.close();
    await stopChild(appProcess);
    if (fakePaypal) await fakePaypal.close();
    if (e2eRecording) await rm(e2eRecording, { force: true });
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
