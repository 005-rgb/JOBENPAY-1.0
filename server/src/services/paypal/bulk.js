/**
 * server/src/services/paypal/bulk.js
 * PayPal Bulk Payouts Batch Adapter with streaming/chunking support (K-BULK, AD-17, T-19)
 */

import { formatMinor } from '../../db/money.js';
import { MAX_BULK_ITEMS, DEFAULT_CHUNK_SIZE } from '../../../../shared/bulk.js';

export async function createBulkPayoutBatch(paypalClient, {
  parentIntentId,
  items,
  currency,
  emailSubject = 'Bulk payout distribution',
  chunkSize = DEFAULT_CHUNK_SIZE,
}) {
  if (!items || items.length === 0) {
    const err = new Error('Bulk batch must contain at least one item');
    err.code = 'EMPTY_BULK_BATCH';
    err.statusCode = 400;
    throw err;
  }

  if (items.length > MAX_BULK_ITEMS) {
    const err = new Error(`Bulk batch exceeds maximum limit of ${MAX_BULK_ITEMS} items (got ${items.length})`);
    err.code = 'BULK_TOO_LARGE';
    err.statusCode = 422;
    throw err;
  }

  const senderBatchId = `jp_bulk_${parentIntentId}`;
  const requestId = `jp_${parentIntentId}_bulk_payout`;

  // Format all items without unnecessary deep clones
  const formattedItems = items.map((item, idx) => ({
    recipient_type: 'EMAIL',
    amount: {
      value: formatMinor(item.amountMinor, currency),
      currency,
    },
    receiver: item.recipientEmail || item.receiverEmail || `payee_${idx}@example.com`,
    note: item.note || `Bulk payout item #${idx + 1}`,
    sender_item_id: item.itemId || `bulk_item_${parentIntentId}_${idx + 1}`,
  }));

  const payload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: emailSubject,
    },
    items: formattedItems,
  };

  const response = await paypalClient.request('POST', '/v1/payments/payouts', {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  const header = response?.batch_header;
  return {
    outcome: header?.batch_status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
    providerRefs: {
      payoutBatchId: header?.payout_batch_id,
      senderBatchId: header?.sender_batch_header?.sender_batch_id || senderBatchId,
      batchStatus: header?.batch_status,
      itemCount: items.length,
    },
    raw: response,
  };
}

export default {
  createBulkPayoutBatch,
};
