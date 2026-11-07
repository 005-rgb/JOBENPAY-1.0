/**
 * tests/contract/subscriptions.contract.test.js
 * Contract test untuk Subscriptions API v1.
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

test('Contract: Subscriptions Lifecycle (Product -> Plan -> Subscription -> Cancel)', async () => {
  // 1. Create Product
  const prodRes = await fetch(`${baseUrl}/v1/catalogs/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Jobenpay API Subscription',
      type: 'SERVICE',
      category: 'SOFTWARE'
    })
  });
  assert.equal(prodRes.status, 201);
  const product = await prodRes.json();
  const productId = product.id;
  assert.ok(productId.startsWith('PROD-'));

  // 2. Create Plan
  const planRes = await fetch(`${baseUrl}/v1/billing/plans`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product_id: productId,
      name: 'Starter Monthly Plan',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: '49.00', currency_code: 'USD' }
          }
        }
      ]
    })
  });
  assert.equal(planRes.status, 201);
  const plan = await planRes.json();
  const planId = plan.id;
  assert.ok(planId.startsWith('P-'));

  // 3. Create Subscription
  const subRes = await fetch(`${baseUrl}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id: planId,
      subscriber: {
        name: { given_name: 'Test Tenant' },
        email_address: 'tenant@example.com'
      }
    })
  });
  assert.equal(subRes.status, 201);
  const subscription = await subRes.json();
  const subId = subscription.id;
  assert.ok(subId.startsWith('I-'));
  assert.equal(subscription.status, 'APPROVAL_PENDING');

  // 4. Cancel Subscription
  const cancelRes = await fetch(`${baseUrl}/v1/billing/subscriptions/${subId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Plan cancelled by user' })
  });
  assert.equal(cancelRes.status, 204);

  // 5. Verify Cancelled
  const getSubRes = await fetch(`${baseUrl}/v1/billing/subscriptions/${subId}`);
  assert.equal(getSubRes.status, 200);
  const cancelledSub = await getSubRes.json();
  assert.equal(cancelledSub.status, 'CANCELLED');
});

