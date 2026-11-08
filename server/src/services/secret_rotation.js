// @ts-check
import crypto from 'node:crypto';
import pool from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { encrypt } from '../lib/crypto.js';
import { createAgentApiKey, hashAgentApiKey } from '../lib/agentApiKeys.js';
import { env } from '../config.js';
import { AppError } from '../lib/errors.js';

const ROTATION_GRACE_PERIOD_MS = 3600000; // 1 hour

/**
 * Rotasi API key untuk agen per PRD 1.9 §9.1.
 * Key lama tetap valid selama grace period (1 jam).
 */
export async function rotateAgentApiKey(agentId, orgId, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 0. Verify agent exists and belongs to orgId
    const agentCheck = await client.query(
      'SELECT id FROM agents WHERE id = $1 AND org_id = $2',
      [agentId, orgId],
    );
    if (agentCheck.rowCount === 0) {
      throw new AppError('AGENT_NOT_FOUND', 404, `Agent ${agentId} not found`);
    }

    // 1. Generate key baru
    const { prefix, apiKey } = createAgentApiKey();
    const keyHash = hashAgentApiKey(env.JOBENPAY_HMAC_PEPPER, apiKey);
    const expiresAt = new Date(Date.now() + ROTATION_GRACE_PERIOD_MS);

    // 2. Insert key baru (aktif langsung)
    const insertRes = await client.query(
      `INSERT INTO agent_api_keys (agent_id, org_id, prefix, key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [agentId, orgId, prefix, keyHash],
    );
    const newKeyId = insertRes.rows[0].id;

    // 3. Set grace period untuk key lama yang belum dicabut
    await client.query(
      `UPDATE agent_api_keys SET grace_until = $1 
       WHERE agent_id = $2 AND org_id = $3 AND revoked_at IS NULL AND id != $4`,
      [expiresAt, agentId, orgId, newKeyId],
    );

    await client.query('COMMIT');
    client.release();

    logger.info({ agentId, orgId, newKeyId }, 'Agent API key rotated');
    return {
      new_key: apiKey,
      expires_at: expiresAt.toISOString(),
      old_key_grace_until: expiresAt.toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw err;
  }
}

/**
 * Rotasi signing key untuk ledger per PRD 1.9 §9.1.
 * Entri lama tetap valid dengan key lama.
 */
export async function rotateLedgerSigningKey(orgId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Ambil key lama yang berstatus ACTIVE
    const oldKey = await client.query(
      `SELECT kid FROM ledger_signing_keys 
       WHERE org_id = $1 AND status = 'ACTIVE'`,
      [orgId],
    );

    // 2. Generate key baru (Ed25519)
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    const privateKeyJwk = privateKey.export({ format: 'jwk' });
    const publicKeyJwk = publicKey.export({ format: 'jwk' });
    const newKid = crypto.randomUUID();

    const privateKeyEnc = encrypt({
      key: env.JOBENPAY_ENC_KEY,
      plaintext: JSON.stringify(privateKeyJwk),
      aad: 'ledger_signing_keys',
    });

    // 3. Insert key baru (status ACTIVE)
    await client.query(
      `INSERT INTO ledger_signing_keys (kid, org_id, private_key_enc, public_key_jwk, status)
       VALUES ($1, $2, $3, $4, 'ACTIVE')`,
      [newKid, orgId, privateKeyEnc, JSON.stringify(publicKeyJwk)],
    );

    // 4. Set key lama ke status ROTATED
    let oldKid = null;
    if (oldKey.rowCount > 0) {
      oldKid = oldKey.rows[0].kid;
      await client.query(
        `UPDATE ledger_signing_keys SET status = 'ROTATED', rotated_at = now()
         WHERE org_id = $1 AND kid = $2`,
        [orgId, oldKid],
      );
    }

    await client.query('COMMIT');
    client.release();

    logger.info({ orgId, newKid, oldKid }, 'Ledger signing key rotated');
    return {
      new_kid: newKid,
      old_kid: oldKid,
      rotated_at: new Date().toISOString(),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw err;
  }
}
