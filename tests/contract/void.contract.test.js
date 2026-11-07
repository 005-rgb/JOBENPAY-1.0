/**
 * tests/contract/void.contract.test.js
 * Contract test for VOID (Authorization Void) against Fake PayPal Server (Item 5 CCC, K-VOID)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import { voidAuthorization, voidOrderInternal } from '../../server/src/services/paypal/void.js';
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

test('Void Adapter Contract: voidAuthorization and voidOrderInternal', async () => {
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

  // 1. Create and authorize an order first to get authorizationId
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '250.00' } }],
    }),
  });
  const order = await createRes.json();

  const authRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const authOrder = await authRes.json();
  const authId = authOrder.purchase_units[0].payments.authorizations[0].id;

  // 2. Call void adapter
  const intentId = 'e0000000-0000-4000-8000-000000000066';
  const voidResult = await voidAuthorization(fakeClient, {
    intentId,
    authorizationId: authId,
  });

  assert.equal(voidResult.outcome, 'COMPLETED');
  assert.equal(voidResult.status, 'VOIDED');
  assert.equal(voidResult.authorizationId, authId);

  // 3. Verify capture after void is rejected by PayPal
  const captureAttemptRes = await fetch(`${baseUrl}/v2/payments/authorizations/${authId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ final_capture: true }),
  });
  assert.equal(captureAttemptRes.status, 422);
  const errData = await captureAttemptRes.json();
  assert.equal(errData.name, 'AUTHORIZATION_VOIDED');

  // 4. Test internal order void (AD-11)
  const orderVoidRes = await voidOrderInternal({
    intentId: 'e0000000-0000-4000-8000-000000000067',
    orderId: 'ORD-INTERNAL-001',
  });
  assert.equal(orderVoidRes.outcome, 'COMPLETED');
  assert.equal(orderVoidRes.status, 'VOIDED');
  assert.equal(orderVoidRes.internal, true);
});

