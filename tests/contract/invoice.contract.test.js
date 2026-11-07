/**
 * tests/contract/invoice.contract.test.js
 * Contract test for INVOICE against Fake PayPal Server (Item 5 CCC, K-INVOICE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import {
  createInvoice,
  sendInvoice,
  recordPayment,
  cancelInvoice,
} from '../../server/src/services/paypal/invoice.js';
import './payments.contract.test.js';

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

test('Invoice Adapter Contract: create, send, pay, and cancel', async () => {
  let capturedHeaders = null;
  const fakeClient = {
    async request(method, path, options = {}) {
      capturedHeaders = options.headers;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: options.headers || {},
        body: options.body,
      });
      const text = await res.text();
      return text ? JSON.parse(text) : { status: res.status };
    },
  };

  const intentId = 'e0000000-0000-4000-8000-000000000141';

  // 1. Create Invoice
  const createRes = await createInvoice(fakeClient, {
    intentId,
    invoiceNumber: 'INV-2026-001',
    amountMinor: 15000n,
    currency: 'USD',
    dueDate: '2026-12-01',
    step: 'invoice_create',
  });

  assert.equal(createRes.outcome, 'CREATED');
  assert.ok(createRes.invoiceId);
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId}_invoice_create`);

  // 2. Send Invoice
  const sendRes = await sendInvoice(fakeClient, {
    intentId,
    invoiceId: createRes.invoiceId,
    step: 'invoice_send',
  });

  assert.equal(sendRes.outcome, 'SENT');
  assert.equal(sendRes.status, 'SENT');
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId}_invoice_send`);

  // 3. Record Payment
  const payRes = await recordPayment(fakeClient, {
    intentId,
    invoiceId: createRes.invoiceId,
    amountMinor: 15000n,
    currency: 'USD',
    step: 'invoice_pay',
  });

  assert.equal(payRes.outcome, 'COMPLETED');
  assert.equal(payRes.status, 'PAID');
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId}_invoice_pay`);

  // 4. Cancel a second invoice
  const intentId2 = 'e0000000-0000-4000-8000-000000000142';
  const createRes2 = await createInvoice(fakeClient, {
    intentId: intentId2,
    invoiceNumber: 'INV-2026-002',
    amountMinor: 5000n,
    currency: 'USD',
    dueDate: '2026-12-15',
    step: 'invoice_create',
  });

  const cancelRes = await cancelInvoice(fakeClient, {
    intentId: intentId2,
    invoiceId: createRes2.invoiceId,
    step: 'invoice_cancel',
  });

  assert.equal(cancelRes.outcome, 'CANCELLED');
  assert.equal(cancelRes.status, 'CANCELLED');
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId2}_invoice_cancel`);
});
