/**
 * server/src/services/paypal/scheduled.js
 * Scheduled transaction dispatcher and runner adapter (K-SCHEDULED, AD-14, T-01)
 */

import { createPayoutBatch } from './payout.js';
import { createSaleOrder, captureSaleOrder } from './sale.js';

export async function reevaluateScheduledIntent({
  intent,
  mandate,
  org,
  agent,
  now = new Date(),
}) {
  if (org && org.frozen) {
    return { passed: false, code: 'ORG_FROZEN', reason: 'Organization is currently frozen' };
  }

  if (agent && agent.status !== 'ACTIVE') {
    return { passed: false, code: 'AGENT_DISABLED', reason: 'Agent is not active' };
  }

  if (mandate) {
    if (mandate.status !== 'ACTIVE') {
      return { passed: false, code: 'MANDATE_INACTIVE', reason: 'Mandate is not active' };
    }
    const validTo = new Date(mandate.validTo || mandate.valid_to);
    if (now.getTime() > validTo.getTime()) {
      return { passed: false, code: 'MANDATE_EXPIRED', reason: 'Mandate has expired' };
    }
  }

  return { passed: true };
}

export async function executeScheduledFire(paypalClient, {
  intent,
  recipientEmail,
  buyerApprovalUrl,
}) {
  const subType = intent.sub_type || intent.subType || 'payout';

  if (subType === 'payout') {
    return createPayoutBatch(paypalClient, {
      intentId: intent.intent_id || intent.id,
      amountMinor: BigInt(intent.amount_minor || intent.amountMinor),
      currency: intent.currency,
      receiverEmail: recipientEmail || intent.metadata?.recipientEmail || 'payee@example.com',
      note: intent.metadata?.note || 'Scheduled payout transaction',
      step: 'sched_payout',
    });
  }

  if (subType === 'charge') {
    // For incoming charge, create and capture sale order
    const orderRes = await createSaleOrder(paypalClient, {
      intentId: intent.intent_id || intent.id,
      amountMinor: BigInt(intent.amount_minor || intent.amountMinor),
      currency: intent.currency,
      returnUrl: intent.metadata?.returnUrl || 'https://example.com/return',
      cancelUrl: intent.metadata?.cancelUrl || 'https://example.com/cancel',
      step: 'sched_order',
    });

    const orderId = orderRes.providerRefs?.orderId;
    if (!orderId) {
      return orderRes;
    }

    const captureRes = await captureSaleOrder(paypalClient, {
      orderId,
      intentId: intent.intent_id || intent.id,
      step: 'sched_capture',
    });

    return {
      outcome: captureRes.outcome,
      providerRefs: {
        orderId,
        captureId: captureRes.providerRefs?.captureId,
      },
      raw: captureRes.raw,
    };
  }

  throw new Error(`Unsupported scheduled sub_type: ${subType}`);
}

export default {
  reevaluateScheduledIntent,
  executeScheduledFire,
};

