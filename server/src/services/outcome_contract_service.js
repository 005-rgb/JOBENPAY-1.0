// @ts-check
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

function runQuery(sql, params, client) {
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return query(sql, params);
}

/**
 * Creates an outcome contract (PRD 2.0 §2.5, PRD 2.1 §2).
 * @param {string} orgId
 * @param {object} params
 * @param {object} [dbClient]
 * @returns {Promise<object>}
 */
export async function createOutcomeContract(orgId, params, dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Invalid or missing orgId');
  }

  const {
    contract_type,
    amount_minor,
    currency = 'USD',
    escrow_id = null,
    metadata = {},
    environment = 'SANDBOX',
  } = params;

  if (!contract_type || typeof contract_type !== 'string') {
    throw new AppError('INVALID_CONTRACT_TYPE', 400, 'contract_type is required');
  }

  let minorVal;
  try {
    minorVal = BigInt(amount_minor);
  } catch {
    throw new AppError('INVALID_AMOUNT', 400, 'amount_minor must be a valid integer minor amount');
  }

  const result = await runQuery(
    `INSERT INTO outcome_contracts (
       org_id, contract_type, amount_minor, currency, escrow_id, metadata, environment, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
     RETURNING contract_id, org_id, contract_type, amount_minor, currency, escrow_id, environment, status, created_at`,
    [orgId, contract_type, minorVal.toString(), currency, escrow_id, JSON.stringify(metadata), environment],
    dbClient,
  );

  return result.rows[0];
}

/**
 * Gets an outcome contract with environment isolation (PRD 2.1 §2).
 * @param {string} orgId
 * @param {string} contractId
 * @param {string|object} [environmentOrClient='SANDBOX']
 * @param {object} [dbClient]
 * @returns {Promise<object>}
 */
export async function getOutcomeContract(orgId, contractId, environmentOrClient = 'SANDBOX', dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Invalid or missing orgId');
  }
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('INVALID_CONTRACT_ID', 400, 'Invalid or missing contractId');
  }

  let environment = 'SANDBOX';
  let client = dbClient;

  if (typeof environmentOrClient === 'string') {
    environment = environmentOrClient;
  } else if (environmentOrClient && typeof environmentOrClient.query === 'function') {
    client = environmentOrClient;
  } else if (environmentOrClient && typeof environmentOrClient === 'object' && environmentOrClient.environment) {
    environment = environmentOrClient.environment;
  }

  const result = await runQuery(
    `SELECT contract_id, org_id, contract_type, amount_minor, currency, escrow_id, metadata, environment, status, created_at, updated_at
     FROM outcome_contracts
     WHERE contract_id = $1 AND org_id = $2 AND environment = $3
     LIMIT 1`,
    [contractId, orgId, environment],
    client,
  );

  if (result.rows.length === 0) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, 'Outcome contract not found');
  }

  return result.rows[0];
}

/**
 * Lists outcome contracts for an org in an environment (PRD 2.1 §2).
 * @param {string} orgId
 * @param {object} [options]
 * @param {object} [dbClient]
 * @returns {Promise<object[]>}
 */
export async function listOutcomeContracts(orgId, options = {}, dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Invalid or missing orgId');
  }

  const { environment = 'SANDBOX', contract_type, status } = options;
  const conditions = ['org_id = $1', 'environment = $2'];
  const values = [orgId, environment];
  let idx = 3;

  if (contract_type) {
    conditions.push(`contract_type = $${idx++}`);
    values.push(contract_type);
  }

  if (status) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }

  const result = await runQuery(
    `SELECT contract_id, org_id, contract_type, amount_minor, currency, escrow_id, metadata, environment, status, created_at
     FROM outcome_contracts
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC`,
    values,
    dbClient,
  );

  return result.rows;
}
