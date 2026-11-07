/**
 * tests/contract/payments.contract.test.js
 * Contract test untuk Payments API v2 (Authorizations, Captures, Refunds).
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

test('Contract: Partial & Final Capture of Authorization', async () => {
  // 1. Buat dan otorisasi order $300
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '300.00' } }]
    })
  });
  const order = await createRes.json();
  const authRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const authOrder = await authRes.json();
  const authId = authOrder.purchase_units[0].payments.authorizations[0].id;

  // 2. Partial capture $100 (final_capture: false)
  const partCapRes = await fetch(`${baseUrl}/v2/payments/authorizations/${authId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency_code: 'USD', value: '100.00' },
      final_capture: false
    })
  });
  assert.equal(partCapRes.status, 201);
  const partCap = await partCapRes.json();
  assert.equal(partCap.amount.value, '100.00');
  assert.equal(partCap.final_capture, false);

  // Periksa status auth
  const getAuthRes = await fetch(`${baseUrl}/v2/payments/authorizations/${authId}`);
  const authData = await getAuthRes.json();
  assert.equal(authData.status, 'PARTIALLY_CAPTURED');

  // 3. Final capture sisa (final_capture: true)
  const finalCapRes = await fetch(`${baseUrl}/v2/payments/authorizations/${authId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency_code: 'USD', value: '200.00' },
      final_capture: true
    })
  });
  assert.equal(finalCapRes.status, 201);
  const finalCap = await finalCapRes.json();
  assert.equal(finalCap.amount.value, '200.00');
  assert.equal(finalCap.final_capture, true);
});

test('Contract: Void Authorization prevents subsequent capture', async () => {
  // 1. Buat otorisasi
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'AUTHORIZE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '150.00' } }]
    })
  });
  const order = await createRes.json();
  const authRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const authOrder = await authRes.json();
  const authId = authOrder.purchase_units[0].payments.authorizations[0].id;

  // 2. Void otorisasi
  const voidRes = await fetch(`${baseUrl}/v2/payments/authorizations/${authId}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  assert.equal(voidRes.status, 200);
  const voidedData = await voidRes.json();
  assert.equal(voidedData.status, 'VOIDED');

  // 3. Upaya capture pada voided auth wajib ditolak 422
  const capRes = await fetch(`${baseUrl}/v2/payments/authorizations/${authId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ final_capture: true })
  });
  assert.equal(capRes.status, 422);
  const errData = await capRes.json();
  assert.equal(errData.name, 'AUTHORIZATION_VOIDED');
});

test('Contract: Capture Refund Lifecycle', async () => {
  // 1. Buat dan tangkap order
  const createRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{ amount: { currency_code: 'USD', value: '120.00' } }]
    })
  });
  const order = await createRes.json();
  const capRes = await fetch(`${baseUrl}/v2/checkout/orders/${order.id}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const capOrder = await capRes.json();
  const captureId = capOrder.purchase_units[0].payments.captures[0].id;

  // 2. Refund dana
  const refRes = await fetch(`${baseUrl}/v2/payments/captures/${captureId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency_code: 'USD', value: '120.00' }
    })
  });
  assert.equal(refRes.status, 201);
  const refData = await refRes.json();
  assert.ok(refData.id.startsWith('REF-'));
  assert.equal(refData.status, 'COMPLETED');
  assert.equal(refData.amount.value, '120.00');
});

