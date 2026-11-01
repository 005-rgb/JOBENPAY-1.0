import pool from '../db/pool.js';
import { AppError } from '../lib/errors.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for audit repository methods.');
}

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({
    createdAt: new Date(row.created_at).toISOString(),
    id: row.id,
  })).toString('base64url');
}

function decodeCursor(cursor) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Number.isFinite(Date.parse(decoded.createdAt)) || !/^[0-9a-f-]{8}-[0-9a-f-]{4}-[1-8][0-9a-f-]{3}-[89ab][0-9a-f-]{3}-[0-9a-f-]{12}$/i.test(decoded.id)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function listAuditEvents(orgId, {
  limit = 25,
  cursor,
  action,
  q,
} = {}, db = pool) {
  assertOrgId(orgId);
  const pageSize = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const values = [orgId];
  const filters = ['event.org_id = $1'];
  if (action) {
    values.push(action);
    filters.push(`event.action = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    const placeholder = `$${values.length}`;
    filters.push(`(event.action ILIKE ${placeholder} OR event.details::text ILIKE ${placeholder}
      OR actor.email ILIKE ${placeholder} OR actor.display_name ILIKE ${placeholder})`);
  }
  const filterSql = filters.join(' AND ');
  const totalResult = await db.query(
    `SELECT count(*)::integer AS total
     FROM audit_events event
     LEFT JOIN users actor ON actor.id = event.actor_id
     WHERE ${filterSql}`,
    values,
  );
  const pageValues = [...values];
  const pageFilters = [...filters];
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) {
      const error = new AppError('VALIDATION_FAILED', 'Invalid audit cursor.');
      error.statusCode = 400;
      throw error;
    }
    pageValues.push(decoded.createdAt, decoded.id);
    pageFilters.push(`(event.created_at, event.id) < ($${pageValues.length - 1}::timestamptz, $${pageValues.length}::uuid)`);
  }
  pageValues.push(pageSize + 1);
  const events = await db.query(
    `SELECT event.id, event.created_at,
            COALESCE(actor.display_name, actor.email, 'System') AS actor,
            event.action,
            COALESCE(
              event.details->>'targetId',
              event.details->>'requestId',
              event.details->>'approvalId',
              event.details->>'documentId',
              event.details->>'agentId',
              event.details->>'mandateId',
              event.details->>'payeeId'
            ) AS target
     FROM audit_events event
     LEFT JOIN users actor ON actor.id = event.actor_id
     WHERE ${pageFilters.join(' AND ')}
     ORDER BY event.created_at DESC, event.id DESC
     LIMIT $${pageValues.length}`,
    pageValues,
  );
  const hasNext = events.rows.length > pageSize;
  const rows = events.rows.slice(0, pageSize).map((row) => ({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
  }));
  return {
    events: rows,
    total: totalResult.rows[0].total,
    hasNext,
    nextCursor: hasNext ? encodeCursor(rows.at(-1)) : null,
  };
}

export default { listAuditEvents };
