/**
 * server/src/services/pact_service.js
 * PRD 1.4 Trust Infrastructure (Fase C: PACT Arbitration & Bonding, WP3)
 *
 * Implements Polymorphic Agent Contract Tokens (PACT) lifecycle:
 * PROPOSED -> AGREED -> IN_PROGRESS -> DELIVERED -> VERIFIED -> SETTLED
 *                        |              |
 *                    DISPUTED <---------+
 *                        |
 *                    SLASHED
 */

import { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { AppError } from '../lib/errors.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_TIERS = new Set(['T0-reexec', 'T1-tee', 'T2-zkml', 'T3-jury']);

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
 * Creates a new PACT Contract.
 * Status starts as 'PROPOSED'.
 */
export async function createContract(orgId, body, dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required and must be a valid UUID');
  }

  const {
    buyer_intent_id,
    seller_org_id,
    task_spec_hash,
    price_minor,
    currency,
    verification_tier,
    seller_bond_minor,
    challenge_window_seconds,
  } = body || {};

  if (!buyer_intent_id || !isValidUuid(buyer_intent_id)) {
    throw new AppError('VALIDATION_FAILED', 400, 'buyer_intent_id must be a valid UUID');
  }
  if (!seller_org_id || !isValidUuid(seller_org_id)) {
    throw new AppError('VALIDATION_FAILED', 400, 'seller_org_id must be a valid UUID');
  }
  if (!task_spec_hash || typeof task_spec_hash !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'task_spec_hash is required');
  }
  if (price_minor === undefined || price_minor === null || BigInt(price_minor) <= 0n) {
    throw new AppError('VALIDATION_FAILED', 400, 'price_minor must be a positive integer');
  }
  if (!currency || typeof currency !== 'string' || currency.trim().length !== 3) {
    throw new AppError('VALIDATION_FAILED', 400, 'currency must be a 3-character ISO code');
  }
  if (!verification_tier || !VALID_TIERS.has(verification_tier)) {
    throw new AppError('VALIDATION_FAILED', 400, `verification_tier must be one of: ${[...VALID_TIERS].join(', ')}`);
  }
  if (seller_bond_minor === undefined || seller_bond_minor === null || BigInt(seller_bond_minor) <= 0n) {
    throw new AppError('VALIDATION_FAILED', 400, 'seller_bond_minor must be a positive integer');
  }
  if (!challenge_window_seconds || Number(challenge_window_seconds) <= 0) {
    throw new AppError('VALIDATION_FAILED', 400, 'challenge_window_seconds must be a positive integer');
  }

  const sql = `
    INSERT INTO pact_contracts (
      org_id, buyer_intent_id, seller_org_id, task_spec_hash, price_minor,
      currency, verification_tier, seller_bond_minor, challenge_window_seconds, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PROPOSED')
    RETURNING contract_id, org_id, buyer_intent_id, seller_org_id, task_spec_hash,
              price_minor, currency, verification_tier, seller_bond_minor,
              challenge_window_seconds, status, created_at
  `;
  const params = [
    orgId,
    buyer_intent_id,
    seller_org_id,
    task_spec_hash,
    BigInt(price_minor).toString(),
    currency.trim().toUpperCase(),
    verification_tier,
    BigInt(seller_bond_minor).toString(),
    Number(challenge_window_seconds),
  ];

  const result = await runQuery(sql, params, dbClient);
  const row = result.rows[0];

  return {
    contract_id: row.contract_id,
    org_id: row.org_id,
    buyer_intent_id: row.buyer_intent_id,
    seller_org_id: row.seller_org_id,
    task_spec_hash: row.task_spec_hash,
    price_minor: Number(row.price_minor), // allow-number-serialization
    currency: row.currency,
    verification_tier: row.verification_tier,
    seller_bond_minor: Number(row.seller_bond_minor), // allow-number-serialization
    challenge_window_seconds: row.challenge_window_seconds,
    status: row.status,
    created_at: row.created_at,
  };
}

/**
 * Funds escrow for an agreed contract.
 * Transitions: PROPOSED / AGREED -> IN_PROGRESS.
 * Posts balanced double-entry ledger entry: DEBIT buyer, CREDIT escrow.
 */
export async function fundEscrow(contractId, orgId, dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, 'Invalid or missing contractId');
  }

  return withTx(async (client) => {
    const cRes = await client.query(
      `SELECT * FROM pact_contracts WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );

    if (cRes.rows.length === 0) {
      throw new AppError('CONTRACT_NOT_FOUND', 404, `Contract ${contractId} not found`);
    }

    const contract = cRes.rows[0];
    if (orgId && contract.org_id !== orgId) {
      throw new AppError('FORBIDDEN', 403, 'Cross-tenant access forbidden');
    }

    if (contract.status !== 'PROPOSED' && contract.status !== 'AGREED') {
      throw new AppError('ILLEGAL_TRANSITION', 409, `Cannot fund contract in status ${contract.status}`);
    }

    // 1. Update contract status to IN_PROGRESS
    await client.query(
      `UPDATE pact_contracts SET status = 'IN_PROGRESS' WHERE contract_id = $1`,
      [contractId],
    );

    // 2. Insert into escrow_accounts
    const priceMinor = BigInt(contract.price_minor);
    const escRes = await client.query(
      `INSERT INTO escrow_accounts (contract_id, held_minor, released_minor, slashed_minor, status)
       VALUES ($1, $2, 0, 0, 'FUNDED')
       RETURNING escrow_id, held_minor, released_minor, slashed_minor, status`,
      [contractId, priceMinor.toString()],
    );
    const escrow = escRes.rows[0];

    // 3. Post double-entry balanced ledger entry
    const legs = [
      {
        legType: 'DEBIT',
        accountRef: 'org:main',
        amountMinor: priceMinor.toString(),
        currency: contract.currency,
      },
      {
        legType: 'CREDIT',
        accountRef: 'escrow:internal',
        amountMinor: priceMinor.toString(),
        currency: contract.currency,
      },
    ];

    await appendEntry(client, {
      orgId: contract.org_id,
      type: LEDGER_TYPES.LEGS_POSTED,
      subjectType: 'pact_contract',
      subjectId: contractId,
      legs,
      payload: {
        step: 'fund_escrow',
        contract_id: contractId,
        escrow_id: escrow.escrow_id,
        amount_minor: priceMinor.toString(),
        currency: contract.currency,
      },
    });

    return {
      escrow_id: escrow.escrow_id,
      held_minor: Number(escrow.held_minor), // allow-number-serialization
      status: escrow.status,
    };
  }, dbClient);
}

/**
 * Delivers work for a contract in progress.
 * Transitions: IN_PROGRESS -> DELIVERED.
 */
export async function deliverWork(contractId, orgId, workAttestation = null, dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, 'Invalid or missing contractId');
  }

  return withTx(async (client) => {
    const cRes = await client.query(
      `SELECT * FROM pact_contracts WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );

    if (cRes.rows.length === 0) {
      throw new AppError('CONTRACT_NOT_FOUND', 404, `Contract ${contractId} not found`);
    }

    const contract = cRes.rows[0];
    if (orgId && contract.seller_org_id !== orgId && contract.org_id !== orgId) {
      throw new AppError('FORBIDDEN', 403, 'Cross-tenant access forbidden');
    }

    if (contract.status !== 'IN_PROGRESS') {
      throw new AppError('ILLEGAL_TRANSITION', 409, `Cannot deliver contract in status ${contract.status}`);
    }

    await client.query(
      `UPDATE pact_contracts SET status = 'DELIVERED', work_attestation = $2 WHERE contract_id = $1`,
      [contractId, JSON.stringify(workAttestation || {})],
    );

    return { status: 'DELIVERED' };
  }, dbClient);
}

/**
 * Verifies delivered work through registered verifier or arbiter.
 * Transitions: DELIVERED -> VERIFIED (PASS) or DISPUTED (FAIL).
 */
export async function verifyWork(contractId, verifierId, verdict, attestation = {}, dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, 'Invalid or missing contractId');
  }

  return withTx(async (client) => {
    const cRes = await client.query(
      `SELECT * FROM pact_contracts WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );

    if (cRes.rows.length === 0) {
      throw new AppError('CONTRACT_NOT_FOUND', 404, `Contract ${contractId} not found`);
    }

    const contract = cRes.rows[0];
    if (contract.status !== 'DELIVERED') {
      throw new AppError('ILLEGAL_TRANSITION', 409, `Cannot verify contract in status ${contract.status}`);
    }

    if (verifierId) {
      if (!isValidUuid(verifierId)) {
        throw new AppError('VERIFIER_NOT_FOUND', 404, 'Invalid verifierId');
      }
      const vRes = await client.query(
        `SELECT * FROM verifier_registry WHERE verifier_id = $1`,
        [verifierId],
      );
      if (vRes.rows.length === 0) {
        throw new AppError('VERIFIER_NOT_FOUND', 404, `Verifier ${verifierId} not found`);
      }
      if (vRes.rows[0].status !== 'ACTIVE') {
        throw new AppError('VERIFIER_INACTIVE', 400, `Verifier ${verifierId} is not ACTIVE`);
      }
    }

    const normVerdict = String(verdict || '').trim().toUpperCase();
    let nextStatus;
    if (normVerdict === 'PASS') {
      nextStatus = 'VERIFIED';
    } else if (normVerdict === 'FAIL') {
      nextStatus = 'DISPUTED';
    } else {
      throw new AppError('INVALID_VERDICT', 400, `Invalid verdict '${verdict}'. Expected 'PASS' or 'FAIL'.`);
    }

    await client.query(
      `UPDATE pact_contracts SET status = $2, dispute_verdict = $3 WHERE contract_id = $1`,
      [contractId, nextStatus, normVerdict],
    );

    return { status: nextStatus };
  }, dbClient);
}

/**
 * Settles escrow upon successful verification.
 * Transitions: VERIFIED -> SETTLED.
 * Posts balanced double-entry ledger entry: DEBIT escrow, CREDIT seller.
 */
export async function settleEscrow(contractId, orgId = null, dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, 'Invalid or missing contractId');
  }

  return withTx(async (client) => {
    const cRes = await client.query(
      `SELECT * FROM pact_contracts WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );

    if (cRes.rows.length === 0) {
      throw new AppError('CONTRACT_NOT_FOUND', 404, `Contract ${contractId} not found`);
    }

    const contract = cRes.rows[0];
    if (orgId && contract.org_id !== orgId && contract.seller_org_id !== orgId) {
      throw new AppError('FORBIDDEN', 403, 'Cross-tenant access forbidden');
    }

    if (contract.status !== 'VERIFIED') {
      throw new AppError('ILLEGAL_TRANSITION', 409, `Cannot settle contract in status ${contract.status}`);
    }

    const escRes = await client.query(
      `SELECT * FROM escrow_accounts WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );

    if (escRes.rows.length === 0) {
      throw new AppError('ESCROW_NOT_FOUND', 404, `Escrow account not found for contract ${contractId}`);
    }

    const escrow = escRes.rows[0];
    const held = BigInt(escrow.held_minor);

    // 1. Update escrow to RELEASED: held = released + slashed (held = held + 0)
    await client.query(
      `UPDATE escrow_accounts
       SET released_minor = $2, slashed_minor = 0, status = 'RELEASED'
       WHERE escrow_id = $1`,
      [escrow.escrow_id, held.toString()],
    );

    // 2. Update contract to SETTLED
    await client.query(
      `UPDATE pact_contracts SET status = 'SETTLED' WHERE contract_id = $1`,
      [contractId],
    );

    // 3. Post double-entry balanced ledger entry
    const legs = [
      {
        legType: 'DEBIT',
        accountRef: 'escrow:internal',
        amountMinor: held.toString(),
        currency: contract.currency,
      },
      {
        legType: 'CREDIT',
        accountRef: 'org:main',
        amountMinor: held.toString(),
        currency: contract.currency,
      },
    ];

    await appendEntry(client, {
      orgId: contract.seller_org_id,
      type: LEDGER_TYPES.LEGS_POSTED,
      subjectType: 'pact_contract',
      subjectId: contractId,
      legs,
      payload: {
        step: 'settle_escrow',
        contract_id: contractId,
        escrow_id: escrow.escrow_id,
        amount_minor: held.toString(),
        currency: contract.currency,
      },
    });

    return { status: 'SETTLED' };
  }, dbClient);
}

/**
 * Handles dispute / challenge for a delivered contract.
 * If fraud proof valid -> SLASHED (bond slashed to buyer, remainder to seller).
 * If fraud proof invalid -> VERIFIED (proceed to settlement).
 */
export async function disputeContract(contractId, fraudProof = {}, orgId = null, dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, 'Invalid or missing contractId');
  }

  return withTx(async (client) => {
    const cRes = await client.query(
      `SELECT * FROM pact_contracts WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );

    if (cRes.rows.length === 0) {
      throw new AppError('CONTRACT_NOT_FOUND', 404, `Contract ${contractId} not found`);
    }

    const contract = cRes.rows[0];
    if (orgId && contract.org_id !== orgId && contract.seller_org_id !== orgId) {
      throw new AppError('FORBIDDEN', 403, 'Cross-tenant access forbidden');
    }

    if (contract.status !== 'DELIVERED' && contract.status !== 'DISPUTED') {
      throw new AppError('ILLEGAL_TRANSITION', 409, `Cannot dispute contract in status ${contract.status}`);
    }

    // Check challenge window
    const elapsedSeconds = (Date.now() - new Date(contract.created_at).getTime()) / 1000;
    if (contract.challenge_window_seconds > 0 && elapsedSeconds > contract.challenge_window_seconds) {
      throw new AppError('CHALLENGE_WINDOW_EXPIRED', 400, 'Challenge window has expired');
    }

    // Fraud proof validation check
    const isProofValid = fraudProof && fraudProof.valid !== false;

    if (!isProofValid) {
      // Fraud proof invalid: transition DISPUTED -> VERIFIED
      await client.query(
        `UPDATE pact_contracts SET status = 'VERIFIED', dispute_proof = $2 WHERE contract_id = $1`,
        [contractId, JSON.stringify(fraudProof || {})],
      );
      return { status: 'VERIFIED' };
    }

    // Fraud proof valid: transition to SLASHED
    const escRes = await client.query(
      `SELECT * FROM escrow_accounts WHERE contract_id = $1 FOR UPDATE`,
      [contractId],
    );

    if (escRes.rows.length === 0) {
      throw new AppError('ESCROW_NOT_FOUND', 404, `Escrow account not found for contract ${contractId}`);
    }

    const escrow = escRes.rows[0];
    const held = BigInt(escrow.held_minor);
    const bond = BigInt(contract.seller_bond_minor);
    const slashed = bond > held ? held : bond;
    const released = held - slashed;

    // 1. Update escrow_accounts with mathematical balance: held = released + slashed
    await client.query(
      `UPDATE escrow_accounts
       SET held_minor = $2, released_minor = $3, slashed_minor = $4, status = 'SLASHED'
       WHERE escrow_id = $1`,
      [escrow.escrow_id, held.toString(), released.toString(), slashed.toString()],
    );

    // 2. Update contract status to SLASHED
    await client.query(
      `UPDATE pact_contracts
       SET status = 'SLASHED', dispute_proof = $2, dispute_verdict = 'SLASHED'
       WHERE contract_id = $1`,
      [contractId, JSON.stringify(fraudProof)],
    );

    // 3. Post double-entry balanced ledger entry
    const legs = [
      {
        legType: 'DEBIT',
        accountRef: 'escrow:internal',
        amountMinor: held.toString(),
        currency: contract.currency,
      },
      {
        legType: 'CREDIT',
        accountRef: 'org:main',
        amountMinor: slashed.toString(),
        currency: contract.currency,
      },
    ];

    if (released > 0n) {
      legs.push({
        legType: 'CREDIT',
        accountRef: 'org:main',
        amountMinor: released.toString(),
        currency: contract.currency,
      });
    }

    await appendEntry(client, {
      orgId: contract.org_id,
      type: LEDGER_TYPES.LEGS_POSTED,
      subjectType: 'pact_contract',
      subjectId: contractId,
      legs,
      payload: {
        step: 'dispute_slash',
        contract_id: contractId,
        escrow_id: escrow.escrow_id,
        slashed_minor: slashed.toString(),
        released_minor: released.toString(),
        currency: contract.currency,
      },
    });

    return {
      status: 'SLASHED',
      slashed_minor: Number(slashed),
      released_minor: Number(released),
    };
  }, dbClient);
}

/**
 * Registers a verifier in verifier_registry.
 */
export async function registerVerifier(orgId, body, dbClient = null) {
  if (!orgId || !isValidUuid(orgId)) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required and must be a valid UUID');
  }

  const { verification_tier, attestation_jwks_uri, status = 'ACTIVE' } = body || {};
  if (!verification_tier || !VALID_TIERS.has(verification_tier)) {
    throw new AppError('VALIDATION_FAILED', 400, `verification_tier must be one of: ${[...VALID_TIERS].join(', ')}`);
  }
  if (!attestation_jwks_uri || typeof attestation_jwks_uri !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'attestation_jwks_uri is required');
  }

  const sql = `
    INSERT INTO verifier_registry (org_id, verification_tier, attestation_jwks_uri, status)
    VALUES ($1, $2, $3, $4)
    RETURNING verifier_id, org_id, verification_tier, attestation_jwks_uri, status, created_at
  `;
  const result = await runQuery(sql, [orgId, verification_tier, attestation_jwks_uri, status], dbClient);
  return result.rows[0];
}

/**
 * Retrieves a contract by contract_id.
 */
export async function getContract(contractId, orgId = null, dbClient = null) {
  if (!contractId || !isValidUuid(contractId)) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, 'Invalid or missing contractId');
  }

  const sql = `SELECT * FROM pact_contracts WHERE contract_id = $1`;
  const result = await runQuery(sql, [contractId], dbClient);
  if (result.rows.length === 0) {
    throw new AppError('CONTRACT_NOT_FOUND', 404, `Contract ${contractId} not found`);
  }

  const contract = result.rows[0];
  if (orgId && contract.org_id !== orgId && contract.seller_org_id !== orgId) {
    throw new AppError('FORBIDDEN', 403, 'Cross-tenant access forbidden');
  }

  return contract;
}
