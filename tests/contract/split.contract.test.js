/**
 * tests/contract/split.contract.test.js
 * Contract tests for Split Adapter (K-SPLIT, AD-13, AD-17, T-13, T-14)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSplitCollection, executeSplitDistribution } from '../../server/src/services/paypal/split.js';
import { calculateSplitShares } from '../../shared/split.js';

test('Split Adapter Contract: executeSplitCollection and executeSplitDistribution', async (t) => {
  function createMockPayPal() {
    const requests = [];
    return {
      requests,
      async request(method, path, options = {}) {
        requests.push({ method, path, headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
        if (path === '/v2/checkout/orders') {
          return {
            id: 'ORDER-SPLIT-9988',
            status: 'CREATED',
          };
        }
        if (path === '/v1/payments/payouts') {
          return {
            batch_header: {
              payout_batch_id: 'BATCH-SPLIT-7788',
              batch_status: 'PENDING',
              sender_batch_header: { sender_batch_id: 'jp_split_intent_sp1' },
            },
          };
        }
        throw new Error(`Unexpected path: ${path}`);
      },
    };
  }

  await t.test('1. Submits valid split collection order to PayPal Checkout Orders API', async () => {
    const mock = createMockPayPal();
    const result = await executeSplitCollection(mock, {
      intentId: 'intent_sp1',
      amountMinor: 25000n, // $250.00
      currency: 'USD',
    });

    assert.equal(result.outcome, 'PENDING');
    assert.equal(result.providerRefs.orderId, 'ORDER-SPLIT-9988');
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].method, 'POST');
    assert.equal(mock.requests[0].path, '/v2/checkout/orders');
    assert.equal(mock.requests[0].headers['PayPal-Request-Id'], 'jp_intent_sp1_collect');
    assert.equal(mock.requests[0].body.purchase_units[0].amount.value, '250.00');
  });

  await t.test('2. Submits split distribution with fee deduction to PayPal Payouts API', async () => {
    const mock = createMockPayPal();
    const recipients = [
      { counterpartyId: '00000000-0000-4000-8000-000000000001', recipientEmail: 'rec1@example.com' },
      { counterpartyId: '00000000-0000-4000-8000-000000000002', recipientEmail: 'rec2@example.com' },
    ];

    const result = await executeSplitDistribution(mock, {
      intentId: 'intent_sp1',
      totalAmountMinor: 10000n, // $100.00
      platformFeeBps: 200,      // 2.0% fee = $2.00, net = $98.00 -> $49.00 each
      currency: 'USD',
      recipients,
    });

    assert.equal(result.outcome, 'PENDING');
    assert.equal(result.providerRefs.payoutBatchId, 'BATCH-SPLIT-7788');
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].method, 'POST');
    assert.equal(mock.requests[0].path, '/v1/payments/payouts');
    assert.equal(mock.requests[0].headers['PayPal-Request-Id'], 'jp_intent_sp1_split_payout');

    const payoutBody = mock.requests[0].body;
    assert.equal(payoutBody.items.length, 2);
    assert.equal(payoutBody.items[0].amount.value, '49.00');
    assert.equal(payoutBody.items[1].amount.value, '49.00');
    assert.equal(result.splitResult.platformFeeMinor, 200n);
    assert.equal(result.splitResult.netPayeeTotal, 9800n);
  });
});

