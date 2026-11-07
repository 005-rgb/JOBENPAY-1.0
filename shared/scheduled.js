/**
 * shared/scheduled.js
 * Domain specification for SCHEDULED category (Tier B, PRD 1.3 §1.2, AD-14, T-01, K-SCHEDULED)
 */

import { z } from 'zod';

export const SCHEDULED_CONFIG = Object.freeze({
  category: 'SCHEDULED',
  subTypes: ['payout', 'charge'],
  subTypeConfig: {
    payout: {
      baseCategory: 'PAYOUT',
      direction: 'OUT',
      consumesBudget: true,
      ledgerRule: 'RULE_SCHEDULED_PAYOUT',
    },
    charge: {
      baseCategory: 'SALE',
      direction: 'IN',
      consumesBudget: false,
      ledgerRule: 'RULE_SCHEDULED_CHARGE',
    },
  },
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

const ISO_WITH_OFFSET_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateScheduledTime(scheduledAtStr, options = {}) {
  if (!scheduledAtStr || typeof scheduledAtStr !== 'string') {
    const err = new Error('Scheduled time must be an ISO-8601 string');
    err.code = 'INVALID_SCHEDULE_FORMAT';
    err.statusCode = 422;
    throw err;
  }

  if (!ISO_WITH_OFFSET_REGEX.test(scheduledAtStr)) {
    const err = new Error('Scheduled time must include an explicit timezone offset (e.g. Z or +07:00)');
    err.code = 'TIMEZONE_OFFSET_REQUIRED';
    err.statusCode = 422;
    throw err;
  }

  const scheduledTime = new Date(scheduledAtStr);
  if (isNaN(scheduledTime.getTime())) {
    const err = new Error('Invalid scheduled date');
    err.code = 'INVALID_SCHEDULE_DATE';
    err.statusCode = 422;
    throw err;
  }

  const now = options.now ? new Date(options.now) : new Date();
  if (scheduledTime.getTime() < now.getTime() && !options.allowPast) {
    const err = new Error('Scheduled time cannot be in the past');
    err.code = 'SCHEDULE_IN_PAST';
    err.statusCode = 422;
    throw err;
  }

  if (options.mandateValidTo) {
    const validTo = new Date(options.mandateValidTo);
    if (scheduledTime.getTime() > validTo.getTime()) {
      const err = new Error('Scheduled time exceeds mandate validTo expiration');
      err.code = 'SCHEDULE_OUT_OF_RANGE';
      err.statusCode = 422;
      throw err;
    }
  }

  return { valid: true, scheduledTime: scheduledTime.toISOString() };
}

export const scheduledProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive()]),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be 3 uppercase letters'),
  subType: z.enum(['payout', 'charge']).default('payout'),
  scheduledAt: z.string().regex(ISO_WITH_OFFSET_REGEX, 'Scheduled time must include timezone offset (e.g. Z or +07:00)'),
  counterpartyId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
});

export default {
  SCHEDULED_CONFIG,
  validateScheduledTime,
  scheduledProposalSchema,
};

