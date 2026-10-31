import pool from '../db/pool.js';

export async function getDashboardSummary(orgId, db = pool) {
  if (!orgId) {
    throw new Error('orgId is required for dashboard repository methods.');
  }

  const result = await db.query(`
    WITH request_counts AS (
      SELECT
        count(*)::integer AS requests,
        count(*) FILTER (WHERE decision = 'AUTO_APPROVE')::integer AS auto_approved,
        count(*) FILTER (WHERE status = 'PENDING_APPROVAL')::integer AS held,
        count(*) FILTER (WHERE status = 'REJECTED')::integer AS blocked,
        count(*) FILTER (WHERE status = 'RECONCILED')::integer AS reconciled
      FROM payment_requests
      WHERE org_id = $1
    ), active_budget AS (
      SELECT
        GREATEST(period.limit_minor - period.reserved_minor - period.spent_minor, 0)::text AS remaining_minor,
        period.currency,
        round(
          100::numeric * (period.reserved_minor + period.spent_minor) / nullif(period.limit_minor, 0)
        )::integer AS used_pct
      FROM mandates AS mandate
      JOIN mandate_versions AS version
        ON version.org_id = mandate.org_id
       AND version.id = mandate.current_version_id
      JOIN mandate_budget_periods AS period
        ON period.org_id = version.org_id
       AND period.version_id = version.id
      WHERE mandate.org_id = $1
        AND mandate.status = 'ACTIVE'
        AND period.period_start <= now()
        AND period.period_end > now()
      ORDER BY mandate.created_at DESC, period.period_start DESC
      LIMIT 1
    )
    SELECT
      COALESCE((SELECT remaining_minor FROM active_budget), '0') AS remaining_budget_minor,
      COALESCE((SELECT currency FROM active_budget), 'USD') AS currency,
      COALESCE((SELECT used_pct FROM active_budget), 0)::integer AS budget_used_pct,
      request_counts.requests,
      request_counts.auto_approved,
      request_counts.held,
      request_counts.blocked,
      request_counts.reconciled,
      EXISTS (SELECT 1 FROM active_budget) AS has_active_budget,
      EXISTS (
        SELECT 1 FROM paypal_connections
        WHERE org_id = $1 AND status = 'CONNECTED'
      ) AS paypal_connected,
      EXISTS (
        SELECT 1 FROM agents
        WHERE org_id = $1 AND status = 'ACTIVE'
      ) AS has_agent,
      EXISTS (
        SELECT 1 FROM mandates
        WHERE org_id = $1 AND status = 'ACTIVE'
      ) AS has_active_mandate
    FROM request_counts
  `, [orgId]);

  const row = result.rows[0];
  return {
    remainingBudgetMinor: row.remaining_budget_minor,
    currency: row.currency.trim(),
    counts: {
      requests: row.requests,
      autoApproved: row.auto_approved,
      held: row.held,
      blocked: row.blocked,
      reconciled: row.reconciled,
    },
    budgetUsedPct: row.budget_used_pct,
    paypalConnected: row.paypal_connected,
    hasAgent: row.has_agent,
    hasActiveMandate: row.has_active_mandate,
  };
}
