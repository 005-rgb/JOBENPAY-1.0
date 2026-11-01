import pool from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for request repository methods.');
}

export async function getRequest(orgId, requestId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query('SELECT * FROM payment_requests WHERE org_id = $1 AND id = $2 LIMIT 1', [orgId, requestId]);
  return result.rows[0] ?? null;
}

export async function getRequestTimeline(orgId, requestId, db = pool) {
  assertOrgId(orgId);
  const [request, evaluations, ledger, approvals] = await Promise.all([
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
  ]);
  return {
    request: request.rows[0] ?? null,
    evaluations: evaluations.rows,
    ledger: ledger.rows,
    approvals: approvals.rows,
  };
}
