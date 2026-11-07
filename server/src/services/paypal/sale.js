/**
 * server/src/services/paypal/sale.js
 * PayPal Orders Capture API Adapter for SALE (PRD 1.3 §1.2, AD-05, AD-15, K-SALE)
 */

import { formatMinor } from '../../db/money.js';

export async function createSaleOrder(paypalClient, {
  intentId,
  amountMinor,
  currency,
  description = 'Sale transaction',
  returnUrl = 'https://example.com/checkout/return',
  cancelUrl = 'https://example.com/checkout/cancel',
  customId = null,
  step = 'order_create',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        reference_id: `pu_${intentId}`,
        custom_id: customId || intentId,
        description,
        amount: {
          currency_code: currency,
          value: formattedAmount,
        },
      },
    ],
    application_context: {
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const response = await paypalClient.request('POST', '/v2/checkout/orders', {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  const approvalLink = response?.links?.find((l) => l.rel === 'approve');

  return {
    outcome: response?.status === 'CREATED' ? 'CREATED' : response?.status,
    orderId: response?.id,
    approvalUrl: approvalLink?.href || null,
    providerRefs: {
      orderId: response?.id,
      orderStatus: response?.status,
      approvalUrl: approvalLink?.href || null,
    },
    raw: response,
  };
}

export async function captureSaleOrder(paypalClient, {
  intentId,
  orderId,
  step = 'order_capture',
}) {
  const requestId = `jp_${intentId}_${step}`;

  const response = await paypalClient.request('POST', `/v2/checkout/orders/${orderId}/capture`, {
    body: JSON.stringify({}),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  const capture = response?.purchase_units?.[0]?.payments?.captures?.[0];
  const isCompleted = response?.status === 'COMPLETED' || capture?.status === 'COMPLETED';

  return {
    outcome: isCompleted ? 'COMPLETED' : 'PENDING',
    captureId: capture?.id || null,
    providerRefs: {
      orderId: response?.id || orderId,
      captureId: capture?.id || null,
      status: response?.status,
      captureStatus: capture?.status,
    },
    raw: response,
  };
}

export async function getSaleOrder(paypalClient, orderId) {
  const response = await paypalClient.request('GET', `/v2/checkout/orders/${orderId}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return {
    orderId: response?.id,
    status: response?.status,
    raw: response,
  };
}

export default {
  createSaleOrder,
  captureSaleOrder,
  getSaleOrder,
};

