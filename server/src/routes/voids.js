/**
 * server/src/routes/voids.js
 * RESTful API endpoints for VOID transaction category (PRD 1.3 §5.1, K-VOID)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';

export const voidsRouter = Router();

const createVoidBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['authorization', 'order']).default('authorization'),
  authorizationId: z.string().optional(),
  orderId: z.string().optional(),
  counterpartyId: z.string().uuid().optional(),
  reason: z.string().min(1).max(1000).optional(),
});

voidsRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createVoidBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid void proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { amountMinor, currency, subType, authorizationId, orderId, counterpartyId, reason } = parsed.data;
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

      // If voiding authorization, verify authorization exists and is not already voided
      if (subType === 'authorization' && authorizationId) {
        const authRes = await tx.query(
          'SELECT * FROM payment_authorizations WHERE org_id = $1 AND authorization_id = $2 FOR UPDATE',
          [orgId, authorizationId]
        );
        if (authRes.rowCount > 0 && authRes.rows[0].status === 'VOIDED') {
          throw new AppError('AUTHORIZATION_VOIDED', 'Authorization is already voided', 422);
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
          $1, $2, 'VOID', $3, 'SUBMITTED',
          $4, $5, $6, $7,
          $8, $9, $10
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, counterpartyId || null, mandateVersionId,
        `hash_void_${idempotencyKey}`, idempotencyKey,
        JSON.stringify({ authorizationId: authorizationId || null, orderId: orderId || null, reason: reason || null })
      ]);

      return { row: inserted.rows[0], replayed: false };
    });

    const statusCode = result.replayed ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      intentId: result.row.intent_id,
      category: 'VOID',
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

voidsRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const result = await query(
      `SELECT ti.*, COALESCE(p.display_name, p.identifier_masked, 'Counterparty') AS counterparty_name
       FROM transaction_intents ti
       LEFT JOIN payees p ON p.id = ti.counterparty_id AND p.org_id = ti.org_id
       WHERE ti.org_id = $1 AND ti.category = 'VOID'
       ORDER BY ti.created_at DESC LIMIT 100`,
      [orgId]
    );

    const rows = result.rows.map(r => ({ ...r, amount_minor: r.amount_minor?.toString() }));
    res.json({
      success: true,
      voids: rows,
      transactions: rows,
    });
  } catch (err) {
    next(err);
  }
});

voidsRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { id } = req.params;
    const result = await query(
      'SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2 AND category = $3',
      [orgId, id, 'VOID']
    );

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Void transaction intent not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

export default voidsRouter;

