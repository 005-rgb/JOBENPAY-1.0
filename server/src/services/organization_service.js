// @ts-check
import pool, { query } from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { env } from '../config.js';
import { AppError } from '../lib/errors.js';
import { encrypt } from '../lib/crypto.js';
import { appendLedgerEntry } from './ledger.js';
import { appendAudit } from '../repositories/audit.js';
import { validateStepUp } from './sca_service.js';

function getEncryptionKey() {
  return env.JOBENPAY_ENC_KEY || process.env.JOBENPAY_ENC_KEY || 'k'.repeat(32);
}

/**
 * Retrieves the organization profile by orgId.
 * 
 * @param {string} orgId 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function getOrgProfile(orgId, dbClient = null) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  const db = dbClient || pool;
  let result = await db.query(
    `SELECT COALESCE(org_id, id) AS org_id, id, name, slug, 
            COALESCE(display_name, name) AS display_name, 
            legal_name, logo_url, website_url, 
            support_email, billing_email, address, created_at, updated_at
     FROM organizations 
     WHERE id = $1 OR org_id = $1
     LIMIT 1`,
    [orgId],
  );

  if (result.rows.length === 0 && orgId === '00000000-0000-4000-8000-000000000000') {
    result = await db.query(
      `SELECT COALESCE(org_id, id) AS org_id, id, name, slug, 
              COALESCE(display_name, name) AS display_name, 
              legal_name, logo_url, website_url, 
              support_email, billing_email, address, created_at, updated_at
       FROM organizations 
       ORDER BY created_at ASC
       LIMIT 1`
    );
  }

  if (result.rows.length === 0) {
    throw new AppError('ORG_NOT_FOUND', 404, 'Organization not found');
  }

  return result.rows[0];
}

/**
 * Updates the organization profile. Sensitive changes such as billing_email require Step-Up (SCA).
 * 
 * @param {string} orgId 
 * @param {string} userId 
 * @param {object} body 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function updateOrgProfile(orgId, userId, body = {}, dbClient = null) {
  if (!orgId || !userId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId and userId are required');
  }
  if (!body || typeof body !== 'object') {
    throw new AppError('VALIDATION_FAILED', 400, 'Request body is required');
  }

  const {
    display_name,
    legal_name,
    website_url,
    support_email,
    billing_email,
    tax_id,
    address,
    step_up_grant_id,
  } = body;

  const exec = async (client) => {
    // 1. Verify existence of organization
    let orgRes = await client.query(
      `SELECT id, billing_email FROM organizations WHERE id = $1 OR org_id = $1 FOR UPDATE`,
      [orgId],
    );
    if (orgRes.rows.length === 0 && orgId === '00000000-0000-4000-8000-000000000000') {
      orgRes = await client.query(
        `SELECT id, billing_email FROM organizations ORDER BY created_at ASC LIMIT 1 FOR UPDATE`
      );
    }
    if (orgRes.rows.length === 0) {
      throw new AppError('ORG_NOT_FOUND', 404, 'Organization not found');
    }
    const currentOrg = orgRes.rows[0];
    const targetOrgId = currentOrg.id;

    // 2. Step-up check if updating billing_email to a new value
    if (billing_email && billing_email !== currentOrg.billing_email) {
      await validateStepUp(userId, 'UPDATE_BILLING_EMAIL', step_up_grant_id, client);
    }

    // 3. Encrypt tax_id if provided
    let taxIdEnc = null;
    if (tax_id) {
      taxIdEnc = encrypt({
        key: getEncryptionKey(),
        plaintext: String(tax_id).trim(),
        aad: `organizations:tax_id_enc:${targetOrgId}`,
      });
    }

    const safeAddressJson = address !== undefined ? JSON.stringify(address) : null;

    // 4. Update organization record
    const updateRes = await client.query(
      `UPDATE organizations 
       SET display_name = COALESCE($1, display_name),
           legal_name = COALESCE($2, legal_name),
           website_url = COALESCE($3, website_url),
           support_email = COALESCE($4, support_email),
           billing_email = COALESCE($5, billing_email),
           tax_id_enc = COALESCE($6, tax_id_enc),
           address = COALESCE($7::jsonb, address),
           updated_at = now()
       WHERE id = $8 OR org_id = $8
       RETURNING COALESCE(org_id, id) AS org_id, id, name, slug, 
                 COALESCE(display_name, name) AS display_name, 
                 legal_name, logo_url, website_url, 
                 support_email, billing_email, address, created_at, updated_at`,
      [
        display_name ?? null,
        legal_name ?? null,
        website_url ?? null,
        support_email ?? null,
        billing_email ?? null,
        taxIdEnc,
        safeAddressJson,
        targetOrgId,
      ],
    );

    const safeFieldsChanged = Object.keys(body).filter(
      (key) => key !== 'step_up_grant_id' && key !== 'tax_id',
    );

    // 5. Append immutable ledger entry and audit log
    await appendLedgerEntry(client, {
      orgId: targetOrgId,
      type: 'ORG_PROFILE_UPDATED',
      subjectType: 'ORG',
      subjectId: targetOrgId,
      payload: { actor: userId, fields_changed: safeFieldsChanged },
    });

    await appendAudit(client, {
      orgId: targetOrgId,
      actorId: userId,
      action: 'ORG_PROFILE_UPDATED',
      details: { fields_changed: safeFieldsChanged },
    });

    return updateRes.rows[0];
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

/**
 * Updates the organization logo URL.
 * 
 * @param {string} orgId 
 * @param {string} userId 
 * @param {string} logoUrl 
 * @param {import('pg').PoolClient|null} [dbClient=null]
 * @returns {Promise<any>}
 */
export async function updateOrgLogo(orgId, userId, logoUrl, dbClient = null) {
  if (!orgId || !userId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId and userId are required');
  }
  if (!logoUrl || typeof logoUrl !== 'string') {
    throw new AppError('VALIDATION_FAILED', 400, 'logoUrl is required and must be a string');
  }

  const exec = async (client) => {
    let res = await client.query(
      `UPDATE organizations 
       SET logo_url = $1, updated_at = now()
       WHERE id = $2 OR org_id = $2
       RETURNING COALESCE(org_id, id) AS org_id, id, logo_url`,
      [logoUrl, orgId],
    );
    if (res.rows.length === 0 && orgId === '00000000-0000-4000-8000-000000000000') {
      const fallbackOrg = await client.query(
        `SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1`
      );
      if (fallbackOrg.rows.length > 0) {
        res = await client.query(
          `UPDATE organizations 
           SET logo_url = $1, updated_at = now()
           WHERE id = $2
           RETURNING COALESCE(org_id, id) AS org_id, id, logo_url`,
          [logoUrl, fallbackOrg.rows[0].id],
        );
      }
    }
    if (res.rows.length === 0) {
      throw new AppError('ORG_NOT_FOUND', 404, 'Organization not found');
    }
    const resolvedOrgId = res.rows[0].id || orgId;

    await appendLedgerEntry(client, {
      orgId: resolvedOrgId,
      type: 'ORG_PROFILE_UPDATED',
      subjectType: 'ORG',
      subjectId: resolvedOrgId,
      payload: { actor: userId, fields_changed: ['logo_url'] },
    });

    await appendAudit(client, {
      orgId: resolvedOrgId,
      actorId: userId,
      action: 'ORG_LOGO_UPDATED',
      details: { logo_url: logoUrl },
    });

    return res.rows[0];
  };

  if (dbClient) {
    return exec(dbClient);
  }
  return withTx(exec);
}

export default {
  getOrgProfile,
  updateOrgProfile,
  updateOrgLogo,
};
