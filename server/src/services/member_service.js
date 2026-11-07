// @ts-check
import crypto from 'node:crypto';
import pool, { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { env } from '../config.js';
import { AppError } from '../lib/errors.js';
import { appendLedgerEntry } from './ledger.js';
import { appendAudit } from '../repositories/audit.js';
import { sendInviteEmail } from './email_service.js';
import { validateStepUp } from './sca_service.js';

const VALID_ROLES = new Set(['ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER']);

/**
 * Lists all active members of an organization.
 * 
 * @param {string} orgId 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any[]>}
 */
export async function listMembers(orgId, dbClient = null) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  const db = dbClient || pool;
  const result = await db.query(
    `SELECT u.id AS user_id, u.email, 
            COALESCE(u.display_name, split_part(u.email, '@', 1)) AS display_name, 
            m.role, m.status, m.last_login_at, m.joined_at
     FROM memberships m 
     JOIN users u ON u.id = m.user_id
     WHERE m.org_id = $1 
     ORDER BY m.joined_at ASC`,
    [orgId],
  );

  return result.rows;
}

/**
 * Invites a new member to an organization.
 * 
 * @param {string} orgId 
 * @param {string} inviterId 
 * @param {string} email 
 * @param {string} role 
 * @param {string|null} [stepUpGrantId=null] 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function inviteMember(orgId, inviterId, email, role, stepUpGrantId = null, dbClient = null) {
  if (!orgId || !inviterId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId and inviterId are required');
  }
  if (!email || typeof email !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'Valid email is required');
  }
  if (!role || typeof role !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'Role is required');
  }

  const normalizedRole = role.toUpperCase();
  if (normalizedRole === 'OWNER') {
    throw new AppError('CANNOT_INVITE_OWNER', 403, 'Cannot invite member with OWNER role');
  }
  if (!VALID_ROLES.has(normalizedRole)) {
    throw new AppError('VALIDATION_FAILED', 400, `Role must be one of: ${[...VALID_ROLES].join(', ')}`);
  }

  const normalizedEmail = email.trim().toLowerCase();

  const exec = async (client) => {
    // 1. Validate step-up if grant provided
    if (stepUpGrantId) {
      await validateStepUp(inviterId, 'INVITE_MEMBER', stepUpGrantId, client);
    }

    // 2. Check if already a member in this organization
    const existing = await client.query(
      `SELECT 1 
       FROM memberships m 
       JOIN users u ON u.id = m.user_id 
       WHERE m.org_id = $1 AND lower(u.email) = $2`,
      [orgId, normalizedEmail],
    );
    if (existing.rows.length > 0) {
      throw new AppError('ALREADY_MEMBER', 409, 'User is already a member of this organization');
    }

    // 3. Generate token & hash
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // 4. Insert or update pending invitation
    const invRes = await client.query(
      `INSERT INTO invitations (org_id, email, role, token_hash, invited_by, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       ON CONFLICT (org_id, email)
       DO UPDATE SET role = EXCLUDED.role, token_hash = EXCLUDED.token_hash,
                     invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at,
                     status = 'PENDING', created_at = now()
       RETURNING COALESCE(invitation_id, id) AS invitation_id, email, role, status, expires_at`,
      [orgId, normalizedEmail, normalizedRole, tokenHash, inviterId, expiresAt],
    );

    const inv = invRes.rows[0];

    // 5. Append ledger entry & audit log
    await appendLedgerEntry(client, {
      orgId,
      type: 'MEMBER_INVITED',
      subjectType: 'INVITATION',
      subjectId: inv.invitation_id,
      payload: { actor: inviterId, email: normalizedEmail, role: normalizedRole },
    });

    await appendAudit(client, {
      orgId,
      actorId: inviterId,
      action: 'MEMBER_INVITED',
      details: { email: normalizedEmail, role: normalizedRole, invitation_id: inv.invitation_id },
    });

    // 6. Send invite email
    const publicUrl = env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${publicUrl}/accept-invite?token=${token}`;
    await sendInviteEmail(normalizedEmail, inviteUrl, orgId, client);

    return {
      invitation_id: inv.invitation_id,
      email: normalizedEmail,
      role: normalizedRole,
      status: 'PENDING',
      expires_at: inv.expires_at,
    };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Updates a member's role in the organization.
 * 
 * @param {string} orgId 
 * @param {string} targetUserId 
 * @param {string} newRole 
 * @param {string} actorId 
 * @param {string|null} [stepUpGrantId=null] 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function updateMemberRole(orgId, targetUserId, newRole, actorId, stepUpGrantId = null, dbClient = null) {
  if (!orgId || !targetUserId || !actorId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId, targetUserId, and actorId are required');
  }
  if (!newRole || typeof newRole !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'newRole is required');
  }

  const normalizedRole = newRole.toUpperCase();
  if (normalizedRole === 'OWNER') {
    throw new AppError('CANNOT_PROMOTE_TO_OWNER', 403, 'Cannot promote member to OWNER');
  }
  if (!VALID_ROLES.has(normalizedRole)) {
    throw new AppError('VALIDATION_FAILED', 400, `Role must be one of: ${[...VALID_ROLES].join(', ')}`);
  }

  const exec = async (client) => {
    // 1. Step-up validation if grant provided or promoting to ADMIN
    if (stepUpGrantId) {
      await validateStepUp(actorId, 'UPDATE_MEMBER_ROLE', stepUpGrantId, client);
    }

    // 2. Fetch current membership record with row lock
    const currentRes = await client.query(
      `SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2 FOR UPDATE`,
      [orgId, targetUserId],
    );
    if (currentRes.rows.length === 0) {
      throw new AppError('MEMBER_NOT_FOUND', 404, 'Member not found');
    }
    const current = currentRes.rows[0];
    if (current.role === 'OWNER') {
      throw new AppError('CANNOT_CHANGE_OWNER_ROLE', 403, 'Cannot change role of organization owner');
    }

    // 3. Update role
    await client.query(
      `UPDATE memberships SET role = $1 WHERE org_id = $2 AND user_id = $3`,
      [normalizedRole, orgId, targetUserId],
    );

    // 4. Append immutable ledger entry & audit log
    await appendLedgerEntry(client, {
      orgId,
      type: 'MEMBER_ROLE_UPDATED',
      subjectType: 'USER',
      subjectId: targetUserId,
      payload: { actor: actorId, old_role: current.role, new_role: normalizedRole },
    });

    await appendAudit(client, {
      orgId,
      actorId,
      action: 'MEMBER_ROLE_UPDATED',
      details: { targetUserId, old_role: current.role, new_role: normalizedRole },
    });

    return { user_id: targetUserId, role: normalizedRole };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Removes a member from the organization.
 * 
 * @param {string} orgId 
 * @param {string} targetUserId 
 * @param {string} actorId 
 * @param {string|null} [stepUpGrantId=null] 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function removeMember(orgId, targetUserId, actorId, stepUpGrantId = null, dbClient = null) {
  if (!orgId || !targetUserId || !actorId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId, targetUserId, and actorId are required');
  }

  const exec = async (client) => {
    // 1. Validate step-up SCA if grant provided
    if (stepUpGrantId) {
      await validateStepUp(actorId, 'REMOVE_MEMBER', stepUpGrantId, client);
    }

    // 2. Fetch current membership record with row lock
    const currentRes = await client.query(
      `SELECT role FROM memberships WHERE org_id = $1 AND user_id = $2 FOR UPDATE`,
      [orgId, targetUserId],
    );
    if (currentRes.rows.length === 0) {
      throw new AppError('MEMBER_NOT_FOUND', 404, 'Member not found');
    }
    const current = currentRes.rows[0];
    if (current.role === 'OWNER') {
      throw new AppError('CANNOT_REMOVE_OWNER', 403, 'Cannot remove organization owner');
    }

    // 3. Delete membership
    await client.query(
      `DELETE FROM memberships WHERE org_id = $1 AND user_id = $2`,
      [orgId, targetUserId],
    );

    // 4. Append ledger entry & audit log
    await appendLedgerEntry(client, {
      orgId,
      type: 'MEMBER_REMOVED',
      subjectType: 'USER',
      subjectId: targetUserId,
      payload: { actor: actorId, removed_user: targetUserId },
    });

    await appendAudit(client, {
      orgId,
      actorId,
      action: 'MEMBER_REMOVED',
      details: { targetUserId },
    });

    return { user_id: targetUserId, removed: true };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Lists pending invitations for an organization.
 * 
 * @param {string} orgId 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any[]>}
 */
export async function listInvitations(orgId, dbClient = null) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  const db = dbClient || pool;
  const result = await db.query(
    `SELECT COALESCE(i.invitation_id, i.id) AS invitation_id, i.email, i.role, 
            i.status, i.expires_at, i.created_at,
            u.email AS invited_by_email, 
            COALESCE(u.display_name, split_part(u.email, '@', 1)) AS invited_by_name
     FROM invitations i
     LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.org_id = $1 AND i.status = 'PENDING' AND i.expires_at > now()
     ORDER BY i.created_at DESC`,
    [orgId],
  );

  return result.rows;
}

/**
 * Revokes a pending invitation.
 * 
 * @param {string} orgId 
 * @param {string} invitationId 
 * @param {string} actorId 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function revokeInvitation(orgId, invitationId, actorId, dbClient = null) {
  if (!orgId || !invitationId || !actorId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId, invitationId, and actorId are required');
  }

  const exec = async (client) => {
    const res = await client.query(
      `UPDATE invitations 
       SET status = 'REVOKED'
       WHERE org_id = $1 AND (invitation_id = $2 OR id = $2) AND status = 'PENDING'
       RETURNING COALESCE(invitation_id, id) AS invitation_id, email, role`,
      [orgId, invitationId],
    );

    if (res.rows.length === 0) {
      throw new AppError('INVITATION_NOT_FOUND', 404, 'Invitation not found or already processed');
    }

    const inv = res.rows[0];

    await appendLedgerEntry(client, {
      orgId,
      type: 'ENTRY',
      subjectType: 'INVITATION',
      subjectId: inv.invitation_id,
      payload: { actor: actorId, action: 'INVITATION_REVOKED', email: inv.email },
    });

    await appendAudit(client, {
      orgId,
      actorId,
      action: 'INVITATION_REVOKED',
      details: { invitation_id: inv.invitation_id, email: inv.email },
    });

    return { invitation_id: inv.invitation_id, status: 'REVOKED' };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

export default {
  listMembers,
  inviteMember,
  updateMemberRole,
  removeMember,
  listInvitations,
  revokeInvitation,
};
