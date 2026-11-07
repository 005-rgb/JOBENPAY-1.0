/**
 * server/src/services/paypal/invoice.js
 * PayPal Invoicing API v2 Adapter for INVOICE (PRD 1.3 §1.2, AD-05, T-05, K-INVOICE)
 */

import { formatMinor } from '../../db/money.js';

export async function createInvoice(paypalClient, {
  intentId,
  invoiceNumber,
  amountMinor,
  currency,
  dueDate,
  recipientEmail = 'client@example.com',
  note = 'Invoice issued by Jobenpay',
  step = 'invoice_create',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    detail: {
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString().split('T')[0],
      currency_code: currency,
      note,
      payment_term: {
        term_type: 'DUE_ON_DATE_SPECIFIED',
        due_date: dueDate,
      },
    },
    invoicer: {
      name: { given_name: 'Merchant Test' },
      email_address: 'merchant@jobenpay.com',
    },
    primary_recipients: [
      {
        billing_info: {
          name: { given_name: 'Client Test' },
          email_address: recipientEmail,
        },
      },
    ],
    amount: {
      currency_code: currency,
      value: formattedAmount,
    },
  };

  const response = await paypalClient.request('POST', '/v2/invoicing/invoices', {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: 'CREATED',
    invoiceId: response?.id,
    status: response?.status || 'DRAFT',
    providerRefs: {
      invoiceId: response?.id,
      invoiceNumber,
      status: response?.status || 'DRAFT',
    },
    raw: response,
  };
}

export async function sendInvoice(paypalClient, {
  intentId,
  invoiceId,
  step = 'invoice_send',
}) {
  const requestId = `jp_${intentId}_${step}`;

  const response = await paypalClient.request('POST', `/v2/invoicing/invoices/${invoiceId}/send`, {
    body: JSON.stringify({ send_to_invoicer: false }),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: 'SENT',
    invoiceId,
    status: 'SENT',
    providerRefs: {
      invoiceId,
      status: 'SENT',
    },
    raw: response,
  };
}

export async function recordPayment(paypalClient, {
  intentId,
  invoiceId,
  amountMinor,
  currency,
  paymentMethod = 'PAYPAL',
  step = 'invoice_pay',
}) {
  const requestId = `jp_${intentId}_${step}`;
  const formattedAmount = formatMinor(amountMinor, currency);

  const payload = {
    method: paymentMethod,
    amount: {
      currency_code: currency,
      value: formattedAmount,
    },
    payment_date: new Date().toISOString().split('T')[0],
  };

  const response = await paypalClient.request('POST', `/v2/invoicing/invoices/${invoiceId}/payments`, {
    body: JSON.stringify(payload),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: 'COMPLETED',
    invoiceId,
    paymentId: response?.payment_id,
    status: 'PAID',
    providerRefs: {
      invoiceId,
      paymentId: response?.payment_id,
      status: 'PAID',
    },
    raw: response,
  };
}

export async function cancelInvoice(paypalClient, {
  intentId,
  invoiceId,
  step = 'invoice_cancel',
}) {
  const requestId = `jp_${intentId}_${step}`;

  const response = await paypalClient.request('POST', `/v2/invoicing/invoices/${invoiceId}/cancel`, {
    body: JSON.stringify({ subject: 'Invoice cancelled' }),
    headers: {
      'PayPal-Request-Id': requestId,
      'Content-Type': 'application/json',
    },
  });

  return {
    outcome: 'CANCELLED',
    invoiceId,
    status: 'CANCELLED',
    providerRefs: {
      invoiceId,
      status: 'CANCELLED',
    },
    raw: response,
  };
}

export default {
  createInvoice,
  sendInvoice,
  recordPayment,
  cancelInvoice,
};

