/**
 * server/src/services/escrow_service.js
 * PRD 1.4 Trust Infrastructure & PRD 2.0 Unified Architecture (§2.4, §4.3, §4.4) & PRD 2.1 (§2)
 *
 * Provides unified escrow account creation, balance verification, and status reporting with environment isolation.
 */

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
 * Creates a unified escrow account with environment isolation (PRD 2.0 §4.4, PRD 2.1 §2).
 * Enforces reference alignment per escrow_type:
 * - PACT: contractId required, splitId and dpId null
 * - SPLIT: splitId required, contractId and dpId null
 * - DOWN_PAYMENT: dpId required, contractId and splitId null
 *
 * @param {string} orgId
 * @param {object} params
 * @param {string} params.escrowType
 * @param {string} [params.contractId]
 * @param {string} [params.splitId]
 * @param {string} [params.dpId]
 * @param {string|number|bigint} params.heldMinor
 * @param {string} [params.environment='SANDBOX']
 * @param {object} [dbClient]
 * @returns {Promise<{ escrow_id: string, status: string, environment: string, created_at: string }>}
 */
export async function createEscrow(
  orgId,
  { escrowType, contractId = null, splitId = null, dpId = null, heldMinor, environment = 'SANDBOX' },
  dbClient = null
) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Valid org_id is required');
  }

  const validTypes = ['SPLIT', 'PACT', 'DOWN_PAYMENT'];
  if (!validTypes.includes(escrowType)) {
    throw new AppError('INVALID_ESCROW_TYPE', 400, `escrow_type must be one of: ${validTypes.join(', ')}`);
  }

  if (escrowType === 'PACT' && (!contractId || !isValidUuid(contractId) || splitId || dpId)) {
    throw new AppError('INVALID_ESCROW_REF', 400, 'PACT escrow requires contract_id and no split_id or dp_id');
  }
  if (escrowType === 'SPLIT' && (!splitId || !isValidUuid(splitId) || contractId || dpId)) {
    throw new AppError('INVALID_ESCROW_REF', 400, 'SPLIT escrow requires split_id and no contract_id or dp_id');
  }
  if (escrowType === 'DOWN_PAYMENT' && (!dpId || !isValidUuid(dpId) || contractId || splitId)) {
    throw new AppError('INVALID_ESCROW_REF', 400, 'DOWN_PAYMENT escrow requires dp_id and no contract_id or split_id');
  }

  let minorVal;
  try {
    minorVal = BigInt(heldMinor);
  } catch {
    throw new AppError('INVALID_AMOUNT', 400, 'heldMinor must be a valid integer minor amount');
  }

  if (minorVal < 0n) {
    throw new AppError('INVALID_AMOUNT', 400, 'heldMinor must be non-negative');
  }

  const result = await runQuery(
    `INSERT INTO escrow_accounts (
       org_id, escrow_type, contract_id, split_id, dp_id,
       held_minor, released_minor, slashed_minor, status, environment
     )
     VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'FUNDED', $7)
     RETURNING escrow_id, status, environment, created_at`,
    [orgId, escrowType, contractId, splitId, dpId, minorVal.toString(), environment],
    dbClient,
  );

  const row = result.rows[0];
  return {
    escrow_id: row.escrow_id,
    status: row.status,
    environment: row.environment,
    created_at: new Date(row.created_at).toISOString(),
  };
}

/**
 * Gets a unified escrow account by id and orgId with environment filtering (PRD 2.0 §4.3, PRD 2.1 §2).
 *
 * @param {string} orgId
 * @param {string} escrowId
 * @param {string|object} [environmentOrClient='SANDBOX']
 * @param {object} [dbClient]
 * @returns {Promise<{ escrow_id: string, escrow_type: string, held_minor: string, released_minor: string, slashed_minor: string, status: string, environment: string, balanced: boolean }>}
 */
export async function getEscrow(orgId, escrowId, environmentOrClient = 'SANDBOX', dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('INVALID_ORG_ID', 400, 'Valid org_id is required');
  }
  if (!escrowId || !isValidUuid(escrowId)) {
    throw new AppError('ESCROW_NOT_FOUND', 404, 'Invalid or missing escrow_id');
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
    `SELECT escrow_id, org_id, escrow_type, contract_id, split_id, dp_id,
            held_minor, released_minor, slashed_minor, status, environment
     FROM escrow_accounts
     WHERE escrow_id = $1 AND org_id = $2 AND environment = $3
     LIMIT 1`,
    [escrowId, orgId, environment],
    client,
  );

  if (result.rows.length === 0) {
    throw new AppError('ESCROW_NOT_FOUND', 404, `Escrow ${escrowId} not found`);
  }

  const row = result.rows[0];
  const held = BigInt(row.held_minor);
  const released = BigInt(row.released_minor);
  const slashed = BigInt(row.slashed_minor);
  const balanced = held === (released + slashed);

  return {
    escrow_id: row.escrow_id,
    escrow_type: row.escrow_type,
    held_minor: held.toString(),
    released_minor: released.toString(),
    slashed_minor: slashed.toString(),
    status: row.status,
    environment: row.environment,
    balanced,
  };
}

/**
 * Checks balance and mathematical invariant of an escrow account for a given contract.
 * Invariant: held === released + slashed
 *
 * @param {string} contractId
 * @param {string|object} [environmentOrClient='SANDBOX']
 * @param {object} [dbClient]
 * @returns {Promise<{ held: string, released: string, slashed: string, balanced: boolean, status: string, environment: string, escrow_id: string }>}
 */
export async function checkEscrowBalance(contractId, environmentOrClient = 'SANDBOX', dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('ESCROW_NOT_FOUND', 404, 'Invalid or missing contractId');
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
    `SELECT escrow_id, contract_id, held_minor, released_minor, slashed_minor, status, environment
     FROM escrow_accounts
     WHERE contract_id = $1 AND environment = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [contractId, environment],
    client,
  );

  if (result.rows.length === 0) {
    throw new AppError('ESCROW_NOT_FOUND', 404, `Escrow not found for contract ${contractId}`);
  }

  const row = result.rows[0];
  const held = BigInt(row.held_minor);
  const released = BigInt(row.released_minor);
  const slashed = BigInt(row.slashed_minor);
  const balanced = held === (released + slashed);

  return {
    escrow_id: row.escrow_id,
    contract_id: row.contract_id,
    held: held.toString(),
    released: released.toString(),
    slashed: slashed.toString(),
    balanced,
    status: row.status,
    environment: row.environment,
  };
}
