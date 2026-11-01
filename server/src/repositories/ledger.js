import pool from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) throw new Error('orgId is required for ledger repository methods.');
}

function appendFilter(filters, values, sql, value) {
  values.push(value);
  filters.push(sql.replace('?', `$${values.length}`));
}

export async function listLedgerEntries(orgId, {
  limit = 25,
  cursor,
  type,
  subject,
  seqFrom,
  seqTo,
  q,
} = {}, db = pool) {
  assertOrgId(orgId);
  const pageSize = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const values = [orgId];
  const filters = ['org_id = $1'];

  if (type) appendFilter(filters, values, 'type = ?', type);
  if (subject) {
    values.push(`%${subject}%`, `%${subject}%`);
    filters.push(`(subject_type ILIKE $${values.length - 1} OR subject_id::text ILIKE $${values.length})`);
  }
  if (seqFrom !== undefined && seqFrom !== null) appendFilter(filters, values, 'seq >= ?', Number(seqFrom));
  if (seqTo !== undefined && seqTo !== null) appendFilter(filters, values, 'seq <= ?', Number(seqTo));
  if (q) {
    values.push(`%${q}%`);
    const placeholder = `$${values.length}`;
    filters.push(`(type ILIKE ${placeholder} OR subject_type ILIKE ${placeholder}
      OR subject_id::text ILIKE ${placeholder} OR payload::text ILIKE ${placeholder})`);
  }

  const filterSql = filters.join(' AND ');
  const totalResult = await db.query(
    `SELECT count(*)::integer AS total FROM ledger_entries WHERE ${filterSql}`,
    values,
  );
  const pageValues = [...values];
  const pageFilters = [...filters];
  if (cursor) appendFilter(pageFilters, pageValues, 'seq < ?', Number(cursor));
  pageValues.push(pageSize + 1);
  const entries = await db.query(
    `SELECT seq, created_at, type, subject_type, subject_id, payload, entry_hash, kid
     FROM ledger_entries
     WHERE ${pageFilters.join(' AND ')}
     ORDER BY seq DESC
     LIMIT $${pageValues.length}`,
    pageValues,
  );
  const hasNext = entries.rows.length > pageSize;
  const rows = entries.rows.slice(0, pageSize).map((row) => ({
    ...row,
    seq: Number(row.seq),
    created_at: new Date(row.created_at).toISOString(),
  }));
  return {
    entries: rows,
    total: totalResult.rows[0].total,
    hasNext,
    nextCursor: hasNext ? String(rows.at(-1).seq) : null,
  };
}

export default { listLedgerEntries };
