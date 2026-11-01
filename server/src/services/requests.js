import { AppError } from '../lib/errors.js';
import { withTx } from '../db/tx.js';
import { enqueue } from '../jobs/queue.js';
import { getRequest } from '../repositories/requests.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';
import { evaluateRequest } from './decision/engine.js';
import { explainReasonCodes } from './decision/explain.js';
import { requestHash } from './requestHash.js';
import { transition } from './requestStateMachine.js';

function conflict(message) {
  const error = new AppError('IDEMPOTENCY_CONFLICT', message);
  error.statusCode = 409;
  return error;
}

function inputPayload(input, mandateVersionId) {
  return {
    orgId: input.orgId,
    agentId: input.agentId,
    mandateVersionId,
    action: input.action,
    amountMinor: BigInt(input.amountMinor).toString(),
    currency: input.currency,
    payeeId: input.payeeId ?? null,
    targetRef: null,
    documentSha256: input.documentSha256 ?? null,
  };
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
       count(*) FILTER (WHERE pr.created_at >= now() - interval '1 hour')::int AS requests_last_hour,
       count(*) FILTER (WHERE pr.payee_id = $2 AND pr.action = 'PAYOUT'
         AND pr.status NOT IN ('REJECTED','CANCELLED','EXPIRED','FAILED')
         AND (pr.created_at AT TIME ZONE $8)::date = (now() AT TIME ZONE $8)::date)::int AS payee_payouts_today,
       count(*) FILTER (WHERE pr.payee_id = $2 AND pr.agent_id = $3
         AND pr.status NOT IN ('REJECTED','CANCELLED','EXPIRED','FAILED')
         AND pr.created_at >= now() - ($4::integer * interval '1 hour')
         AND pr.amount_minor = $5
         AND pr.currency = $6
         AND EXISTS (
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
  const db = options.db;
  return withTx(async (tx) => {
    const existing = await tx.query(
      'SELECT * FROM payment_requests WHERE agent_id = $1 AND agent_idempotency_key = $2 FOR UPDATE',
      [input.agentId, input.idempotencyKey],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      const expected = inputPayload(input, row.mandate_version_id);
      const actual = {
        orgId: row.org_id, agentId: row.agent_id, mandateVersionId: row.mandate_version_id,
        action: row.action, amountMinor: String(row.amount_minor), currency: row.currency,
        payeeId: row.payee_id, targetRef: row.target_ref, documentSha256: input.documentSha256 ?? null,
      };
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw conflict('Idempotency key was reused with a different payload.');
      return row;
    }
    if (input.action !== 'PAYOUT') throw new AppError('ACTION_NOT_ALLOWED', 'Only PAYOUT is supported in Tier A.');
    const context = await loadContext(tx, input);
    if (!context.version?.id) throw new AppError('MANDATE_INACTIVE', 'No active mandate exists for this agent.');
    const hash = requestHash({
      ...input, mandateVersionId: context.version.id, documentSha256: input.documentSha256 ?? context.document?.sha256 ?? null,
    });
    const inserted = await tx.query(
      `INSERT INTO payment_requests
       (org_id, agent_id, mandate_version_id, action, status, amount_minor, currency, payee_id, target_ref,
        document_id, agent_reason, agent_idempotency_key, request_hash)
       VALUES ($1,$2,$3,$4,'RECEIVED',$5,$6,$7,NULL,$8,$9,$10,$11)
       RETURNING *`,
      [input.orgId, input.agentId, context.version.id, input.action, String(input.amountMinor), input.currency,
        input.payeeId ?? null, input.documentId ?? null, input.reason ?? null, input.idempotencyKey, hash],
    );
    let request = inserted.rows[0];
    await appendEntry(tx, {
      orgId: input.orgId, type: LEDGER_TYPES.REQUEST_RECEIVED,
      subjectType: 'PAYMENT_REQUEST', subjectId: request.id,
      payload: { requestId: request.id, agentId: input.agentId, action: input.action, amountMinor: String(input.amountMinor), requestHash: hash },
    });
    request = await transition(tx, request, 'EVALUATING', { kind: 'AGENT', id: input.agentId });
    const evaluated = await evaluateRequest({
      tx,
      request,
      context: { ...context, now: options.now || new Date() },
    });
    if (evaluated.reservation) {
      await tx.query(
        `UPDATE payment_requests SET reserved_period_id = $1, reserved_amount_minor = $2 WHERE id = $3 AND org_id = $4`,
        [evaluated.reservation.id, String(input.amountMinor), request.id, input.orgId],
      );
      request.reserved_period_id = evaluated.reservation.id;
      request.reserved_amount_minor = String(input.amountMinor);
    }
    const finalStatus = evaluated.decision === 'REJECT' ? 'REJECTED'
      : evaluated.decision === 'REQUIRE_APPROVAL' ? 'PENDING_APPROVAL' : 'APPROVED';
    const explanation = evaluated.explanation?.message || explainReasonCodes(evaluated.reasonCodes).message;
    await tx.query(
      `INSERT INTO request_evaluations (org_id, request_id, stage, result, latency_ms)
       VALUES ($1,$2,'A',$3, $4),($1,$2,'B',$5,$4),($1,$2,'D',$6,$4)`,
      [input.orgId, request.id, evaluated.stageA, evaluated.latencyMs ?? 0, evaluated.stageB, { decision: evaluated.decision, reasonCodes: evaluated.reasonCodes }],
    );
    request = await transition(tx, request, finalStatus, { kind: 'SYSTEM', id: 'decision-engine' }, {
      decision: evaluated.decision, reasonCodes: evaluated.reasonCodes, explanation,
      ledgerPayload: { decision: evaluated.decision, reasonCodes: evaluated.reasonCodes, hash },
    });
    if (finalStatus === 'PENDING_APPROVAL') {
      await tx.query(
        `INSERT INTO approvals (org_id, request_id, status, step_up_required, request_hash, expires_at)
         VALUES ($1,$2,'PENDING',$3,$4, now() + ($5::integer * interval '1 hour'))`,
        [input.orgId, request.id, BigInt(input.amountMinor) >= BigInt(context.policy.stepUpApprovalAboveMinor),
          hash, context.policy.approvalTtlHours],
      );
    } else if (finalStatus === 'APPROVED') {
      await enqueue(tx, { type: 'execute_request', payload: { orgId: input.orgId, requestId: request.id }, dedupeKey: `exec:${request.id}` });
    }
    return { ...request, decision: evaluated.decision, reason_codes: evaluated.reasonCodes, explanation };
  }, db);
}

export async function getRequestDetail(orgId, requestId, db) {
  return getRequest(orgId, requestId, db);
}

export { getRequestTimeline } from '../repositories/requests.js';

export async function reevaluateStaleRequest(orgId, requestId, db) {
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
    const evaluated = await evaluateRequest({ tx, request, context });
    if (evaluated.reservation) {
      await tx.query(
        `UPDATE payment_requests
         SET reserved_period_id = $1, reserved_amount_minor = $2
         WHERE id = $3 AND org_id = $4`,
        [evaluated.reservation.id, String(request.amount_minor), request.id, orgId],
      );
      request.reserved_period_id = evaluated.reservation.id;
      request.reserved_amount_minor = String(request.amount_minor);
    }
    await tx.query(
      `INSERT INTO request_evaluations (org_id, request_id, stage, result, latency_ms)
       VALUES ($1,$2,'A',$3,0),($1,$2,'B',$4,0),($1,$2,'D',$5,0)`,
      [orgId, request.id, evaluated.stageA, evaluated.stageB, { decision: evaluated.decision, reasonCodes: evaluated.reasonCodes }],
    );
    const finalStatus = evaluated.decision === 'REJECT' ? 'REJECTED'
      : evaluated.decision === 'REQUIRE_APPROVAL' ? 'PENDING_APPROVAL' : 'APPROVED';
    const explanation = evaluated.explanation.message;
    const final = await transition(tx, request, finalStatus, { kind: 'SYSTEM', id: 'evaluate-request-sweeper' }, {
      decision: evaluated.decision, reasonCodes: evaluated.reasonCodes, explanation,
    });
    if (finalStatus === 'PENDING_APPROVAL') {
      await tx.query(
        `INSERT INTO approvals (org_id, request_id, status, step_up_required, request_hash, expires_at)
         VALUES ($1,$2,'PENDING',$3,$4, now() + ($5::integer * interval '1 hour'))`,
        [orgId, request.id, BigInt(request.amount_minor) >= BigInt(context.policy.stepUpApprovalAboveMinor),
          request.request_hash, context.policy.approvalTtlHours],
      );
    } else if (finalStatus === 'APPROVED') {
      await enqueue(tx, {
        type: 'execute_request',
        payload: { orgId, requestId: request.id },
        dedupeKey: `exec:${request.id}`,
      });
    }
    return final;
  }, db);
}
