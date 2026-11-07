/**
 * server/src/services/paypal/refund.js
 * PayPal Payments Refund API Adapter for REFUND (PRD 1.3 §1.3, AD-05, AD-15, K-REFUND)
 */

import { formatMinor } from '../../db/money.js';

export async function refundCapture(paypalClient, {
  intentId,
  captureId,
  amountMinor,
  currency,
  noteToPayer = 'Refund processed by Jobenpay',
  step = 'refund',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    amount: {
      value: formattedAmount,
      currency_code: currency,
    },
    note_to_payer: noteToPayer,
  };

  const response = await paypalClient.request('POST', `/v2/payments/captures/${captureId}/refund`, {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  const isCompleted = response?.status === 'COMPLETED';

  return {
    outcome: isCompleted ? 'COMPLETED' : response?.status || 'PENDING',
    refundId: response?.id,
    providerRefs: {
      captureId,
      refundId: response?.id,
      status: response?.status,
    },
    raw: response,
  };
}

export async function getRefund(paypalClient, refundId) {
  const response = await paypalClient.request('GET', `/v2/payments/refunds/${refundId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return {
    refundId: response?.id,
    status: response?.status,
    amount: response?.amount,
    raw: response,
  };
}

export default {
  refundCapture,
  getRefund,
};

