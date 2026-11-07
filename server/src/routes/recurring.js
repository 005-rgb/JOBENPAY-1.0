/**
 * server/src/routes/recurring.js
 * RESTful API endpoints for RECURRING transaction category (PRD 1.3 §5.1, AD-17, T-08, K-RECURRING)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { validateRecurringSchedule } from '../../../shared/recurring.js';

export const recurringRouter = Router();

const createRecurringBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
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
  maxCycleAmount: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).optional(),
  description: z.string().min(1).max(1000).optional(),
});

recurringRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createRecurringBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid recurring proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const {
      amountMinor,
      currency,
      subType,
      frequency,
      intervalCount,
      counterpartyId,
      subscriberEmail,
      parentIntentId,
      paypalPlanId,
      paypalSubscriptionId,
      remainingCycles,
      maxCycleAmount,
      description,
    } = parsed.data;

    // Validate frequency, interval, and limits
    try {
      validateRecurringSchedule({
        frequency,
        intervalCount,
        amountMinor,
        currency,
        remainingCycles,
        maxCycleAmount,
      });
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
          $1, $2, 'RECURRING', $3, 'SUBMITTED',
          $4, $5, $6, $7,
          $8, $9
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, counterpartyId, mandateVersionId,
        idempotencyKey, requestHash
      ]);

      const intent = insertIntent.rows[0];

      // Insert recurring_schedules row
      const nextRunAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await tx.query(`
        INSERT INTO recurring_schedules (
          org_id, intent_id, counterparty_id,
          amount_minor, currency, frequency, interval_count,
          next_run_at, remaining_cycles, paypal_plan_id, paypal_subscription_id,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE')
      `, [
        orgId, intent.intent_id, counterpartyId,
        amountMinorBigInt.toString(), currency, frequency, intervalCount,
        nextRunAt, remainingCycles ?? 12, paypalPlanId || null, paypalSubscriptionId || null
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
      frequency,
      counterpartyId,
      replayed: result.replayed,
      createdAt: result.row.created_at,
    });
  } catch (err) {
    next(err);
  }
});

recurringRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const intentId = req.params.id;
    const result = await query(`
      SELECT 
        ti.*,
        rs.frequency,
        rs.interval_count,
        rs.next_run_at,
        rs.remaining_cycles,
        rs.status AS recurring_status,
        rs.paypal_subscription_id
      FROM transaction_intents ti
      LEFT JOIN recurring_schedules rs ON rs.intent_id = ti.intent_id
      WHERE ti.org_id = $1 AND ti.intent_id = $2 AND ti.category = 'RECURRING'
    `, [orgId, intentId]);

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Recurring intent not found', 404);
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

recurringRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const result = await query(`
      SELECT 
        ti.*,
        rs.frequency,
        rs.interval_count,
        rs.next_run_at,
        rs.remaining_cycles,
        rs.status AS recurring_status
      FROM transaction_intents ti
      LEFT JOIN recurring_schedules rs ON rs.intent_id = ti.intent_id
      WHERE ti.org_id = $1 AND ti.category = 'RECURRING'
      ORDER BY ti.created_at DESC
      LIMIT 100
    `, [orgId]);

    res.json({ recurrings: result.rows });
  } catch (err) {
    next(err);
  }
});

export default recurringRouter;

