// server/src/services/intent_service.js
// PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP2)
// Cryptographically verified human intent mandates for autonomous agents

import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { canonicalJson } from '../../../shared/canonical.js';
import { env } from '../config.js';
import {
  signEd25519,
  verifyEd25519,
  generateEd25519Keys,
  kidFromPublicKey,
} from '../lib/crypto.js';
import { StructuredIntentV2Schema } from '../../../shared/dip_schema.js';

export const StructuredIntentSchema = z.object({
  purpose: z.string().min(1, 'Purpose must not be empty'),
  amount_range: z.object({
    min: z.number().int().nonnegative().optional().default(0),
    max: z.number().int().positive('Max amount must be positive'),
  }),
  vendor_categories: z.array(z.string().min(1)).min(1, 'At least one vendor category is required'),
  deadline: z.string().optional(),
});

export const CreateIntentSchema = z.object({
  natural_language_input: z.string().min(1, 'Natural language input is required'),
  structured_intent: StructuredIntentSchema,
  signing_key_id: z.string().optional(),
  signature: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
});

/**
 * Normalizes a string for deterministic comparison.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

function normalize(str) {
  return String(str || '').trim().toLowerCase();
}

function runQuery(sql, params, client) {
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return query(sql, params);
}

/**
 * Validates date string or throws AppError.
 */
function parseValidDate(val, fieldName) {
  if (!val) return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('VALIDATION_FAILED', 400, `Invalid timestamp in ${fieldName}`);
  }
  return d.toISOString();
}

/**
 * Creates and cryptographically signs a human intent mandate.
 * @param {string} orgId - Organization UUID
 * @param {string} userId - Principal user UUID
 * @param {object} body - Intent payload
 * @param {object} [dbClient=null] - Optional DB client for transactions
 * @returns {Promise<object>} Created intent mandate
 */
export async function createIntent(orgId, userId, body, dbClient = null) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  // If structured_intent is v2 Intent Anchor format with constraints, delegate to createIntentAnchor
  if (body?.structured_intent?.constraints) {
    return createIntentAnchor(orgId, userId, body, dbClient);
  }

  const parseResult = CreateIntentSchema.safeParse(body);
  if (!parseResult.success) {
    throw new AppError('VALIDATION_FAILED', 400, 'Invalid intent mandate payload', {
      errors: parseResult.error.flatten(),
    });
  }

  const { natural_language_input, structured_intent, valid_from, valid_to, signature, signing_key_id } = parseResult.data;

  // 1. Calculate canonical JSON and SHA-256 hash
  const canonical = canonicalJson(structured_intent);
  const hashHex = crypto.createHash('sha256').update(canonical).digest('hex');
  const intent_hash = `sha256:${hashHex}`;

  // 2. Sign intent_hash with Ed25519
  let finalSignature = signature;
  let finalKeyId = signing_key_id;

  if (!finalSignature) {
    let privateKey = env.JOBENPAY_LEDGER_SIGNING_KEY;
    if (!privateKey) {
      const generated = generateEd25519Keys();
      privateKey = generated.privateKey;
      finalKeyId = kidFromPublicKey(generated.publicKey);
    } else {
      finalKeyId = signing_key_id || 'system-ledger-key';
    }
    const rawSig = signEd25519(privateKey, intent_hash);
    finalSignature = `ed25519:${rawSig}`;
  } else {
    finalSignature = finalSignature.startsWith('ed25519:') ? finalSignature : `ed25519:${finalSignature}`;
    finalKeyId = finalKeyId || 'principal-key';
  }

  // 3. Compute timestamps
  const nowIso = new Date().toISOString();
  const validFromIso = parseValidDate(valid_from, 'valid_from') || nowIso;
  const validToIso =
    parseValidDate(valid_to, 'valid_to') ||
    parseValidDate(structured_intent.deadline, 'structured_intent.deadline') ||
    new Date(Date.now() + 30 * 86400000).toISOString();

  if (new Date(validToIso).getTime() <= new Date(validFromIso).getTime()) {
    throw new AppError('VALIDATION_FAILED', 400, 'valid_to must be after valid_from');
  }

  const insertSql = `
    INSERT INTO intent_mandates (
      org_id, principal_user_id, natural_language_input, structured_intent,
      intent_hash, signature, signing_key_id, valid_from, valid_to, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ACTIVE')
    RETURNING intent_id, org_id, principal_user_id, natural_language_input,
              structured_intent, intent_hash, signature, signing_key_id,
              valid_from, valid_to, status, created_at;
  `;

  const { rows } = await runQuery(insertSql, [
    orgId,
    userId,
    natural_language_input,
    JSON.stringify(structured_intent),
    intent_hash,
    finalSignature,
    finalKeyId,
    validFromIso,
    validToIso,
  ], dbClient);

  return rows[0];
}

/**
 * Revokes an existing intent mandate.
 * @param {string} orgId - Organization UUID
 * @param {string} intentId - Intent mandate UUID
 * @param {object} [dbClient=null] - Optional DB client
 * @returns {Promise<object>} Status object
 */
export async function revokeIntent(orgId, intentId, dbClient = null) {
  if (!orgId || !intentId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId and intentId are required');
  }

  if (!isValidUuid(intentId)) {
    throw new AppError('INTENT_NOT_FOUND', 404, 'Intent mandate not found');
  }

  const updateSql = `
    UPDATE intent_mandates
    SET status = 'REVOKED'
    WHERE org_id = $1 AND intent_id = $2
    RETURNING intent_id, status;
  `;

  const { rows } = await runQuery(updateSql, [orgId, intentId], dbClient);
  if (!rows || rows.length === 0) {
    throw new AppError('INTENT_NOT_FOUND', 404, 'Intent mandate not found');
  }

  return { status: 'REVOKED', intent_id: rows[0].intent_id };
}

/**
 * Retrieves an intent mandate by ID.
 * @param {string} orgId - Organization UUID
 * @param {string} intentId - Intent mandate UUID
 * @param {object} [dbClient=null] - Optional DB client
 * @returns {Promise<object>} Intent mandate row
 */
export async function getIntentMandate(orgId, intentId, dbClient = null) {
  if (!orgId || !intentId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId and intentId are required');
  }

  if (!isValidUuid(intentId)) {
    throw new AppError('INTENT_NOT_FOUND', 404, 'Intent mandate not found');
  }

  const { rows } = await runQuery(
    `SELECT intent_id, org_id, principal_user_id, natural_language_input,
            structured_intent, intent_hash, signature, signing_key_id,
            valid_from, valid_to, status, created_at
     FROM intent_mandates
     WHERE org_id = $1 AND intent_id = $2;`,
    [orgId, intentId],
    dbClient
  );

  if (!rows || rows.length === 0) {
    throw new AppError('INTENT_NOT_FOUND', 404, 'Intent mandate not found');
  }

  return rows[0];
}

/**
 * Lists intent mandates for an organization.
 * @param {string} orgId - Organization UUID
 * @param {object} [options] - Pagination options
 * @param {object} [dbClient=null] - DB client
 * @returns {Promise<Array<object>>}
 */
export async function listIntentMandates(orgId, { limit = 50, offset = 0 } = {}, dbClient = null) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  const { rows } = await runQuery(
    `SELECT intent_id, org_id, principal_user_id, natural_language_input,
            structured_intent, intent_hash, signature, signing_key_id,
            valid_from, valid_to, status, created_at
     FROM intent_mandates
     WHERE org_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3;`,
    [orgId, limit, offset],
    dbClient
  );

  return rows || [];
}

/**
 * Validates whether a proposed transaction adheres to the bounded intent mandate.
 * @param {string} orgId - Organization UUID
 * @param {string} intentMandateId - Mandate UUID
 * @param {object} transaction - Proposed transaction intent or request
 * @param {object} [dbClient=null] - DB client
 * @returns {Promise<{ valid: boolean, reason?: string, details?: object }>}
 */
export async function validateIntentMatch(orgId, intentMandateId, transaction, dbClient = null) {
  if (!intentMandateId || !isValidUuid(intentMandateId)) {
    return { valid: false, reason: 'INTENT_MANDATE_MISSING' };
  }

  const { rows } = await runQuery(
    `SELECT intent_id, structured_intent, valid_from, valid_to, status
     FROM intent_mandates
     WHERE org_id = $1 AND intent_id = $2;`,
    [orgId, intentMandateId],
    dbClient
  );

  if (!rows || rows.length === 0) {
    return { valid: false, reason: 'INTENT_NOT_FOUND' };
  }

  const mandate = rows[0];

  // 1. Check status
  if (mandate.status !== 'ACTIVE') {
    return { valid: false, reason: 'INTENT_MANDATE_EXPIRED' };
  }

  // 2. Check validity window
  const now = Date.now();
  if (new Date(mandate.valid_to).getTime() <= now || new Date(mandate.valid_from).getTime() > now) {
    return { valid: false, reason: 'INTENT_MANDATE_EXPIRED' };
  }

  const structured = mandate.structured_intent || {};

  // 3. Purpose match (exact match after normalization)
  const txPurpose =
    transaction?.metadata?.purpose ||
    transaction?.purpose ||
    transaction?.sub_type ||
    transaction?.category;

  if (normalize(txPurpose) !== normalize(structured.purpose)) {
    return { valid: false, reason: 'INTENT_MISMATCH' };
  }

  // 4. Amount cap check
  const txAmount = transaction?.amount_minor ?? transaction?.amountMinor ?? transaction?.amount;
  const amountRange = structured.amount_range || structured.constraints?.amount_range;
  if (txAmount !== undefined && amountRange) {
    let txBigInt;
    try {
      txBigInt = BigInt(txAmount);
    } catch {
      return { valid: false, reason: 'INTENT_AMOUNT_EXCEEDED' };
    }

    if (amountRange.max !== undefined) {
      if (txBigInt > BigInt(amountRange.max)) {
        return { valid: false, reason: 'INTENT_AMOUNT_EXCEEDED' };
      }
    }

    if (amountRange.min !== undefined) {
      if (txBigInt < BigInt(amountRange.min)) {
        return { valid: false, reason: 'INTENT_AMOUNT_EXCEEDED' };
      }
    }
  }

  // 5. Vendor categories check
  const vendorCategories = structured.vendor_categories || structured.constraints?.vendor_categories || [];
  const categories = vendorCategories.map(normalize);
  const candidates = [
    transaction?.counterparty_id,
    transaction?.counterpartyId,
    transaction?.counterparty,
    transaction?.vendor_category,
    transaction?.vendorCategory,
    transaction?.metadata?.vendor_category,
    transaction?.metadata?.counterparty,
    transaction?.metadata?.vendor,
    transaction?.payee_id,
    transaction?.payeeId,
  ].filter(Boolean);

  const vendorMatched = candidates.some((cand) => categories.includes(normalize(cand)));
  if (!vendorMatched) {
    return { valid: false, reason: 'INTENT_VENDOR_MISMATCH' };
  }

  return { valid: true };
}

/**
 * Verifies the Ed25519 signature of an intent mandate against a public key.
 * @param {object} intentMandate - Row or object with signature and intent_hash
 * @param {string} publicKeyBase64 - Ed25519 public key in base64 DER/SPKI format
 * @returns {boolean} Whether signature is valid
 */
export function verifyIntentSignature(intentMandate, publicKeyBase64) {
  if (!intentMandate || !intentMandate.signature || !intentMandate.intent_hash || !publicKeyBase64) {
    return false;
  }
  const cleanSig = intentMandate.signature.replace(/^ed25519:/, '');
  try {
    return verifyEd25519(publicKeyBase64, cleanSig, intentMandate.intent_hash);
  } catch {
    return false;
  }
}

/**
 * Creates and cryptographically signs a human Intent Anchor (PRD 1.6 §3).
 * @param {string} orgId
 * @param {string} userId
 * @param {object} body
 * @param {object} [dbClient=null]
 * @returns {Promise<object>}
 */
export async function createIntentAnchor(orgId, userId, body, dbClient = null) {
  if (!orgId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId is required');
  }

  const { natural_language_input, structured_intent, signing_key_id, signature, valid_from, valid_to } = body || {};
  if (!natural_language_input) {
    throw new AppError('VALIDATION_FAILED', 400, 'natural_language_input is required');
  }

  const parseResult = StructuredIntentV2Schema.safeParse(structured_intent);
  if (!parseResult.success) {
    throw new AppError('VALIDATION_FAILED', 400, 'Invalid structured_intent for Intent Anchor', {
      errors: parseResult.error.flatten(),
    });
  }

  const validStructured = parseResult.data;

  // RFC 8785 Canonicalize and SHA-256 hash
  const canonical = canonicalJson(validStructured);
  const hashHex = crypto.createHash('sha256').update(canonical).digest('hex');
  const intent_hash = `sha256:${hashHex}`;

  // Key & signature
  let finalSignature = signature;
  let finalKeyId = signing_key_id;

  if (!finalSignature) {
    let privateKey = env.JOBENPAY_LEDGER_SIGNING_KEY;
    if (!privateKey) {
      const generated = generateEd25519Keys();
      privateKey = generated.privateKey;
      finalKeyId = kidFromPublicKey(generated.publicKey);
    } else {
      finalKeyId = signing_key_id || 'system-ledger-key';
    }
    const rawSig = signEd25519(privateKey, intent_hash);
    finalSignature = `base64:${rawSig}`;
  } else {
    finalSignature = finalSignature.startsWith('base64:') ? finalSignature : `base64:${finalSignature}`;
    finalKeyId = finalKeyId || 'principal-key';
  }

  const nowIso = new Date().toISOString();
  const validFromIso = parseValidDate(valid_from, 'valid_from') || nowIso;
  const validToIso =
    parseValidDate(valid_to, 'valid_to') ||
    parseValidDate(validStructured.constraints?.deadline, 'structured_intent.deadline') ||
    new Date(Date.now() + 30 * 86400000).toISOString();

  if (new Date(validToIso).getTime() <= new Date(validFromIso).getTime()) {
    throw new AppError('VALIDATION_FAILED', 400, 'valid_to must be after valid_from');
  }

  const insertSql = `
    INSERT INTO intent_mandates (
      org_id, principal_user_id, natural_language_input, structured_intent,
      structured_intent_v2, intent_hash, intent_hash_v2, signature, signing_key_id,
      valid_from, valid_to, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'ACTIVE')
    RETURNING intent_id, org_id, principal_user_id, natural_language_input,
              structured_intent, structured_intent_v2, intent_hash, intent_hash_v2,
              signature, signing_key_id, valid_from, valid_to, status, created_at;
  `;

  const { rows } = await runQuery(insertSql, [
    orgId,
    userId,
    natural_language_input,
    JSON.stringify(validStructured),
    JSON.stringify(validStructured),
    intent_hash,
    intent_hash,
    finalSignature,
    finalKeyId,
    validFromIso,
    validToIso,
  ], dbClient);

  const row = rows[0];
  return {
    ...row,
    structured_intent: row.structured_intent_v2 || row.structured_intent,
  };
}

/**
 * Retrieves an Intent Anchor by ID.
 * @param {string} orgId
 * @param {string} intentId
 * @param {object} [dbClient=null]
 * @returns {Promise<object>}
 */
export async function getIntentAnchor(orgId, intentId, dbClient = null) {
  if (!orgId || !intentId) {
    throw new AppError('VALIDATION_FAILED', 400, 'orgId and intentId are required');
  }

  if (!isValidUuid(intentId)) {
    throw new AppError('INTENT_NOT_FOUND', 404, 'Intent anchor not found');
  }

  const { rows } = await runQuery(
    `SELECT intent_id, org_id, principal_user_id, natural_language_input,
            structured_intent, structured_intent_v2, intent_hash, intent_hash_v2,
            signature, signing_key_id, valid_from, valid_to, status, created_at
     FROM intent_mandates
     WHERE org_id = $1 AND intent_id = $2;`,
    [orgId, intentId],
    dbClient
  );

  if (!rows || rows.length === 0) {
    throw new AppError('INTENT_NOT_FOUND', 404, 'Intent anchor not found');
  }

  const row = rows[0];
  return {
    ...row,
    structured_intent: row.structured_intent_v2 || row.structured_intent,
  };
}

/**
 * Verifies an Intent Anchor signature.
 * @param {object} intentAnchor
 * @param {string} publicKeyBase64
 * @returns {boolean}
 */
export function verifyIntentAnchor(intentAnchor, publicKeyBase64) {
  if (!intentAnchor || !intentAnchor.signature || !publicKeyBase64) {
    return false;
  }
  const cleanSig = intentAnchor.signature.replace(/^base64:/, '').replace(/^ed25519:/, '');
  const hash = intentAnchor.intent_hash || intentAnchor.intent_hash_v2;
  if (!hash) return false;
  try {
    return verifyEd25519(publicKeyBase64, cleanSig, hash);
  } catch {
    return false;
  }
}

