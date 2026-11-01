import pool from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for execution repository methods.');
}

export async function getExecutionRequest(orgId, requestId, db = pool, { forUpdate = false } = {}) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT r.*, p.kind AS payee_kind, p.identifier_enc, p.identifier_hmac,
            p.display_name AS payee_display_name, p.identifier_masked,
            d.sha256 AS document_sha256
     FROM payment_requests r
     LEFT JOIN payees p ON p.org_id = r.org_id AND p.id = r.payee_id
     LEFT JOIN documents d ON d.org_id = r.org_id AND d.id = r.document_id
     WHERE r.org_id = $1 AND r.id = $2
     LIMIT 1${forUpdate ? ' FOR UPDATE OF r' : ''}`,
    [orgId, requestId],
  );
  return result.rows[0] ?? null;
}

export async function getExecution(orgId, requestId, db = pool, { forUpdate = false } = {}) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT * FROM executions
     WHERE org_id = $1 AND request_id = $2 AND kind = 'PAYOUT'
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [orgId, requestId],
  );
  return result.rows[0] ?? null;
}

export async function startExecution(tx, { orgId, requestId }) {
  assertOrgId(orgId);
  await tx.query(
    `INSERT INTO executions (org_id, request_id, idempotency_id, kind, status, attempts)
     VALUES ($1, $2, $3, 'PAYOUT', 'STARTED', 0)
     ON CONFLICT (org_id, request_id, kind) DO NOTHING`,
    [orgId, requestId, requestId],
  );
  return getExecution(orgId, requestId, tx, { forUpdate: true });
}

export async function markExecutionSent(tx, { orgId, executionId }) {
  assertOrgId(orgId);
  const result = await tx.query(
    `UPDATE executions
     SET status = 'SENT', attempts = attempts + 1
     WHERE org_id = $1 AND id = $2 AND status IN ('STARTED', 'SENT')
     RETURNING *`,
    [orgId, executionId],
  );
  return result.rows[0] ?? null;
}

export async function saveExecutionResult(tx, {
  orgId,
  executionId,
  status,
  paypalRef = null,
  httpStatus = null,
  responseRedacted = null,
}) {
  assertOrgId(orgId);
  const result = await tx.query(
    `UPDATE executions
     SET status = $3,
         paypal_ref = COALESCE($4, paypal_ref),
         http_status = COALESCE($5, http_status),
         response_redacted = COALESCE($6, response_redacted)
     WHERE org_id = $1 AND id = $2
     RETURNING *`,
    [orgId, executionId, status, paypalRef, httpStatus, responseRedacted],
  );
  return result.rows[0] ?? null;
}

export async function findExecutionRequestForWebhook(orgId, {
  senderItemId = null,
  senderBatchId = null,
  payoutBatchId = null,
} = {}, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT r.*, p.identifier_hmac, p.kind AS payee_kind,
            e.id AS execution_id, e.status AS execution_status,
            e.paypal_ref, e.response_redacted
     FROM payment_requests r
     LEFT JOIN payees p ON p.org_id = r.org_id AND p.id = r.payee_id
     LEFT JOIN executions e ON e.org_id = r.org_id AND e.request_id = r.id AND e.kind = 'PAYOUT'
     WHERE r.org_id = $1
       AND (
         ($2::text IS NOT NULL AND r.id::text = $2)
         OR ($3::text IS NOT NULL AND 'jp_' || r.id::text = $3)
         OR ($4::text IS NOT NULL AND e.paypal_ref = $4)
       )
     LIMIT 1`,
    [orgId, senderItemId, senderBatchId, payoutBatchId],
  );
  return result.rows[0] ?? null;
}

export async function getExecutionByPayPalRef(orgId, paypalRef, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT * FROM executions
     WHERE org_id = $1 AND paypal_ref = $2 AND kind = 'PAYOUT'
     LIMIT 1`,
    [orgId, paypalRef],
  );
  return result.rows[0] ?? null;
}
