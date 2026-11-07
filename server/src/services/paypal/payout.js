/**
 * server/src/services/paypal/payout.js
 * PayPal Payouts API Adapter (AD-05, AD-15, Blueprint M5)
 */

import { formatMinor } from '../../db/money.js';

export async function createPayoutBatch(paypalClient, {
  intentId,
  amountMinor,
  currency,
  receiverEmail,
  note = 'Payout transaction',
  emailSubject = 'You have received a payment',
  step = 'payout',
}) {
  const senderBatchId = `jp_${intentId}`;
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: emailSubject,
    },
    items: [
      {
        recipient_type: 'EMAIL',
        amount: {
          value: formattedAmount,
          currency,
        },
        receiver: receiverEmail,
        note,
        sender_item_id: `item_${intentId}`,
      },
    ],
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
    },
    raw: response,
  };
}

export async function getPayoutBatch(paypalClient, batchId) {
  return paypalClient.request('GET', `/v1/payments/payouts/${encodeURIComponent(batchId)}?page=1&page_size=100`);
}

export async function getPayoutItem(paypalClient, itemId) {
  return paypalClient.request('GET', `/v1/payments/payouts-item/${encodeURIComponent(itemId)}`);
}

export default {
  createPayoutBatch,
  getPayoutBatch,
  getPayoutItem,
};

