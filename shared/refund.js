/**
 * shared/refund.js
 * Domain specification for REFUND transaction category (Tier A, PRD 1.3 §1.3, AD-27, T-10, K-REFUND)
 */

import { z } from 'zod';

export const REFUND_CONFIG = Object.freeze({
  category: 'REFUND',
  subTypes: ['full', 'partial'],
  direction: 'OUT',
  consumesBudget: false, // Reversed from sales / merchant organization cash
  provider: 'PAYPAL_PAYMENTS_REFUND',
  maxRefundWindowDays: 180, // PayPal standard refund window (180 days)
  endpoints: {
    refundCapture: '/v2/payments/captures/{id}/refund',
    getRefund: '/v2/payments/refunds/{id}',
  },
  ledgerLegs: {
    debit: 'org:main',
    credit: 'buyer:{cp}',
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const refundProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  captureId: z.string().min(1, 'captureId is required'),
  counterpartyId: z.string().uuid().optional(),
  reason: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export default {
  REFUND_CONFIG,
  refundProposalSchema,
};

