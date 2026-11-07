/**
 * server/src/services/escrow_service.js
 * PRD 1.4 Trust Infrastructure (Fase C: PACT Arbitration & Bonding, WP2)
 *
 * Provides escrow balance verification and status reporting.
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
 * Checks balance and mathematical invariant of an escrow account for a given contract.
 * Invariant: held === released + slashed
 *
 * @param {string} contractId
 * @param {object} [dbClient]
 * @returns {Promise<{ held: string, released: string, slashed: string, balanced: boolean, status: string, escrow_id: string }>}
 */
export async function checkEscrowBalance(contractId, dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('ESCROW_NOT_FOUND', 404, 'Invalid or missing contractId');
  }

  const result = await runQuery(
    `SELECT escrow_id, contract_id, held_minor, released_minor, slashed_minor, status
     FROM escrow_accounts
     WHERE contract_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [contractId],
    dbClient,
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
  };
}
