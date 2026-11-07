/**
 * shared/debit.js
 * Shared domain logic & Zod validation schema for DEBIT (Tier C, PRD 1.3 §3, AD-17)
 */

import { z } from 'zod';

export const debitProposalSchema = z.object({
  authId: z.string().uuid(),
  amountMinor: z.union([
    z.number().int().positive(),
    z.string().regex(/^[1-9][0-9]*$/, 'Amount must be a positive integer minor string'),
  ]),
  currency: z.string().length(3).default('USD'),
  counterpartyId: z.string().uuid(),
  description: z.string().min(1).max(1000).optional(),
});

export const debitAuthorizationSchema = z.object({
  counterpartyId: z.string().uuid(),
  maxAmountMinor: z.union([
    z.number().int().positive(),
    z.string().regex(/^[1-9][0-9]*$/),
  ]),
  currency: z.string().length(3).default('USD'),
  frequencyLimit: z.enum(['ONCE', 'WEEKLY', 'MONTHLY', 'UNLIMITED']).default('MONTHLY'),
  validUntil: z.string().datetime(),
  mandateRef: z.string().min(1).max(255),
});

/**
 * Validates debit authorization status, validity window, and cap limit
 */
export function validateDebitAuthorization({ authorization, requestedAmountMinor, now = new Date() }) {
  if (!authorization) {
    const err = new Error('Debit authorization not found.');
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  if (authorization.status !== 'ACTIVE') {
    const err = new Error(`Debit authorization is not active (status: ${authorization.status}).`);
    err.code = 'DEBIT_AUTH_INVALID';
    err.statusCode = 422;
    throw err;
  }

  const validUntil = new Date(authorization.valid_until || authorization.validUntil);
  if (now.getTime() > validUntil.getTime()) {
    const err = new Error('Debit authorization has expired.');
    err.code = 'MANDATE_EXPIRED';
    err.statusCode = 410;
    throw err;
  }

  const requested = BigInt(requestedAmountMinor);
  const maxAllowed = BigInt(authorization.max_amount_minor || authorization.maxAmountMinor);
  if (requested > maxAllowed) {
    const err = new Error(`Requested debit amount ${requested} exceeds authorized limit ${maxAllowed}.`);
    err.code = 'CAP_EXCEEDED';
    err.statusCode = 422;
    throw err;
  }

  return true;
}

export default {
  debitProposalSchema,
  debitAuthorizationSchema,
  validateDebitAuthorization,
};

