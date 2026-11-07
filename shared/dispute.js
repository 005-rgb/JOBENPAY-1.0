/**
 * shared/dispute.js
 * Domain specification for DISPUTE category (Tier A, PRD 1.3 §1.2, AD-12, AD-23, T-06, K-DISPUTE)
 */

import { z } from 'zod';

export const DISPUTE_CONFIG = Object.freeze({
  category: 'DISPUTE',
  subTypes: ['chargeback', 'inquiry'],
  direction: 'OUT', // Chargeback deduction when lost / reversed from organization
  consumesBudget: false, // Dispute reversals are claims against sales/cash, not operational budget
  provider: 'PAYPAL_CUSTOMER_DISPUTES_V1',
  endpoints: {
    listDisputes: '/v1/customer-disputes',
    getDispute: '/v1/customer-disputes/{id}',
    provideEvidence: '/v1/customer-disputes/{id}/provide-evidence',
    acceptClaim: '/v1/customer-disputes/{id}/accept-claim',
  },
  subTypeConfig: {
    chargeback: {
      direction: 'OUT',
      consumesBudget: false,
      ledgerLegs: {
        debit: 'org:main',
        credit: 'buyer:{cp}',
      },
    },
    inquiry: {
      direction: 'NONE',
      consumesBudget: false,
      ledgerLegs: {
        debit: 'org:main',
        credit: 'org:main',
      },
    },
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const disputeProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  subType: z.enum(['chargeback', 'inquiry']).default('chargeback'),
  disputeId: z.string().optional(),
  paypalDisputeId: z.string().optional(),
  reason: z.string().min(1).max(100).optional(),
  counterpartyId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export default {
  DISPUTE_CONFIG,
  disputeProposalSchema,
};

