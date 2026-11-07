/**
 * server/src/routes/invoices.js
 * RESTful API endpoints for INVOICE transaction category (PRD 1.3 §5.1, T-05, K-INVOICE)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';

export const invoicesRouter = Router();

const createInvoiceBodySchema = z.object({
  amountMinor: z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/)]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  subType: z.enum(['standard']).default('standard'),
  invoiceNumber: z.string().min(1).max(50),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'),
  recipientEmail: z.string().email().optional(),
  counterpartyId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  description: z.string().min(1).max(1000).optional(),
});

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createInvoiceBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid invoice proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { amountMinor, currency, subType, invoiceNumber, dueDate, recipientEmail, counterpartyId, documentId, description } = parsed.data;
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

      // Check duplicate invoice number within org
      const existingInv = await tx.query(
        'SELECT invoice_id FROM invoice_records WHERE org_id = $1 AND invoice_number = $2',
        [orgId, invoiceNumber]
      );
      if (existingInv.rowCount > 0) {
        throw new AppError('INVOICE_NUMBER_ALREADY_EXISTS', `Invoice number ${invoiceNumber} already exists in organization`, 409);
      }

      const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000001';
      const mandateVersionId = req.mandate?.versionId || '00000000-0000-4000-8000-000000000001';
      const actualCounterpartyId = counterpartyId || '00000000-0000-4000-8000-000000000007';

      const insertedIntent = await tx.query(`
        INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status,
          amount_minor, currency, counterparty_id, mandate_version_id,
          request_hash, idempotency_key, metadata
        ) VALUES (
          $1, $2, 'INVOICE', $3, 'SUBMITTED',
          $4, $5, $6, $7,
          $8, $9, $10
        ) RETURNING *
      `, [
        orgId, agentId, subType,
        amountMinorBigInt.toString(), currency, actualCounterpartyId, mandateVersionId,
        `hash_inv_${idempotencyKey}`, idempotencyKey,
        JSON.stringify({
          invoiceNumber,
          dueDate,
          recipientEmail: recipientEmail || null,
          documentId: documentId || null,
          description: description || null,
        })
      ]);

      const intentRow = insertedIntent.rows[0];

      // Insert record into invoice_records
      await tx.query(`
        INSERT INTO invoice_records (
          org_id, intent_id, counterparty_id, invoice_number, amount_minor, currency, due_date, status, document_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8)
      `, [
        orgId,
        intentRow.intent_id,
        actualCounterpartyId,
        invoiceNumber,
        amountMinorBigInt.toString(),
        currency,
        dueDate,
        documentId || null,
      ]);

      return { row: intentRow, replayed: false };
    });

    const statusCode = result.replayed ? 200 : 201;
    res.status(statusCode).json({
      success: true,
      intentId: result.row.intent_id,
      category: 'INVOICE',
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

invoicesRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const { id } = req.params;
    const result = await query(`
      SELECT ti.*, ir.invoice_number, ir.due_date, ir.status AS invoice_status, ir.paypal_invoice_id
      FROM transaction_intents ti
      LEFT JOIN invoice_records ir ON ir.intent_id = ti.intent_id
      WHERE ti.org_id = $1 AND ti.intent_id = $2 AND ti.category = 'INVOICE'
    `, [orgId, id]);

    if (result.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Invoice transaction intent not found', 404);
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const result = await query(`
      SELECT ti.intent_id, ti.intent_id AS id, ti.status, ti.amount_minor, ti.currency, ti.created_at,
             ir.invoice_number, ir.due_date, ir.status AS invoice_status, ir.paypal_invoice_id,
             COALESCE(p.display_name, p.identifier_masked, 'Counterparty') AS counterparty_name
      FROM transaction_intents ti
      LEFT JOIN invoice_records ir ON ir.intent_id = ti.intent_id
      LEFT JOIN payees p ON p.id = ti.counterparty_id AND p.org_id = ti.org_id
      WHERE ti.org_id = $1 AND ti.category = 'INVOICE'
      ORDER BY ti.created_at DESC
    `, [orgId]);

    res.json({
      success: true,
      invoices: result.rows.map(r => ({ ...r, amount_minor: r.amount_minor?.toString() })),
    });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.post('/:id/send', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const { id } = req.params;
    await query(`
      UPDATE invoice_records SET status = 'SENT'
      WHERE org_id = $1 AND intent_id = $2
    `, [orgId, id]);
    res.json({ ok: true, status: 'SENT' });
  } catch (err) {
    next(err);
  }
});

invoicesRouter.post('/:id/pay', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const { id } = req.params;
    await query(`
      UPDATE invoice_records SET status = 'PAID'
      WHERE org_id = $1 AND intent_id = $2
    `, [orgId, id]);
    res.json({ ok: true, status: 'PAID' });
  } catch (err) {
    next(err);
  }
});

export default invoicesRouter;

