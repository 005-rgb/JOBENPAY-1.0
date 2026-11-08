// @ts-check
import pool from '../db/pool.js';

/**
 * Query audit log events with flexible filters, timestamp ranges, and cursor-based pagination.
 */
export async function queryAuditLog(orgId, filters = {}, cursor = null, limit = 100) {
  if (!orgId) {
    throw new Error('org_id is required');
  }

  const safeLimit = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 1000);
  const conditions = ['org_id = $1'];
  const values = [orgId];
  let paramIdx = 2;

  if (filters.user_id) {
    conditions.push(`actor_id = $${paramIdx++}`);
    values.push(filters.user_id);
  }
  if (filters.action) {
    conditions.push(`action = $${paramIdx++}`);
    values.push(filters.action);
  }
  if (filters.from) {
    conditions.push(`created_at >= $${paramIdx++}`);
    values.push(new Date(filters.from).toISOString());
  }
  if (filters.to) {
    conditions.push(`created_at <= $${paramIdx++}`);
    values.push(new Date(filters.to).toISOString());
  }
  if (cursor) {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      if (parsed.created_at && parsed.id) {
        conditions.push(`(created_at, id) < ($${paramIdx++}, $${paramIdx++})`);
        values.push(parsed.created_at, parsed.id);
      }
    } catch {
      // Ignore invalid cursor
    }
  }

  values.push(safeLimit + 1);
  const querySql = `
    SELECT id, created_at, org_id, actor_id, action, details
    FROM audit_events
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC, id DESC
    LIMIT $${paramIdx}
  `;

  const result = await pool.query(querySql, values);
  const rows = result.rows;
  const hasMore = rows.length > safeLimit;
  const returnedRows = hasMore ? rows.slice(0, safeLimit) : rows;

  const events = returnedRows.map((r) => {
    const details = r.details || {};
    const resourceType = details.resource_type || details.resourceType || null;
    const resourceId = details.resource_id || details.resourceId || null;
    return {
      event_id: r.id,
      org_id: r.org_id,
      user_id: r.actor_id,
      action: r.action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata: details,
      created_at: new Date(r.created_at).toISOString(),
    };
  });

  let nextCursor = null;
  if (hasMore) {
    const last = returnedRows[returnedRows.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ created_at: last.created_at, id: last.id })).toString('base64');
  }

  return {
    events,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}
