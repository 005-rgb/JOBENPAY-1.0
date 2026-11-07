/**
 * shared/bulk.js
 * Domain specification for BULK transaction category (Tier B, PRD 1.3 §1.2, AD-17, T-19, K-BULK)
 */

import { z } from 'zod';

export const MAX_BULK_ITEMS = 15000;
export const DEFAULT_CHUNK_SIZE = 500;

export const BULK_CONFIG = Object.freeze({
  category: 'BULK',
  subTypes: ['payout'],
  direction: 'OUT',
  consumesBudget: true,
  maxBatchItems: MAX_BULK_ITEMS,
  defaultChunkSize: DEFAULT_CHUNK_SIZE,
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export function computeParentStatus(itemStatuses) {
  if (!itemStatuses || itemStatuses.length === 0) return 'PENDING';

  const total = itemStatuses.length;
  let successCount = 0;
  let failedCount = 0;
  let pendingCount = 0;

  for (const s of itemStatuses) {
    if (s === 'COMPLETED' || s === 'SUCCESS') successCount++;
    else if (s === 'FAILED' || s === 'REJECTED') failedCount++;
    else pendingCount++;
  }

  if (pendingCount > 0) return 'EXECUTING';
  if (successCount === total) return 'COMPLETED';
  if (failedCount === total) return 'FAILED';
  return 'PARTIALLY_COMPLETED';
}

export const bulkItemSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  counterpartyId: z.string().uuid().optional(),
  recipientEmail: z.string().email().optional(),
  note: z.string().max(255).optional(),
});

export const bulkProposalSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['payout']).default('payout'),
  items: z.array(bulkItemSchema).min(1).max(MAX_BULK_ITEMS),
  idempotencyKey: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
});

export default {
  MAX_BULK_ITEMS,
  DEFAULT_CHUNK_SIZE,
  BULK_CONFIG,
  computeParentStatus,
  bulkItemSchema,
  bulkProposalSchema,
};

