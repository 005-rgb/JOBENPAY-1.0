import pool from '../db/pool.js';

export const PAYEE_STATUSES = Object.freeze({
  NEW: 'NEW',
  PENDING_REVIEW: 'PENDING_REVIEW',
  TRUSTED: 'TRUSTED',
  BLOCKED: 'BLOCKED',
});

function assertOrgId(orgId) {
  if (!orgId) {
    throw new Error('orgId is required for payee repository methods.');
  }
}

export async function listPayees(orgId, db = pool, environment = null) {
  assertOrgId(orgId);
  const conditions = ['org_id = $1'];
  const params = [orgId];
  if (environment) {
    conditions.push('environment = $2');
    params.push(String(environment).toUpperCase());
  }
  const result = await db.query(
    `SELECT id, org_id, display_name, kind, identifier_enc, identifier_hmac,
            identifier_masked, trust, changed_at, created_at
     FROM payees
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC, id`,
    params,
  );
  return result.rows;
}

export async function getPayee(orgId, payeeId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT id, org_id, display_name, kind, identifier_enc, identifier_hmac,
            identifier_masked, trust, changed_at, created_at
     FROM payees
     WHERE org_id = $1 AND id = $2
     LIMIT 1`,
    [orgId, payeeId],
  );
  return result.rows[0] ?? null;
}

export async function createPayee(orgId, {
  displayName,
  kind,
  identifierEnc,
  identifierHmac,
  identifierMasked,
  trust = PAYEE_STATUSES.NEW,
  environment = 'SANDBOX',
}, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `INSERT INTO payees (
       org_id, display_name, kind, identifier_enc, identifier_hmac, identifier_masked, trust, environment
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, org_id, display_name, kind, identifier_enc, identifier_hmac,
               identifier_masked, trust, changed_at, created_at`,
    [orgId, displayName, kind, identifierEnc, identifierHmac, identifierMasked, trust, (environment || 'SANDBOX').toUpperCase()],
  );
  return result.rows[0];
}

export async function recordPayeeChange(orgId, payeeId, {
  field = 'identifier',
  oldValue = null,
  newValue = null,
  oldHmac = null,
  newHmac = null,
  changedBy = null,
}, db = pool) {
  assertOrgId(orgId);
  // 1. Audit table payee_change_history
  await db.query(
    `INSERT INTO payee_change_history (
       org_id, payee_id, field, old_value, new_value, old_hmac, new_hmac, changed_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [orgId, payeeId, field, oldValue, newValue, oldHmac, newHmac, changedBy],
  );

  // 2. Backward compatibility with payee_revisions
  await db.query(
    `INSERT INTO payee_revisions (org_id, payee_id, field, old_hmac, new_hmac, changed_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [orgId, payeeId, field, oldHmac, newHmac, changedBy],
  );
}

export async function recordPayeeRevision(orgId, payeeId, {
  oldHmac,
  newHmac,
  changedBy,
}, db = pool) {
  return recordPayeeChange(orgId, payeeId, {
    field: 'identifier',
    oldHmac,
    newHmac,
    changedBy,
  }, db);
}

export async function updatePayee(orgId, payeeId, {
  displayName,
  kind,
  identifierEnc,
  identifierHmac,
  identifierMasked,
  identifierChanged = false,
  changedBy = null,
}, db = pool) {
  assertOrgId(orgId);
  const oldPayee = await getPayee(orgId, payeeId, db);
  const result = await db.query(
    `UPDATE payees
     SET display_name = COALESCE($3, display_name),
         kind = COALESCE($4, kind),
         identifier_enc = COALESCE($5, identifier_enc),
         identifier_hmac = COALESCE($6, identifier_hmac),
         identifier_masked = COALESCE($7, identifier_masked),
         changed_at = CASE WHEN $8::boolean THEN now() ELSE changed_at END
     WHERE org_id = $1 AND id = $2
     RETURNING id, org_id, display_name, kind, identifier_enc, identifier_hmac,
               identifier_masked, trust, changed_at, created_at`,
    [
      orgId,
      payeeId,
      displayName ?? null,
      kind ?? null,
      identifierEnc ?? null,
      identifierHmac ?? null,
      identifierMasked ?? null,
      identifierChanged,
    ],
  );

  if (identifierChanged && oldPayee && changedBy) {
    await recordPayeeChange(orgId, payeeId, {
      field: 'identifier',
      oldValue: oldPayee.identifier_masked,
      newValue: identifierMasked ?? oldPayee.identifier_masked,
      oldHmac: oldPayee.identifier_hmac,
      newHmac: identifierHmac ?? oldPayee.identifier_hmac,
      changedBy,
    }, db);
  }

  return result.rows[0] ?? null;
}

export async function updatePayeeTrust(orgId, payeeId, trust, changedBy = null, db = pool) {
  assertOrgId(orgId);
  let resolvedChangedBy = changedBy;
  let client = db;
  if (changedBy && typeof changedBy.query === 'function') {
    client = changedBy;
    resolvedChangedBy = null;
  }
  const oldPayee = await getPayee(orgId, payeeId, client);
  const result = await client.query(
    `UPDATE payees
     SET trust = $3, changed_at = now()
     WHERE org_id = $1 AND id = $2
     RETURNING id, org_id, display_name, kind, identifier_masked, trust, changed_at, created_at`,
    [orgId, payeeId, trust],
  );

  if (oldPayee && oldPayee.trust !== trust) {
    await recordPayeeChange(orgId, payeeId, {
      field: 'trust',
      oldValue: oldPayee.trust,
      newValue: trust,
      changedBy: resolvedChangedBy,
    }, client);
  }

  return result.rows[0] ?? null;
}

export async function countRecentPayeeChanges(orgId, payeeId, days = 30, db = pool) {
  assertOrgId(orgId);
  // Check payee_change_history
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM payee_change_history
     WHERE org_id = $1 AND payee_id = $2
       AND created_at >= now() - ($3::int * interval '1 day')`,
    [orgId, payeeId, days],
  );
  const count = result.rows[0]?.count ?? 0;
  if (count > 0) return count;

  // Fallback to check payee_revisions
  const fallback = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM payee_revisions
     WHERE org_id = $1 AND payee_id = $2
       AND created_at >= now() - ($3::int * interval '1 day')`,
    [orgId, payeeId, days],
  );
  const fallbackCount = fallback.rows[0]?.count ?? 0;
  if (fallbackCount > 0) return fallbackCount;

  // Fallback to check changed_at directly on payee row
  const payee = await getPayee(orgId, payeeId, db);
  if (payee?.changed_at) {
    const diffDays = (Date.now() - new Date(payee.changed_at).getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < days) return 1;
  }
  return 0;
}

export async function listPayeeRevisions(orgId, payeeId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT id, changed_by, created_at
     FROM payee_revisions
     WHERE org_id = $1 AND payee_id = $2
     ORDER BY created_at DESC, id`,
    [orgId, payeeId],
  );
  return result.rows;
}

export async function listPayeeChangeHistory(orgId, payeeId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT id, org_id, payee_id, field, old_value, new_value, old_hmac, new_hmac, changed_by, created_at
     FROM payee_change_history
     WHERE org_id = $1 AND payee_id = $2
     ORDER BY created_at DESC, id`,
    [orgId, payeeId],
  );
  return result.rows;
}

export default {
  PAYEE_STATUSES,
  listPayees,
  getPayee,
  createPayee,
  updatePayee,
  updatePayeeTrust,
  recordPayeeChange,
  recordPayeeRevision,
  countRecentPayeeChanges,
  listPayeeRevisions,
  listPayeeChangeHistory,
};
