/**
 * tests/contract/invoicing.contract.test.js
 * Contract test untuk Invoicing API v2.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';

let server;
let baseUrl;

test.before(async () => {
  server = createFakePayPalServer();
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test.beforeEach(async () => {
  await fetch(`${baseUrl}/_fake/reset`, { method: 'POST' });
});

test('Contract: Invoicing Lifecycle (Draft -> Send -> Pay -> Show)', async () => {
  const payload = {
    detail: {
      invoice_number: 'INV-CONTRACT-001',
      invoice_date: '2026-11-06',
      currency_code: 'USD'
    },
    amount: {
      currency_code: 'USD',
      value: '220.00'
    }
  };

  // 1. Create Invoice (DRAFT)
  const createRes = await fetch(`${baseUrl}/v2/invoicing/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(createRes.status, 201);
  const invoice = await createRes.json();
  const invId = invoice.id;
  assert.ok(invId.startsWith('INV2-'));
  assert.equal(invoice.status, 'DRAFT');

  // 2. Send Invoice (SENT)
  const sendRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${invId}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(sendRes.status, 202);

  // 3. Record Payment (PAID)
  const payRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${invId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'BANK_TRANSFER',
      amount: { currency_code: 'USD', value: '220.00' }
    })
  });
  assert.equal(payRes.status, 200);
  const payData = await payRes.json();
  assert.ok(payData.payment_id);

  // 4. Verify Final Invoice Status
  const getRes = await fetch(`${baseUrl}/v2/invoicing/invoices/${invId}`);
  assert.equal(getRes.status, 200);
  const finalInvoice = await getRes.json();
  assert.equal(finalInvoice.status, 'PAID');
});

