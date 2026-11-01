import { performance } from 'node:perf_hooks';

import { AppError } from '../lib/errors.js';
import { withTx } from '../db/tx.js';
import { enqueue } from '../jobs/queue.js';
import { getRequest } from '../repositories/requests.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';
import { combineDecisions, evaluateRequest } from './decision/engine.js';
import { explainReasonCodes } from './decision/explain.js';
import { requestHash } from './requestHash.js';
import { transition } from './requestStateMachine.js';
import { evaluateStageC } from './decision/stageC.js';
import { notifyOrgRoles } from '../repositories/notifications.js';

function conflict(message) {
  const error = new AppError('IDEMPOTENCY_CONFLICT', message);
  error.statusCode = 409;
  return error;
}

function requestError(code, message, statusCode) {
  const error = new AppError(code, message);
  error.statusCode = statusCode;
  return error;
}

function validateInput(input) {
  if (!input?.orgId || !input?.agentId
    || typeof input.idempotencyKey !== 'string'
    || !input.idempotencyKey.trim()
    || input.idempotencyKey.length > 200
    || !['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'].includes(input.action)
    || !/^[A-Z]{3}$/.test(input.currency || '')
    || !/^\d+$/.test(String(input.amountMinor ?? ''))
    || (input.reason != null && (typeof input.reason !== 'string' || input.reason.length > 2000))
    || (typeof input.amountMinor === 'number' && !Number.isSafeInteger(input.amountMinor))) {
    throw requestError('VALIDATION_FAILED', 'A valid org, agent, idempotency key, currency, and amount are required.', 400);
  }
  const amount = BigInt(input.amountMinor);
  if (amount <= 0n || amount > 9223372036854775807n) {
    throw requestError('VALIDATION_FAILED', 'Amount must be positive and within the supported integer range.', 400);
  }
}

function statusForDecision(decision) {
  if (decision === 'REJECT') return 'REJECTED';
  if (decision === 'REQUIRE_APPROVAL') return 'PENDING_APPROVAL';
  return 'APPROVED';
}

async function enforceDemoSubmissionLimit(tx, orgId) {
  const organization = await tx.query('SELECT slug FROM organizations WHERE id = $1', [orgId]);
  if (organization.rows[0]?.slug !== 'jobenpay-demo') return;

  await tx.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [orgId, 'payment-request-hourly-limit'],
  );
  const recent = await tx.query(
    `SELECT count(*)::integer AS count FROM payment_requests
     WHERE org_id = $1 AND created_at >= now() - interval '1 hour'`,
    [orgId],
  );
  if (Number(recent.rows[0].count) >= 30) {
    const error = new AppError('RATE_LIMITED', 'The demo organization has reached its hourly request limit.');
    error.statusCode = 429;
    throw error;
  }
}

async function lockInvoiceSubmission(tx, { orgId, payeeId, documentId }) {
  if (!documentId) return;
  const extraction = await tx.query(
    `SELECT invoice_number FROM document_extractions
     WHERE org_id = $1 AND document_id = $2`,
    [orgId, documentId],
  );
  const invoiceNumber = extraction.rows[0]?.invoice_number;
  if (typeof invoiceNumber !== 'string' || !invoiceNumber.trim()) return;

  await tx.query(
    'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
    [`invoice:${orgId}`, `${payeeId ?? ''}:${invoiceNumber.trim().toLowerCase()}`],
  );
}

async function saveDeterministicEvaluations(tx, orgId, requestId, evaluated) {
  await tx.query(
    `INSERT INTO request_evaluations (org_id, request_id, stage, result, latency_ms)
     VALUES ($1,$2,'A',$3,0),($1,$2,'B',$4,0)`,
    [orgId, requestId, evaluated.stageA, {
      ...evaluated.stageB,
      decision: evaluated.decision,
      reasonCodes: evaluated.reasonCodes,
    }],
  );
}

async function finalizeEvaluation(tx, request, context, deterministic, aiResult = null, { dryRun = false } = {}) {
  const combined = combineDecisions(deterministic, aiResult);
  const explanation = explainReasonCodes(combined.reasonCodes, aiResult?.explanation);
  const decidedStatus = statusForDecision(combined.decision);
  const status = dryRun && decidedStatus !== 'REJECTED' ? 'CANCELLED' : decidedStatus;

  if (aiResult) {
    const aiEvaluation = {
      decision: aiResult.decision,
      reasonCodes: aiResult.reasonCodes,
      riskScore: aiResult.riskScore,
      intentMatch: aiResult.intentMatch,
      anomalies: aiResult.anomalies,
      injectionSuspected: aiResult.injectionSuspected,
      explanation: aiResult.explanation,
      error: aiResult.aiError ?? null,
    };
    await tx.query(
      `INSERT INTO request_evaluations
         (org_id, request_id, stage, result, ai_model, prompt_version, latency_ms)
       VALUES ($1,$2,'C',$3,$4,$5,$6)`,
      [request.org_id, request.id, aiEvaluation, aiResult.aiModel, aiResult.promptVersion, aiResult.latencyMs],
    );
    await tx.query(
      'UPDATE payment_requests SET risk_score = $1 WHERE org_id = $2 AND id = $3',
      [aiResult.riskScore, request.org_id, request.id],
    );
    request.risk_score = aiResult.riskScore;
  }

  await tx.query(
    `INSERT INTO request_evaluations (org_id, request_id, stage, result, latency_ms)
     VALUES ($1,$2,'D',$3,0)`,
    [request.org_id, request.id, {
      decision: combined.decision,
      reasonCodes: explanation.reasonCodes,
    }],
  );
  const finalRequest = await transition(tx, request, status, { kind: 'SYSTEM', id: 'decision-engine' }, {
    decision: combined.decision,
    reasonCodes: explanation.reasonCodes,
    explanation: explanation.message,
    ledgerPayload: {
      decision: combined.decision,
      reasonCodes: explanation.reasonCodes,
      hash: request.request_hash,
      ...(dryRun ? { dryRun: true } : {}),
    },
  });
  if (status === 'PENDING_APPROVAL') {
    const approval = await tx.query(
      `INSERT INTO approvals (org_id, request_id, status, step_up_required, request_hash, expires_at)
       VALUES ($1,$2,'PENDING',$3,$4, now() + ($5::integer * interval '1 hour'))
       RETURNING expires_at`,
      [request.org_id, request.id, BigInt(request.amount_minor) >= BigInt(context.policy.stepUpApprovalAboveMinor),
        request.request_hash, context.policy.approvalTtlHours],
    );
    await notifyOrgRoles(tx, request.org_id, ['OWNER', 'ADMIN', 'APPROVER'], 'REQUEST_PENDING_APPROVAL', {
      requestId: request.id,
      approvalExpiresAt: approval.rows[0]?.expires_at ?? null,
    });
  } else if (status === 'APPROVED') {
    await enqueue(tx, {
      type: 'execute_request',
      orgId: request.org_id,
      payload: { orgId: request.org_id, requestId: request.id },
      dedupeKey: `exec:${request.id}`,
    });
  }
  return {
    ...finalRequest,
    risk_score: aiResult?.riskScore ?? request.risk_score ?? null,
    decision: combined.decision,
    reason_codes: explanation.reasonCodes,
    reasonCodes: explanation.reasonCodes,
    explanation: explanation.message,
  };
}

async function prepareStaleEvaluation(orgId, requestId, db) {
  return withTx(async (tx) => {
    const locked = await tx.query(
      `SELECT * FROM payment_requests
       WHERE org_id = $1 AND id = $2 AND status IN ('RECEIVED', 'EVALUATING')
         AND created_at < now() - interval '2 minutes'
       FOR UPDATE`,
      [orgId, requestId],
    );
    if (!locked.rowCount) return null;
    let request = locked.rows[0];
    if (request.status === 'RECEIVED') {
      request = await transition(tx, request, 'EVALUATING', { kind: 'SYSTEM', id: 'evaluate-request-sweeper' });
    }
    const context = await loadContext(tx, {
      orgId,
      agentId: request.agent_id,
      payeeId: request.payee_id,
      documentId: request.document_id,
      amountMinor: request.amount_minor,
      currency: request.currency,
    });
    const existing = await tx.query(
      `SELECT 1 FROM request_evaluations
       WHERE org_id = $1 AND request_id = $2 AND stage IN ('A','B') LIMIT 1`,
      [orgId, request.id],
    );
    const evaluated = await evaluateRequest({
      tx: existing.rowCount || request.reserved_period_id ? undefined : tx,
      request,
      context,
    });
    if (evaluated.reservation) {
      await tx.query(
        `UPDATE payment_requests SET reserved_period_id = $1, reserved_amount_minor = $2
         WHERE id = $3 AND org_id = $4`,
        [evaluated.reservation.id, String(request.amount_minor), request.id, orgId],
      );
      request.reserved_period_id = evaluated.reservation.id;
      request.reserved_amount_minor = String(request.amount_minor);
    }
    if (!existing.rowCount) await saveDeterministicEvaluations(tx, orgId, request.id, evaluated);
    if (evaluated.decision === 'REJECT') {
      return { result: await finalizeEvaluation(tx, request, context, evaluated) };
    }
    return { request, context, evaluated };
  }, db);
}

async function loadContext(tx, input) {
  const result = await tx.query(
    `SELECT o.*, a.id AS agent_id, a.status AS agent_status,
            m.id AS mandate_id, m.status AS mandate_status, v.*,
            p.id AS payee_id, p.display_name AS payee_display_name, p.trust AS payee_trust,
            d.id AS document_id, d.status AS document_status, d.injection_flags, d.sha256 AS document_sha256,
            de.payee_name, de.invoice_number, de.amount_minor AS extraction_amount_minor, de.currency AS extraction_currency
     FROM organizations o
     JOIN agents a ON a.org_id = o.id AND a.id = $2
     LEFT JOIN mandates m ON m.org_id = o.id AND m.agent_id = a.id AND m.status = 'ACTIVE'
     LEFT JOIN mandate_versions v ON v.org_id = o.id AND v.id = m.current_version_id
     LEFT JOIN payees p ON p.org_id = o.id AND p.id = $3
     LEFT JOIN documents d ON d.org_id = o.id AND d.id = $4
     LEFT JOIN document_extractions de ON de.org_id = o.id AND de.document_id = d.id
     WHERE o.id = $1 LIMIT 1`,
    [input.orgId, input.agentId, input.payeeId ?? null, input.documentId ?? null],
  );
  const row = result.rows[0];
  if (!row) {
    const error = new AppError('NOT_FOUND', 'Organization or agent not found.');
    error.statusCode = 404;
    throw error;
  }
  const history = await tx.query(
    `SELECT
       count(*) FILTER (WHERE pr.agent_id = $3 AND pr.created_at >= now() - interval '1 hour')::int AS requests_last_hour,
       count(*) FILTER (WHERE pr.agent_id = $3 AND pr.payee_id = $2 AND pr.action = 'PAYOUT'
         AND pr.status NOT IN ('REJECTED','CANCELLED','EXPIRED','FAILED')
         AND (pr.created_at AT TIME ZONE $8)::date = (now() AT TIME ZONE $8)::date)::int AS payee_payouts_today,
       count(*) FILTER (WHERE pr.payee_id = $2 AND pr.action = 'PAYOUT'
         AND pr.status NOT IN ('REJECTED','CANCELLED','EXPIRED','FAILED')
         AND pr.created_at >= now() - ($4::integer * interval '1 hour')
         AND pr.amount_minor = $5
         AND pr.currency = $6
         AND $7::text IS NOT NULL AND EXISTS (
           SELECT 1 FROM documents old_d
           JOIN document_extractions old_de ON old_de.org_id = old_d.org_id AND old_de.document_id = old_d.id
           WHERE old_d.org_id = pr.org_id AND old_d.id = pr.document_id
             AND old_de.invoice_number IS NOT DISTINCT FROM $7
         ))::int AS duplicate,
       (SELECT count(*)::int FROM payee_revisions r
        WHERE r.org_id = $1 AND r.payee_id = $2
          AND r.created_at >= now() - interval '30 days') AS payee_changes_30_days
     FROM payment_requests pr
     WHERE pr.org_id = $1`,
    [input.orgId, input.payeeId ?? null, input.agentId, Number(row.policy?.duplicateWindowHours ?? 0),
      String(input.amountMinor), input.currency, row.invoice_number ?? null, row.policy?.schedule?.timezone || 'UTC'],
  );
  const h = history.rows[0] || {};
  return {
    org: row,
    agent: { id: row.agent_id, status: row.agent_status },
    mandate: row.mandate_id ? { id: row.mandate_id, status: row.mandate_status } : null,
    version: row.mandate_id ? row : null,
    policy: row.policy,
    payee: row.payee_id ? { id: row.payee_id, display_name: row.payee_display_name, trust: row.payee_trust } : null,
    document: row.document_id ? {
      id: row.document_id, status: row.document_status, injection_flags: row.injection_flags, sha256: row.document_sha256,
    } : null,
    extraction: row.payee_name ? {
      payee_name: row.payee_name, invoice_number: row.invoice_number,
      amount_minor: row.extraction_amount_minor, currency: row.extraction_currency,
    } : null,
    history: {
      requestsLastHour: h.requests_last_hour,
      payeePayoutsToday: h.payee_payouts_today,
      duplicate: Number(h.duplicate) > 0,
      payeeChanges30Days: h.payee_changes_30_days,
    },
  };
}

export async function submitPaymentRequest(input, options = {}) {
  validateInput(input);
  const db = options.db;
  const prepared = await withTx(async (tx) => {
    await tx.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      [input.agentId, input.idempotencyKey],
    );
    const existing = await tx.query(
      'SELECT * FROM payment_requests WHERE agent_id = $1 AND agent_idempotency_key = $2 FOR UPDATE',
      [input.agentId, input.idempotencyKey],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      const document = input.documentId
        ? await tx.query('SELECT sha256 FROM documents WHERE org_id = $1 AND id = $2', [input.orgId, input.documentId])
        : null;
      if (input.documentId && !document.rowCount) {
        throw requestError('NOT_FOUND', 'Document not found.', 404);
      }
      const expectedHash = requestHash({
        ...input,
        mandateVersionId: row.mandate_version_id,
        documentSha256: document?.rows[0]?.sha256 ?? null,
      });
      if (row.org_id !== input.orgId
        || row.action !== input.action
        || String(row.amount_minor) !== BigInt(input.amountMinor).toString()
        || row.currency !== input.currency
        || String(row.payee_id ?? '').toLowerCase() !== String(input.payeeId ?? '').toLowerCase()
        || (row.agent_reason ?? null) !== (input.reason ?? null)
        || row.request_hash !== expectedHash) {
        throw conflict('Idempotency key was reused with a different payload.');
      }
      return { result: row };
    }
    await enforceDemoSubmissionLimit(tx, input.orgId);
    await lockInvoiceSubmission(tx, input);
    const context = await loadContext(tx, input);
    if (input.payeeId && !context.payee) {
      throw requestError('NOT_FOUND', 'Payee not found in this organization.', 404);
    }
    if (input.documentId && !context.document) {
      throw requestError('NOT_FOUND', 'Document not found in this organization.', 404);
    }
    const hash = requestHash({
      ...input, mandateVersionId: context.version?.id ?? null,
      documentSha256: context.document?.sha256 ?? null,
    });
    const inserted = await tx.query(
      `INSERT INTO payment_requests
       (org_id, agent_id, mandate_version_id, action, status, amount_minor, currency, payee_id, target_ref,
        document_id, agent_reason, agent_idempotency_key, request_hash)
       VALUES ($1,$2,$3,$4,'RECEIVED',$5,$6,$7,NULL,$8,$9,$10,$11)
       RETURNING *`,
      [input.orgId, input.agentId, context.version?.id ?? null, input.action, String(input.amountMinor), input.currency,
        input.payeeId ?? null, input.documentId ?? null, input.reason ?? null, input.idempotencyKey, hash],
    );
    let request = inserted.rows[0];
    await appendEntry(tx, {
      orgId: input.orgId, type: LEDGER_TYPES.REQUEST_RECEIVED,
      subjectType: 'PAYMENT_REQUEST', subjectId: request.id,
      payload: { requestId: request.id, agentId: input.agentId, action: input.action, amountMinor: String(input.amountMinor), requestHash: hash },
    });
    request = await transition(tx, request, 'EVALUATING', { kind: 'AGENT', id: input.agentId });
    const evaluationStartedAt = performance.now();
    const evaluated = await evaluateRequest({
      tx,
      request,
      context: { ...context, now: options.now || new Date() },
    });
    evaluated.latencyMs = Math.max(0, Math.round(performance.now() - evaluationStartedAt));
    if (evaluated.reservation) {
      await tx.query(
        `UPDATE payment_requests SET reserved_period_id = $1, reserved_amount_minor = $2 WHERE id = $3 AND org_id = $4`,
        [evaluated.reservation.id, String(input.amountMinor), request.id, input.orgId],
      );
      request.reserved_period_id = evaluated.reservation.id;
      request.reserved_amount_minor = String(input.amountMinor);
    }
    await saveDeterministicEvaluations(tx, input.orgId, request.id, evaluated);
    if (evaluated.decision === 'REJECT') {
      return {
        result: await finalizeEvaluation(tx, request, context, evaluated, null, options),
      };
    }
    return { request, context, evaluated };
  }, db);
  if (prepared.result) {
    return {
      ...prepared.result,
      reasonCodes: prepared.result.reason_codes ?? prepared.result.reasonCodes ?? [],
    };
  }

  const aiResult = await evaluateStageC({
    request: prepared.request,
    context: prepared.context,
    orgId: input.orgId,
  });
  return withTx(async (tx) => {
    const current = await tx.query(
      `SELECT * FROM payment_requests
       WHERE org_id = $1 AND id = $2
       FOR UPDATE`,
      [input.orgId, prepared.request.id],
    );
    if (!current.rowCount) throw requestError('NOT_FOUND', 'Payment request not found.', 404);
    if (current.rows[0].status !== 'EVALUATING') return current.rows[0];
    return finalizeEvaluation(tx, current.rows[0], prepared.context, prepared.evaluated, aiResult, options);
  }, db);
}

export async function getRequestDetail(orgId, requestId, db) {
  return getRequest(orgId, requestId, db);
}

export { getRequestTimeline } from '../repositories/requests.js';

export async function reevaluateStaleRequest(orgId, requestId, db) {
  const prepared = await prepareStaleEvaluation(orgId, requestId, db);
  if (!prepared) return null;
  if (prepared.result) return prepared.result;
  const aiResult = await evaluateStageC({
    request: prepared.request,
    context: prepared.context,
    orgId,
  });
  return withTx(async (tx) => {
    const current = await tx.query(
      `SELECT * FROM payment_requests
       WHERE org_id = $1 AND id = $2 AND status = 'EVALUATING'
       FOR UPDATE`,
      [orgId, requestId],
    );
    if (!current.rowCount) {
      const completed = await tx.query(
        'SELECT * FROM payment_requests WHERE org_id = $1 AND id = $2',
        [orgId, requestId],
      );
      return completed.rows[0] ?? null;
    }
    return finalizeEvaluation(
      tx,
      current.rows[0],
      prepared.context,
      prepared.evaluated,
      aiResult,
    );
  }, db);
}
