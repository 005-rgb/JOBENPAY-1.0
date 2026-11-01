import crypto from 'node:crypto';

import { query } from '../db/pool.js';

export async function findUserByEmail(orgId, email) {
  if (!orgId) {
    throw new Error('orgId is required for users repository methods.');
  }

  const result = await query(
    `SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1`,
    [String(email).trim()],
  );
  return result.rows[0] ?? null;
}

export async function findUserById(orgId, userId) {
  if (!orgId) {
    throw new Error('orgId is required for users repository methods.');
  }

  const result = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [userId]);
  return result.rows[0] ?? null;
}

export async function createUser(orgId, { email, passwordHash, displayName, role = 'VIEWER', isJudge = false }) {
  if (!orgId) {
    throw new Error('orgId is required for users repository methods.');
  }

  const result = await query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [String(email).trim().toLowerCase(), passwordHash, displayName || null],
  );

  const user = result.rows[0];
  await query(
    `INSERT INTO memberships (org_id, user_id, role, is_judge)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, user_id) DO NOTHING`,
    [orgId, user.id, role, isJudge],
  );

  return user;
}

export async function recordLoginFailure(orgId, userId) {
  if (!orgId) {
    throw new Error('orgId is required for users repository methods.');
  }

  const result = await query(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1,
         locked_until = CASE
           WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes'
           ELSE NULL
         END
     WHERE id = $1
     RETURNING failed_login_count`,
    [userId],
  );
  return Number(result.rows[0].failed_login_count);
}

export async function resetLoginFailure(orgId, userId) {
  if (!orgId) {
    throw new Error('orgId is required for users repository methods.');
  }

  await query(
    `UPDATE users
     SET failed_login_count = 0,
         locked_until = NULL
     WHERE id = $1`,
    [userId],
  );
}

export function hashToken(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export default {
  findUserByEmail,
  findUserById,
  createUser,
  recordLoginFailure,
  resetLoginFailure,
  hashToken,
};
