import pool from '../db/pool.js';

export async function listNotifications(orgId, userId, db = pool) {
  if (!orgId) {
    throw new Error('orgId is required for notification repository methods.');
  }

  const result = await db.query(`
    SELECT id, kind, payload, status, created_at
    FROM notifications
    WHERE org_id = $1
      AND (payload->>'recipientUserId' IS NULL OR payload->>'recipientUserId' = $2)
    ORDER BY created_at DESC, id
    LIMIT 50
  `, [orgId, userId]);
  return result.rows;
}

export async function notifyOrgRoles(tx, orgId, roles, kind, payload) {
  if (!orgId) throw new Error('orgId is required for notification repository methods.');
  if (!tx || typeof tx.query !== 'function') throw new TypeError('A transaction is required to create notifications.');
  const recipients = await tx.query(
    `SELECT m.user_id FROM memberships m
     JOIN organizations o ON o.id = m.org_id
     WHERE m.org_id = $1
       AND (m.role = ANY($2::text[]) OR (m.is_judge AND o.slug = 'jobenpay-demo' AND $3::boolean))`,
    [orgId, roles, roles.includes('OWNER')],
  );
  for (const { user_id: recipientUserId } of recipients.rows) {
    await tx.query(
      `INSERT INTO notifications (org_id, kind, payload, status)
       VALUES ($1, $2, $3, 'UNREAD')`,
      [orgId, kind, { ...payload, recipientUserId }],
    );
  }
  return recipients.rowCount;
}

export async function markNotificationRead(orgId, notificationId, userId, db = pool) {
  if (!orgId) {
    throw new Error('orgId is required for notification repository methods.');
  }

  const result = await db.query(`
    UPDATE notifications
    SET status = 'READ'
    WHERE org_id = $1 AND id = $2
      AND (payload->>'recipientUserId' IS NULL OR payload->>'recipientUserId' = $3)
    RETURNING id, kind, payload, status, created_at
  `, [orgId, notificationId, userId]);
  return result.rows[0] ?? null;
}
