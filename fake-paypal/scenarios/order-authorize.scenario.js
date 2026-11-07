/**
 * fake-paypal/scenarios/order-authorize.scenario.js
 * Skenario stateful untuk Order Authorization, Partial Capture, dan Void (Kategori DOWN_PAYMENT / HOLD).
 */

import { randomUUID } from 'node:crypto';

export class OrderAuthorizeScenario {
  constructor(store) {
    this.store = store;
  }

  createOrder(payload) {
    const id = `ORD-AUTH-${randomUUID().substring(0, 8).toUpperCase()}`;
    const amount = payload?.purchase_units?.[0]?.amount || { currency_code: 'USD', value: '250.00' };

    const order = {
      id,
      status: 'CREATED',
      intent: 'AUTHORIZE',
      purchase_units: [
        {
          reference_id: payload?.purchase_units?.[0]?.reference_id || 'default',
          amount: amount,
          payee: {
            email_address: 'merchant-test@jobenpay.com',
            merchant_id: 'MERCHANT_001'
          }
        }
      ],
      links: [
        {
          href: `https://www.sandbox.paypal.com/checkoutnow?token=${id}`,
          rel: 'approve',
          method: 'GET'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${id}/authorize`,
          rel: 'authorize',
          method: 'POST'
        }
      ],
      create_time: new Date().toISOString()
    };

    this.store.orders.set(id, order);
    return { status: 201, body: order };
  }

  authorizeOrder(id, payload) {
    const order = this.store.orders.get(id);
    if (!order) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Order not found' } };

    if (order.status === 'COMPLETED') {
      return { status: 422, body: { name: 'ORDER_ALREADY_AUTHORIZED', message: 'Order has already been authorized' } };
    }

    order.status = 'COMPLETED';
    const authId = `AUTH-${randomUUID().substring(0, 8).toUpperCase()}`;
    const unit = order.purchase_units[0];
    
    // Masa berlaku otorisasi PayPal Sandbox: 29 hari ke depan
    const expiration = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();

    const authorization = {
      id: authId,
      status: 'CREATED',
      amount: unit.amount,
      remaining_amount: unit.amount,
      expiration_time: expiration,
      seller_protection: {
        status: 'ELIGIBLE',
        dispute_categories: ['ITEM_NOT_RECEIVED', 'UNAUTHORIZED_TRANSACTION']
      },
      links: [
        {
          href: `https://api-m.sandbox.paypal.com/v2/payments/authorizations/${authId}`,
          rel: 'self',
          method: 'GET'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v2/payments/authorizations/${authId}/capture`,
          rel: 'capture',
          method: 'POST'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v2/payments/authorizations/${authId}/void`,
          rel: 'void',
          method: 'POST'
        }
      ],
      create_time: new Date().toISOString(),
      update_time: new Date().toISOString()
    };

    this.store.authorizations.set(authId, authorization);
    order.purchase_units[0].payments = {
      authorizations: [authorization]
    };

    return {
      status: 201,
      body: {
        id: order.id,
        status: 'COMPLETED',
        purchase_units: [
          {
            reference_id: unit.reference_id,
            payments: {
              authorizations: [authorization]
            }
          }
        ]
      }
    };
  }

  captureAuthorization(authId, payload) {
    const auth = this.store.authorizations.get(authId);
    if (!auth) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Authorization not found' } };

    if (auth.status === 'VOIDED') {
      return { status: 422, body: { name: 'AUTHORIZATION_VOIDED', message: 'Cannot capture a voided authorization' } };
    }

    const captureAmount = payload?.amount || auth.amount;
    const isFinal = payload?.final_capture === undefined ? true : Boolean(payload.final_capture);

    const captureId = `CAP-AUTH-${randomUUID().substring(0, 8).toUpperCase()}`;
    const capture = {
      id: captureId,
      status: 'COMPLETED',
      amount: captureAmount,
      final_capture: isFinal,
      create_time: new Date().toISOString()
    };

    this.store.captures.set(captureId, capture);

    if (isFinal) {
      auth.status = 'CAPTURED';
    } else {
      auth.status = 'PARTIALLY_CAPTURED';
    }

    return { status: 201, body: capture };
  }

  voidAuthorization(authId) {
    const auth = this.store.authorizations.get(authId);
    if (!auth) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Authorization not found' } };

    if (auth.status === 'VOIDED' || auth.status === 'CAPTURED') {
      return { status: 422, body: { name: 'AUTHORIZATION_ALREADY_COMPLETED', message: `Cannot void authorization in status ${auth.status}` } };
    }

    auth.status = 'VOIDED';
    auth.update_time = new Date().toISOString();

    return { status: 200, body: auth };
  }
}

