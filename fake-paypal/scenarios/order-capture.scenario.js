/**
 * fake-paypal/scenarios/order-capture.scenario.js
 * Skenario stateful untuk Order Capture (Kategori SALE).
 */

import { randomUUID } from 'node:crypto';

export class OrderCaptureScenario {
  constructor(store) {
    this.store = store;
  }

  createOrder(payload) {
    const id = `ORD-${randomUUID().substring(0, 8).toUpperCase()}`;
    const amount = payload?.purchase_units?.[0]?.amount || { currency_code: 'USD', value: '100.00' };
    
    const order = {
      id,
      status: 'CREATED',
      intent: 'CAPTURE',
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
          href: `https://api-m.sandbox.paypal.com/v2/checkout/orders/${id}/capture`,
          rel: 'capture',
          method: 'POST'
        }
      ],
      create_time: new Date().toISOString()
    };

    this.store.orders.set(id, order);
    return { status: 201, body: order };
  }

  approveOrder(id) {
    const order = this.store.orders.get(id);
    if (!order) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Order not found' } };
    order.status = 'APPROVED';
    return { status: 200, body: order };
  }

  captureOrder(id, payload) {
    const order = this.store.orders.get(id);
    if (!order) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Order not found' } };
    
    if (order.status === 'COMPLETED') {
      return { status: 422, body: { name: 'ORDER_ALREADY_CAPTURED', message: 'Order has already been captured' } };
    }

    order.status = 'COMPLETED';
    const captureId = `CAP-${randomUUID().substring(0, 8).toUpperCase()}`;
    const unit = order.purchase_units[0];
    
    const capture = {
      id: captureId,
      status: 'COMPLETED',
      amount: unit.amount,
      final_capture: true,
      seller_protection: {
        status: 'ELIGIBLE',
        dispute_categories: ['ITEM_NOT_RECEIVED', 'UNAUTHORIZED_TRANSACTION']
      },
      seller_receivable_breakdown: {
        gross_amount: unit.amount,
        paypal_fee: {
          currency_code: unit.amount.currency_code,
          value: '3.20'
        },
        net_amount: {
          currency_code: unit.amount.currency_code,
          value: (parseFloat(unit.amount.value) - 3.20).toFixed(2)
        }
      },
      create_time: new Date().toISOString(),
      update_time: new Date().toISOString()
    };

    this.store.captures.set(captureId, capture);
    order.purchase_units[0].payments = {
      captures: [capture]
    };

    return {
      status: 201,
      body: {
        id: order.id,
        status: 'COMPLETED',
        payment_source: {
          paypal: {
            email_address: 'buyer-test@jobenpay.com',
            account_id: 'BUYER_ACC_001'
          }
        },
        purchase_units: [
          {
            reference_id: unit.reference_id,
            payments: {
              captures: [capture]
            }
          }
        ]
      }
    };
  }
}

