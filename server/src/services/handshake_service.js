// @ts-check
import crypto from 'node:crypto';
import pool, { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { AppError } from '../lib/errors.js';
import { appendLedgerEntry } from './ledger.js';
import { verifySarReceipt } from './verify_service.js';

const VALID_VERDICTS = new Set(['VERIFIED', 'DENIED', 'INDETERMINATE']);

/**
 * Initiates a pre-transaction Trust Handshake.
 * 
 * @param {object} params
 * @param {string} params.requesterOrgId 
 * @param {string} params.targetOrgId 
 * @param {string} params.agentId 
 * @param {object} params.requestIntent 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function initiateHandshake({ requesterOrgId, targetOrgId, agentId, requestIntent }, dbClient = null) {
  if (!requesterOrgId || !targetOrgId || !agentId) {
    throw new AppError('VALIDATION_FAILED', 400, 'requesterOrgId, targetOrgId, and agentId are required');
  }
  if (!requestIntent || typeof requestIntent !== 'object') {
    throw new AppError('VALIDATION_FAILED', 400, 'requestIntent object is required');
  }

  const nonce = `nonce_${crypto.randomBytes(32).toString('base64url')}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

  const exec = async (client) => {
    // Check if there is already an active pending handshake
    const existing = await client.query(
      `SELECT handshake_id FROM trust_handshakes 
       WHERE requester_org_id = $1 AND target_org_id = $2 AND agent_id = $3
         AND status = 'PENDING' AND expires_at > now()`,
      [requesterOrgId, targetOrgId, agentId],
    );

    if (existing.rows.length > 0) {
      // Return existing pending handshake if still valid
      return {
        handshake_id: existing.rows[0].handshake_id,
        handshake_nonce: nonce,
        expires_at: expiresAt.toISOString(),
        status: 'PENDING',
      };
    }

    const ins = await client.query(
      `INSERT INTO trust_handshakes (
        requester_org_id, target_org_id, agent_id, request_intent, 
        handshake_nonce, status, issued_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7)
      RETURNING handshake_id, handshake_nonce, status, expires_at`,
      [requesterOrgId, targetOrgId, agentId, JSON.stringify(requestIntent), nonce, now, expiresAt],
    );

    const row = ins.rows[0];

    // Append ledger entry
    await appendLedgerEntry(client, {
      orgId: requesterOrgId,
      type: 'HANDSHAKE_INITIATED',
      subjectType: 'HANDSHAKE',
      subjectId: row.handshake_id,
      payload: {
        handshake_id: row.handshake_id,
        requester_org: requesterOrgId,
        target_org: targetOrgId,
      },
    });

    return {
      handshake_id: row.handshake_id,
      handshake_nonce: row.handshake_nonce,
      expires_at: row.expires_at.toISOString(),
      status: row.status,
    };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Responds to a Trust Handshake with a verdict and signed proof.
 * 
 * @param {string} handshakeId 
 * @param {object} params
 * @param {string} params.handshakeNonce 
 * @param {string} params.verdict 
 * @param {object|null} [params.sar=null] 
 * @param {object} params.signature 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function respondHandshake(handshakeId, { handshakeNonce, verdict, sar = null, signature }, dbClient = null) {
  if (!handshakeId || !handshakeNonce || !verdict) {
    throw new AppError('VALIDATION_FAILED', 400, 'handshakeId, handshakeNonce, and verdict are required');
  }

  const normalizedVerdict = String(verdict).toUpperCase();
  if (!VALID_VERDICTS.has(normalizedVerdict)) {
    throw new AppError('VALIDATION_FAILED', 400, `verdict must be one of: ${[...VALID_VERDICTS].join(', ')}`);
  }

  if (normalizedVerdict === 'VERIFIED' && !sar) {
    throw new AppError('VALIDATION_FAILED', 400, 'SAR object is required when verdict is VERIFIED');
  }

  const exec = async (client) => {
    const hsRes = await client.query(
      `SELECT * FROM trust_handshakes WHERE handshake_id = $1 FOR UPDATE`,
      [handshakeId],
    );

    if (hsRes.rows.length === 0) {
      throw new AppError('HANDSHAKE_NOT_FOUND', 404, `Handshake ${handshakeId} not found`);
    }

    const hs = hsRes.rows[0];

    if (hs.status !== 'PENDING') {
      throw new AppError('ILLEGAL_TRANSITION', 409, `Handshake is already in status ${hs.status}`);
    }

    const now = new Date();
    if (now.getTime() > new Date(hs.expires_at).getTime()) {
      await client.query(`UPDATE trust_handshakes SET status = 'EXPIRED' WHERE handshake_id = $1`, [handshakeId]);
      throw new AppError('HANDSHAKE_EXPIRED', 400, 'Handshake has expired');
    }

    if (hs.handshake_nonce !== handshakeNonce) {
      throw new AppError('NONCE_MISMATCH', 400, 'Invalid handshake nonce');
    }

    // Verify SAR if VERIFIED
    if (normalizedVerdict === 'VERIFIED') {
      const sarVerification = await verifySarReceipt(sar, { mode: 'online' }, client);
      if (!sarVerification.valid) {
        throw new AppError('INVALID_SAR', 400, 'SAR attached to handshake is invalid');
      }
    }

    const responsePayload = {
      verdict: normalizedVerdict,
      sar: sar || null,
      signature: signature || null,
    };

    await client.query(
      `UPDATE trust_handshakes 
       SET status = $1, response_json = $2, responded_at = $3
       WHERE handshake_id = $4`,
      [normalizedVerdict, JSON.stringify(responsePayload), now, handshakeId],
    );

    // Ledger entry
    const ledgerType = normalizedVerdict === 'VERIFIED' ? 'HANDSHAKE_VERIFIED' : 'HANDSHAKE_DENIED';
    await appendLedgerEntry(client, {
      orgId: hs.target_org_id,
      type: ledgerType,
      subjectType: 'HANDSHAKE',
      subjectId: handshakeId,
      payload: {
        handshake_id: handshakeId,
        sar_id: sar?.sar_id || null,
        verdict: normalizedVerdict,
      },
    });

    return {
      handshake_id: handshakeId,
      status: normalizedVerdict,
      verified_at: now.toISOString(),
    };
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Retrieves handshake status by ID. Auto-expires if past expiration time.
 * 
 * @param {string} handshakeId 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function getHandshake(handshakeId, dbClient = null) {
  if (!handshakeId) {
    throw new AppError('VALIDATION_FAILED', 400, 'handshakeId is required');
  }

  const db = dbClient || pool;
  const res = await db.query(
    `SELECT * FROM trust_handshakes WHERE handshake_id = $1`,
    [handshakeId],
  );

  if (res.rows.length === 0) {
    throw new AppError('HANDSHAKE_NOT_FOUND', 404, `Handshake ${handshakeId} not found`);
  }

  const hs = res.rows[0];
  const now = new Date();

  if (hs.status === 'PENDING' && now.getTime() > new Date(hs.expires_at).getTime()) {
    await db.query(
      `UPDATE trust_handshakes SET status = 'EXPIRED' WHERE handshake_id = $1`,
      [handshakeId],
    );
    hs.status = 'EXPIRED';
  }

  return {
    handshake_id: hs.handshake_id,
    status: hs.status,
    requester_org_id: hs.requester_org_id,
    target_org_id: hs.target_org_id,
    agent_id: hs.agent_id,
    request_intent: hs.request_intent,
    issued_at: hs.issued_at,
    responded_at: hs.responded_at,
    expires_at: hs.expires_at,
  };
}

/**
 * Background sweep worker: auto-expires pending handshakes whose timeout expired.
 * 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<number>} count of expired handshakes
 */
export async function expirePendingHandshakes(dbClient = null) {
  const db = dbClient || pool;
  const res = await db.query(
    `UPDATE trust_handshakes 
     SET status = 'EXPIRED' 
     WHERE status = 'PENDING' AND expires_at < now()
     RETURNING handshake_id`,
  );
  return res.rows.length;
}

export default {
  initiateHandshake,
  respondHandshake,
  getHandshake,
  expirePendingHandshakes,
};
