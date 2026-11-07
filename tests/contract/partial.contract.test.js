/**
 * tests/contract/partial.contract.test.js
 * Contract test for PARTIAL (Partial Capture & Refund) against Fake PayPal Server (Item 5 CCC, K-PARTIAL)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import { captureAuthorizationPartial, refundCapturePartial } from '../../server/src/services/paypal/partial.js';
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

test('Partial Adapter Contract: captureAuthorizationPartial and refundCapturePartial', async () => {
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

  // 1. Create and authorize an order first to obtain an authorizationId
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '300.00' } }],
    }),
  });
  const order = await createRes.json();

  const authRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  const authOrder = await authRes.json();
  const authId = authOrder.purchase_units[0].payments.authorizations[0].id;
  assert.ok(authId, 'Authorization ID should be present');

  // 2. Perform first partial capture ($100.00, non-final)
  const intentId1 = 'e0000000-0000-4000-8000-000000000071';
  const capture1 = await captureAuthorizationPartial(fakeClient, {
    intentId: intentId1,
    authorizationId: authId,
    amountMinor: 10000n,
    currency: 'USD',
    isFinal: false,
    step: 'partial_capture_1',
  });

  assert.equal(capture1.outcome, 'COMPLETED');
  assert.ok(capture1.captureId);
  assert.equal(capture1.isFinal, false);
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId1}_partial_capture_1`);

  // 3. Perform second partial capture ($200.00, final)
  const intentId2 = 'e0000000-0000-4000-8000-000000000072';
  const capture2 = await captureAuthorizationPartial(fakeClient, {
    intentId: intentId2,
    authorizationId: authId,
    amountMinor: 20000n,
    currency: 'USD',
    isFinal: true,
    step: 'partial_capture_2',
  });

  assert.equal(capture2.outcome, 'COMPLETED');
  assert.ok(capture2.captureId);
  assert.equal(capture2.isFinal, true);
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId2}_partial_capture_2`);

  // 4. Test partial refund on capture1
  const intentId3 = 'e0000000-0000-4000-8000-000000000073';
  const refund = await refundCapturePartial(fakeClient, {
    intentId: intentId3,
    captureId: capture1.captureId,
    amountMinor: 5000n,
    currency: 'USD',
    step: 'partial_refund',
  });

  assert.equal(refund.outcome, 'COMPLETED');
  assert.ok(refund.refundId);
  assert.equal(capturedHeaders['PayPal-Request-Id'], `jp_${intentId3}_partial_refund`);
});

