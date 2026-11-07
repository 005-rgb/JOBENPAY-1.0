/**
 * tests/contract/orders.contract.test.js
 * Contract test untuk Orders API v2 (SALE, DOWN_PAYMENT).
 * Membandingkan bentuk respons Fake PayPal dengan cassette dan skema resmi.
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

test('Contract: OAuth 2.0 Token Generation', async () => {
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.token_type, 'Bearer');
  assert.ok(typeof data.access_token === 'string' && data.access_token.length > 0);
  assert.ok(typeof data.expires_in === 'number');
});

test('Contract: Order Create with CAPTURE intent matches schema', async () => {
  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: 'pu_001',
        amount: { currency_code: 'USD', value: '100.00' }
      }
    ]
  };

  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PayPal-Request-Id': 'req_ord_create_001'
    },
    body: JSON.stringify(payload)
  });

  assert.equal(res.status, 201);
  const data = await res.json();
  assert.ok(data.id.startsWith('ORD-'));
  assert.equal(data.status, 'CREATED');
  assert.equal(data.intent, 'CAPTURE');
  assert.ok(Array.isArray(data.links));
  assert.ok(data.links.some((l) => l.rel === 'approve'));
  assert.ok(data.links.some((l) => l.rel === 'capture'));
});

test('Contract: Order Capture lifecycle (create -> capture)', async () => {
  // 1. Create Order
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '50.00' } }]
    })
  });
  const order = await createRes.json();

  // 2. Capture Order
  const capRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  assert.equal(capRes.status, 201);
  const capturedOrder = await capRes.json();
  assert.equal(capturedOrder.status, 'COMPLETED');
  const captureUnit = capturedOrder.purchase_units[0].payments.captures[0];
  assert.ok(captureUnit.id.startsWith('CAP-'));
  assert.equal(captureUnit.status, 'COMPLETED');
  assert.equal(captureUnit.amount.value, '50.00');

  // 3. Double Capture ditolak 422
  const reCapRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(reCapRes.status, 422);
});

test('Contract: Order Authorize lifecycle (create -> authorize)', async () => {
  // 1. Create Order with AUTHORIZE
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '250.00' } }]
    })
  });
  const order = await createRes.json();
  assert.equal(order.intent, 'AUTHORIZE');

  // 2. Authorize Order
  const authRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  assert.equal(authRes.status, 201);
  const authorizedOrder = await authRes.json();
  assert.equal(authorizedOrder.status, 'COMPLETED');
  const authObj = authorizedOrder.purchase_units[0].payments.authorizations[0];
  assert.ok(authObj.id.startsWith('AUTH-'));
  assert.equal(authObj.status, 'CREATED');
  assert.ok(authObj.expiration_time);
});

test('Contract: PayPal-Request-Id Idempotency Enforcement', async () => {
  const payload1 = {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'USD', value: '75.00' } }]
  };

  // Panggilan 1
  const res1 = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PayPal-Request-Id': 'same_request_id_test'
    },
    body: JSON.stringify(payload1)
  });
  assert.equal(res1.status, 201);
  const data1 = await res1.json();

  // Panggilan 2: Payload identik -> Harap replay data1
  const res2 = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PayPal-Request-Id': 'same_request_id_test'
    },
    body: JSON.stringify(payload1)
  });
  assert.equal(res2.status, 201);
  const data2 = await res2.json();
  assert.equal(data2.id, data1.id);

  // Panggilan 3: Kunci sama, tapi payload diubah -> Wajib 422 IDEMPOTENCY_KEY_REUSED
  const payload2 = {
    intent: 'CAPTURE',
    purchase_units: [{ amount: { currency_code: 'USD', value: '999.00' } }]
  };
  const res3 = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'PayPal-Request-Id': 'same_request_id_test'
    },
    body: JSON.stringify(payload2)
  });
  assert.equal(res3.status, 422);
  const errData = await res3.json();
  assert.equal(errData.name, 'IDEMPOTENCY_KEY_REUSED');
});

