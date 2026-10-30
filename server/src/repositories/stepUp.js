import crypto from 'node:crypto';

import { query } from '../db/pool.js';

export async function createGrant(orgId, { userId, sessionId, purpose, expiresAt }) {
  if (!orgId) {
    throw new Error('orgId is required for stepUp repository methods.');
  }

  const grantId = crypto.randomUUID();
  const result = await query(
    `INSERT INTO step_up_grants (id, user_id, session_id, purpose, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [grantId, userId, sessionId, purpose, expiresAt],
  );

  return result.rows[0];
}

export async function useGrant(orgId, { grantId, purpose, sessionId }) {
  if (!orgId) {
    throw new Error('orgId is required for stepUp repository methods.');
  }

  const result = await query(
    `SELECT * FROM step_up_grants
     WHERE id = $1 AND session_id = $2 AND purpose = $3 AND consumed_at IS NULL AND expires_at > now() LIMIT 1`,
    [grantId, sessionId, purpose],
  );

  const grant = result.rows[0];
  if (!grant) {
    return null;
  }

  await query(
    `UPDATE step_up_grants SET consumed_at = now() WHERE id = $1`,
    [grantId],
  );

  return grant;
}

export async function consumeGrant(tx, orgId, {
  grantId,
  userId,
  sessionId,
  purpose,
}) {
  if (!orgId) {
    throw new Error('orgId is required for stepUp repository methods.');
  }
  if (!tx || typeof tx.query !== 'function') {
    throw new TypeError('A transaction is required to consume a step-up grant.');
  }
  const result = await tx.query(
    `UPDATE step_up_grants
     SET consumed_at = now()
     WHERE id = $1 AND user_id = $2 AND session_id = $3 AND purpose = $4
       AND consumed_at IS NULL AND expires_at > now()
     RETURNING id`,
    [grantId, userId, sessionId, purpose],
  );
  return result.rowCount === 1;
}

export default {
  createGrant,
  useGrant,
  consumeGrant,
};
