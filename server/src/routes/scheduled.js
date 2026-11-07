/**
 * server/src/routes/scheduled.js
 * RESTful API endpoints for SCHEDULED transaction category (PRD 1.3 §5.1, AD-14, T-01, K-SCHEDULED)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { validateScheduledTime } from '../../../shared/scheduled.js';

export const scheduledRouter = Router();

const createScheduledBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['payout', 'charge']).default('payout'),
  scheduledAt: z.string().min(1),
  counterpartyId: z.string().uuid().optional(),
  recipientEmail: z.string().email().optional(),
  description: z.string().min(1).max(1000).optional(),
});

scheduledRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id;
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createScheduledBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid scheduled proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { amountMinor, currency, subType, scheduledAt, counterpartyId, recipientEmail, description } = parsed.data;

    // Validate scheduled time format and timezone offset
    try {
      validateScheduledTime(scheduledAt);
    } catch (valErr) {
      throw new AppError(valErr.code || 'VALIDATION_FAILED', valErr.message, valErr.statusCode || 422);
    }

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

      // Check active mandate
      const mandateRes = await tx.query(
        `SELECT id, valid_to FROM mandates WHERE org_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
        [orgId]
      );
      const mandate = mandateRes.rows[0];
      const mandateVersionId = mandate?.id || '00000000-0000-4000-8000-000000000003';

      if (mandate?.valid_to) {
        try {
          validateScheduledTime(scheduledAt, { mandateValidTo: mandate.valid_to });
        } catch (valErr) {
          throw new AppError(valErr.code || 'VALIDATION_FAILED', valErr.message, valErr.statusCode || 422);
        }
      }

      const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000002';
      const requestHash = `hash_${Date.now()}_${idempotencyKey}`;

      // Insert transaction_intents row
      const insertIntent = await tx.query(`
        INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status,
          amount_minor, currency, counterparty_id, mandate_version_id,
          request_hash, idempotency_key, metadata
        ) VALUES (
          $1, $2, 'SCHEDULED', $3, 'SCHEDULED',
          $4, $5, $6, $7,
          $8, $9, $10
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, counterpartyId || null, mandateVersionId,
        requestHash, idempotencyKey,
        JSON.stringify({ scheduledAt, recipientEmail, description }),
      ]);

      const intent = insertIntent.rows[0];

      // Register scheduled_runs row
      await tx.query(`
        INSERT INTO scheduled_runs (
          org_id, intent_id, scheduled_at, status
        ) VALUES ($1, $2, $3, 'PENDING')
      `, [orgId, intent.intent_id, scheduledAt]);

      return { row: intent, replayed: false };
    });

    res.status(result.replayed ? 200 : 201).json({
      intentId: result.row.intent_id,
      orgId: result.row.org_id,
      category: 'SCHEDULED',
      subType: result.row.sub_type,
      status: result.row.status,
      amountMinor: result.row.amount_minor,
      currency: result.row.currency,
      scheduledAt,
      replayed: result.replayed,
    });
  } catch (err) {
    next(err);
  }
});

scheduledRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id;
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { rows } = await query(`
      SELECT i.intent_id, i.org_id, i.category, i.sub_type, i.status, i.amount_minor, i.currency,
             i.counterparty_id, i.metadata, r.scheduled_at, r.status AS run_status, r.fired_at
      FROM transaction_intents i
      LEFT JOIN scheduled_runs r ON i.intent_id = r.intent_id
      WHERE i.org_id = $1 AND i.category = 'SCHEDULED'
      ORDER BY i.created_at DESC
      LIMIT 100
    `, [orgId]);

    res.json({ scheduled: rows });
  } catch (err) {
    next(err);
  }
});

scheduledRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id;
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { id } = req.params;

    const result = await withTx(async (tx) => {
      const intentRes = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2 FOR UPDATE',
        [orgId, id]
      );
      if (intentRes.rowCount === 0) {
        throw new AppError('NOT_FOUND', 'Scheduled intent not found', 404);
      }

      const intent = intentRes.rows[0];
      if (intent.status !== 'SCHEDULED') {
        throw new AppError('ILLEGAL_TRANSITION', `Cannot cancel intent in status ${intent.status}`, 409);
      }

      await tx.query(
        `UPDATE transaction_intents SET status = 'CANCELLED', updated_at = now() WHERE intent_id = $1`,
        [id]
      );

      await tx.query(
        `UPDATE scheduled_runs SET status = 'CANCELLED', updated_at = now() WHERE intent_id = $1`,
        [id]
      );

      return { intentId: id, status: 'CANCELLED' };
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

