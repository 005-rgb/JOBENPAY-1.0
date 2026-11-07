/**
 * server/src/services/paypal/void.js
 * PayPal Payments Authorization Void Adapter (PRD 1.3 §1.4, AD-05, AD-11, K-VOID)
 */

export async function voidAuthorization(paypalClient, {
  intentId,
  authorizationId,
  step = 'void',
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
    status: 'VOIDED',
    providerRefs: {
      authorizationId,
      status: 'VOIDED',
    },
    raw: response,
  };
}

export async function voidOrderInternal({
  intentId,
  orderId,
}) {
  // AD-11: Semantik pembatalan VOID.order murni internal tanpa pemanggilan ke PayPal
  return {
    outcome: 'COMPLETED',
    orderId,
    status: 'VOIDED',
    internal: true,
  };
}

export default {
  voidAuthorization,
  voidOrderInternal,
};

