import { query } from '../db/pool.js';

export async function getMembership(orgId, userId, targetOrgId) {
  if (!orgId) {
    throw new Error('orgId is required for memberships repository methods.');
  }

  const result = await query(
    `SELECT * FROM memberships WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
    [userId, targetOrgId || orgId],
  );
  return result.rows[0] ?? null;
}

export async function listMemberships(orgId, userId) {
  if (!orgId) {
    throw new Error('orgId is required for memberships repository methods.');
  }

  const result = await query(
    `SELECT * FROM memberships WHERE user_id = $1 AND org_id = $2 ORDER BY created_at ASC`,
    [userId, orgId],
  );
  return result.rows;
}

export async function updateRole(orgId, userId, targetOrgId, role) {
  if (!orgId) {
    throw new Error('orgId is required for memberships repository methods.');
  }

  await query(
    `UPDATE memberships
     SET role = $1
     WHERE user_id = $2 AND org_id = $3`,
    [role, userId, targetOrgId || orgId],
  );
}

export async function createMembership(orgId, { userId, targetOrgId, role, isJudge = false }) {
  if (!orgId) {
    throw new Error('orgId is required for memberships repository methods.');
  }

  const result = await query(
    `INSERT INTO memberships (org_id, user_id, role, is_judge)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role, is_judge = EXCLUDED.is_judge
     RETURNING *`,
    [targetOrgId || orgId, userId, role, isJudge],
  );

  return result.rows[0] ?? null;
}

export default {
  getMembership,
  listMemberships,
  updateRole,
  createMembership,
};
