import { query } from '../db/pool.js';

export async function appendAudit(txOrOptions, maybeOptions) {
  const tx = txOrOptions && typeof txOrOptions.query === 'function' ? txOrOptions : null;
  const options = tx ? maybeOptions : txOrOptions;
  const { orgId, actorId, action, details } = options || {};

  if (!orgId) {
    throw new Error('orgId is required for audit repository methods.');
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
