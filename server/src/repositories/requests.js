import pool from '../db/pool.js';
import { parsePage, pageResult } from '../lib/cursor.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for request repository methods.');
}

export async function getRequest(orgId, requestId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query('SELECT * FROM payment_requests WHERE org_id = $1 AND id = $2 LIMIT 1', [orgId, requestId]);
  return result.rows[0] ?? null;
}

export async function getAgentRequest(orgId, agentId, requestId, db = pool) {
  assertOrgId(orgId);
  if (!agentId) throw new Error('agentId is required for agent request repository methods.');
  const result = await db.query(
    `SELECT id, org_id, agent_id, status, decision, reason_codes, explanation,
            amount_minor, currency, created_at
     FROM payment_requests
     WHERE org_id = $1 AND agent_id = $2 AND id = $3
     LIMIT 1`,
    [orgId, agentId, requestId],
  );
  return result.rows[0] ?? null;
}

export async function getActiveAgentBudget(orgId, agentId, db = pool) {
  assertOrgId(orgId);
  if (!agentId) throw new Error('agentId is required for agent budget repository methods.');
  const result = await db.query(
    `SELECT v.policy->'budget'->>'limitMinor' AS limit_minor,
            COALESCE(p.reserved_minor::text, '0') AS reserved_minor,
            COALESCE(p.spent_minor::text, '0') AS spent_minor,
            COALESCE(p.currency, (v.policy->>'currency')::char(3), 'USD') AS currency
     FROM mandates m
     JOIN mandate_versions v
       ON v.org_id = m.org_id AND v.id = m.current_version_id
     LEFT JOIN mandate_budget_periods p
       ON p.org_id = m.org_id AND p.version_id = v.id
      AND p.period_start <= now() AND p.period_end > now()
     WHERE m.org_id = $1 AND m.agent_id = $2 AND m.status = 'ACTIVE'
     LIMIT 1`,
    [orgId, agentId],
  );
  return result.rows[0] ?? null;
}

export async function getRequestTimeline(orgId, requestId, db = pool) {
  assertOrgId(orgId);
  const [request, evaluations, ledger, approvals, approvalDecisions, executions] = await Promise.all([
    db.query('SELECT * FROM payment_requests WHERE org_id = $1 AND id = $2 LIMIT 1', [orgId, requestId]),
    db.query('SELECT * FROM request_evaluations WHERE org_id = $1 AND request_id = $2 ORDER BY created_at, id', [orgId, requestId]),
    db.query(
      `SELECT seq, type, subject_type, subject_id, payload, created_at
       FROM ledger_entries
       WHERE org_id = $1 AND subject_type = 'PAYMENT_REQUEST' AND subject_id = $2
       ORDER BY seq`,
      [orgId, requestId],
    ),
    db.query('SELECT * FROM approvals WHERE org_id = $1 AND request_id = $2 ORDER BY created_at, id', [orgId, requestId]),
    db.query(
      `SELECT d.* FROM approval_decisions d
       JOIN approvals a ON a.org_id = d.org_id AND a.id = d.approval_id
       WHERE d.org_id = $1 AND a.request_id = $2 ORDER BY d.created_at, d.id`,
      [orgId, requestId],
    ),
    db.query(
      `SELECT id, created_at, kind, status, paypal_ref, http_status, response_redacted, attempts
       FROM executions WHERE org_id = $1 AND request_id = $2 ORDER BY created_at, id`,
      [orgId, requestId],
    ),
  ]);
  const timeline = [
    ...evaluations.rows.map((item) => ({ kind: 'EVALUATION', ...item })),
    ...approvals.rows.map((item) => ({ kind: 'APPROVAL', ...item })),
    ...approvalDecisions.rows.map((item) => ({ kind: 'APPROVAL_DECISION', ...item })),
    ...executions.rows.map((item) => ({ kind: 'EXECUTION', ...item })),
    ...ledger.rows.map((item) => ({ kind: 'LEDGER', ...item })),
  ].sort((left, right) => (
    new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
  ));
  const { agent_reason: untrustedAgentClaim, ...requestData } = request.rows[0] ?? {};
  return {
    request: request.rows[0] ? { ...requestData, untrustedAgentClaim } : null,
    evaluations: evaluations.rows,
    ledger: ledger.rows,
    approvals: approvals.rows,
    approvalDecisions: approvalDecisions.rows,
    executions: executions.rows,
    timeline,
  };
}

export async function listRequests(orgId, {
  limit,
  cursor,
  status = null,
  agentId = null,
  q = null,
} = {}, db = pool) {
  assertOrgId(orgId);
  const page = parsePage({ limit, cursor });
  const result = await db.query(
    `SELECT r.id, r.created_at, r.created_at::text AS cursor_created_at,
            r.agent_id, a.name AS agent_name, r.action, r.status,
            r.amount_minor, r.currency, r.payee_id, p.display_name AS payee_name,
            r.decision, r.reason_codes, r.explanation, r.risk_score, r.document_id
     FROM payment_requests r
     JOIN agents a ON a.org_id = r.org_id AND a.id = r.agent_id
     LEFT JOIN payees p ON p.org_id = r.org_id AND p.id = r.payee_id
     WHERE r.org_id = $1
       AND ($2::text IS NULL OR r.status = $2)
       AND ($3::uuid IS NULL OR r.agent_id = $3)
       AND ($4::text IS NULL OR r.id::text ILIKE '%' || $4 || '%'
            OR a.name ILIKE '%' || $4 || '%'
            OR coalesce(r.explanation, '') ILIKE '%' || $4 || '%')
       AND ($5::timestamptz IS NULL OR (r.created_at, r.id) < ($5, $6::uuid))
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $7`,
    [orgId, status || null, agentId || null, q || null,
      page.cursor?.createdAt ?? null, page.cursor?.id ?? null, page.limit + 1],
  );
  const resultPage = pageResult(result.rows, page.limit);
  return {
    requests: resultPage.items.map(({ cursor_created_at: _cursorCreatedAt, ...row }) => ({
      ...row,
      amount_minor: String(row.amount_minor),
    })),
    nextCursor: resultPage.nextCursor,
  };
}
