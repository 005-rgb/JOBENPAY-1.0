/**
 * server/src/routes/debit.js
 * RESTful API endpoints for DEBIT transaction category (Tier C, PRD 1.3 §3, AD-17, B-F6)
 */

import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { debitProposalSchema, debitAuthorizationSchema, validateDebitAuthorization } from '../../../shared/debit.js';
import { PartnerSimulatorProvider } from '../services/partnerSimulator.js';

export const debitRouter = Router();

debitRouter.post('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const idempotencyKey = req.header('Idempotency-Key');
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = debitProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid debit proposal body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { authId, amountMinor, currency, counterpartyId, description } = parsed.data;
    const amtBig = BigInt(amountMinor);

    const result = await withTx(async (tx) => {
      // 1. Check idempotency
      const existing = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2 FOR UPDATE',
        [orgId, idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const reqHash = `deb_${authId}_${amountMinor}_${counterpartyId}`;
        if (row.request_hash !== reqHash) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different payload', 422);
        }
        return { intent: row, cached: true };
      }

      // 2. Fetch and lock debit authorization
      const authRes = await tx.query(
        'SELECT * FROM debit_authorizations WHERE org_id = $1 AND auth_id = $2 FOR UPDATE',
        [orgId, authId]
      );

      if (authRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 'Debit authorization not found', 404);
      }

      const authorization = authRes.rows[0];

      // Validate authorization limits and status
      validateDebitAuthorization({ authorization, requestedAmountMinor: amtBig, now: new Date() });

      const agentId = req.user?.id || req.agent?.id || '00000000-0000-4000-8000-000000000000';
      const mandateVersionId = req.mandate?.current_version_id || '00000000-0000-4000-8000-000000000001';
      const reqHash = `deb_${authId}_${amountMinor}_${counterpartyId}`;

      // Insert transaction_intents (Tier C always requires approval)
      const intentRes = await tx.query(
        `INSERT INTO transaction_intents (
          org_id, agent_id, category, sub_type, status, amount_minor, currency,
          counterparty_id, mandate_version_id, request_hash, idempotency_key, metadata
        ) VALUES ($1, $2, 'DEBIT', 'direct', 'NEEDS_APPROVAL', $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          orgId,
          agentId,
          amtBig.toString(),
          currency,
          counterpartyId,
          mandateVersionId,
          reqHash,
          idempotencyKey,
          JSON.stringify({ authId, description, provider: 'simulated' }),
        ]
      );
      const intent = intentRes.rows[0];

      // Insert debit_execution_records
      const execRes = await tx.query(
        `INSERT INTO debit_execution_records (
          org_id, intent_id, auth_id, amount_minor, currency, status, provider
        ) VALUES ($1, $2, $3, $4, $5, 'EXECUTING', 'simulated')
        RETURNING *`,
        [orgId, intent.intent_id, authId, amtBig.toString(), currency]
      );

      return { intent, execution: execRes.rows[0], cached: false };
    });

    res.status(result.cached ? 200 : 201).json({
      success: true,
      provider: 'simulated',
      intentId: result.intent.intent_id,
      status: result.intent.status,
      category: 'DEBIT',
      subType: 'direct',
      amountMinor: amtBig.toString(),
      currency,
      cached: result.cached,
    });
  } catch (err) {
    next(err);
  }
});

debitRouter.post('/authorizations', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    if (!orgId) throw new AppError('UNAUTHORIZED', 'Organization context required', 401);

    const parsed = debitAuthorizationSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid authorization body', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const { counterpartyId, maxAmountMinor, currency, frequencyLimit, validUntil, mandateRef } = parsed.data;

    const resAuth = await query(
      `INSERT INTO debit_authorizations (
        org_id, counterparty_id, max_amount_minor, currency, frequency_limit,
        status, valid_until, mandate_ref
      ) VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)
      RETURNING *`,
      [orgId, counterpartyId, BigInt(maxAmountMinor).toString(), currency, frequencyLimit, validUntil, mandateRef]
    );

    res.status(201).json({
      success: true,
      provider: 'simulated',
      data: resAuth.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

debitRouter.post('/authorizations/:authId/revoke', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const { authId } = req.params;

    const resRev = await query(
      `UPDATE debit_authorizations
       SET status = 'REVOKED'
       WHERE org_id = $1 AND auth_id = $2
       RETURNING *`,
      [orgId, authId]
    );

    if (resRev.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Debit authorization not found', 404);
    }

    res.json({
      success: true,
      provider: 'simulated',
      data: resRev.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

debitRouter.get('/', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const result = await query(
      `SELECT i.*, e.auth_id, e.status as execution_status, e.provider
       FROM transaction_intents i
       LEFT JOIN debit_execution_records e ON e.intent_id = i.intent_id AND e.org_id = i.org_id
       WHERE i.org_id = $1 AND i.category = 'DEBIT'
       ORDER BY i.created_at DESC LIMIT 100`,
      [orgId]
    );

    const rows = result.rows.map(r => ({
      ...r,
      amount_minor: r.amount_minor?.toString(),
    }));

    res.json({
      success: true,
      provider: 'simulated',
      debits: rows,
      transactions: rows,
    });
  } catch (err) {
    next(err);
  }
});

debitRouter.get('/:intentId', async (req, res, next) => {
  try {
    const orgId = req.org?.id || req.session?.current_org_id || req.session?.org_id || req.user?.org_id || '00000000-0000-4000-8000-000000000001';
    const { intentId } = req.params;

    const resDeb = await query(
      `SELECT i.*, e.auth_id, e.status as execution_status, e.provider
       FROM transaction_intents i
       LEFT JOIN debit_execution_records e ON e.intent_id = i.intent_id AND e.org_id = i.org_id
       WHERE i.org_id = $1 AND i.intent_id = $2`,
      [orgId, intentId]
    );

    if (resDeb.rows.length === 0) {
      throw new AppError('NOT_FOUND', 'Debit record not found', 404);
    }

    res.json({
      success: true,
      provider: 'simulated',
      data: resDeb.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

export default debitRouter;

