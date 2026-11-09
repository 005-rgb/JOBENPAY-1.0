// @ts-check
import defaultPool from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
export const ACTOR_TYPES = ['USER', 'AGENT', 'SYSTEM', 'EXTERNAL'];

/**
 * Log security event to immutable security_events ledger.
 */
export async function logSecurityEvent(
  orgId,
  environment,
  eventType,
  severity,
  actorType,
  actorId,
  details = {},
  db = defaultPool
) {
  const upperSeverity = String(severity || 'LOW').toUpperCase();
  const upperActorType = String(actorType || 'SYSTEM').toUpperCase();

  if (!SEVERITIES.includes(upperSeverity)) {
    throw new AppError('INVALID_SEVERITY', 400, `Invalid severity: ${severity}`);
  }
  if (!ACTOR_TYPES.includes(upperActorType)) {
    throw new AppError('INVALID_ACTOR_TYPE', 400, `Invalid actor type: ${actorType}`);
  }

  const result = await db.query(
    `INSERT INTO security_events (org_id, environment, event_type, severity, actor_type, actor_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING event_id, org_id, environment, event_type, severity, actor_type, actor_id, details, created_at`,
    [
      orgId || null,
      environment || null,
      eventType,
      upperSeverity,
      upperActorType,
      actorId || null,
      JSON.stringify(details || {}),
    ]
  );

  const event = result.rows[0];
  if (upperSeverity === 'CRITICAL' || upperSeverity === 'HIGH') {
    logger.warn({ eventType, severity: upperSeverity, actorId, orgId, details }, 'Security alert logged');
  }

  return {
    eventId: event.event_id,
    orgId: event.org_id,
    environment: event.environment,
    eventType: event.event_type,
    severity: event.severity,
    actorType: event.actor_type,
    actorId: event.actor_id,
    details: event.details,
    createdAt: event.created_at,
  };
}

/**
 * Hitung dan simpan baseline behavioral untuk sebuah agen.
 */
export async function computeBaseline(agentId, orgId, environment, options = {}) {
  const db = options.db || defaultPool;
  const env = (environment || 'SANDBOX').toUpperCase();

  if (!agentId || !orgId) {
    throw new AppError('PARAMS_REQUIRED', 400, 'agentId and orgId are required.');
  }

  // Ambil data agregat transaksi historis agen
  const statsRes = await db.query(
    `SELECT
       COUNT(*)::text AS tx_count,
       COALESCE(ROUND(AVG(amount_minor)), 5000)::text AS avg_val,
       COALESCE(ROUND(STDDEV(amount_minor)), 1000)::text AS stddev_val,
       COALESCE(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) / 3600, 1)::numeric AS hours_span
     FROM transaction_intents
     WHERE agent_id = $1 AND org_id = $2 AND environment = $3`,
    [agentId, orgId, env]
  );

  const row = statsRes.rows[0];
  const statsTxCount = parseInt(String(row.tx_count || '0'), 10);
  const hoursSpan = Math.max(Number(row.hours_span) || 1, 1);
  const avgRequestsPerHour = options.avgRequestsPerHour !== undefined
    ? Number(options.avgRequestsPerHour)
    : (statsTxCount > 0 ? Number((statsTxCount / hoursSpan).toFixed(2)) : 10.0);
  const avgAmountPerTxMinor = options.avgAmountPerTxMinor !== undefined
    ? BigInt(options.avgAmountPerTxMinor)
    : BigInt(row.avg_val || '5000');
  const stddevAmountMinor = options.stddevAmountMinor !== undefined
    ? BigInt(options.stddevAmountMinor)
    : BigInt(row.stddev_val && row.stddev_val !== '0' ? row.stddev_val : '1000');

  const result = await db.query(
    `INSERT INTO agent_behavior_baselines (
       agent_id, org_id, environment, avg_requests_per_hour, avg_amount_per_tx_minor, stddev_amount_minor, computed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (agent_id, environment)
     DO UPDATE SET
       avg_requests_per_hour = EXCLUDED.avg_requests_per_hour,
       avg_amount_per_tx_minor = EXCLUDED.avg_amount_per_tx_minor,
       stddev_amount_minor = EXCLUDED.stddev_amount_minor,
       computed_at = now()
     RETURNING *`,
    [agentId, orgId, env, avgRequestsPerHour, avgAmountPerTxMinor.toString(), stddevAmountMinor.toString()]
  );

  const saved = result.rows[0];
  return {
    baselineId: saved.baseline_id,
    agentId: saved.agent_id,
    orgId: saved.org_id,
    environment: saved.environment,
    avgRequestsPerHour: Number(saved.avg_requests_per_hour),
    avgAmountPerTxMinor: saved.avg_amount_per_tx_minor.toString(),
    stddevAmountMinor: saved.stddev_amount_minor.toString(),
    computedAt: saved.computed_at,
  };
}

/**
 * Deteksi rogue agent berdasarkan behavioral baseline (OWASP ASI10).
 */
export async function detectRogueAgent(agentId, environment, options = {}) {
  const db = options.db || defaultPool;
  const env = (environment || 'SANDBOX').toUpperCase();

  const baseline = await db.query(
    `SELECT * FROM agent_behavior_baselines WHERE agent_id = $1 AND environment = $2`,
    [agentId, env]
  );

  if (baseline.rows.length === 0) {
    return {
      anomalous: false,
      reason: 'NO_BASELINE_RECORDED',
      anomalies: [],
    };
  }

  const b = baseline.rows[0];
  const recent = await db.query(
    `SELECT
       COUNT(*)::text AS tx_count,
       COALESCE(ROUND(AVG(amount_minor)), 0)::text AS avg_val
     FROM transaction_intents
     WHERE agent_id = $1 AND environment = $2 AND created_at > now() - interval '1 hour'`,
    [agentId, env]
  );

  const r = recent.rows[0];
  const txCount = parseInt(String(r.tx_count || '0'), 10);
  const recentAvgMinor = BigInt(r.avg_val || '0');
  const baselineStddevMinor = BigInt(b.stddev_amount_minor || '1');
  const baselineAvgRequests = Number(b.avg_requests_per_hour) || 1;
  const baselineAvgMinor = BigInt(b.avg_amount_per_tx_minor || '0');

  const anomalies = [];

  // 1. Velocity spike check (request volume > 5x expected hourly rate)
  if (txCount > baselineAvgRequests * 5) {
    anomalies.push({
      type: 'VELOCITY_SPIKE',
      expected: baselineAvgRequests,
      actual: txCount,
      threshold: baselineAvgRequests * 5,
    });
  }

  // 2. Amount anomaly check (transaction amount deviates > 3 standard deviations)
  const diff = recentAvgMinor > baselineAvgMinor ? recentAvgMinor - baselineAvgMinor : baselineAvgMinor - recentAvgMinor;
  const threeSigma = 3n * baselineStddevMinor;
  if (txCount > 0 && diff > threeSigma) {
    anomalies.push({
      type: 'AMOUNT_ANOMALY',
      expectedMinor: baselineAvgMinor.toString(),
      actualMinor: recentAvgMinor.toString(),
      stddevMinor: baselineStddevMinor.toString(),
      deviationMinor: diff.toString(),
    });
  }

  if (anomalies.length > 0) {
    await logSecurityEvent(
      b.org_id,
      env,
      'ROGUE_AGENT_SUSPECTED',
      'HIGH',
      'AGENT',
      agentId,
      { anomalies, recentTxCount: txCount, recentAvgMinor: recentAvgMinor.toString() },
      db
    );
  }

  return {
    anomalous: anomalies.length > 0,
    anomalies,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Daftar security events dengan filter dan isolasi tenant.
 */
export async function getSecurityEvents(orgId, options = {}, db = defaultPool) {
  if (!orgId) {
    throw new AppError('ORG_ID_REQUIRED', 400, 'orgId is required to retrieve security events.');
  }

  const severity = options.severity ? String(options.severity).toUpperCase() : null;
  const eventType = options.eventType ? String(options.eventType) : null;
  const environment = options.environment ? String(options.environment).toUpperCase() : null;
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const result = await db.query(
    `SELECT event_id, org_id, environment, event_type, severity, actor_type, actor_id, details, created_at
     FROM security_events
     WHERE org_id = $1
       AND ($2::text IS NULL OR severity = $2)
       AND ($3::text IS NULL OR event_type = $3)
       AND ($4::environment_type IS NULL OR environment = $4)
     ORDER BY created_at DESC
     LIMIT $5 OFFSET $6`,
    [orgId, severity, eventType, environment, limit, offset]
  );

  return result.rows.map((r) => ({
    eventId: r.event_id,
    orgId: r.org_id,
    environment: r.environment,
    eventType: r.event_type,
    severity: r.severity,
    actorType: r.actor_type,
    actorId: r.actor_id,
    details: r.details,
    createdAt: r.created_at,
  }));
}
