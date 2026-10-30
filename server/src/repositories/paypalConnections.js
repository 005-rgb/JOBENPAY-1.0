import { query as poolQuery } from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) {
    throw new Error('orgId is required for PayPal connection repository methods.');
  }
}

export async function getPaypalConnection(orgId, db = { query: poolQuery }) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT org_id, client_id_enc, webhook_id, webhook_token, status,
            last_tested_at, last_error_code
     FROM paypal_connections
     WHERE org_id = $1
     LIMIT 1`,
    [orgId],
  );
  return result.rows[0] ?? null;
}

export async function getPaypalCredentials(orgId, db = { query: poolQuery }) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT org_id, client_id_enc, client_secret_enc, webhook_id, webhook_token,
            status, last_tested_at, last_error_code
     FROM paypal_connections
     WHERE org_id = $1
     LIMIT 1`,
    [orgId],
  );
  return result.rows[0] ?? null;
}

export async function findPaypalConnectionByWebhookToken(webhookToken, db = { query: poolQuery }) {
  if (!webhookToken) {
    throw new Error('webhookToken is required for PayPal webhook repository methods.');
  }
  const result = await db.query(
    `SELECT org_id, webhook_id, webhook_token
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
}, db = { query: poolQuery }) {
  assertOrgId(orgId);
  const result = await db.query(`
    INSERT INTO paypal_connections (
      org_id, client_id_enc, client_secret_enc, webhook_id, webhook_token, status, last_error_code
    )
    VALUES ($1, $2, $3, $4, $5, 'UNTESTED', NULL)
    ON CONFLICT (org_id) DO UPDATE SET
      client_id_enc = EXCLUDED.client_id_enc,
      client_secret_enc = EXCLUDED.client_secret_enc,
      webhook_id = EXCLUDED.webhook_id,
      webhook_token = COALESCE(paypal_connections.webhook_token, EXCLUDED.webhook_token),
      status = 'UNTESTED',
      last_tested_at = NULL,
      last_error_code = NULL
    RETURNING *
  `, [orgId, clientIdEnc, clientSecretEnc, webhookId ?? null, webhookToken]);
  return result.rows[0];
}

export async function updatePaypalConnectionStatus(orgId, { status, lastErrorCode = null }, db = { query: poolQuery }) {
  assertOrgId(orgId);
  const result = await db.query(`
    UPDATE paypal_connections
    SET status = $2,
        last_tested_at = now(),
        last_error_code = $3
    WHERE org_id = $1
    RETURNING *
  `, [orgId, status, lastErrorCode]);
  return result.rows[0] ?? null;
}

export async function deletePaypalConnection(orgId, db = { query: poolQuery }) {
  assertOrgId(orgId);
  await db.query('DELETE FROM paypal_connections WHERE org_id = $1', [orgId]);
}
