// @ts-check
import pool from '../db/pool.js';

/**
 * List payment transactions with org and environment isolation.
 *
 * @param {string} orgId
 * @param {string} environment
 * @param {object} [options]
 * @returns {Promise<{ items: any[], total: number, hasMore: boolean, nextCursor: string | null }>}
 */
export async function listPaymentTransactions(orgId, environment, options = {}) {
  if (!orgId) throw new Error('orgId is required');
  const env = environment || 'SANDBOX';
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  const conditions = ['org_id = $1', 'environment = $2'];
  const values = [orgId, env];

  if (options.status) {
    values.push(options.status);
    conditions.push(`status = $${values.length}`);
  }

  if (options.gateway) {
    values.push(options.gateway);
    conditions.push(`gateway = $${values.length}`);
  }

  if (options.cursor) {
    values.push(options.cursor);
    conditions.push(`created_at < $${values.length}`);
  }

  if (options.q) {
    values.push(`%${options.q}%`);
    conditions.push(`(gateway_tx_id ILIKE $${values.length} OR idempotency_key ILIKE $${values.length} OR request_id::text ILIKE $${values.length})`);
  }

  const whereClause = conditions.join(' AND ');
  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM payment_transactions WHERE ${whereClause}`,
    values,
  );
  const total = countRes.rows[0]?.count || 0;

  values.push(limit + 1);
  const dataRes = await pool.query(
    `SELECT tx_id, org_id, environment, request_id, gateway, gateway_tx_id,
            amount_minor::text AS amount_minor, currency, status, error_code, error_message,
            idempotency_key, created_at, updated_at
     FROM payment_transactions
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  const hasMore = dataRes.rows.length > limit;
  const items = hasMore ? dataRes.rows.slice(0, limit) : dataRes.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

  return { items, total, hasMore, nextCursor };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Get payment transaction by ID.
 *
 * @param {string} orgId
 * @param {string} environment
 * @param {string} txId
 * @returns {Promise<any | null>}
 */
export async function getPaymentTransactionById(orgId, environment, txId) {
  if (!orgId) throw new Error('orgId is required');
  if (!txId) throw new Error('txId is required');
  if (!UUID_REGEX.test(txId)) return null;
  const env = environment || 'SANDBOX';

  const res = await pool.query(
    `SELECT tx_id, org_id, environment, request_id, gateway, gateway_tx_id,
            amount_minor::text AS amount_minor, currency, status, error_code, error_message,
            idempotency_key, created_at, updated_at
     FROM payment_transactions
     WHERE org_id = $1 AND environment = $2 AND tx_id = $3`,
    [orgId, env, txId],
  );

  return res.rows[0] || null;
}

/**
 * List webhook events for an organization.
 *
 * @param {string} orgId
 * @param {object} [options]
 * @returns {Promise<any[]>}
 */
export async function listPaymentWebhookEvents(orgId, options = {}) {
  if (!orgId) throw new Error('orgId is required');
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  const conditions = ['org_id = $1'];
  const values = [orgId];

  if (options.gateway) {
    values.push(options.gateway);
    conditions.push(`gateway = $${values.length}`);
  }

  values.push(limit);
  const res = await pool.query(
    `SELECT event_id, org_id, gateway, gateway_event_id, event_type, payload, processed, created_at
     FROM payment_webhook_events
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${values.length}`,
    values,
  );

  return res.rows;
}

/**
 * Get aggregated payment statistics for an organization and environment.
 *
 * @param {string} orgId
 * @param {string} environment
 * @returns {Promise<object>}
 */
export async function getPaymentStats(orgId, environment) {
  if (!orgId) throw new Error('orgId is required');
  const env = environment || 'SANDBOX';

  const statusRes = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM payment_transactions
     WHERE org_id = $1 AND environment = $2
     GROUP BY status`,
    [orgId, env],
  );

  const gatewayRes = await pool.query(
    `SELECT gateway, COUNT(*)::int AS count
     FROM payment_transactions
     WHERE org_id = $1 AND environment = $2
     GROUP BY gateway`,
    [orgId, env],
  );

  const byStatus = {};
  for (const row of statusRes.rows) {
    byStatus[row.status] = row.count;
  }

  const byGateway = {};
  for (const row of gatewayRes.rows) {
    byGateway[row.gateway] = row.count;
  }

  const totalTransactions = Object.values(byStatus).reduce((a, b) => a + b, 0);

  return {
    totalTransactions,
    byStatus,
    byGateway,
    environment: env,
  };
}
