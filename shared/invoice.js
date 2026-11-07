/**
 * shared/invoice.js
 * Domain specification for INVOICE category (Tier A, PRD 1.3 §1.2, T-05, K-INVOICE)
 */

import { z } from 'zod';

export const INVOICE_CONFIG = Object.freeze({
  category: 'INVOICE',
  subTypes: ['standard'],
  direction: 'IN', // Incoming payment from client / buyer
  consumesBudget: false, // Merchant incoming receivable; no budget deduction
  provider: 'PAYPAL_INVOICING_V2',
  endpoints: {
    createInvoice: '/v2/invoicing/invoices',
    sendInvoice: '/v2/invoicing/invoices/{id}/send',
    getInvoice: '/v2/invoicing/invoices/{id}',
    cancelInvoice: '/v2/invoicing/invoices/{id}/cancel',
    recordPayment: '/v2/invoicing/invoices/{id}/payments',
  },
  ledgerLegs: {
    debit: 'buyer:{cp}',
    credit: 'org:main',
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const invoiceProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  subType: z.enum(['standard']).default('standard'),
  invoiceNumber: z.string().min(1).max(50),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'),
  recipientEmail: z.string().email().optional(),
  counterpartyId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export default {
  INVOICE_CONFIG,
  invoiceProposalSchema,
};

