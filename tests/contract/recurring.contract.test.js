/**
 * tests/contract/recurring.contract.test.js
 * Contract tests for Recurring Subscriptions Adapter (K-RECURRING, AD-17, T-08)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBillingPlanAndSubscription, cancelSubscription } from '../../server/src/services/paypal/recurring.js';

test('Recurring Adapter Contract: createBillingPlanAndSubscription and cancelSubscription', async (t) => {
  function createMockPayPal() {
    const requests = [];
    return {
      requests,
      async request(method, path, options = {}) {
        requests.push({ method, path, headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
        if (path === '/v1/billing/plans') {
          return {
            id: 'PLAN-RECUR-1234',
            status: 'ACTIVE',
          };
        }
        if (path === '/v1/billing/subscriptions') {
          return {
            id: 'I-SUB-RECUR-5678',
            status: 'APPROVAL_PENDING',
          };
        }
        if (path.includes('/cancel')) {
          return {};
        }
        throw new Error(`Unexpected path: ${path}`);
      },
    };
  }

  await t.test('1. Creates billing plan and subscription request to PayPal Subscriptions API', async () => {
    const mock = createMockPayPal();
    const result = await createBillingPlanAndSubscription(mock, {
      intentId: 'intent_rec1',
      amountMinor: 4900n, // $49.00
      currency: 'USD',
      frequency: 'MONTHLY',
      intervalCount: 1,
      subscriberEmail: 'sub@example.com',
    });

    assert.equal(result.outcome, 'PENDING');
    assert.equal(result.providerRefs.planId, 'PLAN-RECUR-1234');
    assert.equal(result.providerRefs.subscriptionId, 'I-SUB-RECUR-5678');
    assert.equal(mock.requests.length, 2);
    assert.equal(mock.requests[1].headers['PayPal-Request-Id'], 'jp_intent_rec1_init');
    assert.equal(mock.requests[1].body.plan_id, 'PLAN-RECUR-1234');
  });

  await t.test('2. Cancels active subscription via PayPal Subscriptions API', async () => {
    const mock = createMockPayPal();
    const result = await cancelSubscription(mock, {
      subscriptionId: 'I-SUB-RECUR-5678',
      intentId: 'intent_rec_cancel',
      reason: 'User cancelled plan',
    });

    assert.equal(result.outcome, 'SUCCESS');
    assert.equal(result.providerRefs.status, 'CANCELLED');
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].method, 'POST');
    assert.equal(mock.requests[0].path, '/v1/billing/subscriptions/I-SUB-RECUR-5678/cancel');
    assert.equal(mock.requests[0].headers['PayPal-Request-Id'], 'jp_intent_rec_cancel_cancel');
  });
});

