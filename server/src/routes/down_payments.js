/**
 * server/src/routes/down_payments.js
 * RESTful API endpoints for DOWN_PAYMENT transaction category (PRD 1.3 §5.1, K-DOWN_PAYMENT)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';

export const downPaymentsRouter = Router();

const createDownPaymentBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['initial', 'settlement', 'forfeit']).default('initial'),
  totalAmountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]).optional(),
  authorizationId: z.string().optional(),
  initialIntentId: z.string().uuid().optional(),
  counterpartyId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
});

downPaymentsRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createDownPaymentBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid down payment proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { amountMinor, currency, subType, totalAmountMinor, authorizationId, initialIntentId, counterpartyId, description } = parsed.data;
    const amountMinorBigInt = BigInt(amountMinor);
    const totalMinorBigInt = totalAmountMinor ? BigInt(totalAmountMinor) : amountMinorBigInt;

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

      // Check down payment business constraints
      if (subType === 'initial') {
        if (totalAmountMinor && amountMinorBigInt >= totalMinorBigInt) {
          throw new AppError('DP_EXCEEDS_TOTAL', 'Down payment cannot equal or exceed total amount', 422);
        }
      } else if (subType === 'settlement' && initialIntentId) {
        const dpAccRes = await tx.query(
          'SELECT * FROM down_payment_accounts WHERE org_id = $1 AND intent_id = $2 FOR UPDATE',
          [orgId, initialIntentId]
        );
        if (dpAccRes.rowCount > 0) {
          const acc = dpAccRes.rows[0];
          if (acc.status === 'SETTLED') {
            throw new AppError('ALREADY_SETTLED', 'Down payment account is already settled', 409);
          }
          if (acc.status === 'FORFEITED') {
            throw new AppError('ILLEGAL_TRANSITION', 'Cannot settle forfeited down payment', 409);
          }
          const dpMinor = BigInt(acc.dp_amount_minor);
          const totalMinor = BigInt(acc.total_amount_minor);
          if (dpMinor + amountMinorBigInt !== totalMinor) {
            throw new AppError('SETTLEMENT_AMOUNT_MISMATCH', 'Settlement amount must equal total minus down payment', 422);
          }
        }
      }

      const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000001';
      const mandateVersionId = req.mandate?.versionId || '00000000-0000-4000-8000-000000000001';

      const inserted = await tx.query(`
        INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status,
          amount_minor, currency, counterparty_id, mandate_version_id,
          request_hash, idempotency_key, metadata
        ) VALUES (
          $1, $2, 'DOWN_PAYMENT', $3, 'SUBMITTED',
          $4, $5, $6, $7,
          $8, $9, $10
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, counterpartyId || null, mandateVersionId,
        `hash_dp_${idempotencyKey}`, idempotencyKey,
        JSON.stringify({
          authorizationId: authorizationId || null,
          totalAmountMinor: totalMinorBigInt.toString(),
          initialIntentId: initialIntentId || null,
          description: description || null,
        })
      ]);

      const intentRow = inserted.rows[0];

      // If initial DP, register in down_payment_accounts
      if (subType === 'initial' && counterpartyId) {
        await tx.query(`
          INSERT INTO down_payment_accounts (
            org_id, intent_id, counterparty_id, dp_amount_minor, total_amount_minor, status, authorization_id
          ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
        `, [
          orgId,
          intentRow.intent_id,
          counterpartyId,
          amountMinorBigInt.toString(),
          totalMinorBigInt.toString(),
          authorizationId || null,
        ]);
      }

      return { row: intentRow, replayed: false };
    });

    const statusCode = result.replayed ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      intentId: result.row.intent_id,
      category: 'DOWN_PAYMENT',
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

downPaymentsRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { id } = req.params;
    const result = await query(
      'SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2 AND category = $3',
      [orgId, id, 'DOWN_PAYMENT']
    );

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Down payment transaction intent not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

downPaymentsRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const result = await query(`
      SELECT ti.intent_id, ti.intent_id AS id, ti.status, ti.amount_minor, ti.currency, ti.created_at,
             dp.dp_amount_minor, dp.total_amount_minor, dp.settlement_amount_minor, dp.status AS dp_status,
             dp.authorization_id, COALESCE(p.display_name, p.identifier_masked, 'Counterparty') AS counterparty_name
      FROM transaction_intents ti
      LEFT JOIN down_payment_accounts dp ON dp.intent_id = ti.intent_id
      LEFT JOIN payees p ON p.id = ti.counterparty_id AND p.org_id = ti.org_id
      WHERE ti.org_id = $1 AND ti.category = 'DOWN_PAYMENT'
      ORDER BY ti.created_at DESC
    `, [orgId]);

    res.json({
      success: true,
      downPayments: result.rows.map(r => ({
        ...r,
        amount_minor: r.amount_minor?.toString(),
        dp_amount_minor: r.dp_amount_minor?.toString(),
        total_amount_minor: r.total_amount_minor?.toString(),
        settlement_amount_minor: r.settlement_amount_minor?.toString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

downPaymentsRouter.post('/:id/settle', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const { id } = req.params;
    await query(`
      UPDATE down_payment_accounts SET status = 'SETTLED'
      WHERE org_id = $1 AND intent_id = $2
    `, [orgId, id]);
    res.json({ ok: true, status: 'SETTLED' });
  } catch (err) {
    next(err);
  }
});

export default downPaymentsRouter;

