/**
 * tests/contract/refund.contract.test.js
 * Contract test for REFUND against Fake PayPal Server (Item 5 CCC, K-REFUND)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import { refundCapture, getRefund } from '../../server/src/services/paypal/refund.js';
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

test('Refund Adapter Contract: refundCapture and getRefund', async () => {
  const fakeClient = {
    async request(method, path, options = {}) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: options.headers || {},
        body: options.body,
      });
      return await res.json();
    },
  };

  // 1. Create and capture an order first to obtain captureId
  const createOrderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '150.00' } }],
    }),
  });
  const order = await createOrderRes.json();
  const capRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const capOrder = await capRes.json();
  const captureId = capOrder.purchase_units[0].payments.captures[0].id;

  // 2. Call refund adapter
  const intentId = 'e0000000-0000-4000-8000-000000000099';
  const refundResult = await refundCapture(fakeClient, {
    intentId,
    captureId,
    amountMinor: 15000n,
    currency: 'USD',
    noteToPayer: 'Test partial refund',
  });

  assert.equal(refundResult.outcome, 'COMPLETED');
  assert.ok(refundResult.refundId.startsWith('REF-'));
  assert.equal(refundResult.providerRefs.captureId, captureId);

  // 3. Get refund details
  const getRes = await getRefund(fakeClient, refundResult.refundId);
  assert.equal(getRes.refundId, refundResult.refundId);
  assert.equal(getRes.status, 'COMPLETED');
});

