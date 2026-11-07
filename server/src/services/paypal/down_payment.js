/**
 * server/src/services/paypal/down_payment.js
 * PayPal Payments Down Payment Adapter: Initial DP, Settlement, and Forfeit Void (PRD 1.3 §1.2, AD-04, AD-26, T-09)
 */

import { formatMinor } from '../../db/money.js';

export async function captureInitialDownPayment(paypalClient, {
  intentId,
  authorizationId,
  dpAmountMinor,
  currency,
  noteToPayer = 'Down payment captured by Jobenpay',
  step = 'dp_initial',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(dpAmountMinor, currency);

  const payload = {
    amount: {
      value: formattedAmount,
      currency_code: currency,
    },
    final_capture: false,
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
    authorizationId,
    status: 'DP_PAID',
    providerRefs: {
      authorizationId,
      captureId: response?.id,
      status: response?.status,
    },
    raw: response,
  };
}

export async function captureSettlement(paypalClient, {
  intentId,
  authorizationId,
  settlementAmountMinor,
  currency,
  noteToPayer = 'Settlement final balance captured by Jobenpay',
  step = 'dp_settle',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(settlementAmountMinor, currency);

  const payload = {
    amount: {
      value: formattedAmount,
      currency_code: currency,
    },
    final_capture: true,
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
    authorizationId,
    status: 'SETTLED',
    providerRefs: {
      authorizationId,
      captureId: response?.id,
      status: response?.status,
    },
    raw: response,
  };
}

export async function voidForfeitedAuthorization(paypalClient, {
  intentId,
  authorizationId,
  step = 'dp_forfeit',
}) {
  const requestId = `jp_${intentId}_${step}`;

  const response = await paypalClient.request('POST', `/v2/payments/authorizations/${authorizationId}/void`, {
    body: JSON.stringify({}),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  const isVoided = response?.status === 'VOIDED' || response?.status === 204 || !response?.status;

  return {
    outcome: isVoided ? 'COMPLETED' : 'PENDING',
    authorizationId,
    status: 'FORFEITED',
    providerRefs: {
      authorizationId,
      status: 'VOIDED',
    },
    raw: response,
  };
}

export default {
  captureInitialDownPayment,
  captureSettlement,
  voidForfeitedAuthorization,
};

