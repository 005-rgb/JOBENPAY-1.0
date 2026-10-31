import pool from '../db/pool.js';

function assertTx(tx) {
  if (!tx || typeof tx.query !== 'function') throw new TypeError('A transaction client is required.');
}

function budgetError() {
  const error = new Error('Mandate budget exceeded.');
  error.code = 'BUDGET_EXCEEDED';
  error.statusCode = 409;
  return error;
}

function positiveMinor(value) {
  const parsed = typeof value === 'bigint' ? value : BigInt(String(value));
  if (parsed <= 0n || parsed >= 9007199254740992n) {
    const error = new Error('Budget amount must be a positive safe integer minor value.');
    error.code = 'VALIDATION_FAILED';
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

export async function getOrCreatePeriod(tx, versionId, now = new Date()) {
  assertTx(tx);
  const version = await tx.query(
    `SELECT org_id, policy->'budget'->>'limitMinor' AS limit_minor,
            policy->>'currency' AS currency, policy->'schedule'->>'timezone' AS timezone
     FROM mandate_versions WHERE id = $1 LIMIT 1`,
    [versionId],
  );
  if (!version.rowCount) return null;
  const policy = version.rows[0];
  const dates = await tx.query(
    `SELECT date_trunc('month', $1::timestamptz AT TIME ZONE $2) AT TIME ZONE $2 AS period_start,
            (date_trunc('month', $1::timestamptz AT TIME ZONE $2) + interval '1 month') AT TIME ZONE $2 AS period_end`,
    [now.toISOString(), policy.timezone],
  );
  const period = dates.rows[0];
  const result = await tx.query(
    `INSERT INTO mandate_budget_periods
       (org_id, version_id, period_start, period_end, limit_minor, currency)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (version_id, period_start) DO UPDATE SET version_id = EXCLUDED.version_id
     RETURNING id, org_id, version_id, period_start, period_end, limit_minor, reserved_minor, spent_minor, currency`,
    [policy.org_id, versionId, period.period_start, period.period_end, policy.limit_minor, policy.currency],
  );
  return result.rows[0];
}

export async function reserve(tx, versionId, amountMinor, now = new Date()) {
  const amount = positiveMinor(amountMinor);
  const period = await getOrCreatePeriod(tx, versionId, now);
  if (!period) throw new Error('Mandate version not found.');
  const result = await tx.query(
    `UPDATE mandate_budget_periods
     SET reserved_minor = reserved_minor + $2
     WHERE id = $1 AND reserved_minor + spent_minor + $2 <= limit_minor
     RETURNING id, org_id, version_id, period_start, period_end, limit_minor, reserved_minor, spent_minor, currency`,
    [period.id, amount.toString()],
  );
  if (!result.rowCount) throw budgetError();
  return result.rows[0];
}

export async function release(tx, periodId, amountMinor) {
  assertTx(tx);
  const amount = positiveMinor(amountMinor);
  const result = await tx.query(
    `UPDATE mandate_budget_periods
     SET reserved_minor = reserved_minor - $2
     WHERE id = $1 AND reserved_minor >= $2
     RETURNING *`,
    [periodId, amount.toString()],
  );
  if (!result.rowCount) throw new Error('Budget reservation not found or invalid.');
  return result.rows[0];
}

export async function commitSpend(tx, periodId, amountMinor) {
  assertTx(tx);
  const amount = positiveMinor(amountMinor);
  const result = await tx.query(
    `UPDATE mandate_budget_periods
     SET reserved_minor = reserved_minor - $2, spent_minor = spent_minor + $2
     WHERE id = $1 AND reserved_minor >= $2 AND reserved_minor + spent_minor <= limit_minor
     RETURNING *`,
    [periodId, amount.toString()],
  );
  if (!result.rowCount) throw new Error('Budget reservation not found or invalid.');
  return result.rows[0];
}

export async function getBudget(orgId, mandateId, db = pool) {
  const result = await db.query(
    `SELECT p.limit_minor, p.reserved_minor, p.spent_minor, p.currency,
            p.period_start, p.period_end
     FROM mandate_budget_periods p
     JOIN mandate_versions v ON v.id = p.version_id AND v.org_id = p.org_id
     JOIN mandates m ON m.id = v.mandate_id AND m.org_id = v.org_id
     WHERE m.org_id = $1 AND m.id = $2
       AND p.version_id = m.current_version_id
     ORDER BY p.period_start DESC LIMIT 1`,
    [orgId, mandateId],
  );
  if (result.rows[0]) return result.rows[0];
  const version = await db.query(
    `SELECT m.current_version_id AS version_id
     FROM mandates m WHERE m.org_id = $1 AND m.id = $2`,
    [orgId, mandateId],
  );
  if (!version.rows[0]?.version_id) return null;
  await getOrCreatePeriod(db, version.rows[0].version_id);
  const created = await db.query(
    `SELECT limit_minor, reserved_minor, spent_minor, currency, period_start, period_end
     FROM mandate_budget_periods WHERE version_id = $1 ORDER BY period_start DESC LIMIT 1`,
    [version.rows[0].version_id],
  );
  return created.rows[0] ?? null;
}
