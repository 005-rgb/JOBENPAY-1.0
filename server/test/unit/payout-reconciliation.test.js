import test from 'node:test';
import assert from 'node:assert/strict';

import { env } from '../../src/config.js';
import { hmacSha256 } from '../../src/lib/crypto.js';
import { formatMinor } from '../../src/db/money.js';
import {
  classifyPayoutResult,
  extractPayoutItem,
  payoutBatchResponse,
} from '../../src/services/payoutReconciliation.js';

test('formatMinor converts integer minor units to an exact two-digit decimal', () => {
  assert.equal(formatMinor(0), '0.00');
  assert.equal(formatMinor(5), '0.05');
  assert.equal(formatMinor('1234'), '12.34');
  assert.equal(formatMinor('100000000000000001'), '1000000000000000.01');
});

test('payout item normalization extracts batch, item, receiver, amount, and status', () => {
  assert.deepEqual(extractPayoutItem({
    sender_batch_header: { sender_batch_id: 'jp-request-1' },
    payout_batch_id: 'BATCH-1',
    payout_item: {
      sender_item_id: 'request-1',
      receiver: 'payee@example.test',
      amount: { value: '12.34', currency: 'USD' },
      transaction_status: 'SUCCESS',
    },
  }), {
    senderItemId: 'request-1',
    senderBatchId: 'jp-request-1',
    payoutBatchId: 'BATCH-1',
    receiver: 'payee@example.test',
    amount: { value: '12.34', currency: 'USD' },
    status: 'SUCCESS',
  });
  assert.deepEqual(payoutBatchResponse({
    batch_header: { payout_batch_id: 'BATCH-1', batch_status: 'SUCCESS' },
    items: [{
      payout_item: {
        sender_item_id: 'request-1',
        receiver: 'payee@example.test',
        amount: { value: '12.34', currency: 'USD' },
        transaction_status: 'SUCCESS',
      },
    }],
  }).items[0].status, 'SUCCESS');
});

test('successful payout must match exact amount, currency, and HMAC receiver', {
  skip: !env.JOBENPAY_HMAC_PEPPER,
}, () => {
  const request = {
    id: 'request-1',
    amount_minor: '1234',
    currency: 'USD',
    identifier_hmac: hmacSha256(env.JOBENPAY_HMAC_PEPPER, 'payee@example.test'),
  };
  const payoutItem = {
    senderItemId: request.id,
    senderBatchId: `jp_${request.id}`,
    receiver: 'payee@example.test',
    amount: { value: '12.34', currency: 'USD' },
    status: 'SUCCESS',
  };
  assert.deepEqual(classifyPayoutResult({ request, payoutItem }), { kind: 'RECONCILED', status: 'SUCCESS' });
  assert.equal(classifyPayoutResult({
    request,
    payoutItem: { ...payoutItem, amount: { value: '12.35', currency: 'USD' } },
  }).kind, 'MISMATCH');
  assert.equal(classifyPayoutResult({
    request,
    payoutItem: { ...payoutItem, receiver: 'other@example.test' },
  }).kind, 'MISMATCH');
  assert.deepEqual(classifyPayoutResult({
    request,
    payoutItem: { ...payoutItem, status: 'ONHOLD' },
  }), { kind: 'REVIEW', status: 'ONHOLD' });
});
