/**
 * server/src/services/paypal/transfer.js
 * PayPal P2P Transfer Payout Adapter (K-TRANSFER, AD-17, T-18)
 */

import { formatMinor } from '../../db/money.js';

export async function executeTransferPayout(paypalClient, {
  intentId,
  amountMinor,
  currency,
  receiverEmail,
  note = 'Peer-to-peer transfer',
  step = 'transfer',
}) {
  const senderBatchId = `jp_transfer_${intentId}`;
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: 'You have received a transfer payment',
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
        sender_item_id: `transfer_item_${intentId}`,
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

export default {
  executeTransferPayout,
};

