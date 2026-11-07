/**
 * server/src/routes/disputes.js
 * RESTful API endpoints for DISPUTE transaction category (PRD 1.3 §5.1, AD-12, AD-23, T-06, K-DISPUTE)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';

export const disputesRouter = Router();

const createDisputeBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['chargeback', 'inquiry']).default('chargeback'),
  disputeId: z.string().optional(),
  paypalDisputeId: z.string().optional(),
  reason: z.string().min(1).max(100).optional(),
  counterpartyId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
});

disputesRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createDisputeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid dispute proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { amountMinor, currency, subType, disputeId, paypalDisputeId, reason, counterpartyId, description } = parsed.data;
    const amountMinorBigInt = BigInt(amountMinor);

    const result = await withTx(async (tx) => {
      // Check existing idempotency key
      const existing = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2',
        [orgId, idempotencyKey]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        if (row.amount_minor !== amountMinorBigInt.toString() || row.currency !== currency) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different payload', 422);
        }
        return { row, replayed: true };
      }

      const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000001';
      const mandateVersionId = req.mandate?.versionId || '00000000-0000-4000-8000-000000000001';
      const actualCounterpartyId = counterpartyId || '00000000-0000-4000-8000-000000000007';

      const inserted = await tx.query(`
        INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status,
          amount_minor, currency, counterparty_id, mandate_version_id,
          request_hash, idempotency_key, metadata
        ) VALUES (
          $1, $2, 'DISPUTE', $3, 'SUBMITTED',
          $4, $5, $6, $7,
          $8, $9, $10
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, actualCounterpartyId, mandateVersionId,
        `hash_disp_${idempotencyKey}`, idempotencyKey,
        JSON.stringify({
          disputeId: disputeId || null,
          paypalDisputeId: paypalDisputeId || null,
          reason: reason || 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
          description: description || null,
        })
      ]);

      const intentRow = inserted.rows[0];

      // Record in disputes table if paypalDisputeId provided
      if (paypalDisputeId) {
        await tx.query(`
          INSERT INTO disputes (
            org_id, paypal_dispute_id, status, reason, amount_minor, currency
          ) VALUES ($1, $2, 'OPEN', $3, $4, $5)
        `, [
          orgId,
          paypalDisputeId,
          reason || 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
          amountMinorBigInt.toString(),
          currency,
        ]);
      }

      return { row: intentRow, replayed: false };
    });

    const statusCode = result.replayed ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      intentId: result.row.intent_id,
      category: 'DISPUTE',
      subType: result.row.sub_type,
      status: result.row.status,
      amountMinor: result.row.amount_minor,
      currency: result.row.currency,
      replayed: result.replayed,
    });
  } catch (err) {
    next(err);
  }
});

disputesRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { id } = req.params;
    const result = await query(
      'SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2 AND category = $3',
      [orgId, id, 'DISPUTE']
    );

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Dispute transaction intent not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

disputesRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const result = await query(`
      SELECT ti.intent_id, ti.intent_id AS id, ti.sub_type, ti.status, ti.amount_minor, ti.currency,
             ti.created_at, ti.metadata, p.name AS counterparty_name
      FROM transaction_intents ti
      LEFT JOIN payees p ON p.id = ti.counterparty_id
      WHERE ti.org_id = $1 AND ti.category = 'DISPUTE'
      ORDER BY ti.created_at DESC
    `, [orgId]);

    res.json({
      success: true,
      disputes: result.rows.map(r => ({
        ...r,
        amount_minor: r.amount_minor?.toString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default disputesRouter;

