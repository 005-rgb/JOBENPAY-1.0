import crypto from 'node:crypto';

import { query } from '../db/pool.js';

export async function createSession(orgId, { userId, currentOrgId, csrfSecret, expiresAt, userAgent = null, ipAddress = null }) {
  if (!orgId) {
    throw new Error('orgId is required for sessions repository methods.');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');

  const result = await query(
    `INSERT INTO sessions (id_hash, user_id, current_org_id, csrf_secret, last_seen_at, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, now(), $5, $6, $7)
     RETURNING *`,
    [tokenHash, userId, currentOrgId ?? orgId, csrfSecret, expiresAt, userAgent, ipAddress],
  );

  return { session: result.rows[0], token: rawToken };
}

export async function findSessionByCookie(orgId, rawToken) {
  if (!orgId) {
    throw new Error('orgId is required for sessions repository methods.');
  }

  const tokenHash = crypto.createHash('sha256').update(String(rawToken), 'utf8').digest('hex');
  const result = await query(
    `SELECT * FROM sessions WHERE id_hash = $1 AND expires_at > now() LIMIT 1`,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

export async function touchSession(orgId, sessionId, { userAgent = null, ipAddress = null } = {}) {
  if (!orgId) {
    throw new Error('orgId is required for sessions repository methods.');
  }

  if (userAgent || ipAddress) {
    await query(
      `UPDATE sessions
       SET last_seen_at = now(),
           user_agent = COALESCE(user_agent, $3),
           ip_address = COALESCE(ip_address, $4)
       WHERE id = $1 AND current_org_id = $2`,
      [sessionId, orgId, userAgent, ipAddress],
    );
  } else {
    await query(
      `UPDATE sessions SET last_seen_at = now() WHERE id = $1 AND current_org_id = $2`,
      [sessionId, orgId],
    );
  }
}

export async function findUserSessions(orgId, userId) {
  if (!orgId || !userId) {
    throw new Error('orgId and userId are required for findUserSessions.');
  }
  const result = await query(
    `SELECT id, id_hash, user_agent, ip_address, created_at, last_seen_at, expires_at
     FROM sessions
     WHERE user_id = $1 AND expires_at > now()
     ORDER BY last_seen_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function deleteUserOtherSessions(orgId, userId, currentSessionId) {
  if (!orgId || !userId) {
    throw new Error('orgId and userId are required for deleteUserOtherSessions.');
  }
  const result = await query(
    `DELETE FROM sessions WHERE user_id = $1 AND id != $2`,
    [userId, currentSessionId],
  );
  return result.rowCount || 0;
}

export async function deleteSession(orgId, sessionId) {
  if (!orgId) {
    throw new Error('orgId is required for sessions repository methods.');
  }

  await query('DELETE FROM sessions WHERE id = $1 AND current_org_id = $2', [sessionId, orgId]);
}

export async function rotateCookie(orgId, sessionId, { csrfSecret, expiresAt }) {
  if (!orgId) {
    throw new Error('orgId is required for sessions repository methods.');
  }

  const newToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(newToken, 'utf8').digest('hex');
  await query(
    `UPDATE sessions
     SET id_hash = $1, csrf_secret = $2, expires_at = $3, last_seen_at = now()
     WHERE id = $4 AND current_org_id = $5`,
    [tokenHash, csrfSecret, expiresAt, sessionId, orgId],
  );

  return newToken;
}

export default {
  createSession,
  findSessionByCookie,
  touchSession,
  findUserSessions,
  deleteUserOtherSessions,
  deleteSession,
  rotateCookie,
};
