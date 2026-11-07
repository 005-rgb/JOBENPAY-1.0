/**
 * tests/contract/down_payment.contract.test.js
 * Contract test for DOWN_PAYMENT against Fake PayPal Server (Item 5 CCC, K-DOWN_PAYMENT)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import {
  captureInitialDownPayment,
  captureSettlement,
  voidForfeitedAuthorization,
} from '../../server/src/services/paypal/down_payment.js';
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

test('Down Payment Adapter Contract: Initial DP, Settlement, and Forfeit Void', async () => {
  let capturedHeaders = null;
  const fakeClient = {
    async request(method, path, options = {}) {
      capturedHeaders = options.headers;
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: options.headers || {},
        body: options.body,
      });
      return await res.json();
    },
  };

  // 1. Order Setup with intent: AUTHORIZE ($500.00)
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '500.00' } }],
    }),
  });
  const order = await createRes.json();

  const authRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const authOrder = await authRes.json();
  const authId = authOrder.purchase_units[0].payments.authorizations[0].id;
  assert.ok(authId, 'Authorization ID must be returned');

  // 2. Initial Down Payment ($100.00, non-final)
  const intentId1 = 'e0000000-0000-4000-8000-000000000091';
  const initResult = await captureInitialDownPayment(fakeClient, {
    intentId: intentId1,
    authorizationId: authId,
    dpAmountMinor: 10000n,
    currency: 'USD',
    step: 'dp_initial',
  });

  assert.equal(initResult.outcome, 'COMPLETED');
  assert.equal(initResult.status, 'DP_PAID');
  assert.ok(initResult.captureId);
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId1}_dp_initial`);

  // 3. Final Settlement ($400.00, final)
  const intentId2 = 'e0000000-0000-4000-8000-000000000092';
  const settleResult = await captureSettlement(fakeClient, {
    intentId: intentId2,
    authorizationId: authId,
    settlementAmountMinor: 40000n,
    currency: 'USD',
    step: 'dp_settle',
  });

  assert.equal(settleResult.outcome, 'COMPLETED');
  assert.equal(settleResult.status, 'SETTLED');
  assert.ok(settleResult.captureId);
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId2}_dp_settle`);

  // 4. Forfeit Scenario: Void remaining authorization hold
  const createRes2 = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '300.00' } }],
    }),
  });
  const order2 = await createRes2.json();

  const authRes2 = await fetch(`${baseUrl}/v2/checkout/orders/${order2.id}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const authOrder2 = await authRes2.json();
  const authId2 = authOrder2.purchase_units[0].payments.authorizations[0].id;

  const intentId3 = 'e0000000-0000-4000-8000-000000000093';
  const forfeitResult = await voidForfeitedAuthorization(fakeClient, {
    intentId: intentId3,
    authorizationId: authId2,
    step: 'dp_forfeit',
  });

  assert.equal(forfeitResult.outcome, 'COMPLETED');
  assert.equal(forfeitResult.status, 'FORFEITED');
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId3}_dp_forfeit`);
});

