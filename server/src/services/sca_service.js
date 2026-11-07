// @ts-check
import pool, { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';

/**
 * Validates and consumes a Step-Up Authentication (SCA) grant.
 * 
 * @param {string} userId - UUID of the user performing the sensitive action
 * @param {string} purpose - Expected step-up purpose
 * @param {string|null} [grantId=null] - Grant ID submitted by client
 * @param {import('pg').PoolClient|null} [client=null] - Optional database client for transactional scope
 * @returns {Promise<boolean>}
 */
export async function validateStepUp(userId, purpose, grantId = null, client = null) {
  if (!grantId) {
    throw new AppError('STEP_UP_REQUIRED', 403, 'Step-up authentication (SCA) required for this operation');
  }

  const db = client || pool;
  const result = await db.query(
    `UPDATE step_up_grants
     SET consumed_at = now()
     WHERE id = $1 AND user_id = $2 AND purpose = $3
       AND consumed_at IS NULL AND expires_at > now()
     RETURNING id`,
    [grantId, userId, purpose],
  );

  if (result.rows.length === 0) {
    throw new AppError('STEP_UP_INVALID', 403, 'Invalid or expired step-up authentication grant');
  }

  return true;
}

export default {
  validateStepUp,
};
