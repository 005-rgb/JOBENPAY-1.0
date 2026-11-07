/**
 * tests/contract/transfer.contract.test.js
 * Contract tests for Transfer Payout Adapter (K-TRANSFER, AD-17, T-18)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTransferPayout } from '../../server/src/services/paypal/transfer.js';
import { validateTransferParties } from '../../shared/transfer.js';

test('Transfer Adapter Contract: executeTransferPayout and party validation', async (t) => {
  function createMockPayPal() {
    const requests = [];
    return {
      requests,
      async request(method, path, options = {}) {
        requests.push({ method, path, headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
        return {
          batch_header: {
            payout_batch_id: 'BATCH-TRANSFER-1122',
            batch_status: 'PENDING',
            sender_batch_header: { sender_batch_id: 'jp_transfer_intent_t1' },
          },
        };
      },
    };
  }

  await t.test('1. Submits valid transfer payout to PayPal API', async () => {
    const mock = createMockPayPal();
    const result = await executeTransferPayout(mock, {
      intentId: 'intent_t1',
      amountMinor: 8000n,
      currency: 'USD',
      receiverEmail: 'receiver@example.com',
      note: 'Transfer payment for services',
    });

    assert.equal(result.outcome, 'PENDING');
    assert.equal(result.providerRefs.payoutBatchId, 'BATCH-TRANSFER-1122');
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].headers['PayPal-Request-Id'], 'jp_intent_t1_transfer');
  });

  await t.test('2. Enforces sender and receiver are not identical (SENDER_EQUALS_RECEIVER)', () => {
    const samePartyId = '00000000-0000-4000-8000-000000000099';
    assert.throws(
      () => validateTransferParties(samePartyId, samePartyId),
      (err) => err.code === 'SENDER_EQUALS_RECEIVER' && err.statusCode === 422
    );

    const senderId = '00000000-0000-4000-8000-000000000001';
    const receiverId = '00000000-0000-4000-8000-000000000002';
    assert.equal(validateTransferParties(senderId, receiverId), true);
  });
});

