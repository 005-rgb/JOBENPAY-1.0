/**
 * fake-paypal/scenarios/subscriptions.scenario.js
 * Skenario stateful untuk Subscriptions API v1.
 */

import { randomUUID } from 'node:crypto';

export class SubscriptionsScenario {
  constructor(store) {
    this.store = store;
  }

  createProduct(payload) {
    const id = `PROD-${randomUUID().substring(0, 8).toUpperCase()}`;
    const product = {
      id,
      name: payload?.name || 'SaaS Monthly Plan',
      description: payload?.description || 'Monthly recurring subscription',
      type: payload?.type || 'SERVICE',
      category: payload?.category || 'SOFTWARE',
      create_time: new Date().toISOString()
    };
    this.store.products.set(id, product);
    return { status: 201, body: product };
  }

  createPlan(payload) {
    const id = `P-${randomUUID().substring(0, 10).toUpperCase()}`;
    const plan = {
      id,
      product_id: payload?.product_id || 'PROD-DEFAULT',
      name: payload?.name || 'Basic Monthly Plan',
      status: 'ACTIVE',
      billing_cycles: payload?.billing_cycles || [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: '29.00', currency_code: 'USD' }
          }
        }
      ],
      payment_preferences: payload?.payment_preferences || {
        auto_bill_outstanding: true,
        setup_fee_failure_action: 'CONTINUE',
        payment_failure_threshold: 3
      },
      create_time: new Date().toISOString()
    };
    this.store.plans.set(id, plan);
    return { status: 201, body: plan };
  }

  createSubscription(payload) {
    const id = `I-${randomUUID().substring(0, 12).toUpperCase()}`;
    const planId = payload?.plan_id || 'P-DEFAULT';

    const subscription = {
      id,
      plan_id: planId,
      status: 'APPROVAL_PENDING',
      start_time: payload?.start_time || new Date().toISOString(),
      subscriber: payload?.subscriber || {
        name: { given_name: 'Subscriber Test' },
        email_address: 'subscriber@example.com'
      },
      links: [
        {
          href: `https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=${id}`,
          rel: 'approve',
          method: 'GET'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${id}`,
          rel: 'self',
          method: 'GET'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${id}/cancel`,
          rel: 'cancel',
          method: 'POST'
        }
      ],
      create_time: new Date().toISOString()
    };

    this.store.subscriptions.set(id, subscription);
    return { status: 201, body: subscription };
  }

  getSubscription(id) {
    const sub = this.store.subscriptions.get(id);
    if (!sub) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Subscription not found' } };
    return { status: 200, body: sub };
  }

  cancelSubscription(id, reason = 'Customer request') {
    const sub = this.store.subscriptions.get(id);
    if (!sub) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Subscription not found' } };

    sub.status = 'CANCELLED';
    sub.status_change_note = reason;
    return { status: 204, body: null };
  }
}

