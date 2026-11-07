/**
 * shared/webhook-routes.js
 * PayPal Webhook Routes Mapping (PRD-R §6.4 / BW-08)
 */

export const WEBHOOK_ROUTES = Object.freeze([
  {
    event: 'PAYMENT.CAPTURE.COMPLETED',
    categories: ['SALE', 'DOWN_PAYMENT', 'SPLIT'],
    transitionTo: 'COMPLETED',
    actor: 'WEBHOOK',
    ledgerEffect: 'POST_LEGS',
  },
  {
    event: 'PAYMENT.CAPTURE.DENIED',
    categories: ['SALE', 'DOWN_PAYMENT'],
    transitionTo: 'FAILED',
    actor: 'WEBHOOK',
    ledgerEffect: 'NONE',
  },
  {
    event: 'PAYMENT.CAPTURE.REFUNDED',
    categories: ['REFUND', 'PARTIAL'],
    transitionTo: 'COMPLETED',
    actor: 'WEBHOOK',
    ledgerEffect: 'POST_REVERSAL_LEGS',
  },
  {
    event: 'PAYMENT.AUTHORIZATION.CREATED',
    categories: ['DOWN_PAYMENT', 'PARTIAL'],
    transitionTo: 'AUTHORIZED',
    actor: 'WEBHOOK',
    ledgerEffect: 'RECORD_HONOR_WINDOW',
  },
  {
    event: 'PAYMENT.AUTHORIZATION.VOIDED',
    categories: ['VOID', 'DOWN_PAYMENT'],
    transitionTo: 'VOIDED',
    actor: 'WEBHOOK',
    ledgerEffect: 'RELEASE_HOLD',
  },
  {
    event: 'PAYMENT.PAYOUTSBATCH.SUCCESS',
    categories: ['PAYOUT', 'BULK', 'SPLIT'],
    transitionTo: 'BATCH_SUCCESS',
    actor: 'WEBHOOK',
    ledgerEffect: 'CHECK_CHILDREN',
  },
  {
    event: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
    categories: ['PAYOUT', 'BULK', 'SPLIT'],
    transitionTo: 'COMPLETED',
    actor: 'WEBHOOK',
    ledgerEffect: 'POST_PAYOUT_LEGS',
  },
  {
    event: 'PAYMENT.PAYOUTS-ITEM.FAILED',
    categories: ['PAYOUT', 'BULK'],
    transitionTo: 'FAILED',
    actor: 'WEBHOOK',
    ledgerEffect: 'RELEASE_BUDGET',
  },
  {
    event: 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED',
    categories: ['PAYOUT'],
    transitionTo: 'UNCLAIMED',
    actor: 'WEBHOOK',
    ledgerEffect: 'HOLD_BUDGET_TEMPORARY',
  },
  {
    event: 'INVOICING.INVOICE.PAID',
    categories: ['INVOICE'],
    transitionTo: 'PAID',
    actor: 'WEBHOOK',
    ledgerEffect: 'POST_RECEIVABLE_SETTLED',
  },
  {
    event: 'INVOICING.INVOICE.CANCELLED',
    categories: ['INVOICE'],
    transitionTo: 'CANCELLED',
    actor: 'WEBHOOK',
    ledgerEffect: 'VOID_RECEIVABLE',
  },
  {
    event: 'BILLING.SUBSCRIPTION.ACTIVATED',
    categories: ['RECURRING'],
    transitionTo: 'ACTIVE',
    actor: 'WEBHOOK',
    ledgerEffect: 'ACTIVATE_SCHEDULE',
  },
  {
    event: 'BILLING.SUBSCRIPTION.PAYMENT.COMPLETED',
    categories: ['RECURRING'],
    transitionTo: 'COMPLETED',
    actor: 'WEBHOOK',
    ledgerEffect: 'POST_RECURRING_CHARGE',
  },
  {
    event: 'CUSTOMER.DISPUTE.CREATED',
    categories: ['DISPUTE'],
    transitionTo: 'OPEN',
    actor: 'WEBHOOK',
    ledgerEffect: 'FREEZE_DISPUTED_FUNDS',
  },
  {
    event: 'CUSTOMER.DISPUTE.RESOLVED',
    categories: ['DISPUTE'],
    transitionTo: 'RESOLVED',
    actor: 'WEBHOOK',
    ledgerEffect: 'POST_DISPUTE_SETTLEMENT',
  },
]);

export function findWebhookRoute(eventType) {
  return WEBHOOK_ROUTES.find((r) => r.event === eventType) ?? null;
}

export default WEBHOOK_ROUTES;
