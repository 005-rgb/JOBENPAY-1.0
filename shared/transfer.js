/**
 * shared/transfer.js
 * Domain specification for TRANSFER category (Tier B, PRD 1.3 §1.2, AD-17, T-18, K-TRANSFER)
 */

import { z } from 'zod';

export const TRANSFER_CONFIG = Object.freeze({
  category: 'TRANSFER',
  subTypes: ['p2p'],
  direction: 'OUT',
  consumesBudget: true,
  ledgerRule: 'RULE_TRANSFER_P2P',
  supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
});

export function validateTransferParties(senderId, receiverId) {
  if (!senderId || !receiverId) {
    const err = new Error('Both sender and receiver counterparty IDs are required');
    err.code = 'PARTIES_REQUIRED';
    err.statusCode = 422;
    throw err;
  }

  if (senderId === receiverId) {
    const err = new Error('Sender and receiver counterparties cannot be the same party');
    err.code = 'SENDER_EQUALS_RECEIVER';
    err.statusCode = 422;
    throw err;
  }

  return true;
}

export const transferProposalSchema = z.object({
  amountMinor: z.union([z.bigint(), z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['p2p']).default('p2p'),
  senderCounterpartyId: z.string().uuid(),
  receiverCounterpartyId: z.string().uuid(),
  recipientEmail: z.string().email().optional(),
  description: z.string().min(1).max(1000).optional(),
  idempotencyKey: z.string().min(1).max(255),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => data.senderCounterpartyId !== data.receiverCounterpartyId,
  {
    message: 'Sender and receiver counterparties cannot be the same party',
    path: ['receiverCounterpartyId'],
  }
);

export default {
  TRANSFER_CONFIG,
  validateTransferParties,
  transferProposalSchema,
};

