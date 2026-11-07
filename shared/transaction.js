/**
 * shared/transaction.js
 * Universal transaction categories, sub-types, validation schemas, and metadata definitions.
 * (PRD 1.3 §2, §5, §10, FR-1307)
 */

import { z } from 'zod';

export const TRANSACTION_CATEGORIES = Object.freeze([
  'PAYOUT',
  'SALE',
  'REFUND',
  'VOID',
  'PARTIAL',
  'DOWN_PAYMENT',
  'INVOICE',
  'DISPUTE',
  'SCHEDULED',
  'RECURRING',
  'BULK',
  'SPLIT',
  'TRANSFER',
  'FINANCING',
  'DEBIT',
]);

export const CATEGORY_SUBTYPES = Object.freeze({
  PAYOUT: ['standard'],
  SALE: ['standard'],
  REFUND: ['full', 'partial'],
  VOID: ['authorization', 'order'],
  PARTIAL: ['payment', 'refund'],
  DOWN_PAYMENT: ['initial', 'settlement', 'forfeit'],
  INVOICE: ['standard'],
  DISPUTE: ['chargeback', 'inquiry'],
  SCHEDULED: ['payout', 'charge'],
  RECURRING: ['init', 'charge', 'cancel'],
  BULK: ['payout'],
  SPLIT: ['collect', 'split', 'hold', 'payout'],
  TRANSFER: ['p2p'],
  FINANCING: ['po', 'invoice'],
  DEBIT: ['direct'],
});

export const TRANSACTION_STATUSES = Object.freeze([
  'DRAFT',
  'SUBMITTED',
  'EVALUATING',
  'NEEDS_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXECUTING',
  'COMPLETED',
  'FAILED',
  'CANCELED',
  'RECONCILED',
]);

export const CATEGORY_PROVIDERS = Object.freeze({
  PAYOUT: 'SANDBOX',
  SALE: 'SANDBOX',
  REFUND: 'SANDBOX',
  VOID: 'SANDBOX',
  PARTIAL: 'SANDBOX',
  DOWN_PAYMENT: 'SANDBOX',
  INVOICE: 'SANDBOX',
  DISPUTE: 'SANDBOX',
  SCHEDULED: 'SANDBOX',
  RECURRING: 'SANDBOX',
  BULK: 'SANDBOX',
  SPLIT: 'SANDBOX',
  TRANSFER: 'SANDBOX',
  FINANCING: 'SIMULATED',
  DEBIT: 'SIMULATED',
});

export const createTransactionSchema = z.object({
  category: z.enum([
    'PAYOUT',
    'SALE',
    'REFUND',
    'VOID',
    'PARTIAL',
    'DOWN_PAYMENT',
    'INVOICE',
    'DISPUTE',
    'SCHEDULED',
    'RECURRING',
    'BULK',
    'SPLIT',
    'TRANSFER',
    'FINANCING',
    'DEBIT',
  ]),
  subType: z.string().min(1),
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  counterpartyId: z.string().uuid().optional(),
  parentIntentId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).default({}),
  agentReason: z.string().min(1).max(1000).optional(),
}).refine((data) => {
  const allowedSubtypes = CATEGORY_SUBTYPES[data.category];
  return allowedSubtypes && allowedSubtypes.includes(data.subType);
}, {
  message: 'Invalid subType for category',
  path: ['subType'],
});

