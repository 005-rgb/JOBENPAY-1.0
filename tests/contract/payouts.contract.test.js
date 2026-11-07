/**
 * tests/contract/payouts.contract.test.js
 * Contract test untuk Payouts API v1 (Single & Batch).
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

test('Contract: Payout Batch Creation and Queries', async () => {
  const payload = {
    sender_batch_header: {
      sender_batch_id: 'batch_contract_001',
      email_subject: 'Payout Notification Test'
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: { value: '45.00', currency: 'USD' },
        receiver: 'recipient1@example.com',
        note: 'Payment 1',
        sender_item_id: 'item_001'
      },
      {
        recipient_type: 'EMAIL',
        amount: { value: '55.00', currency: 'USD' },
        receiver: 'recipient2@example.com',
        note: 'Payment 2',
        sender_item_id: 'item_002'
      }
    ]
  };

  // 1. Buat batch
  const createRes = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  assert.equal(createRes.status, 201);
  const data = await createRes.json();
  const batchId = data.batch_header.payout_batch_id;
  assert.ok(batchId.startsWith('BATCH-'));
  assert.equal(data.batch_header.batch_status, 'SUCCESS');
  assert.equal(data.batch_header.amount.value, '100.00');

  // 2. Query batch
  const getBatchRes = await fetch(`${baseUrl}/v1/payments/payouts/${batchId}`);
  assert.equal(getBatchRes.status, 200);
  const batchData = await getBatchRes.json();
  assert.equal(batchData.items.length, 2);
  const firstItemId = batchData.items[0].payout_item_id;

  // 3. Query item
  const getItemRes = await fetch(`${baseUrl}/v1/payments/payouts-item/${firstItemId}`);
  assert.equal(getItemRes.status, 200);
  const itemData = await getItemRes.json();
  assert.equal(itemData.transaction_status, 'SUCCESS');
  assert.equal(itemData.payout_item_id, firstItemId);
});

test('Contract: Duplicate sender_batch_id returns 400 DUPLICATE_RESOURCE_IDENTIFIER', async () => {
  const payload = {
    sender_batch_header: {
      sender_batch_id: 'duplicate_sender_id_001'
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: { value: '10.00', currency: 'USD' },
        receiver: 'vendor@example.com'
      }
    ]
  };

  // Panggilan 1 sukses
  const res1 = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(res1.status, 201);

  // Panggilan 2 dengan sender_batch_id yang sama harus ditolak 400
  const res2 = await fetch(`${baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  assert.equal(res2.status, 400);
  const errData = await res2.json();
  assert.equal(errData.name, 'DUPLICATE_RESOURCE_IDENTIFIER');
});

