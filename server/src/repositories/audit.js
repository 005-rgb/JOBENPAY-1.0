import { query } from '../db/pool.js';

export async function appendAudit(txOrOptions, maybeOptions) {
  const tx = txOrOptions && typeof txOrOptions.query === 'function' ? txOrOptions : null;
  const options = tx ? maybeOptions : txOrOptions;
  const { orgId: rawOrgId, actorId, action, details } = options || {};
  const orgId = rawOrgId || '00000000-0000-4000-8000-000000000000';

  if (!orgId) {
    // Fallback to global org if not present
    options.orgId = '00000000-0000-4000-8000-000000000000';
  }

  if (tx) {
    await tx.query(
      `INSERT INTO audit_events (org_id, actor_id, action, details)
       VALUES ($1, $2, $3, $4)`,
      [orgId, actorId ?? null, action, details ?? {}],
    );
    return;
  }

  await query(
    `INSERT INTO audit_events (org_id, actor_id, action, details)
     VALUES ($1, $2, $3, $4)`,
    [orgId, actorId ?? null, action, details ?? {}],
  );
}

export default {
  appendAudit,
};
