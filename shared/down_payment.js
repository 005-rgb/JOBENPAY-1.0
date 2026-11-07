/**
 * shared/down_payment.js
 * Domain specification for DOWN_PAYMENT category (Tier A, PRD 1.3 §1.2, AD-04, AD-26, T-09, K-DOWN_PAYMENT)
 */

import { z } from 'zod';

export const DOWN_PAYMENT_CONFIG = Object.freeze({
  category: 'DOWN_PAYMENT',
  subTypes: ['initial', 'settlement', 'forfeit'],
  direction: 'IN', // Initial & settlement receive money into merchant; forfeit claims internal escrow
  consumesBudget: false, // Merchant incoming / internal claim; no budget deduction
  authorizationValidityDays: 29, // PayPal maximum authorization window is 29 days
  subTypeConfig: {
    initial: {
      provider: 'PAYPAL_ORDERS_AUTHORIZE_CAPTURE_PARTIAL',
      endpoint: '/v2/payments/authorizations/{id}/capture',
      finalCapture: false,
      ledgerLegs: {
        debit: 'buyer:{cp}',
        credit: 'org:down_payment_escrow',
      },
    },
    settlement: {
      provider: 'PAYPAL_PAYMENTS_CAPTURE_FINAL',
      endpoint: '/v2/payments/authorizations/{id}/capture',
      finalCapture: true,
      ledgerLegs: {
        debit: 'buyer:{cp}',
        credit: 'org:main',
      },
    },
    forfeit: {
      provider: 'PAYPAL_PAYMENTS_AUTHORIZATION_VOID',
      endpoint: '/v2/payments/authorizations/{id}/void',
      ledgerLegs: {
        debit: 'org:down_payment_escrow',
        credit: 'org:main',
      },
    },
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export const downPaymentProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  subType: z.enum(['initial', 'settlement', 'forfeit']).default('initial'),
  totalAmountMinor: z.union([z.bigint(), z.number().int().positive()]).optional(),
  authorizationId: z.string().optional(),
  initialIntentId: z.string().uuid().optional(),
  counterpartyId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
});

export default {
  DOWN_PAYMENT_CONFIG,
  downPaymentProposalSchema,
};

