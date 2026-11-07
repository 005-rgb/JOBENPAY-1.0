/**
 * shared/split.js
 * Domain specification for SPLIT category (Tier B, PRD 1.3 §1.2, AD-13, AD-17, T-13, T-14, K-SPLIT)
 */

import { z } from 'zod';
import { mulBpsFloor, splitFee } from './money.js';

export const SPLIT_CONFIG = Object.freeze({
  category: 'SPLIT',
  subTypes: ['collect', 'split', 'hold', 'payout'],
  direction: 'IN_OUT',
  consumesBudget: true,
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
  maxPlatformFeeBps: 10000,
});

/**
 * Calculates platform fee and payee shares with guaranteed zero-diff exact balance.
 * Uses integer floor division:
 *   fee = floor(total * bps / 10000)
 *   netPayeeTotal = total - fee
 */
export function calculateSplitShares({ totalAmountMinor, platformFeeBps = 0, recipients = [] }) {
  const total = BigInt(totalAmountMinor);
  if (total <= 0n) {
    const err = new Error('Total amount must be greater than zero');
    err.code = 'INVALID_AMOUNT';
    err.statusCode = 422;
    throw err;
  }

  const bps = parseInt(String(platformFeeBps ?? 0), 10);
  if (bps < 0 || bps > SPLIT_CONFIG.maxPlatformFeeBps) {
    const err = new Error(`Platform fee bps must be between 0 and ${SPLIT_CONFIG.maxPlatformFeeBps}`);
    err.code = 'INVALID_FEE_BPS';
    err.statusCode = 422;
    throw err;
  }

  const { fee: platformFeeMinor, payee: netPayeeTotal } = splitFee(total, bps);

  if (!recipients || recipients.length === 0) {
    return {
      totalAmountMinor: total,
      platformFeeBps: bps,
      platformFeeMinor,
      shares: [],
      netPayeeTotal,
    };
  }

  // If 1 recipient, they get the full netPayeeTotal
  if (recipients.length === 1) {
    const r = recipients[0];
    return {
      totalAmountMinor: total,
      platformFeeBps: bps,
      platformFeeMinor,
      netPayeeTotal,
      shares: [
        {
          counterpartyId: r.counterpartyId ?? r.counterparty_id,
          amountMinor: netPayeeTotal,
          holdUntil: r.holdUntil ?? r.hold_until ?? null,
        },
      ],
    };
  }

  // Multiple recipients: apportion according to shareBps or equal parts
  let distributed = 0n;
  const shares = [];
  const count = BigInt(recipients.length);

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i];
    let shareAmount = 0n;

    if (r.shareBps !== undefined && r.shareBps !== null) {
      // Specified share in bps of netPayeeTotal
      shareAmount = (netPayeeTotal * BigInt(r.shareBps)) / 10000n;
    } else {
      // Divide equally
      shareAmount = netPayeeTotal / count;
    }

    // Last recipient gets remaining delta to guarantee sum === netPayeeTotal
    if (i === recipients.length - 1) {
      shareAmount = netPayeeTotal - distributed;
    } else {
      distributed += shareAmount;
    }

    shares.push({
      counterpartyId: r.counterpartyId ?? r.counterparty_id,
      amountMinor: shareAmount,
      holdUntil: r.holdUntil ?? r.hold_until ?? null,
    });
  }

  // Double check sum
  let sumShares = 0n;
  for (const s of shares) {
    sumShares += s.amountMinor;
  }

  if (sumShares + platformFeeMinor !== total) {
    const err = new Error('Split shares calculation produced an unbalanced sum');
    err.code = 'SPLIT_UNBALANCED';
    err.statusCode = 500;
    throw err;
  }

  return {
    totalAmountMinor: total,
    platformFeeBps: bps,
    platformFeeMinor,
    netPayeeTotal,
    shares,
  };
}

export const splitRecipientSchema = z.object({
  counterpartyId: z.string().uuid(),
  amountMinor: z.union([z.bigint(), z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).optional(),
  shareBps: z.number().int().min(0).max(10000).optional(),
  holdUntil: z.string().datetime().optional().nullable(),
});

export const splitProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['collect', 'split', 'hold', 'payout']).default('collect'),
  platformFeeBps: z.number().int().min(0).max(10000).default(0),
  parentIntentId: z.string().uuid().optional(),
  recipients: z.array(splitRecipientSchema).optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
});

export default {
  SPLIT_CONFIG,
  calculateSplitShares,
  splitRecipientSchema,
  splitProposalSchema,
};
