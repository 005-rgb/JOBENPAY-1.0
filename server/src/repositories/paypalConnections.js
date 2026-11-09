import { query as poolQuery } from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) {
    throw new Error('orgId is required for PayPal connection repository methods.');
  }
}

function normalizeEnv(env) {
  return String(env || 'SANDBOX').toUpperCase() === 'LIVE' ? 'LIVE' : 'SANDBOX';
}

export async function getPaypalConnection(orgId, envOrDb = 'SANDBOX', maybeDb = { query: poolQuery }) {
  assertOrgId(orgId);
  const isEnv = typeof envOrDb === 'string';
  const environment = isEnv ? envOrDb : 'SANDBOX';
  const db = isEnv ? (maybeDb || { query: poolQuery }) : envOrDb;
  const envValue = normalizeEnv(environment);
  const result = await db.query(
    `SELECT org_id, client_id_enc, webhook_id, webhook_token, status,
            last_tested_at, last_error_code, environment
     FROM paypal_connections
     WHERE org_id = $1 AND environment = $2
     LIMIT 1`,
    [orgId, envValue],
  );
  return result.rows[0] ?? null;
}

export async function getPaypalCredentials(orgId, envOrDb = 'SANDBOX', maybeDb = { query: poolQuery }) {
  assertOrgId(orgId);
  const isEnv = typeof envOrDb === 'string';
  const environment = isEnv ? envOrDb : 'SANDBOX';
  const db = isEnv ? (maybeDb || { query: poolQuery }) : envOrDb;
  const envValue = normalizeEnv(environment);
  const result = await db.query(
    `SELECT org_id, client_id_enc, client_secret_enc, webhook_id, webhook_token,
            status, last_tested_at, last_error_code, environment
     FROM paypal_connections
     WHERE org_id = $1 AND environment = $2
     LIMIT 1`,
    [orgId, envValue],
  );
  return result.rows[0] ?? null;
}

export async function findPaypalConnectionByWebhookToken(webhookToken, db = { query: poolQuery }) {
  if (!webhookToken) {
    throw new Error('webhookToken is required for PayPal webhook repository methods.');
  }
  const result = await db.query(
    `SELECT org_id, webhook_id, webhook_token, environment
     FROM paypal_connections
     WHERE webhook_token = $1
     LIMIT 1`,
    [webhookToken],
  );
  return result.rows[0] ?? null;
}

export async function savePaypalConnection(orgId, {
  clientIdEnc,
  clientSecretEnc,
  webhookId,
  webhookToken,
  environment = 'SANDBOX',
}, db = { query: poolQuery }) {
  assertOrgId(orgId);
  const envValue = normalizeEnv(environment);
  const result = await db.query(`
    INSERT INTO paypal_connections (
      org_id, client_id_enc, client_secret_enc, webhook_id, webhook_token, status, last_error_code, environment
    )
    VALUES ($1, $2, $3, $4, $5, 'UNTESTED', NULL, $6)
    ON CONFLICT (org_id, environment) DO UPDATE SET
      client_id_enc = EXCLUDED.client_id_enc,
      client_secret_enc = EXCLUDED.client_secret_enc,
      webhook_id = EXCLUDED.webhook_id,
      webhook_token = COALESCE(paypal_connections.webhook_token, EXCLUDED.webhook_token),
      status = 'UNTESTED',
      last_tested_at = NULL,
      last_error_code = NULL
    RETURNING *
  `, [orgId, clientIdEnc, clientSecretEnc, webhookId ?? null, webhookToken, envValue]);
  return result.rows[0];
}

export async function updatePaypalConnectionStatus(orgId, { status, lastErrorCode = null, environment = 'SANDBOX' }, db = { query: poolQuery }) {
  assertOrgId(orgId);
  const envValue = normalizeEnv(environment);
  const result = await db.query(`
    UPDATE paypal_connections
    SET status = $2,
        last_tested_at = now(),
        last_error_code = $3
    WHERE org_id = $1 AND environment = $4
    RETURNING *
  `, [orgId, status, lastErrorCode, envValue]);
  return result.rows[0] ?? null;
}

export async function deletePaypalConnection(orgId, envOrDb = 'SANDBOX', maybeDb = { query: poolQuery }) {
  assertOrgId(orgId);
  const isEnv = typeof envOrDb === 'string';
  const environment = isEnv ? envOrDb : 'SANDBOX';
  const db = isEnv ? (maybeDb || { query: poolQuery }) : envOrDb;
  const envValue = normalizeEnv(environment);
  await db.query('DELETE FROM paypal_connections WHERE org_id = $1 AND environment = $2', [orgId, envValue]);
}
