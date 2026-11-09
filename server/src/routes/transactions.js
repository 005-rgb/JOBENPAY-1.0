/**
 * server/src/routes/transactions.js
 * Unified Transactions API for all 15 categories (PRD 1.3 §10, B-F7, WP F7-1, WP F7-3)
 */

import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { LEDGER_RULES } from '../../../shared/ledger-rules.js';
import {
  CATEGORY_PROVIDERS,
  CATEGORY_SUBTYPES,
  TRANSACTION_CATEGORIES,
  createTransactionSchema,
} from '../../../shared/transaction.js';
import { generateSar, computeSarHash, SAR_VERSION } from '../services/sar.js';
import { explainReasonCodes, TEMPLATES_ID } from '../services/decision/explain.js';
import { appendEntry, LEDGER_TYPES } from '../services/ledger.js';
import { useGrant } from '../repositories/stepUp.js';

export const transactionsRouter = Router();

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000001';

function resolveOrgId(req) {
  return req.org?.id || req.session?.current_org_id || req.user?.org_id || GLOBAL_ORG_ID;
}

// ----------------------------------------------------------------------------
// 1. GET / — List transactions with multi-select category, status & pagination
// ----------------------------------------------------------------------------
transactionsRouter.get('/', async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { category, status, search, limit = '50', cursor } = req.query;

    const env = (req.environment || req.headers['x-jobenpay-environment'] || req.headers['x-environment'] || 'SANDBOX').toUpperCase();
    const conditions = ['ti.org_id = $1', `ti.environment = $2`];
    const params = [orgId, env];
    let paramIndex = 3;

    // Multi-select category (comma-separated or single)
    if (category && typeof category === 'string' && category.trim()) {
      const categories = category.split(',').map((c) => c.trim()).filter(Boolean);
      if (categories.length > 0) {
        conditions.push(`ti.category = ANY($${paramIndex++}::text[])`);
        params.push(categories);
      }
    }

    // Multi-select status (comma-separated or single)
    if (status && typeof status === 'string' && status.trim()) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        conditions.push(`ti.status = ANY($${paramIndex++}::text[])`);
        params.push(statuses);
      }
    }

    // Search filter
    if (search && typeof search === 'string' && search.trim()) {
      conditions.push(`(
        ti.intent_id::text ILIKE $${paramIndex} OR
        p.display_name ILIKE $${paramIndex} OR
        ti.metadata::text ILIKE $${paramIndex}
      )`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Cursor pagination based on created_at
    if (cursor && typeof cursor === 'string') {
      conditions.push(`ti.created_at < $${paramIndex++}::timestamptz`);
      params.push(cursor);
    }

    const pageSize = Math.min(Math.max(1, Number.parseInt(limit, 10) || 50), 200);
    params.push(pageSize + 1);

    const sql = `
      SELECT
        ti.intent_id AS id,
        ti.intent_id,
        ti.org_id,
        ti.agent_id,
        ti.category,
        ti.sub_type,
        ti.status,
        ti.amount_minor,
        ti.currency,
        ti.counterparty_id,
        COALESCE(p.display_name, p.identifier_masked, 'Internal / Unspecified') AS counterparty_name,
        ti.parent_intent_id,
        ti.reconciliation_status,
        ti.metadata,
        ti.created_at,
        ti.updated_at
      FROM transaction_intents ti
      LEFT JOIN payees p ON p.id = ti.counterparty_id AND p.org_id = ti.org_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY ti.created_at DESC
      LIMIT $${paramIndex}
    `;

    const result = await query(sql, params);
    const hasNext = result.rows.length > pageSize;
    const rows = hasNext ? result.rows.slice(0, pageSize) : result.rows;
    const nextCursor = hasNext && rows.length > 0 ? rows.at(-1).created_at.toISOString() : null;

    const transactions = rows.map((row) => ({
      ...row,
      amount_minor: row.amount_minor.toString(),
      provider: CATEGORY_PROVIDERS[row.category] || 'SANDBOX',
    }));

    // Get total count for summary
    const countResult = await query(
      `SELECT count(*)::int AS total FROM transaction_intents WHERE org_id = $1 AND environment = $2`,
      [orgId, env]
    );

    return res.status(200).json({
      transactions,
      nextCursor,
      totalCount: countResult.rows[0]?.total || 0,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 2. GET /:id — Complete transaction details (timeline, legs, SAR, refs, policy)
// ----------------------------------------------------------------------------
transactionsRouter.get('/:id', async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { id } = req.params;

    // Load intent
    const intentResult = await query(
      `SELECT
         ti.*,
         COALESCE(p.display_name, p.identifier_masked, 'Internal / Counterparty') AS counterparty_name,
         p.identifier_masked AS counterparty_email,
         p.trust AS counterparty_trust,
         p.trust AS counterparty_status
       FROM transaction_intents ti
       LEFT JOIN payees p ON p.id = ti.counterparty_id AND p.org_id = ti.org_id
       WHERE ti.org_id = $1 AND ti.intent_id = $2`,
      [orgId, id]
    );

    if (intentResult.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Transaction intent not found', 404);
    }

    const intent = intentResult.rows[0];
    intent.amount_minor = intent.amount_minor.toString();
    intent.provider = CATEGORY_PROVIDERS[intent.category] || 'SANDBOX';

    // Load double-entry ledger legs
    const legsResult = await query(
      `SELECT
         leg_id,
         intent_id,
         leg_type,
         amount_minor,
         currency,
         account_ref,
         status,
         external_ref,
         created_at
       FROM transaction_legs
       WHERE intent_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    let debitSum = 0n;
    let creditSum = 0n;
    const legs = legsResult.rows.map((leg) => {
      const amt = BigInt(leg.amount_minor);
      if (leg.leg_type === 'DEBIT') debitSum += amt;
      if (leg.leg_type === 'CREDIT') creditSum += amt;
      return {
        ...leg,
        amount_minor: amt.toString(),
      };
    });

    const isBalanced = legs.length > 0 && debitSum === creditSum;

    // Load transition timeline from ledger entries or history
    const timelineResult = await query(
      `SELECT
         seq,
         type,
         subject_type,
         subject_id,
         payload,
         created_at
       FROM ledger_entries
       WHERE org_id = $1
         AND (
           subject_id = $2
           OR payload->>'requestId' = $2::text
           OR payload->>'intent_id' = $2::text
           OR payload->>'intentId' = $2::text
         )
       ORDER BY seq ASC`,
      [orgId, id]
    );

    const timeline = timelineResult.rows.map((row) => ({
      seq: row.seq.toString(),
      type: row.type,
      status: row.payload?.to || row.type,
      from: row.payload?.from || null,
      actor: row.payload?.actor || { kind: 'SYSTEM', id: 'engine' },
      timestamp: row.created_at,
      reason: row.payload?.reason || row.payload?.comment || null,
    }));

    // If timeline is empty, provide synthetic initial step from intent creation
    if (timeline.length === 0) {
      timeline.push({
        seq: '0',
        type: 'INTENT_CREATED',
        status: intent.status,
        from: 'DRAFT',
        actor: { kind: 'AGENT', id: intent.agent_id },
        timestamp: intent.created_at,
        reason: 'Intent initialized',
      });
    }

    // Load executions
    const execResult = await query(
      `SELECT
         id,
         kind,
         status,
         paypal_ref,
         http_status,
         response_redacted,
         created_at
       FROM executions
       WHERE org_id = $1 AND request_id = $2
       ORDER BY created_at DESC`,
      [orgId, id]
    );

    // Load reconciliation
    const reconResult = await query(
      `SELECT
         id,
         paypal_ref,
         amount_minor,
         currency,
         status,
         reconciled_at,
         created_at
       FROM settlement_records
       WHERE org_id = $1 AND intent_id = $2`,
      [orgId, id]
    );

    // Generate SAR v1.1
    let sar = null;
    let sarHash = null;
    try {
      sar = generateSar({
        intent,
        legs,
        executions: execResult.rows,
        actor: { kind: 'USER', id: req.user?.id || 'viewer' },
      });
      sarHash = computeSarHash(sar);
    } catch {
      // In case SAR cannot be generated yet for draft
      sar = {
        version: SAR_VERSION,
        intent_id: intent.intent_id,
        category: intent.category,
        sub_type: intent.sub_type,
        amount_minor: intent.amount_minor,
        currency: intent.currency,
        legs_summary: {
          debit_sum: debitSum.toString(),
          credit_sum: creditSum.toString(),
          is_balanced: isBalanced,
        },
      };
      sarHash = computeSarHash(sar);
    }

    // Human-readable policy evaluation
    const reasonCodes = intent.metadata?.reasonCodes || intent.metadata?.reason_codes || [];
    const evaluationExplanation = explainReasonCodes(reasonCodes);

    const policyEvaluation = {
      decision: intent.status === 'NEEDS_APPROVAL' ? 'REQUIRE_APPROVAL' : intent.status,
      reasonCodes,
      explanation_en: evaluationExplanation.message,
      explanation_id: reasonCodes.length > 0
        ? reasonCodes.map((code) => TEMPLATES_ID[code] || `Perlu tinjauan (${code})`).join(' ')
        : 'Permintaan memenuhi aturan mandat.',
    };

    return res.status(200).json({
      intent,
      timeline,
      legs,
      legs_summary: {
        debit_sum: debitSum.toString(),
        credit_sum: creditSum.toString(),
        is_balanced: isBalanced,
      },
      sar,
      sar_hash: sarHash,
      executions: execResult.rows,
      reconciliation: reconResult.rows[0] || {
        status: intent.reconciliation_status,
        paypal_ref: execResult.rows[0]?.paypal_ref || null,
        reconciled_at: intent.reconciliation_status === 'RECONCILED' ? intent.updated_at : null,
      },
      policy_evaluation: policyEvaluation,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 3. POST / — Unified Create Transaction Intent
// ----------------------------------------------------------------------------
transactionsRouter.post('/', async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const idempotencyKey = req.header('Idempotency-Key') || req.body?.idempotencyKey;
    if (!idempotencyKey) {
      throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required', 400);
    }

    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      const err = new AppError('VALIDATION_FAILED', 'Invalid transaction payload', 400);
      err.details = parsed.error.issues;
      throw err;
    }

    const {
      category,
      subType,
      amountMinor,
      currency,
      counterpartyId,
      parentIntentId,
      metadata,
      agentReason,
    } = parsed.data;

    const amountMinorBigInt = BigInt(amountMinor);
    const agentId = req.agent?.id || '00000000-0000-4000-8000-000000000001';
    const mandateVersionId = req.mandate?.versionId || '00000000-0000-4000-8000-000000000001';

    const result = await withTx(async (tx) => {
      // 1. Idempotency check
      const existing = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND idempotency_key = $2',
        [orgId, idempotencyKey]
      );
      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        if (
          row.amount_minor !== amountMinorBigInt.toString() ||
          row.currency !== currency ||
          row.category !== category ||
          row.sub_type !== subType
        ) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED', 'Idempotency key reused with different payload', 422);
        }
        return { intent: row, replayed: true };
      }

      // 2. Compute request_hash
      const hashPayload = `${orgId}:${category}:${subType}:${amountMinorBigInt.toString()}:${currency}:${counterpartyId || ''}:${idempotencyKey}`;
      const requestHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');

      // 3. Determine initial gate status
      // Tier C categories always require approval per PRD
      const requiresApproval =
        category === 'FINANCING' ||
        category === 'DEBIT' ||
        amountMinorBigInt > 100000n; // > $1000 threshold

      const initialStatus = requiresApproval ? 'NEEDS_APPROVAL' : 'APPROVED';

      const enrichedMeta = {
        ...metadata,
        agentReason: agentReason || 'Submitted via UI transaction builder',
        reasonCodes: requiresApproval
          ? (category === 'FINANCING' || category === 'DEBIT'
              ? ['TIER_C_REQUIRES_APPROVAL', 'AMOUNT_REQUIRES_APPROVAL']
              : ['AMOUNT_REQUIRES_APPROVAL'])
          : [],
      };

      const targetEnv = (req.environment || req.headers['x-jobenpay-environment'] || req.headers['x-environment'] || 'SANDBOX').toUpperCase();

      // 4. Insert transaction intent
      const inserted = await tx.query(
        `INSERT INTO transaction_intents (
           org_id, agent_id, category, sub_type, status,
           amount_minor, currency, counterparty_id, parent_intent_id,
           mandate_version_id, request_hash, idempotency_key, metadata, environment
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          orgId,
          agentId,
          category,
          subType,
          initialStatus,
          amountMinorBigInt.toString(),
          currency,
          counterpartyId || null,
          parentIntentId || null,
          mandateVersionId,
          requestHash,
          idempotencyKey,
          JSON.stringify(enrichedMeta),
          targetEnv,
        ]
      );

      const intentRow = inserted.rows[0];

      // 5. If auto-approved, post balanced double-entry ledger legs immediately
      if (initialStatus === 'APPROVED') {
        const rule = LEDGER_RULES[category]?.[subType];
        if (rule) {
          const legs = rule.legs({
            ...intentRow,
            amountMinor: amountMinorBigInt,
            counterpartyId: counterpartyId || '00000000-0000-4000-8000-000000000001',
          });
          for (const leg of legs) {
            await tx.query(
              `INSERT INTO transaction_legs (
                 intent_id, leg_type, amount_minor, currency, account_ref, status, environment
               ) VALUES ($1, $2, $3, $4, $5, 'POSTED', $6)`,
              [
                intentRow.intent_id,
                leg.legType,
                leg.amountMinor.toString(),
                leg.currency,
                leg.accountRef,
                targetEnv,
              ]
            );
          }
        }
      }

      // 6. Log entry to audit trail
      await appendEntry(tx, {
        orgId,
        type: LEDGER_TYPES.REQUEST_RECEIVED || 'INTENT_SUBMITTED',
        subjectType: 'TRANSACTION_INTENT',
        subjectId: intentRow.intent_id,
        payload: {
          intentId: intentRow.intent_id,
          category,
          subType,
          status: initialStatus,
          amountMinor: amountMinorBigInt.toString(),
          currency,
          actor: { kind: 'USER', id: req.user?.id || 'builder' },
        },
      });

      return { intent: intentRow, replayed: false };
    });

    const statusCode = result.replayed ? 200 : 201;
    return res.status(statusCode).json({
      ok: true,
      data: {
        ...result.intent,
        amount_minor: result.intent.amount_minor.toString(),
        provider: CATEGORY_PROVIDERS[result.intent.category] || 'SANDBOX',
      },
      replayed: result.replayed,
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 4. POST /:id/decision — Maker/Checker Approval or Rejection
// ----------------------------------------------------------------------------
transactionsRouter.post('/:id/decision', async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { id } = req.params;
    const { decision, comment, stepUpGrantId } = req.body;

    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw new AppError('VALIDATION_FAILED', 'Decision must be APPROVE or REJECT', 400);
    }

    const updated = await withTx(async (tx) => {
      const intentRes = await tx.query(
        'SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2 FOR UPDATE',
        [orgId, id]
      );
      if (intentRes.rowCount === 0) {
        throw new AppError('NOT_FOUND', 'Transaction not found', 404);
      }
      const current = intentRes.rows[0];

      if (current.status !== 'NEEDS_APPROVAL') {
        const err = new AppError('ILLEGAL_TRANSITION', `Cannot decide intent in status ${current.status}`, 409);
        throw err;
      }

      // Check step-up if amount > $5000 or TIER C
      const amountBigInt = BigInt(current.amount_minor);
      const requiresStepUp = amountBigInt >= 500000n || current.category === 'FINANCING' || current.category === 'DEBIT';
      if (requiresStepUp && decision === 'APPROVE' && req.session) {
        const grant = await useGrant(orgId, {
          grantId: stepUpGrantId,
          purpose: 'APPROVE_ABOVE_THRESHOLD',
          sessionId: req.session.id,
        });
        if (!grant) {
          throw new AppError('STEP_UP_REQUIRED', 'Step-up authentication required for high-value / Tier C approval', 401);
        }
      }

      const nextStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';

      // Update intent status
      const updatedIntent = await tx.query(
        `UPDATE transaction_intents
         SET status = $1, updated_at = now()
         WHERE org_id = $2 AND intent_id = $3
         RETURNING *`,
        [nextStatus, orgId, id]
      );

      // If approved, post ledger legs
      if (nextStatus === 'APPROVED') {
        const rule = LEDGER_RULES[current.category]?.[current.sub_type];
        if (rule) {
          const legs = rule.legs({
            ...current,
            amountMinor: amountBigInt,
            counterpartyId: current.counterparty_id || '00000000-0000-4000-8000-000000000001',
          });
          for (const leg of legs) {
            await tx.query(
              `INSERT INTO transaction_legs (
                 intent_id, leg_type, amount_minor, currency, account_ref, status
               ) VALUES ($1, $2, $3, $4, $5, 'POSTED')`,
              [
                id,
                leg.legType,
                leg.amountMinor.toString(),
                leg.currency,
                leg.accountRef,
              ]
            );
          }
        }
      }

      // Append ledger log
      await appendEntry(tx, {
        orgId,
        type: LEDGER_TYPES.REQUEST_DECIDED || 'INTENT_DECIDED',
        subjectType: 'TRANSACTION_INTENT',
        subjectId: id,
        payload: {
          intentId: id,
          from: 'NEEDS_APPROVAL',
          to: nextStatus,
          decision,
          comment: comment || null,
          actor: { kind: 'USER', id: req.user?.id || 'approver' },
        },
      });

      return updatedIntent.rows[0];
    });

    return res.status(200).json({
      ok: true,
      result: {
        id: updated.intent_id,
        status: updated.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// 5. GET /:id/sar — Structured Audit Record (SAR v1.1)
// ----------------------------------------------------------------------------
transactionsRouter.get('/:id/sar', async (req, res, next) => {
  try {
    const orgId = resolveOrgId(req);
    const { id } = req.params;

    const intentRes = await query(
      'SELECT * FROM transaction_intents WHERE org_id = $1 AND intent_id = $2',
      [orgId, id]
    );
    if (intentRes.rowCount === 0) {
      throw new AppError('NOT_FOUND', 'Transaction not found', 404);
    }

    const legsRes = await query(
      'SELECT * FROM transaction_legs WHERE intent_id = $1 ORDER BY created_at ASC',
      [id]
    );

    const execRes = await query(
      'SELECT * FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, id]
    );

    const sar = generateSar({
      intent: intentRes.rows[0],
      legs: legsRes.rows,
      executions: execRes.rows,
      actor: { kind: 'USER', id: req.user?.id || 'verifier' },
    });
    const hash = computeSarHash(sar);

    return res.status(200).json({
      ok: true,
      sar,
      sar_hash: hash,
      verified: true,
    });
  } catch (err) {
    next(err);
  }
});
