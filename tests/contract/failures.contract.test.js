/**
 * tests/contract/failures.contract.test.js
 * Contract test untuk mode kegagalan terprogram (failure-modes.js).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakePayPalServer } from '../../fake-paypal/server.js';
import { failureInjector } from '../../fake-paypal/failure-modes.js';

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

test('Failure Mode: 429 Rate Limit with Retry-After header', async () => {
  // Suntikkan aturan kegagalan 429
  failureInjector.addRule({
    path: '/v2/checkout/orders',
    method: 'POST',
    statusCode: 429,
    headers: { 'Retry-After': '7' },
    body: {
      name: 'RATE_LIMIT_REACHED',
      message: 'Too many requests. Please slow down.'
    }
  });

  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'CAPTURE' })
  });

  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '7');
  const errData = await res.json();
  assert.equal(errData.name, 'RATE_LIMIT_REACHED');
});

test('Failure Mode: 503 Service Unavailable Injection', async () => {
  failureInjector.addRule({
    path: '/v1/payments/payouts',
    method: 'POST',
    statusCode: 503,
    body: {
      name: 'SERVICE_UNAVAILABLE',
      message: 'PayPal Payouts service temporarily down for maintenance.'
    }
  });

  const res = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] })
  });

  assert.equal(res.status, 503);
  const data = await res.json();
  assert.equal(data.name, 'SERVICE_UNAVAILABLE');
});

test('Failure Mode: failOnAttempt (fail attempt #2 only)', async () => {
  failureInjector.addRule({
    path: '/v2/checkout/orders',
    method: 'POST',
    failOnAttempt: 2,
    statusCode: 500,
    body: { name: 'TRANSIENT_ERROR', message: 'Flaky network blip' }
  });

  // Attempt 1: Harap 201 Berhasil
  const res1 = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'CAPTURE' })
  });
  assert.equal(res1.status, 201);

  // Attempt 2: Harap 500 Gagal
  const res2 = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'CAPTURE' })
  });
  assert.equal(res2.status, 500);

  // Attempt 3: Harap 201 Berhasil kembali
  const res3 = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'CAPTURE' })
  });
  assert.equal(res3.status, 201);
});

test('Failure Mode: Webhook invalid signature verification', async () => {
  // Verifikasi normal: SUCCESS
  const resNormal = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_id: 'WH-01' })
  });
  const dataNormal = await resNormal.json();
  assert.equal(dataNormal.verification_status, 'SUCCESS');

  // Set mode invalid-signature
  failureInjector.setWebhookMode('invalid-signature');

  const resInvalid = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhook_id: 'WH-01' })
  });
  const dataInvalid = await resInvalid.json();
  assert.equal(dataInvalid.verification_status, 'FAILURE');
});

