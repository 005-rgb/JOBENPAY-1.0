/**
 * fake-paypal/scenarios/invoicing.scenario.js
 * Skenario stateful untuk Invoicing API v2.
 */

import { randomUUID } from 'node:crypto';

export class InvoicingScenario {
  constructor(store) {
    this.store = store;
  }

  createInvoice(payload) {
    const id = `INV2-${randomUUID().substring(0, 8).toUpperCase()}`;
    const invoice = {
      id,
      status: 'DRAFT',
      detail: payload?.detail || {
        invoice_number: `INV-${Date.now()}`,
        invoice_date: new Date().toISOString().split('T')[0],
        currency_code: 'USD'
      },
      invoicer: payload?.invoicer || {
        name: { given_name: 'Merchant Test' },
        email_address: 'merchant@jobenpay.com'
      },
      primary_recipients: payload?.primary_recipients || [
        {
          billing_info: {
            name: { given_name: 'Client Test' },
            email_address: 'client@example.com'
          }
        }
      ],
      amount: payload?.amount || {
        currency_code: 'USD',
        value: '150.00'
      },
      links: [
        {
          href: `https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${id}`,
          rel: 'self',
          method: 'GET'
        },
        {
          href: `https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${id}/send`,
          rel: 'send',
          method: 'POST'
        }
      ]
    };

    this.store.invoices.set(id, invoice);
    return { status: 201, body: invoice };
  }

  getInvoice(id) {
    const invoice = this.store.invoices.get(id);
    if (!invoice) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Invoice not found' } };
    return { status: 200, body: invoice };
  }

  sendInvoice(id) {
    const invoice = this.store.invoices.get(id);
    if (!invoice) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Invoice not found' } };

    invoice.status = 'SENT';
    return { status: 202, body: { href: `https://api-m.sandbox.paypal.com/v2/invoicing/invoices/${id}`, rel: 'self', method: 'GET' } };
  }

  recordPayment(id, payload) {
    const invoice = this.store.invoices.get(id);
    if (!invoice) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Invoice not found' } };

    invoice.status = 'PAID';
    const paymentId = `PAY-${randomUUID().substring(0, 8).toUpperCase()}`;
    return { status: 200, body: { payment_id: paymentId } };
  }

  cancelInvoice(id) {
    const invoice = this.store.invoices.get(id);
    if (!invoice) return { status: 404, body: { name: 'RESOURCE_NOT_FOUND', message: 'Invoice not found' } };

    invoice.status = 'CANCELLED';
    return { status: 204, body: null };
  }
}

