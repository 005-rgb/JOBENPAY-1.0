/**
 * server/src/routes/bulk.js
 * RESTful API endpoints for BULK transaction category (PRD 1.3 §5.1, AD-17, T-19, K-BULK)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { MAX_BULK_ITEMS } from '../../../shared/bulk.js';

export const bulkRouter = Router();

const bulkItemBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  counterpartyId: z.string().uuid().optional(),
  recipientEmail: z.string().email().optional(),
  note: z.string().max(255).optional(),
});

const createBulkBodySchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['payout']).default('payout'),
  items: z.array(bulkItemBodySchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

bulkRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createBulkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid bulk proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { currency, subType, items, metadata } = parsed.data;

    if (items.length > MAX_BULK_ITEMS) {
      throw new AppError(
        'BULK_TOO_LARGE',
        `Bulk batch exceeds maximum limit of ${MAX_BULK_ITEMS} items (got ${items.length})`,
        422
      );
    }

    // Compute total minor amount using BigInt
    let totalAmountMinor = 0n;
    for (const item of items) {
      totalAmountMinor += BigInt(item.amountMinor);
    }

    const result = await withTx(async (tx) => {
      // Check existing idempotency key
      const existing = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2',
        [orgId, idempotencyKey]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        if (row.amount_minor !== totalAmountMinor.toString() || row.currency !== currency) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different payload', 422);
        }
        const batchCheck = await tx.query(
          'SELECT * FROM bulk_batches WHERE parent_intent_id = $1',
          [row.intent_id]
        );
        return {
          parent: row,
          batch: batchCheck.rows[0],
          replayed: true,
        };
      }

      // Check active mandate
      const mandateRes = await tx.query(
        `SELECT id FROM mandates WHERE org_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1`,
        [orgId]
      );
      const mandateVersionId = mandateRes.rows[0]?.id || '00000000-0000-4000-8000-000000000003';
      const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000002';
      const requestHash = `hash_bulk_${Date.now()}_${idempotencyKey}`;

      // Insert parent intent
      const parentInsert = await tx.query(`
        INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status,
          amount_minor, currency, mandate_version_id,
          request_hash, idempotency_key, metadata
        ) VALUES (
          $1, $2, 'BULK', $3, 'SUBMITTED',
          $4, $5, $6,
          $7, $8, $9
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        totalAmountMinor.toString(), currency, mandateVersionId,
        requestHash, idempotencyKey,
        JSON.stringify({ itemCount: items.length, metadata }),
      ]);

      const parentIntent = parentInsert.rows[0];

      // Insert bulk_batches record
      const batchInsert = await tx.query(`
        INSERT INTO bulk_batches (
          org_id, parent_intent_id, item_count, total_amount_minor, currency, status
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING')
        RETURNING *
      `, [
        orgId, parentIntent.intent_id, items.length, totalAmountMinor.toString(), currency,
      ]);

      const batch = batchInsert.rows[0];

      // Insert child intents per item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const itemAmount = BigInt(item.amountMinor);
        const childIdemp = `${idempotencyKey}_item_${i + 1}`;
        await tx.query(`
          INSERT INTO transaction_intents (
            org_id, agent_id, category, sub_type, status,
            amount_minor, currency, counterparty_id, parent_intent_id,
            mandate_version_id, request_hash, idempotency_key, metadata
          ) VALUES (
            $1, $2, 'BULK', 'payout', 'SUBMITTED',
            $3, $4, $5, $6,
            $7, $8, $9, $10
          )
        `, [
          orgId, agentId,
          itemAmount.toString(), currency, item.counterpartyId || null, parentIntent.intent_id,
          mandateVersionId, `${requestHash}_item_${i + 1}`, childIdemp,
          JSON.stringify({ recipientEmail: item.recipientEmail, note: item.note, itemIndex: i + 1 }),
        ]);
      }

      return {
        parent: parentIntent,
        batch,
        replayed: false,
      };
    });

    res.status(result.replayed ? 200 : 201).json({
      batchId: result.batch?.batch_id,
      parentIntentId: result.parent.intent_id,
      itemCount: items.length,
      totalAmountMinor: totalAmountMinor.toString(),
      currency,
      status: result.parent.status,
      replayed: result.replayed,
    });
  } catch (err) {
    next(err);
  }
});

bulkRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { id } = req.params;

    const batchRes = await query(
      `SELECT * FROM bulk_batches WHERE org_id = $1 AND (batch_id = $2 OR parent_intent_id = $2)`,
      [orgId, id]
    );

    if (batchRes.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Bulk batch not found', 404);
    }

    const batch = batchRes.rows[0];

    const childrenRes = await query(
      `SELECT intent_id, status, amount_minor, currency, counterparty_id, metadata, created_at
       FROM transaction_intents
       WHERE org_id = $1 AND parent_intent_id = $2
       ORDER BY created_at ASC`,
      [orgId, batch.parent_intent_id]
    );

    res.json({
      batch,
      items: childrenRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

bulkRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const result = await query(`
      SELECT bb.*, ti.created_at
      FROM bulk_batches bb
      LEFT JOIN transaction_intents ti ON ti.intent_id = bb.parent_intent_id
      WHERE bb.org_id = $1
      ORDER BY ti.created_at DESC
    `, [orgId]);

    res.json({
      success: true,
      batches: result.rows.map(r => ({
        ...r,
        total_amount_minor: r.total_amount_minor?.toString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default bulkRouter;

