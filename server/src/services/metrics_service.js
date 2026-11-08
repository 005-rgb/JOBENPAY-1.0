// @ts-check
import pool from '../db/pool.js';

export function parseWindowInterval(window) {
  switch (window) {
    case '15m':
      return '15 minutes';
    case '1h':
      return '1 hour';
    case '24h':
    case '1d':
      return '24 hours';
    case '7d':
      return '7 days';
    case '30d':
      return '30 days';
    default:
      return '1 hour';
  }
}

export async function getTenantMetrics(orgId, window = '1h') {
  const interval = parseWindowInterval(window);

  // Aggregate payment_requests for tenant within time window
  const reqRes = await pool.query(`
    SELECT
      count(*)::int as total,
      count(*) FILTER (WHERE status NOT IN ('FAILED', 'MISMATCH'))::int as success,
      count(*) FILTER (WHERE status IN ('FAILED', 'MISMATCH'))::int as error,
      count(*) FILTER (WHERE decision IS NOT NULL)::int as decisions_total,
      count(*) FILTER (WHERE decision = 'AUTO_APPROVE' OR status = 'APPROVED')::int as decisions_approved,
      count(*) FILTER (WHERE decision = 'REJECT' OR status = 'REJECTED')::int as decisions_rejected,
      count(*) FILTER (WHERE decision = 'REQUIRE_APPROVAL' OR status = 'PENDING_APPROVAL')::int as decisions_pending,
      count(*) FILTER (WHERE action = 'PAYOUT')::int as payouts_total,
      count(*) FILTER (WHERE action = 'PAYOUT' AND status IN ('EXECUTED', 'RECONCILED'))::int as payouts_success,
      count(*) FILTER (WHERE action = 'PAYOUT' AND status IN ('FAILED', 'REJECTED'))::int as payouts_failed
    FROM payment_requests
    WHERE org_id = $1 AND created_at >= now() - ($2::text)::interval
  `, [orgId, interval]);

  const row = reqRes.rows[0] || {};

  // Aggregate latencies from request_evaluations
  const latRes = await pool.query(`
    SELECT
      coalesce(percentile_cont(0.50) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p50,
      coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p95,
      coalesce(percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms), 0)::int as p99
    FROM request_evaluations
    WHERE org_id = $1 AND created_at >= now() - ($2::text)::interval
  `, [orgId, interval]);

  const latRow = latRes.rows[0] || {};

  return {
    org_id: orgId,
    window,
    metrics: {
      requests_total: row.total || 0,
      requests_success: row.success || 0,
      requests_error: row.error || 0,
      latency_p50_ms: latRow.p50 || 0,
      latency_p95_ms: latRow.p95 || 0,
      latency_p99_ms: latRow.p99 || 0,
      decisions_total: row.decisions_total || 0,
      decisions_approved: row.decisions_approved || 0,
      decisions_rejected: row.decisions_rejected || 0,
      decisions_pending_approval: row.decisions_pending || 0,
      payouts_total: row.payouts_total || 0,
      payouts_success: row.payouts_success || 0,
      payouts_failed: row.payouts_failed || 0,
      rate_limit_utilization: 0.15,
    },
    generated_at: new Date().toISOString(),
  };
}
