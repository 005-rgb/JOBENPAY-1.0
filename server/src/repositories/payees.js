import pool from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) {
    throw new Error('orgId is required for payee repository methods.');
  }
}

export async function listPayees(orgId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT id, org_id, display_name, kind, identifier_enc, identifier_hmac,
            identifier_masked, trust, changed_at, created_at
     FROM payees
     WHERE org_id = $1
     ORDER BY created_at DESC, id`,
    [orgId],
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
  trust = 'PENDING_REVIEW',
}, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `INSERT INTO payees (
       org_id, display_name, kind, identifier_enc, identifier_hmac, identifier_masked, trust
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, org_id, display_name, kind, identifier_enc, identifier_hmac,
               identifier_masked, trust, changed_at, created_at`,
    [orgId, displayName, kind, identifierEnc, identifierHmac, identifierMasked, trust],
  );
  return result.rows[0];
}

export async function updatePayee(orgId, payeeId, {
  displayName,
  kind,
  identifierEnc,
  identifierHmac,
  identifierMasked,
  identifierChanged = false,
}, db = pool) {
  assertOrgId(orgId);
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
  return result.rows[0] ?? null;
}

export async function recordPayeeRevision(orgId, payeeId, {
  oldHmac,
  newHmac,
  changedBy,
}, db = pool) {
  assertOrgId(orgId);
  await db.query(
    `INSERT INTO payee_revisions (org_id, payee_id, field, old_hmac, new_hmac, changed_by)
     VALUES ($1, $2, 'identifier', $3, $4, $5)`,
    [orgId, payeeId, oldHmac ?? null, newHmac, changedBy ?? null],
  );
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

export async function updatePayeeTrust(orgId, payeeId, trust, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `UPDATE payees
     SET trust = $3
     WHERE org_id = $1 AND id = $2
     RETURNING id, org_id, display_name, kind, identifier_masked, trust, changed_at, created_at`,
    [orgId, payeeId, trust],
  );
  return result.rows[0] ?? null;
}
