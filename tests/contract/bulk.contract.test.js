/**
 * tests/contract/bulk.contract.test.js
 * Contract tests for Bulk Payout Adapter (K-BULK, AD-17, T-19)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBulkPayoutBatch } from '../../server/src/services/paypal/bulk.js';

test('Bulk Payout Adapter Contract: 15,000 item limit, chunking and execution', async (t) => {
  function createMockPayPal() {
    const requests = [];
    return {
      requests,
      async request(method, path, options = {}) {
        requests.push({ method, path, headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
        return {
          batch_header: {
            payout_batch_id: 'BATCH-BULK-990011',
            batch_status: 'PENDING',
            sender_batch_header: { sender_batch_id: 'jp_bulk_parent_123' },
          },
        };
      },
    };
  }

  await t.test('1. Submits valid bulk payout batch to PayPal API', async () => {
    const mock = createMockPayPal();
    const items = [
      { amountMinor: 5000n, recipientEmail: 'user1@example.com' },
      { amountMinor: 7500n, recipientEmail: 'user2@example.com' },
    ];

    const result = await createBulkPayoutBatch(mock, {
      parentIntentId: 'parent_123',
      items,
      currency: 'USD',
    });

    assert.equal(result.outcome, 'PENDING');
    assert.equal(result.providerRefs.payoutBatchId, 'BATCH-BULK-990011');
    assert.equal(result.providerRefs.itemCount, 2);
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].headers['PayPal-Request-Id'], 'jp_parent_123_bulk_payout');
  });

  await t.test('2. 15,000 items passes limit check', async () => {
    const mock = createMockPayPal();
    // Create lightweight representation of 15,000 items
    const items = new Array(15000).fill({ amountMinor: 100n, recipientEmail: 'bulk@example.com' });

    const result = await createBulkPayoutBatch(mock, {
      parentIntentId: 'parent_max_15000',
      items,
      currency: 'USD',
    });

    assert.equal(result.providerRefs.itemCount, 15000);
    assert.equal(mock.requests.length, 1);
  });

  await t.test('3. 15,001 items is rejected with BULK_TOO_LARGE', async () => {
    const mock = createMockPayPal();
    const items = new Array(15001).fill({ amountMinor: 100n, recipientEmail: 'bulk@example.com' });

    await assert.rejects(
      async () => {
        await createBulkPayoutBatch(mock, {
          parentIntentId: 'parent_overflow',
          items,
          currency: 'USD',
        });
      },
      (err) => err.code === 'BULK_TOO_LARGE' && err.statusCode === 422
    );
  });
});

