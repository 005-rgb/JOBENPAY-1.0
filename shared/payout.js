/**
 * shared/payout.js
 * Domain specification for PAYOUT transaction category (Tier A, PRD 1.3 §1.1, K-PAYOUT)
 */

import { z } from 'zod';

export const PAYOUT_CONFIG = Object.freeze({
  category: 'PAYOUT',
  subType: 'standard',
  direction: 'OUT',
  consumesBudget: true,
  provider: 'PAYPAL_PAYOUTS',
  endpoints: {
    create: '/v1/payments/payouts',
  },
  ledgerLegs: {
    debit: 'org:main',
    credit: 'payee:{cp}',
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const payoutProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  payeeId: z.string().uuid('payeeId must be a valid UUID'),
  agentReason: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

