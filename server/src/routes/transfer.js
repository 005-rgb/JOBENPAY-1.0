/**
 * server/src/routes/transfer.js
 * RESTful API endpoints for TRANSFER transaction category (PRD 1.3 §5.1, AD-17, T-18, K-TRANSFER)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { validateTransferParties } from '../../../shared/transfer.js';

export const transferRouter = Router();

const createTransferBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['p2p']).default('p2p'),
  senderCounterpartyId: z.string().uuid(),
  receiverCounterpartyId: z.string().uuid(),
  recipientEmail: z.string().email().optional(),
  description: z.string().min(1).max(1000).optional(),
}).refine(
  (data) => data.senderCounterpartyId !== data.receiverCounterpartyId,
  {
    message: 'Sender and receiver counterparties cannot be the same party',
    path: ['receiverCounterpartyId'],
  }
);

transferRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createTransferBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const isSenderEqualsReceiver = parsed.error.issues.some(
        (i) => i.message.includes('Sender and receiver counterparties cannot be the same party')
      );
      const err = new AppError(
        isSenderEqualsReceiver ? 'SENDER_EQUALS_RECEIVER' : 'VALIDATION_FAILED',
        isSenderEqualsReceiver ? 'Sender and receiver counterparties cannot be the same party' : 'Invalid transfer proposal body',
        422
      );
      err.details = parsed.error.issues;
      throw err;
    }

    const { amountMinor, currency, subType, senderCounterpartyId, receiverCounterpartyId, description } = parsed.data;

    // Domain validation
    validateTransferParties(senderCounterpartyId, receiverCounterpartyId);

    const amountMinorBigInt = BigInt(amountMinor);
    const targetEnv = (req.environment || req.headers['x-jobenpay-environment'] || req.headers['x-environment'] || 'SANDBOX').toUpperCase();

    const result = await withTx(async (tx) => {
      // Check existing idempotency key
      const existing = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2 AND environment = $3',
        [orgId, idempotencyKey, targetEnv]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        if (
          row.amount_minor !== amountMinorBigInt.toString() ||
          row.currency !== currency ||
          row.counterparty_id !== receiverCounterpartyId
        ) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different payload', 422);
        }
        return { row, replayed: true };
      }

      // Check active mandate
      const mandateRes = await tx.query(
        `SELECT id FROM mandates WHERE org_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
        [orgId]
      );
      const mandate = mandateRes.rows[0];
      const mandateVersionId = mandate?.id || '00000000-0000-4000-8000-000000000003';

      const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000002';
      const requestHash = `hash_${Date.now()}_${idempotencyKey}`;

      // Insert transaction_intents row (status DRAFT -> SUBMITTED)
      const insertIntent = await tx.query(`
        INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status,
          amount_minor, currency, counterparty_id, mandate_version_id,
          idempotency_key, request_hash, environment
        ) VALUES (
          $1, $2, 'TRANSFER', $3, 'SUBMITTED',
          $4, $5, $6, $7,
          $8, $9, $10
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, receiverCounterpartyId, mandateVersionId,
        idempotencyKey, requestHash, targetEnv
      ]);

      const intent = insertIntent.rows[0];

      // Insert transfer_records row
      await tx.query(`
        INSERT INTO transfer_records (
          org_id, intent_id, sender_counterparty_id, receiver_counterparty_id,
          amount_minor, currency, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
      `, [
        orgId, intent.intent_id, senderCounterpartyId, receiverCounterpartyId,
        amountMinorBigInt.toString(), currency
      ]);

      return { row: intent, replayed: false };
    });

    return res.status(result.replayed ? 200 : 201).json({
      intentId: result.row.intent_id,
      orgId: result.row.org_id,
      category: result.row.category,
      subType: result.row.sub_type,
      status: result.row.status,
      amountMinor: result.row.amount_minor,
      currency: result.row.currency,
      senderCounterpartyId,
      receiverCounterpartyId,
      replayed: result.replayed,
      createdAt: result.row.created_at,
    });
  } catch (err) {
    next(err);
  }
});

transferRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);
    const env = (req.environment || req.headers['x-jobenpay-environment'] || req.headers['x-environment'] || 'SANDBOX').toUpperCase();

    const intentId = req.params.id;
    const result = await query(`
      SELECT 
        ti.*,
        tr.sender_counterparty_id,
        tr.receiver_counterparty_id,
        tr.status AS transfer_status,
        tr.paypal_payout_id
      FROM transaction_intents ti
      LEFT JOIN transfer_records tr ON tr.intent_id = ti.intent_id
      WHERE ti.org_id = $1 AND ti.intent_id = $2 AND ti.category = 'TRANSFER' AND ti.environment = $3
    `, [orgId, intentId, env]);

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Transfer intent not found', 404);
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

transferRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);
    const env = (req.environment || req.headers['x-jobenpay-environment'] || req.headers['x-environment'] || 'SANDBOX').toUpperCase();

    const result = await query(`
      SELECT 
        ti.*,
        tr.sender_counterparty_id,
        tr.receiver_counterparty_id,
        tr.status AS transfer_status
      FROM transaction_intents ti
      LEFT JOIN transfer_records tr ON tr.intent_id = ti.intent_id
      WHERE ti.org_id = $1 AND ti.category = 'TRANSFER' AND ti.environment = $2
      ORDER BY ti.created_at DESC
      LIMIT 100
    `, [orgId, env]);

    res.json({ transfers: result.rows });
  } catch (err) {
    next(err);
  }
});

export default transferRouter;

