/**
 * shared/partial.js
 * Domain specification for PARTIAL transaction category (Tier A, PRD 1.3 §1.4, AD-10, AD-27, T-10, K-PARTIAL)
 */

import { z } from 'zod';

export const PARTIAL_CONFIG = Object.freeze({
  category: 'PARTIAL',
  subTypes: ['payment', 'refund'],
  subTypeConfig: {
    payment: {
      direction: 'IN',
      consumesBudget: false,
      provider: 'PAYPAL_PAYMENTS_AUTHORIZATION_CAPTURE',
      endpoint: '/v2/payments/authorizations/{id}/capture',
      ledgerLegs: {
        debit: 'buyer:{cp}',
        credit: 'org:main',
      },
    },
    refund: {
      direction: 'OUT',
      consumesBudget: false,
      provider: 'PAYPAL_PAYMENTS_REFUND',
      endpoint: '/v2/payments/captures/{id}/refund',
      ledgerLegs: {
        debit: 'org:main',
        credit: 'buyer:{cp}',
      },
    },
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const partialProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  subType: z.enum(['payment', 'refund']).default('payment'),
  authorizationId: z.string().optional(),
  captureId: z.string().optional(),
  isFinal: z.boolean().default(false),
  counterpartyId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export default {
  PARTIAL_CONFIG,
  partialProposalSchema,
};

