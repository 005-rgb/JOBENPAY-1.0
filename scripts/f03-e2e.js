import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createFakePaypalServer } from '../server/test/helpers/fake-paypal.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireWeb = createRequire(path.join(root, 'web', 'package.json'));
const { chromium, expect } = requireWeb('@playwright/test');
const password = process.env.SEED_OWNER_PASSWORD || 'E2E-Owner-Password-2026!';

function assertEnvironment() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must point to a dedicated E2E PostgreSQL database.');
  }
  if (!process.env.SEED_OWNER_PASSWORD || process.env.SEED_OWNER_PASSWORD.length < 12) {
    throw new Error('SEED_OWNER_PASSWORD must be configured for the E2E owner account.');
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

async function main() {
  assertEnvironment();
  process.chdir(root);
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.JOBENPAY_ENC_KEY = crypto.randomBytes(32).toString('base64');
  process.env.JOBENPAY_LEDGER_SIGNING_KEY = crypto.generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  process.env.JOBENPAY_HMAC_PEPPER = crypto.randomBytes(32).toString('base64');

  const { runMigrations } = await import('../server/scripts/migrate.js');
  const { seedDemoData } = await import('../server/scripts/seed.js');
  const pool = (await import('../server/src/db/pool.js')).default;
  let fakePaypal;
  let appProcess;
  let browser;

  try {
    await runMigrations(process.env.DATABASE_URL);
    await seedDemoData(pool, { write: () => {} });
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

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${appUrl}/login`);
    await page.getByLabel('Email').fill('owner@jobenpay.test');
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'SYNTHETIC OWNER' })).toBeVisible();

    await page.getByRole('button', { name: 'Business Tools' }).click();
    await page.getByRole('link', { name: 'PayPal Sandbox' }).click();
    await page.getByLabel('Client ID').fill('test-client');
    await page.getByLabel('Client secret').fill('test-secret');
    await page.getByLabel('Webhook ID').fill('test-webhook');
    await page.getByRole('button', { name: 'Save connection' }).click();
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByText('CONNECTED', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Agents & Mandates' }).click();
    await page.getByRole('link', { name: 'Agents', exact: true }).click();
    await page.getByRole('button', { name: 'New agent' }).click();
    await page.getByLabel('Agent name').fill('E2E Agent');
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E2E Agent' })).toBeVisible();
    await page.getByRole('button', { name: 'Create API key' }).click();
    await expect(page.locator('code').filter({ hasText: 'jp_sbx_' })).toBeVisible();

    await page.getByRole('button', { name: 'Pay & Get Paid' }).click();
    await page.getByRole('link', { name: 'Payees', exact: true }).click();
    await page.getByRole('button', { name: 'New payee' }).click();
    await page.getByLabel('Display name').fill('E2E Payee');
    await page.getByLabel('Identifier').fill('e2e-payee@synthetic.test');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('link', { name: 'E2E Payee' })).toBeVisible();

    const businessTools = page.getByRole('button', { name: 'Business Tools' });
    if (await businessTools.getAttribute('aria-expanded') !== 'true') await businessTools.click();
    await page.getByRole('link', { name: 'Security', exact: true }).click();
    await page.getByRole('button', { name: 'Freeze organization' }).click();
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: 'Kill switch active' })).toBeVisible();
    await page.getByRole('button', { name: 'Unfreeze organization' }).click();
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.locator('[role="alert"]').filter({ hasText: 'Kill switch active' })).toHaveCount(0);
  } finally {
    if (browser) await browser.close();
    await stopChild(appProcess);
    if (fakePaypal) await fakePaypal.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
