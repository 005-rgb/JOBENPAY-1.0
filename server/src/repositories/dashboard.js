import pool from '../db/pool.js';

export async function getDashboardSummary(orgId, dbOrEnv = pool, maybeEnv = 'SANDBOX') {
  if (!orgId) {
    throw new Error('orgId is required for dashboard repository methods.');
  }

  let db = pool;
  let environment = 'SANDBOX';
  if (typeof dbOrEnv === 'string') {
    environment = dbOrEnv;
  } else {
    db = dbOrEnv || pool;
    environment = maybeEnv || 'SANDBOX';
  }

  const env = (environment || 'SANDBOX').toUpperCase();

  const result = await db.query(`
    WITH request_counts AS (
      SELECT
        count(*)::integer AS requests,
        count(*) FILTER (WHERE metadata->>'decision' = 'AUTO_APPROVE')::integer AS auto_approved,
        count(*) FILTER (WHERE status = 'PENDING_APPROVAL' OR status = 'NEEDS_APPROVAL')::integer AS held,
        count(*) FILTER (WHERE status = 'REJECTED')::integer AS blocked,
        count(*) FILTER (WHERE reconciliation_status = 'RECONCILED')::integer AS reconciled
      FROM transaction_intents
      WHERE org_id = $1 AND environment = $2
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
        AND mandate.environment = $2
        AND mandate.status = 'ACTIVE'
        AND period.period_start <= now()
        AND period.period_end > now()
      ORDER BY mandate.created_at DESC, period.period_start DESC
      LIMIT 1
    ), recent_txs AS (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', t.intent_id,
            'category', t.category,
            'sub_type', t.sub_type,
            'amount_minor', t.amount_minor::text,
            'currency', t.currency,
            'status', t.status,
            'created_at', t.created_at
          ) ORDER BY t.created_at DESC
        ),
        '[]'::json
      ) AS list
      FROM (
        SELECT intent_id, category, sub_type, amount_minor, currency, status, created_at
        FROM transaction_intents
        WHERE org_id = $1 AND environment = $2
        ORDER BY created_at DESC
        LIMIT 5
      ) t
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
        WHERE org_id = $1 AND environment = $2 AND status = 'CONNECTED'
      ) AS paypal_connected,
      EXISTS (
        SELECT 1 FROM agents
        WHERE org_id = $1 AND environment = $2 AND status = 'ACTIVE'
      ) AS has_agent,
      (
        SELECT count(*)::integer FROM agents
        WHERE org_id = $1 AND environment = $2 AND status = 'ACTIVE'
      ) AS total_agents,
      EXISTS (
        SELECT 1 FROM mandates
        WHERE org_id = $1 AND environment = $2 AND status = 'ACTIVE'
      ) AS has_active_mandate,
      (
        SELECT count(*)::integer FROM mandates
        WHERE org_id = $1 AND environment = $2 AND status = 'ACTIVE'
      ) AS active_mandates,
      (SELECT list FROM recent_txs) AS recent_transactions
    FROM request_counts
  `, [orgId, env]);

  const row = result.rows[0];
  const paypalConnected = Boolean(row.paypal_connected);
  const hasAgent = Boolean(row.has_agent);
  const hasActiveMandate = Boolean(row.has_active_mandate);
  const completedSetupCount = (paypalConnected ? 1 : 0) + (hasAgent ? 1 : 0) + (hasActiveMandate ? 1 : 0);

  return {
    environment: env,
    remainingBudgetMinor: row.remaining_budget_minor,
    currency: row.currency.trim(),
    counts: {
      requests: row.requests,
      autoApproved: row.auto_approved,
      held: row.held,
      blocked: row.blocked,
      reconciled: row.reconciled,
      pendingApprovals: row.held,
      totalAgents: row.total_agents,
      activeMandates: row.active_mandates,
    },
    budgetUsedPct: row.budget_used_pct,
    paypalConnected,
    hasAgent,
    totalAgents: row.total_agents,
    hasActiveMandate,
    activeMandates: row.active_mandates,
    pendingApprovals: row.held,
    recentTransactions: row.recent_transactions || [],
    setupReadiness: {
      paypalConnected,
      hasAgent,
      hasActiveMandate,
      completedCount: completedSetupCount,
      totalCount: 3,
      isReady: completedSetupCount === 3,
    },
  };
}
