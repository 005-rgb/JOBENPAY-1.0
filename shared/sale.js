/**
 * shared/sale.js
 * Domain specification for SALE transaction category (Tier A, PRD 1.3 §1.2, K-SALE)
 */

import { z } from 'zod';

export const SALE_CONFIG = Object.freeze({
  category: 'SALE',
  subType: 'standard',
  direction: 'IN',
  consumesBudget: false,
  provider: 'PAYPAL_ORDERS_CAPTURE',
  endpoints: {
    createOrder: '/v2/checkout/orders',
    captureOrder: '/v2/checkout/orders/{id}/capture',
  },
  ledgerLegs: {
    debit: 'buyer:{cp}',
    credit: 'org:main',
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const saleProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  counterpartyId: z.string().uuid('counterpartyId must be a valid UUID').optional(),
  buyerEmail: z.string().email().optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export default {
  SALE_CONFIG,
  saleProposalSchema,
};

