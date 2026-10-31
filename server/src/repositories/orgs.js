import { query } from '../db/pool.js';

export async function getOrgById(orgId, id) {
  if (!orgId) {
    throw new Error('orgId is required for orgs repository methods.');
  }

  const result = await query('SELECT * FROM organizations WHERE id = $1 AND id = $2 LIMIT 1', [orgId, id]);
  return result.rows[0] ?? null;
}

export async function listUserOrgs(orgId, userId) {
  if (!orgId) {
    throw new Error('orgId is required for orgs repository methods.');
  }

  const result = await query(
    `SELECT o.*
     FROM organizations o
     JOIN memberships m ON m.org_id = o.id
     WHERE m.user_id = $1 AND o.id = $2`,
    [userId, orgId],
  );
  return result.rows;
}

export async function getCurrentOrg(orgId, userId) {
  if (!orgId) {
    throw new Error('orgId is required for orgs repository methods.');
  }

  const result = await query(
    `SELECT o.*
     FROM organizations o
     JOIN memberships m ON m.org_id = o.id
     WHERE m.user_id = $1 AND o.id = $2
     LIMIT 1`,
    [userId, orgId],
  );
  return result.rows[0] ?? null;
}

export async function createOrg(orgId, { name, slug }) {
  if (!orgId) {
    throw new Error('orgId is required for orgs repository methods.');
  }

  const result = await query(
    `INSERT INTO organizations (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO NOTHING
     RETURNING *`,
    [name, slug],
  );

  return result.rows[0] ?? null;
}

export async function setFrozenStatus(tx, orgId, { frozenBy, frozen }) {
  if (!orgId) {
    throw new Error('orgId is required for orgs repository methods.');
  }

  const result = await tx.query(
    `UPDATE organizations
     SET frozen_at = $1,
         frozen_by = $2
     WHERE id = $3
     RETURNING id`,
    [frozen ? new Date().toISOString() : null, frozen ? frozenBy : null, orgId],
  );
  return result.rowCount === 1;
}

export default {
  getOrgById,
  listUserOrgs,
  getCurrentOrg,
  createOrg,
  setFrozenStatus,
};
