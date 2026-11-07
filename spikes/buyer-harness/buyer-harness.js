/**
 * spikes/buyer-harness/buyer-harness.js
 * Spike 13: Buyer Harness prototype using Playwright
 * Automates login to Sandbox personal buyer account and clicks approval.
 */

import { getSandboxCredentials } from '../lib/env.js';

export async function approveOrderWithPlaywright(approvalUrl) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.log('[BUYER HARNESS]: Playwright tidak terpasang sebagai dependency. Lewati uji browser headless.');
    return { success: false, reason: 'PLAYWRIGHT_NOT_INSTALLED' };
  }

  const creds = getSandboxCredentials();
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('[BUYER HARNESS]: Navigating to approval URL...');
    await page.goto(approvalUrl, { waitUntil: 'networkidle' });

    console.log('[BUYER HARNESS]: Logging in to Sandbox buyer account...');
    await page.fill('input#email', creds.buyerEmail);
    await page.click('button#btnNext');
    await page.fill('input#password', creds.buyerPassword);
    await page.click('button#btnLogin');

    console.log('[BUYER HARNESS]: Confirming payment...');
    await page.click('button#payment-submit-btn');
    await page.waitForNavigation({ waitUntil: 'networkidle' });

    console.log('[BUYER HARNESS]: Payment approved successfully.');
    await browser.close();
    return { success: true };
  } catch (err) {
    console.error('[BUYER HARNESS ERROR]:', err.message);
    await browser.close();
    return { success: false, error: err.message };
  }
}

