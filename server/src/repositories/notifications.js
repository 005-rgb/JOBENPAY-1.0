import pool from '../db/pool.js';

export async function listNotifications(orgId, db = pool) {
  if (!orgId) {
    throw new Error('orgId is required for notification repository methods.');
  }

  const result = await db.query(`
    SELECT id, kind, payload, status, created_at
    FROM notifications
    WHERE org_id = $1
    ORDER BY created_at DESC, id
    LIMIT 50
  `, [orgId]);
  return result.rows;
}

export async function markNotificationRead(orgId, notificationId, db = pool) {
  if (!orgId) {
    throw new Error('orgId is required for notification repository methods.');
  }

  const result = await db.query(`
    UPDATE notifications
    SET status = 'READ'
    WHERE org_id = $1 AND id = $2
    RETURNING id, kind, payload, status, created_at
  `, [orgId, notificationId]);
  return result.rows[0] ?? null;
}
