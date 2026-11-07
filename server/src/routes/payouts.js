/**
 * server/src/routes/payouts.js
 * RESTful API endpoints for PAYOUT transaction category (PRD 1.3 §5.1, K-PAYOUT)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { payoutProposalSchema } from '../../../shared/payout.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';

export const payoutsRouter = Router();

const createPayoutBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  payeeId: z.string().uuid(),
  agentReason: z.string().min(1).max(1000).optional(),
});

payoutsRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createPayoutBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid payout proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { amountMinor, currency, payeeId, agentReason } = parsed.data;
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

      const inserted = await tx.query(`
        INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status,
          amount_minor, currency, counterparty_id, mandate_version_id,
          request_hash, idempotency_key, metadata
        ) VALUES (
          $1, $2, 'PAYOUT', 'standard', 'SUBMITTED',
          $3, $4, $5, $6,
          $7, $8, $9
        ) RETURNING *
      `, [
        orgId, agentId, amountMinorBigInt.toString(), currency, payeeId, mandateVersionId,
        `hash_payout_${idempotencyKey}`, idempotencyKey,
        JSON.stringify({ agentReason: agentReason || null })
      ]);

      return { row: inserted.rows[0], replayed: false };
    });

    const statusCode = result.replayed ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      intentId: result.row.intent_id,
      category: 'PAYOUT',
      subType: 'standard',
      status: result.row.status,
      amountMinor: result.row.amount_minor,
      currency: result.row.currency,
      replayed: result.replayed,
    });
  } catch (err) {
    next(err);
  }
});

payoutsRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const result = await query(
      `SELECT ti.*, COALESCE(p.display_name, p.identifier_masked, 'Payout Recipient') AS counterparty_name
       FROM transaction_intents ti
       LEFT JOIN payees p ON p.id = ti.counterparty_id AND p.org_id = ti.org_id
       WHERE ti.org_id = $1 AND ti.category = 'PAYOUT'
       ORDER BY ti.created_at DESC LIMIT 100`,
      [orgId]
    );

    const rows = result.rows.map(r => ({ ...r, amount_minor: r.amount_minor?.toString() }));
    res.json({
      success: true,
      payouts: rows,
      transactions: rows,
    });
  } catch (err) {
    next(err);
  }
});

payoutsRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { id } = req.params;
    const result = await query(
      'SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2 AND category = $3',
      [orgId, id, 'PAYOUT']
    );

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Payout transaction intent not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

export default payoutsRouter;

