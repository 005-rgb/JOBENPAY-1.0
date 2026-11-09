// server/src/services/agent_service.js
// @ts-check
import pool from '../db/pool.js';
import { AppError } from '../lib/errors.js';

export const VALID_ENVIRONMENTS = new Set(['SANDBOX', 'LIVE', 'PRODUCTION', 'SIMULATED']);

/**
 * Mengambil daftar agen. WAJIB menyertakan environment.
 * Agen Sandbox tidak akan muncul di Live.
 *
 * @param {string} orgId
 * @param {string} environment
 * @param {import('pg').PoolClient|import('pg').Pool} [dbClient=pool]
 * @returns {Promise<Array<any>>}
 */
export async function listAgents(orgId, environment, dbClient = pool) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  const env = String(environment || '').toUpperCase();
  if (!env || !VALID_ENVIRONMENTS.has(env)) {
    throw new AppError('INVALID_ENVIRONMENT', 400, 'Invalid or missing environment');
  }

  const result = await dbClient.query(
    `SELECT COALESCE(agent_id, id) AS agent_id, id, org_id, name, description, status, environment, created_at
     FROM agents 
     WHERE org_id = $1 AND environment = $2
     ORDER BY created_at DESC, id`,
    [orgId, env],
  );
  return result.rows;
}

/**
 * Membuat agen baru dengan environment tertentu.
 *
 * @param {string} orgId
 * @param {{ name: string, description?: string|null, status?: string, environment?: string }} data
 * @param {import('pg').PoolClient|import('pg').Pool} [dbClient=pool]
 * @returns {Promise<any>}
 */
export async function createAgent(
  orgId,
  { name, description = null, status = 'ACTIVE', environment = 'SANDBOX' },
  dbClient = pool,
) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('VALIDATION_FAILED', 400, 'Agent name is required');
  }

  const env = String(environment || 'SANDBOX').toUpperCase();
  if (!VALID_ENVIRONMENTS.has(env)) {
    throw new AppError('INVALID_ENVIRONMENT', 400, `Invalid environment: ${environment}`);
  }

  const cleanDesc = description == null ? null : String(description).trim();
  const cleanStatus = String(status || 'ACTIVE').toUpperCase();

  const result = await dbClient.query(
    `INSERT INTO agents (org_id, name, description, status, environment)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING COALESCE(agent_id, id) AS agent_id, id, org_id, name, description, status, environment, created_at`,
    [orgId, name.trim(), cleanDesc, cleanStatus, env],
  );
  return result.rows[0];
}

/**
 * Mengambil agen berdasarkan id dan environment opsional.
 *
 * @param {string} orgId
 * @param {string} agentId
 * @param {string|null} [environment=null]
 * @param {import('pg').PoolClient|import('pg').Pool} [dbClient=pool]
 * @returns {Promise<any|null>}
 */
export async function getAgent(orgId, agentId, environment = null, dbClient = pool) {
  if (!orgId || !agentId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId and agentId are required');
  }

  let queryStr = `SELECT COALESCE(agent_id, id) AS agent_id, id, org_id, name, description, status, environment, created_at FROM agents WHERE org_id = $1 AND (id = $2 OR agent_id = $2)`;
  const params = [orgId, agentId];
  if (environment) {
    const env = String(environment).toUpperCase();
    queryStr += ` AND environment = $3`;
    params.push(env);
  }
  queryStr += ` LIMIT 1`;
  const result = await dbClient.query(queryStr, params);
  return result.rows[0] ?? null;
}

export default {
  listAgents,
  createAgent,
  getAgent,
};
