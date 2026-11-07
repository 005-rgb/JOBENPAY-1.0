/**
 * server/src/services/paypal/recurring.js
 * PayPal Subscriptions & Recurring Billing Adapter (K-RECURRING, AD-17, T-08)
 */

import { formatMinor } from '../../db/money.js';

export async function createBillingPlanAndSubscription(paypalClient, {
  intentId,
  amountMinor,
  currency,
  frequency = 'MONTHLY',
  intervalCount = 1,
  subscriberEmail,
  returnUrl = 'https://example.com/recurring/return',
  cancelUrl = 'https://example.com/recurring/cancel',
  step = 'init',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  // 1. Create or reference plan
  const planPayload = {
    product_id: `PROD_${currency}_SUBSCRIPTION`,
    name: `Recurring Plan ${frequency}`,
    description: `Automated recurring billing every ${intervalCount} ${frequency}`,
    status: 'ACTIVE',
    billing_cycles: [
      {
        frequency: {
          interval_unit: frequency,
          interval_count: intervalCount,
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0, // Infinite or managed by app
        pricing_scheme: {
          fixed_price: {
            value: formattedAmount,
            currency_code: currency,
          },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3,
    },
  };

  const planRes = await paypalClient.request('POST', '/v1/billing/plans', {
    body: JSON.stringify(planPayload),
    headers: {
      'PayPal-Request-Id': `${requestId}_plan`,
      'Content-Type': 'application/json',
    },
  });

  const planId = planRes?.id || `PLAN-${intentId}`;

  // 2. Create subscription under plan
  const subPayload = {
    plan_id: planId,
    subscriber: {
      email_address: subscriberEmail || 'subscriber@example.com',
    },
    application_context: {
      return_url: returnUrl,
      cancel_url: cancelUrl,
    },
  };

  const subRes = await paypalClient.request('POST', '/v1/billing/subscriptions', {
    body: JSON.stringify(subPayload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: subRes?.status === 'ACTIVE' || subRes?.status === 'APPROVAL_PENDING' ? 'PENDING' : 'FAILED',
    providerRefs: {
      planId,
      subscriptionId: subRes?.id,
      status: subRes?.status,
    },
    raw: subRes,
  };
}

export async function cancelSubscription(paypalClient, {
  subscriptionId,
  reason = 'Customer requested cancellation',
  intentId,
  step = 'cancel',
}) {
  const requestId = `jp_${intentId || subscriptionId}_${step}`;

  const response = await paypalClient.request('POST', `/v1/billing/subscriptions/${subscriptionId}/cancel`, {
    body: JSON.stringify({ reason }),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: 'SUCCESS',
    providerRefs: {
      subscriptionId,
      status: 'CANCELLED',
    },
    raw: response,
  };
}

export default {
  createBillingPlanAndSubscription,
  cancelSubscription,
};

