/**
 * shared/void.js
 * Domain specification for VOID transaction category (Tier A, PRD 1.3 §1.4, AD-11, K-VOID)
 */

import { z } from 'zod';

export const VOID_CONFIG = Object.freeze({
  category: 'VOID',
  subTypes: ['authorization', 'order'],
  direction: 'NONE',
  consumesBudget: false,
  provider: 'PAYPAL_PAYMENTS_AUTHORIZATION_VOID',
  endpoints: {
    voidAuthorization: '/v2/payments/authorizations/{id}/void',
  },
  ledgerLegs: {
    debit: 'buyer:{cp}',
    credit: 'org:authorized_holds',
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const voidProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  subType: z.enum(['authorization', 'order']).default('authorization'),
  authorizationId: z.string().optional(),
  orderId: z.string().optional(),
  counterpartyId: z.string().uuid().optional(),
  reason: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export default {
  VOID_CONFIG,
  voidProposalSchema,
};

