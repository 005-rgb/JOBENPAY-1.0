// @ts-check
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

/**
 * Register a new entity in the unified entity registry (PRD 2.0 §2.3, §4.2)
 * @param {string} orgId
 * @param {object} params
 * @param {object} [dbClient]
 * @returns {Promise<object>}
 */
export async function registerEntity(orgId, params, dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Invalid or missing orgId');
  }

  const {
    entity_type,
    display_name,
    legal_entity_lei = null,
    public_key_jwk = {},
    verification_tier = null,
    attestation_jwks_uri = null,
    reputation_score = 50,
  } = params;

  if (!['ISSUER', 'VERIFIER', 'BOTH'].includes(entity_type)) {
    throw new AppError('INVALID_ENTITY_TYPE', 400, 'entity_type must be ISSUER, VERIFIER, or BOTH');
  }

  if (!display_name || typeof display_name !== 'string') {
    throw new AppError('INVALID_DISPLAY_NAME', 400, 'display_name is required');
  }

  const runQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  try {
    const result = await runQuery(
      `INSERT INTO entities (
        org_id, entity_type, display_name, legal_entity_lei, public_key_jwk,
        verification_tier, attestation_jwks_uri, reputation_score, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')
      RETURNING entity_id, entity_type, org_id, display_name, legal_entity_lei, status, reputation_score, created_at`,
      [
        orgId,
        entity_type,
        display_name,
        legal_entity_lei,
        JSON.stringify(public_key_jwk),
        verification_tier,
        attestation_jwks_uri,
        reputation_score,
      ],
    );

    return result.rows[0];
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      throw new AppError('ENTITY_ALREADY_EXISTS', 409, `Entity of type ${entity_type} already registered for org`);
    }
    throw err;
  }
}

/**
 * Get an entity by ID
 * @param {string} orgId
 * @param {string} entityId
 * @param {object} [dbClient]
 * @returns {Promise<object>}
 */
export async function getEntity(orgId, entityId, dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Invalid or missing orgId');
  }
  if (!entityId || !isValidUuid(entityId)) {
    throw new AppError('INVALID_ENTITY_ID', 400, 'Invalid or missing entityId');
  }

  const runQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const result = await runQuery(
    `SELECT entity_id, entity_type, org_id, display_name, legal_entity_lei,
            public_key_jwk, verification_tier, attestation_jwks_uri, status,
            reputation_score, created_at, updated_at
     FROM entities
     WHERE org_id = $1 AND entity_id = $2`,
    [orgId, entityId],
  );

  if (result.rows.length === 0) {
    throw new AppError('ENTITY_NOT_FOUND', 404, 'Entity not found');
  }

  return result.rows[0];
}

/**
 * List entities for an organization (PRD 2.0 §4.1)
 * @param {string} orgId
 * @param {object} [options]
 * @param {object} [dbClient]
 * @returns {Promise<{ entities: object[], next_cursor: string|null, has_more: boolean }>}
 */
export async function listEntities(orgId, options = {}, dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Invalid or missing orgId');
  }

  const { limit = 50, entity_type, status, cursor } = options;
  const runQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const conditions = ['org_id = $1'];
  const values = [orgId];
  let paramIdx = 2;

  if (entity_type) {
    conditions.push(`entity_type = $${paramIdx++}`);
    values.push(entity_type);
  }

  if (status) {
    conditions.push(`status = $${paramIdx++}`);
    values.push(status);
  }

  if (cursor) {
    conditions.push(`entity_id > $${paramIdx++}`);
    values.push(cursor);
  }

  const fetchLimit = Math.min(Math.max(1, limit), 100);
  values.push(fetchLimit + 1);

  const sql = `
    SELECT entity_id, entity_type, org_id, display_name, legal_entity_lei,
           public_key_jwk, verification_tier, attestation_jwks_uri, status,
           reputation_score, created_at
    FROM entities
    WHERE ${conditions.join(' AND ')}
    ORDER BY entity_id ASC
    LIMIT $${paramIdx}
  `;

  const result = await runQuery(sql, values);
  const rows = result.rows;
  const has_more = rows.length > fetchLimit;
  const entities = has_more ? rows.slice(0, fetchLimit) : rows;
  const next_cursor = has_more && entities.length > 0 ? entities[entities.length - 1].entity_id : null;

  return {
    entities,
    next_cursor,
    has_more,
  };
}

/**
 * Update entity status (ACTIVE, SUSPENDED, REVOKED)
 * @param {string} orgId
 * @param {string} entityId
 * @param {string} status
 * @param {object} [dbClient]
 * @returns {Promise<object>}
 */
export async function updateEntityStatus(orgId, entityId, status, dbClient = null) {
  if (!['ACTIVE', 'SUSPENDED', 'REVOKED'].includes(status)) {
    throw new AppError('INVALID_STATUS', 400, 'Status must be ACTIVE, SUSPENDED, or REVOKED');
  }

  const runQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const result = await runQuery(
    `UPDATE entities
     SET status = $1, updated_at = now()
     WHERE org_id = $2 AND entity_id = $3
     RETURNING entity_id, status, updated_at`,
    [status, orgId, entityId],
  );

  if (result.rows.length === 0) {
    throw new AppError('ENTITY_NOT_FOUND', 404, 'Entity not found');
  }

  return result.rows[0];
}

/**
 * Update entity reputation score (0 - 100)
 * @param {string} orgId
 * @param {string} entityId
 * @param {number} score
 * @param {object} [dbClient]
 * @returns {Promise<object>}
 */
export async function updateReputationScore(orgId, entityId, score, dbClient = null) {
  if (typeof score !== 'number' || score < 0 || score > 100) {
    throw new AppError('INVALID_SCORE', 400, 'Reputation score must be an integer between 0 and 100');
  }

  const runQuery = dbClient ? dbClient.query.bind(dbClient) : query;

  const result = await runQuery(
    `UPDATE entities
     SET reputation_score = $1, updated_at = now()
     WHERE org_id = $2 AND entity_id = $3
     RETURNING entity_id, reputation_score, updated_at`,
    [score, orgId, entityId],
  );

  if (result.rows.length === 0) {
    throw new AppError('ENTITY_NOT_FOUND', 404, 'Entity not found');
  }

  return result.rows[0];
}
