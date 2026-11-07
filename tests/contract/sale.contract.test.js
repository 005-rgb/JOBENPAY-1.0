/**
 * tests/contract/sale.contract.test.js
 * Contract test for SALE (Orders API CAPTURE) against Fake PayPal Server (Item 5 CCC, K-SALE)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import { createSaleOrder, captureSaleOrder, getSaleOrder } from '../../server/src/services/paypal/sale.js';
import './orders.contract.test.js';

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

test('Sale Adapter Contract: createSaleOrder and captureSaleOrder', async () => {
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

  const intentId = 'e0000000-0000-4000-8000-000000000001';
  const createRes = await createSaleOrder(fakeClient, {
    intentId,
    amountMinor: 250000n,
    currency: 'USD',
    description: 'Sale test order',
  });

  assert.equal(createRes.outcome, 'CREATED');
  assert.ok(createRes.orderId.startsWith('ORD-'));
  assert.ok(createRes.approvalUrl.includes('checkoutnow?token='));

  // Approve the order on fake server
  const approveRes = await fetch(`${baseUrl}/_fake/orders/${createRes.orderId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(approveRes.status, 200);

  // Capture the order
  const captureRes = await captureSaleOrder(fakeClient, {
    intentId,
    orderId: createRes.orderId,
  });

  assert.equal(captureRes.outcome, 'COMPLETED');
  assert.ok(captureRes.captureId.startsWith('CAP-'));
  assert.equal(captureRes.providerRefs.orderId, createRes.orderId);

  // Get order
  const getRes = await getSaleOrder(fakeClient, createRes.orderId);
  assert.equal(getRes.orderId, createRes.orderId);
  assert.equal(getRes.status, 'COMPLETED');
});

