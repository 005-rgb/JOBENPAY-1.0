/**
 * server/src/services/paypal/split.js
 * PayPal Split Payments Collection & Payouts Adapter (K-SPLIT, AD-13, AD-17, T-13, T-14)
 */

import { formatMinor } from '../../db/money.js';
import { calculateSplitShares } from '../../../../shared/split.js';

export async function executeSplitCollection(paypalClient, {
  intentId,
  amountMinor,
  currency,
  returnUrl = 'https://example.com/split/return',
  cancelUrl = 'https://example.com/split/cancel',
  step = 'collect',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: `split_collect_${intentId}`,
        amount: {
          currency_code: currency,
          value: formattedAmount,
        },
        description: `Split collection for intent ${intentId}`,
      },
    ],
    application_context: {
      return_url: returnUrl,
      cancel_url: cancelUrl,
      user_action: 'PAY_NOW',
    },
  };

  const response = await paypalClient.request('POST', '/v2/checkout/orders', {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: response?.status === 'COMPLETED' ? 'SUCCESS' : 'PENDING',
    providerRefs: {
      orderId: response?.id,
      status: response?.status,
    },
    raw: response,
  };
}

export async function executeSplitDistribution(paypalClient, {
  intentId,
  totalAmountMinor,
  platformFeeBps,
  currency,
  recipients = [],
  step = 'split_payout',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const senderBatchId = `jp_split_${intentId}`;

  const splitResult = calculateSplitShares({
    totalAmountMinor,
    platformFeeBps,
    recipients,
  });

  const payoutItems = splitResult.shares.map((share, idx) => ({
    recipient_type: 'EMAIL',
    amount: {
      value: formatMinor(share.amountMinor, currency),
      currency,
    },
    receiver: share.recipientEmail || `payee_${share.counterpartyId}@example.com`,
    note: `Split payout share for intent ${intentId}`,
    sender_item_id: `split_item_${intentId}_${idx}`,
  }));

  const payload = {
    sender_batch_header: {
      sender_batch_id: senderBatchId,
      email_subject: 'You have received a split payout distribution',
    },
    items: payoutItems,
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
    splitResult,
    providerRefs: {
      payoutBatchId: header?.payout_batch_id,
      senderBatchId: header?.sender_batch_header?.sender_batch_id || senderBatchId,
      batchStatus: header?.batch_status,
    },
    raw: response,
  };
}

export default {
  executeSplitCollection,
  executeSplitDistribution,
};

