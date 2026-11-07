/**
 * server/src/services/paypal/partial.js
 * PayPal Payments Partial Capture & Refund API Adapter for PARTIAL (PRD 1.3 §1.4, AD-05, AD-10, AD-27, K-PARTIAL)
 */

import { formatMinor } from '../../db/money.js';

export async function captureAuthorizationPartial(paypalClient, {
  intentId,
  authorizationId,
  amountMinor,
  currency,
  isFinal = false,
  noteToPayer = 'Partial capture processed by Jobenpay',
  step = 'partial_capture',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    amount: {
      value: formattedAmount,
      currency_code: currency,
    },
    final_capture: Boolean(isFinal),
    note_to_payer: noteToPayer,
  };

  const response = await paypalClient.request('POST', `/v2/payments/authorizations/${authorizationId}/capture`, {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  const isCompleted = response?.status === 'COMPLETED';

  return {
    outcome: isCompleted ? 'COMPLETED' : response?.status || 'PENDING',
    captureId: response?.id,
    isFinal: Boolean(isFinal),
    providerRefs: {
      authorizationId,
      captureId: response?.id,
      status: response?.status,
    },
    raw: response,
  };
}

export async function refundCapturePartial(paypalClient, {
  intentId,
  captureId,
  amountMinor,
  currency,
  noteToPayer = 'Partial refund processed by Jobenpay',
  step = 'partial_refund',
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

export default {
  captureAuthorizationPartial,
  refundCapturePartial,
};

