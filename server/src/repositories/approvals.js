import pool from '../db/pool.js';
import { parsePage, pageResult } from '../lib/cursor.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for approval repository methods.');
}

export async function listApprovals(orgId, { limit, cursor, status = 'PENDING' } = {}, db = pool) {
  assertOrgId(orgId);
  const page = parsePage({ limit, cursor });
  const result = await db.query(
    `SELECT a.id, a.request_id, a.status, a.step_up_required, a.request_hash, a.expires_at,
            a.created_at, a.created_at::text AS cursor_created_at,
            r.agent_id, agent.name AS agent_name, r.action, r.amount_minor, r.currency, r.payee_id,
            payee.display_name AS payee_name, r.decision, r.reason_codes
     FROM approvals a
     JOIN payment_requests r ON r.org_id = a.org_id AND r.id = a.request_id
     JOIN agents agent ON agent.org_id = r.org_id AND agent.id = r.agent_id
     LEFT JOIN payees payee ON payee.org_id = r.org_id AND payee.id = r.payee_id
     WHERE a.org_id = $1 AND ($2::text IS NULL OR a.status = $2)
       AND ($3::timestamptz IS NULL OR (a.created_at, a.id) < ($3, $4::uuid))
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $5`,
    [orgId, status || null, page.cursor?.createdAt ?? null, page.cursor?.id ?? null, page.limit + 1],
  );
  const resultPage = pageResult(result.rows, page.limit);
  return {
    approvals: resultPage.items.map(({ cursor_created_at: _cursorCreatedAt, ...approval }) => approval),
    nextCursor: resultPage.nextCursor,
  };
}

export async function getApprovalDetail(orgId, approvalId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT a.id AS approval_id, a.org_id, a.request_id, a.status AS approval_status,
            a.step_up_required, a.request_hash AS approval_request_hash, a.expires_at,
            r.created_at AS request_created_at, r.agent_id, r.mandate_version_id,
            r.action, r.status AS request_status, r.amount_minor, r.currency, r.payee_id,
            r.document_id, r.target_ref, r.request_hash, r.decision, r.reason_codes, r.explanation,
            r.risk_score, r.agent_reason,
            agent.name AS agent_name,
            payee.display_name AS payee_name, payee.trust AS payee_trust,
            d.filename AS document_filename, d.mime AS document_mime,
            d.size AS document_size, d.sha256 AS document_sha256,
            d.status AS document_status, d.injection_flags,
            de.payee_name AS extraction_payee_name, de.invoice_number,
            de.amount_minor AS extraction_amount_minor, de.currency AS extraction_currency,
            de.due_date, de.items, de.notes, de.confidence,
            mv.policy, m.id AS mandate_id,
            bp.limit_minor, bp.reserved_minor, bp.spent_minor, bp.period_start, bp.period_end
     FROM approvals a
     JOIN payment_requests r ON r.org_id = a.org_id AND r.id = a.request_id
     JOIN agents agent ON agent.org_id = r.org_id AND agent.id = r.agent_id
     LEFT JOIN payees payee ON payee.org_id = r.org_id AND payee.id = r.payee_id
     LEFT JOIN documents d ON d.org_id = r.org_id AND d.id = r.document_id
     LEFT JOIN document_extractions de ON de.org_id = d.org_id AND de.document_id = d.id
     LEFT JOIN mandate_versions mv ON mv.org_id = r.org_id AND mv.id = r.mandate_version_id
     LEFT JOIN mandates m ON m.org_id = mv.org_id AND m.id = mv.mandate_id
     LEFT JOIN LATERAL (
       SELECT limit_minor, reserved_minor, spent_minor, period_start, period_end
       FROM mandate_budget_periods
       WHERE org_id = r.org_id AND version_id = r.mandate_version_id
       ORDER BY period_start DESC LIMIT 1
     ) bp ON true
     WHERE a.org_id = $1 AND a.id = $2
     LIMIT 1`,
    [orgId, approvalId],
  );
  const row = result.rows[0];
  if (!row) return null;

  const [evaluations, revisions, priorRequests, decisions, executions, ledger] = await Promise.all([
    db.query(
      `SELECT stage, result, ai_model, prompt_version, latency_ms, created_at
       FROM request_evaluations WHERE org_id = $1 AND request_id = $2 ORDER BY created_at, id`,
      [orgId, row.request_id],
    ),
    row.payee_id
      ? db.query(
        `SELECT id, field, changed_by, created_at FROM payee_revisions
         WHERE org_id = $1 AND payee_id = $2 ORDER BY created_at DESC, id DESC LIMIT 20`,
        [orgId, row.payee_id],
      )
      : Promise.resolve({ rows: [] }),
    row.payee_id
      ? db.query(
        `SELECT id, created_at, action, status, amount_minor, currency, reason_codes
         FROM payment_requests
         WHERE org_id = $1 AND payee_id = $2 AND id <> $3
         ORDER BY created_at DESC, id DESC LIMIT 20`,
        [orgId, row.payee_id, row.request_id],
      )
      : Promise.resolve({ rows: [] }),
    db.query(
      `SELECT id, decided_by, decision, comment, created_at
       FROM approval_decisions WHERE org_id = $1 AND approval_id = $2
       ORDER BY created_at, id`,
      [orgId, approvalId],
    ),
    db.query(
      `SELECT id, kind, status, paypal_ref, http_status, response_redacted, attempts, created_at
       FROM executions WHERE org_id = $1 AND request_id = $2 ORDER BY created_at, id`,
      [orgId, row.request_id],
    ),
    db.query(
      `SELECT seq, type, payload, created_at FROM ledger_entries
       WHERE org_id = $1 AND subject_type = 'PAYMENT_REQUEST' AND subject_id = $2
       ORDER BY seq`,
      [orgId, row.request_id],
    ),
  ]);
  const limitMinor = row.limit_minor == null ? null : BigInt(row.limit_minor);
  const reservedMinor = BigInt(row.reserved_minor ?? 0);
  const spentMinor = BigInt(row.spent_minor ?? 0);
  return {
    approval: {
      id: row.approval_id,
      status: row.approval_status,
      stepUpRequired: row.step_up_required,
      requestHash: row.approval_request_hash,
      expiresAt: row.expires_at,
    },
    request: {
      id: row.request_id,
      createdAt: row.request_created_at,
      agentId: row.agent_id,
      agentName: row.agent_name,
      mandateVersionId: row.mandate_version_id,
      mandateId: row.mandate_id,
      action: row.action,
      status: row.request_status,
      amountMinor: String(row.amount_minor),
      currency: row.currency,
      payeeId: row.payee_id,
      payeeName: row.payee_name,
      payeeTrust: row.payee_trust,
      documentId: row.document_id,
      decision: row.decision,
      reasonCodes: row.reason_codes ?? [],
      explanation: row.explanation,
      riskScore: row.risk_score,
    },
    document: row.document_id ? {
      id: row.document_id,
      filename: row.document_filename,
      mime: row.document_mime,
      size: row.document_size,
      sha256: row.document_sha256,
      status: row.document_status,
      injectionFlags: row.injection_flags ?? [],
      extraction: row.extraction_payee_name || row.invoice_number ? {
        payeeName: row.extraction_payee_name,
        invoiceNumber: row.invoice_number,
        amountMinor: row.extraction_amount_minor == null ? null : String(row.extraction_amount_minor),
        currency: row.extraction_currency,
        dueDate: row.due_date,
        items: row.items,
        notes: row.notes,
        confidence: row.confidence,
      } : null,
    } : null,
    evaluations: evaluations.rows,
    payeeHistory: {
      revisions: revisions.rows,
      priorRequests: priorRequests.rows.map((request) => ({
        ...request,
        amount_minor: String(request.amount_minor),
      })),
    },
    decisions: decisions.rows,
    executions: executions.rows,
    ledger: ledger.rows,
    budget: limitMinor == null ? null : {
      limitMinor: limitMinor.toString(),
      reservedMinor: reservedMinor.toString(),
      spentMinor: spentMinor.toString(),
      remainingMinor: (limitMinor - reservedMinor - spentMinor).toString(),
      periodStart: row.period_start,
      periodEnd: row.period_end,
    },
  };
}
