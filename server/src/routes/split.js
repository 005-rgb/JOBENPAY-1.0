/**
 * server/src/routes/split.js
 * RESTful API endpoints for SPLIT transaction category (PRD 1.3 §5.1, AD-13, AD-17, T-13, T-14, K-SPLIT)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { calculateSplitShares, splitProposalSchema } from '../../../shared/split.js';

export const splitRouter = Router();

const createSplitBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['collect', 'split', 'hold', 'payout']).default('collect'),
  platformFeeBps: z.number().int().min(0).max(10000).default(0),
  parentIntentId: z.string().uuid().optional(),
  counterpartyId: z.string().uuid().optional(),
  recipients: z.array(z.object({
    counterpartyId: z.string().uuid(),
    amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).optional(),
    shareBps: z.number().int().min(0).max(10000).optional(),
    holdUntil: z.string().datetime().optional().nullable(),
  })).optional(),
  description: z.string().min(1).max(1000).optional(),
});

splitRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id;
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createSplitBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid split proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const {
      amountMinor,
      currency,
      subType,
      platformFeeBps,
      parentIntentId,
      counterpartyId,
      recipients,
      description,
    } = parsed.data;

    const amountMinorBigInt = BigInt(amountMinor);

    // Calculate shares and platform fee
    const splitCalc = calculateSplitShares({
      totalAmountMinor: amountMinorBigInt,
      platformFeeBps,
      recipients: recipients || (counterpartyId ? [{ counterpartyId }] : []),
    });

    const result = await withTx(async (tx) => {
      // Check existing idempotency key
      const existing = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2',
        [orgId, idempotencyKey]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        if (
          row.amount_minor !== amountMinorBigInt.toString() ||
          row.currency !== currency ||
          row.sub_type !== subType
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
          idempotency_key, request_hash
        ) VALUES (
          $1, $2, 'SPLIT', $3, 'SUBMITTED',
          $4, $5, $6, $7,
          $8, $9
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, counterpartyId || null, mandateVersionId,
        idempotencyKey, requestHash
      ]);

      const intent = insertIntent.rows[0];

      // Insert split_records row
      await tx.query(`
        INSERT INTO split_records (
          org_id, intent_id, sub_type, parent_intent_id,
          total_amount_minor, currency, platform_fee_bps, platform_fee_minor,
          recipient_counterparty_id, recipient_share_minor, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
      `, [
        orgId, intent.intent_id, subType, parentIntentId || null,
        amountMinorBigInt.toString(), currency, platformFeeBps, splitCalc.platformFeeMinor.toString(),
        counterpartyId || null, splitCalc.netPayeeTotal.toString()
      ]);

      return { row: intent, replayed: false, splitCalc };
    });

    return res.status(result.replayed ? 200 : 201).json({
      intentId: result.row.intent_id,
      orgId: result.row.org_id,
      category: result.row.category,
      subType: result.row.sub_type,
      status: result.row.status,
      amountMinor: result.row.amount_minor,
      currency: result.row.currency,
      platformFeeBps,
      platformFeeMinor: result.splitCalc?.platformFeeMinor?.toString?.() || '0',
      netPayeeTotal: result.splitCalc?.netPayeeTotal?.toString?.() || result.row.amount_minor,
      replayed: result.replayed,
      createdAt: result.row.created_at,
    });
  } catch (err) {
    next(err);
  }
});

splitRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id;
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const intentId = req.params.id;
    const result = await query(`
      SELECT 
        ti.*,
        sr.platform_fee_bps,
        sr.platform_fee_minor,
        sr.recipient_share_minor,
        sr.status AS split_status,
        sr.paypal_reference_id
      FROM transaction_intents ti
      LEFT JOIN split_records sr ON sr.intent_id = ti.intent_id
      WHERE ti.org_id = $1 AND ti.intent_id = $2 AND ti.category = 'SPLIT'
    `, [orgId, intentId]);

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Split intent not found', 404);
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

splitRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id;
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const result = await query(`
      SELECT 
        ti.*,
        sr.platform_fee_bps,
        sr.platform_fee_minor,
        sr.recipient_share_minor,
        sr.status AS split_status
      FROM transaction_intents ti
      LEFT JOIN split_records sr ON sr.intent_id = ti.intent_id
      WHERE ti.org_id = $1 AND ti.category = 'SPLIT'
      ORDER BY ti.created_at DESC
      LIMIT 100
    `, [orgId]);

    res.json({ splits: result.rows });
  } catch (err) {
    next(err);
  }
});

export default splitRouter;

