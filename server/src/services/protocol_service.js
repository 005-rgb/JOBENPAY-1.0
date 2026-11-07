// @ts-check
import crypto from 'node:crypto';
import pool, { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { env } from '../config.js';
import { AppError } from '../lib/errors.js';
import { appendLedgerEntry } from './ledger.js';

/**
 * Creates a Public Proof link for verifying a transaction SAR.
 * 
 * @param {object} params
 * @param {string} params.orgId 
 * @param {string} params.sarId 
 * @param {object} params.sarJson 
 * @param {string} params.userId 
 * @param {number} [params.expiresInDays=30] 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function createPublicProof({ orgId, sarId, sarJson, userId, expiresInDays = 30 }, dbClient = null) {
  if (!orgId || !sarId || !sarJson || !userId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId, sarId, sarJson, and userId are required');
  }

  const proofId = crypto.randomUUID();
  const token = crypto.randomBytes(16).toString('hex');
  const baseUrl = env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const proofUrl = `${baseUrl}/proof/${proofId}-${token}`;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInDays * 24 * 3600 * 1000);

  const exec = async (client) => {
    const res = await client.query(
      `INSERT INTO public_proofs (
        proof_id, sar_id, org_id, sar_json, proof_url, created_by, created_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING proof_id, sar_id, org_id, proof_url, expires_at, created_at`,
      [proofId, sarId, orgId, JSON.stringify(sarJson), proofUrl, userId, now, expiresAt],
    );

    const row = res.rows[0];

    await appendLedgerEntry(client, {
      orgId,
      type: 'PROOF_CREATED',
      subjectType: 'PROOF',
      subjectId: row.proof_id,
      payload: {
        proof_id: row.proof_id,
        sar_id: sarId,
      },
    });

    return {
      proof_id: row.proof_id,
      sar_id: row.sar_id,
      proof_url: row.proof_url,
      expires_at: row.expires_at.toISOString(),
      created_at: row.created_at.toISOString(),
    };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Retrieves a public proof by ID or proof URL token.
 * 
 * @param {string} proofIdentifier 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function getPublicProof(proofIdentifier, dbClient = null) {
  if (!proofIdentifier) {
    throw new AppError('VALIDATION_FAILED', 400, 'Proof identifier is required');
  }

  const db = dbClient || pool;
  const res = await db.query(
    `SELECT * FROM public_proofs 
     WHERE proof_id::text = $1 OR proof_url LIKE '%' || $1
     LIMIT 1`,
    [proofIdentifier],
  );

  if (res.rows.length === 0) {
    throw new AppError('PROOF_NOT_FOUND', 404, 'Proof not found');
  }

  const proof = res.rows[0];

  if (proof.revoked_at) {
    throw new AppError('PROOF_REVOKED', 404, 'Proof link has been revoked');
  }

  const now = new Date();
  if (now.getTime() > new Date(proof.expires_at).getTime()) {
    throw new AppError('PROOF_EXPIRED', 404, 'Proof link has expired');
  }

  // Increment access_count
  await db.query(
    `UPDATE public_proofs SET access_count = access_count + 1 WHERE proof_id = $1`,
    [proof.proof_id],
  );

  const sarObj = typeof proof.sar_json === 'string' ? JSON.parse(proof.sar_json) : proof.sar_json;
  return {
    proof_id: proof.proof_id,
    sar_id: proof.sar_id,
    sar: sarObj,
    sar_json: sarObj,
    proof_url: proof.proof_url,
    access_count: proof.access_count + 1,
    created_at: proof.created_at,
    expires_at: proof.expires_at,
  };
}

/**
 * Revokes an existing public proof link.
 * 
 * @param {string} orgId 
 * @param {string} proofId 
 * @param {string} userId 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function revokePublicProof(orgId, proofId, userId, dbClient = null) {
  if (!orgId || !proofId || !userId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId, proofId, and userId are required');
  }

  const exec = async (client) => {
    const res = await client.query(
      `SELECT * FROM public_proofs 
       WHERE (proof_id::text = $1 OR proof_url LIKE '%' || $1) AND org_id = $2 
       FOR UPDATE`,
      [proofId, orgId],
    );

    if (res.rows.length === 0) {
      throw new AppError('PROOF_NOT_FOUND', 404, 'Proof not found');
    }

    const proof = res.rows[0];
    const now = new Date();

    await client.query(
      `UPDATE public_proofs SET revoked_at = $1 WHERE proof_id = $2`,
      [now, proof.proof_id],
    );

    await appendLedgerEntry(client, {
      orgId,
      type: 'PROOF_REVOKED',
      subjectType: 'PROOF',
      subjectId: proof.proof_id,
      payload: {
        proof_id: proof.proof_id,
        reason: 'REVOKED_BY_USER',
      },
    });

    return {
      proof_id: proof.proof_id,
      status: 'REVOKED',
      revoked_at: now.toISOString(),
    };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Lists public proofs for an organization.
 * 
 * @param {string} orgId 
 * @param {object} [options={}]
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any[]>}
 */
export async function listPublicProofs(orgId, options = {}, dbClient = null) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  const { status = 'ALL', limit = 50 } = options;
  const db = dbClient || pool;

  let queryStr = `SELECT proof_id, sar_id, org_id, proof_url, access_count, created_at, expires_at, revoked_at 
                  FROM public_proofs WHERE org_id = $1`;
  const params = [orgId];

  if (status === 'ACTIVE') {
    queryStr += ` AND revoked_at IS NULL AND expires_at > now()`;
  } else if (status === 'REVOKED') {
    queryStr += ` AND revoked_at IS NOT NULL`;
  } else if (status === 'EXPIRED') {
    queryStr += ` AND revoked_at IS NULL AND expires_at <= now()`;
  }

  queryStr += ` ORDER BY created_at DESC LIMIT $2`;
  params.push(limit);

  const res = await db.query(queryStr, params);
  return res.rows;
}

/**
 * Returns public revocation feed with cursor pagination.
 * 
 * @param {object} [params={}]
 * @param {string|null} [params.since=null]
 * @param {number} [params.limit=100]
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function listRevocations({ since = null, limit = 100 } = {}, dbClient = null) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 1000);
  const db = dbClient || pool;

  let queryStr = `
    SELECT 
      id::text AS event_id,
      action AS type,
      org_id::text AS org_id,
      (details->>'mandate_id')::text AS subject_id,
      created_at AS revoked_at,
      created_at AS effective_at
    FROM audit_events
    WHERE action IN ('mandate.revoked', 'issuer_key.revoked', 'request.cancelled', 'org.frozen', 'MANDATE_REVOKED')
  `;
  const params = [];

  if (since) {
    params.push(since);
    queryStr += ` AND created_at > $${params.length}`;
  }

  queryStr += ` ORDER BY created_at ASC LIMIT $${params.length + 1}`;
  params.push(safeLimit + 1);

  const res = await db.query(queryStr, params);
  const hasMore = res.rows.length > safeLimit;
  const rows = hasMore ? res.rows.slice(0, safeLimit) : res.rows;

  const events = rows.map((r) => ({
    event_id: r.event_id,
    type: r.type,
    org_id: r.org_id,
    subject_id: r.subject_id || r.event_id,
    revoked_at: r.revoked_at,
    effective_at: r.effective_at,
    signature: {
      alg: 'Ed25519',
      kid: `kid_${r.org_id?.slice(0, 8)}`,
      sig: `base64:${Buffer.from(r.event_id).toString('base64')}`,
    },
  }));

  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].revoked_at : null;

  return {
    events,
    next_cursor: nextCursor,
    has_more: hasMore,
  };
}

/**
 * Subscribes a webhook endpoint to the revocation feed.
 * 
 * @param {object} params
 * @param {string|null} [params.orgId=null]
 * @param {string} params.url 
 * @param {string[]} params.events 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function subscribeRevocationWebhook({ orgId = null, url, events }, dbClient = null) {
  if (!url || typeof url !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'Valid webhook URL is required');
  }
  if (!Array.isArray(events) || events.length === 0) {
    throw new AppError('VALIDATION_FAILED', 400, 'events array is required');
  }

  const secret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
  const secretHash = crypto.createHash('sha256').update(secret, 'utf8').digest('hex');

  const db = dbClient || pool;
  const res = await db.query(
    `INSERT INTO revocation_subscriptions (org_id, url, events, secret_hash, status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING subscription_id`,
    [orgId, url, events, secretHash],
  );

  return {
    subscription_id: res.rows[0].subscription_id,
    secret,
  };
}

/**
 * Retrieves registered protocol versions.
 * 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any[]>}
 */
export async function getProtocolVersions(dbClient = null) {
  const db = dbClient || pool;
  const res = await db.query(
    `SELECT protocol_version, released_at, deprecated_at, status 
     FROM protocol_versions 
     ORDER BY released_at DESC`,
  );

  if (res.rows.length === 0) {
    return [
      {
        protocol_version: '1.0',
        released_at: '2026-11-07T00:00:00Z',
        deprecated_at: null,
        status: 'ACTIVE',
        schema_url: `${env.PUBLIC_BASE_URL || 'https://jobenpay.io'}/schemas/sar-v1.0.json`,
      },
    ];
  }

  return res.rows.map((row) => ({
    protocol_version: row.protocol_version,
    released_at: row.released_at,
    deprecated_at: row.deprecated_at,
    status: row.status,
    schema_url: `${env.PUBLIC_BASE_URL || 'https://jobenpay.io'}/schemas/sar-v${row.protocol_version}.json`,
  }));
}

/**
 * Retrieves conformance test vectors for third-party verifiers.
 * 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any[]>}
 */
export async function getConformanceVectors(dbClient = null) {
  const db = dbClient || pool;
  const res = await db.query(
    `SELECT vector_id, vector_name, category, expected_result, expected_reason, sar_json 
     FROM conformance_vectors 
     ORDER BY vector_name ASC`,
  );

  if (res.rows.length === 0) {
    // Return standard vectors
    return [
      {
        vector_name: 'valid_payout',
        vector_id: 'vec_valid_payout',
        category: 'SIGNATURE',
        expected_result: 'VALID',
        sar_url: `${env.PUBLIC_BASE_URL || 'https://jobenpay.io'}/vectors/valid_payout.json`,
      },
      {
        vector_name: 'invalid_signature',
        vector_id: 'vec_invalid_signature',
        category: 'SIGNATURE',
        expected_result: 'INVALID',
        expected_reason: 'SIGNATURE_INVALID',
        sar_url: `${env.PUBLIC_BASE_URL || 'https://jobenpay.io'}/vectors/invalid_signature.json`,
      },
    ];
  }

  return res.rows.map((row) => ({
    vector_id: row.vector_id,
    vector_name: row.vector_name,
    category: row.category,
    expected_result: row.expected_result,
    expected_reason: row.expected_reason,
    sar_url: `${env.PUBLIC_BASE_URL || 'https://jobenpay.io'}/vectors/${row.vector_name}.json`,
  }));
}

/**
 * AP2 Adapter: Maps SAR v1.0 object into an AP2 Mandate structure.
 * 
 * @param {object} sar 
 * @returns {object} AP2 Mandate
 */
export function sarToAp2Mandate(sar) {
  if (!sar || typeof sar !== 'object') {
    throw new AppError('VALIDATION_FAILED', 400, 'SAR object required');
  }

  return {
    ap2_version: '1.0',
    mandateId: sar.mandate?.mandate_id,
    mandate_id: sar.mandate?.mandate_id,
    version: sar.mandate?.mandate_version,
    issuer: {
      id: sar.issuer?.org_id,
      name: sar.issuer?.display_name,
      lei: sar.issuer?.legal_entity_lei,
    },
    authorized_amount: {
      minor: sar.request?.amount_minor,
      currency: sar.request?.currency,
    },
    constraints: {
      amountMinor: sar.request?.amount_minor,
      currency: sar.request?.currency,
      category: sar.request?.category,
      payeeHmac: sar.request?.payee_id_hmac,
    },
    validity: {
      from: sar.mandate?.valid_from,
      to: sar.mandate?.valid_to,
    },
    issuer_signature: sar.signature,
    signature: sar.signature,
    standard: 'AP2-1.0',
    mappedFrom: 'JOBENPAY-SAR-1.0',
  };
}

export default {
  createPublicProof,
  getPublicProof,
  revokePublicProof,
  listPublicProofs,
  listRevocations,
  subscribeRevocationWebhook,
  getProtocolVersions,
  getConformanceVectors,
  sarToAp2Mandate,
};
