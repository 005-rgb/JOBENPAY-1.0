/**
 * shared/recurring.js
 * Domain specification for RECURRING category (Tier B, PRD 1.3 §1.2, AD-17, T-08, K-RECURRING)
 */

import { z } from 'zod';

export const RECURRING_FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

export const RECURRING_CONFIG = Object.freeze({
  category: 'RECURRING',
  subTypes: ['init', 'charge', 'cancel'],
  direction: 'IN', // Recurring subscription collection into organization revenue
  consumesBudget: false,
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
  maxIntervalCount: 12,
  maxCyclesLimit: 365,
});

/**
 * Validates recurring agreement frequency, intervals, and limits (T-08, test_recurring_limit).
 */
export function validateRecurringSchedule({
  frequency,
  intervalCount = 1,
  amountMinor,
  currency,
  remainingCycles = null,
  maxCycleAmount = null,
}) {
  if (!RECURRING_FREQUENCIES.includes(frequency)) {
    const err = new Error(`Invalid recurring frequency: ${frequency}. Must be one of ${RECURRING_FREQUENCIES.join(', ')}`);
    err.code = 'INVALID_FREQUENCY';
    err.statusCode = 422;
    throw err;
  }

  const interval = parseInt(String(intervalCount || 1), 10);
  if (interval <= 0 || interval > RECURRING_CONFIG.maxIntervalCount) {
    const err = new Error(`Interval count must be between 1 and ${RECURRING_CONFIG.maxIntervalCount}`);
    err.code = 'INVALID_INTERVAL_COUNT';
    err.statusCode = 422;
    throw err;
  }

  const amt = BigInt(amountMinor);
  if (amt <= 0n) {
    const err = new Error('Amount must be strictly greater than zero');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 422;
    throw err;
  }

  if (maxCycleAmount !== null && maxCycleAmount !== undefined) {
    const maxAmt = BigInt(maxCycleAmount);
    if (amt > maxAmt) {
      const err = new Error(`Recurring charge amount ${amt} exceeds cycle limit of ${maxAmt}`);
      err.code = 'RECURRING_LIMIT_EXCEEDED';
      err.statusCode = 422;
      throw err;
    }
  }

  if (remainingCycles !== null && remainingCycles !== undefined) {
    const cycles = parseInt(String(remainingCycles), 10);
    if (cycles <= 0) {
      const err = new Error('Recurring subscription cycles have expired');
      err.code = 'RECURRING_CYCLES_EXPIRED';
      err.statusCode = 422;
      throw err;
    }
  }

  return true;
}

export const recurringProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['init', 'charge', 'cancel']).default('init'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']).default('MONTHLY'),
  intervalCount: z.number().int().min(1).max(12).default(1),
  counterpartyId: z.string().uuid(),
  subscriberEmail: z.string().email().optional(),
  parentIntentId: z.string().uuid().optional(),
  paypalPlanId: z.string().optional(),
  paypalSubscriptionId: z.string().optional(),
  remainingCycles: z.number().int().min(0).max(365).optional().nullable(),
  maxCycleAmount: z.union([z.bigint(), z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
});

export default {
  RECURRING_FREQUENCIES,
  RECURRING_CONFIG,
  validateRecurringSchedule,
  recurringProposalSchema,
};

