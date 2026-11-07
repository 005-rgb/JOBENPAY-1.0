/**
 * server/src/services/vlei_service.js
 * PRD 1.4 Trust Infrastructure (Fase A: vLEI Integration, WP2)
 * High-assurance vLEI credential verification, status querying, and lifetime management.
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { canonicalJson } from '../../../shared/canonical.js';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export const linkVleiSchema = z.object({
  lei: z.string().trim().length(20, 'LEI must be exactly 20 characters'),
  vlei_credential: z.object({
    lei: z.string().trim().length(20).optional(),
    legal_name: z.string().trim().min(1).optional(),
    jurisdiction: z.string().trim().length(2).optional(),
    verified_at: z.string().datetime().optional(),
    expires_at: z.string().datetime().optional(),
    public_key: z.string().min(1).optional(),
    signature: z.string().min(1),
  }).passthrough(),
  vlei_issuer: z.string().trim().min(1).default('GLEIF'),
  legal_name: z.string().trim().min(1).optional(),
  jurisdiction: z.string().trim().length(2).optional(),
  verified_at: z.string().datetime().optional(),
  expires_at: z.string().datetime().optional(),
}).strict();

/**
 * Reconstruct or parse an Ed25519 public key into a KeyObject
 */
export function parseEd25519PublicKey(pubKeyInput) {
  if (!pubKeyInput) return null;
  try {
    if (typeof pubKeyInput === 'object') {
      return crypto.createPublicKey({ key: pubKeyInput, format: 'jwk' });
    }
    const str = String(pubKeyInput).trim();
    if (str.startsWith('-----BEGIN PUBLIC KEY-----')) {
      return crypto.createPublicKey(str);
    }
    const buf = /^[0-9a-fA-F]+$/.test(str)
      ? Buffer.from(str, 'hex')
      : Buffer.from(str, 'base64');

    if (buf.length === 32) {
      const spki = Buffer.concat([ED25519_SPKI_PREFIX, buf]);
      return crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
    }
    return crypto.createPublicKey({ key: buf, format: 'der', type: 'spki' });
  } catch {
    return null;
  }
}

/**
 * Verify Ed25519 signature on credential
 */
export function verifyCredentialSignature(credential) {
  const { signature, public_key, ...unsignedData } = credential;
  if (!signature || !public_key) return false;

  const keyObject = parseEd25519PublicKey(public_key);
  if (!keyObject) return false;

  try {
    const sigBuffer = /^[0-9a-fA-F]+$/.test(signature)
      ? Buffer.from(signature, 'hex')
      : Buffer.from(signature, 'base64');

    const canonicalData = Buffer.from(canonicalJson(unsignedData), 'utf8');
    return crypto.verify(null, canonicalData, keyObject, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Link and verify a vLEI credential for an organization
 */
export async function linkVlei(orgId, body) {
  if (!orgId) {
    throw new AppError('UNAUTHORIZED', 401, 'Organization context required');
  }

  const parsed = linkVleiSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError('VLEI_INVALID', 400, 'Invalid vLEI payload', parsed.error.issues);
  }

  const { lei, vlei_credential, vlei_issuer } = parsed.data;

  // 1. Cek LEI mismatch antara body dan credential
  if (vlei_credential.lei && vlei_credential.lei !== lei) {
    throw new AppError('LEI_MISMATCH', 422, 'LEI in credential does not match the provided LEI');
  }

  // 2. Tentukan waktu verifikasi dan kedaluwarsa
  const now = new Date();
  const verifiedAtStr = parsed.data.verified_at || vlei_credential.verified_at || now.toISOString();
  const expiresAtStr = parsed.data.expires_at || vlei_credential.expires_at;

  if (!expiresAtStr) {
    throw new AppError('VLEI_INVALID', 400, 'vLEI credential missing expiry date');
  }

  const verifiedAt = new Date(verifiedAtStr);
  const expiresAt = new Date(expiresAtStr);

  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    throw new AppError('VLEI_EXPIRED', 400, 'vLEI credential has expired');
  }

  if (expiresAt.getTime() <= verifiedAt.getTime()) {
    throw new AppError('VLEI_INVALID', 400, 'vLEI expiry date must be strictly after verification date');
  }

  // 3. Verifikasi tanda tangan digital Ed25519 (fail-closed)
  const isSignatureValid = verifyCredentialSignature(vlei_credential);
  if (!isSignatureValid) {
    throw new AppError('VLEI_INVALID', 400, 'vLEI credential signature is invalid or could not be verified');
  }

  // 4. Periksa apakah LEI sudah ditautkan ke organisasi lain
  const existingLei = await query(
    `SELECT org_id FROM org_legal_identity WHERE lei = $1`,
    [lei]
  );
  if (existingLei.rowCount > 0 && existingLei.rows[0].org_id !== orgId) {
    throw new AppError('LEI_ALREADY_LINKED', 409, 'LEI is already linked to another organization');
  }

  const legalName = parsed.data.legal_name || vlei_credential.legal_name || 'Verified Legal Entity';
  const jurisdiction = parsed.data.jurisdiction || vlei_credential.jurisdiction || 'US';

  // 5. Simpan identitas legal organisasi (idempoten per org_id)
  const result = await query(
    `INSERT INTO org_legal_identity (
       org_id, lei, legal_name, jurisdiction, vlei_credential, vlei_issuer, verified_at, expires_at, status
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE'
     )
     ON CONFLICT (org_id) DO UPDATE SET
       lei = EXCLUDED.lei,
       legal_name = EXCLUDED.legal_name,
       jurisdiction = EXCLUDED.jurisdiction,
       vlei_credential = EXCLUDED.vlei_credential,
       vlei_issuer = EXCLUDED.vlei_issuer,
       verified_at = EXCLUDED.verified_at,
       expires_at = EXCLUDED.expires_at,
       status = 'ACTIVE'
     RETURNING identity_id, status, verified_at, expires_at, lei, legal_name`,
    [
      orgId,
      lei,
      legalName,
      jurisdiction,
      JSON.stringify(vlei_credential),
      vlei_issuer,
      verifiedAt.toISOString(),
      expiresAt.toISOString(),
    ]
  );

  const row = result.rows[0];
  return {
    identity_id: row.identity_id,
    status: row.status,
    verified_at: new Date(row.verified_at).toISOString(),
    expires_at: new Date(row.expires_at).toISOString(),
    lei: row.lei,
    legal_name: row.legal_name,
  };
}

/**
 * Get active or recorded vLEI status for an organization
 */
export async function getVleiStatus(orgId) {
  if (!orgId) return null;
  const result = await query(
    `SELECT identity_id, org_id, lei, legal_name, jurisdiction, vlei_issuer,
            verified_at, expires_at, status, created_at
     FROM org_legal_identity
     WHERE org_id = $1`,
    [orgId]
  );

  if (result.rowCount === 0) {
    return { status: 'INACTIVE', identity_id: null, lei: null };
  }

  const row = result.rows[0];
  const isExpired = new Date(row.expires_at).getTime() <= Date.now();
  const effectiveStatus = isExpired ? 'EXPIRED' : row.status;

  return {
    identity_id: row.identity_id,
    lei: row.lei,
    legal_name: row.legal_name,
    jurisdiction: row.jurisdiction,
    vlei_issuer: row.vlei_issuer,
    verified_at: new Date(row.verified_at).toISOString(),
    expires_at: new Date(row.expires_at).toISOString(),
    status: effectiveStatus,
  };
}

/**
 * Determine if an organization has an active, unexpired vLEI credential
 */
export async function hasActiveVlei(orgId) {
  if (!orgId) return false;
  const result = await query(
    `SELECT 1 FROM org_legal_identity
     WHERE org_id = $1 AND status = 'ACTIVE' AND expires_at > now()
     LIMIT 1`,
    [orgId]
  );
  return result.rowCount > 0;
}

export default {
  linkVlei,
  getVleiStatus,
  hasActiveVlei,
  verifyCredentialSignature,
  parseEd25519PublicKey,
};
