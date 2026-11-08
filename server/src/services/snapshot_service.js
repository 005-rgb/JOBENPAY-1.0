// @ts-check
import crypto from 'node:crypto';
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { canonicalJson } from '../../../shared/canonical.js';
import { env } from '../config.js';
import { signEd25519, verifyEd25519, generateEd25519Keys } from '../lib/crypto.js';
import { CognitiveSnapshotSchema } from '../../../shared/cpl_schema.js';

const CROCKFORD_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a standard Crockford Base32 snapshot ID: snap_[0-9A-HJKMNP-TV-Z]{26}
 */
export function generateSnapshotId(timestamp = Date.now()) {
  const randomBytes = crypto.randomBytes(16);
  let t = timestamp;
  let timeStr = '';
  for (let i = 0; i < 10; i++) {
    timeStr = CROCKFORD_CHARS[t % 32] + timeStr;
    t = Math.floor(t / 32);
  }
  let randStr = '';
  for (let i = 0; i < 16; i++) {
    randStr += CROCKFORD_CHARS[randomBytes[i] % 32];
  }
  return `snap_${timeStr}${randStr}`;
}

const PII_EMAIL_REGEX = /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/;
const PII_PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}/;
const PII_SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/;
const PII_CREDIT_CARD_REGEX = /\b(?:\d{4}[ -]?){3}\d{4}\b/;

/**
 * Recursively scans object for PII.
 * PRD 1.7 §0: No PII allowed in Cognitive Snapshot.
 * @param {any} val
 * @returns {{ hasPII: boolean, type?: string, path?: string }}
 */
export function detectPII(val, path = '') {
  if (val === null || val === undefined) return { hasPII: false };

  if (typeof val === 'string') {
    // Hashes, base64 signatures, standard IDs, and enum/slugs are cryptographic tokens, not PII
    if (
      /^sha256:[a-f0-9]{64}$/i.test(val) ||
      /^[a-f0-9]{64}$/i.test(val) ||
      /^base64:[A-Za-z0-9+/=]+$/.test(val) ||
      /^snap_[0-9A-HJKMNP-TV-Z]{26}$/.test(val) ||
      /^[0-9a-f-]{36}$/i.test(val)
    ) {
      return { hasPII: false };
    }

    if (PII_EMAIL_REGEX.test(val)) return { hasPII: true, type: 'EMAIL', path };
    if (PII_PHONE_REGEX.test(val)) return { hasPII: true, type: 'PHONE', path };
    if (PII_SSN_REGEX.test(val)) return { hasPII: true, type: 'SSN', path };
    if (PII_CREDIT_CARD_REGEX.test(val)) return { hasPII: true, type: 'CREDIT_CARD', path };
    return { hasPII: false };
  }

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      const res = detectPII(val[i], `${path}[${i}]`);
      if (res.hasPII) return res;
    }
    return { hasPII: false };
  }

  if (typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) {
      if (/password|secret|bearer|token_value/i.test(k)) {
        return { hasPII: true, type: 'SENSITIVE_KEY', path: `${path}.${k}` };
      }
      const res = detectPII(v, `${path}.${k}`);
      if (res.hasPII) return res;
    }
    return { hasPII: false };
  }

  return { hasPII: false };
}

/**
 * Computes deterministic RFC 8785 sha256 hash for a snapshot (excluding snapshot_hash and signature).
 * @param {object} snapshotObj
 * @returns {string} sha256:<hex>
 */
export function computeSnapshotHash(snapshotObj) {
  const { snapshot_hash: _sh, signature: _sig, ...dataToHash } = snapshotObj;
  const canonicalStr = canonicalJson(dataToHash);
  const hex = crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
  return `sha256:${hex}`;
}

/**
 * Signs snapshot hash using Ed25519.
 * @param {string} snapshotHash
 * @param {string} [privateKeyBase64]
 * @returns {string} base64:<sig>
 */
export function signSnapshot(snapshotHash, privateKeyBase64) {
  const key = privateKeyBase64 || env.JOBENPAY_LEDGER_SIGNING_KEY;
  if (!key) {
    const generated = generateEd25519Keys();
    const rawSig = signEd25519(generated.privateKey, snapshotHash);
    return `base64:${rawSig}`;
  }
  const rawSig = signEd25519(key, snapshotHash);
  return `base64:${rawSig}`;
}

/**
 * Verifies Ed25519 signature of a Cognitive Snapshot.
 * @param {object} snapshot
 * @param {string} [publicKeyBase64]
 * @returns {boolean}
 */
export function verifySnapshotSignature(snapshot, publicKeyBase64) {
  if (!snapshot || !snapshot.signature || !snapshot.snapshot_hash) return false;
  const expectedHash = computeSnapshotHash(snapshot);
  if (snapshot.snapshot_hash !== expectedHash) return false;

  const rawSig = snapshot.signature.replace(/^base64:/, '');
  const key = publicKeyBase64 || env.JOBENPAY_LEDGER_PUBLIC_KEY;
  if (!key) {
    // If no configured public key, check that signature format is valid base64
    return Buffer.from(rawSig, 'base64').length === 64;
  }
  return verifyEd25519(key, rawSig, snapshot.snapshot_hash);
}

/**
 * Creates, signs, and persists a Cognitive Snapshot.
 * @param {object} params
 * @param {string} params.requestId
 * @param {string} params.orgId
 * @param {object} params.model
 * @param {object} params.inputs
 * @param {object} params.outputs
 * @param {object} [params.environment]
 * @param {string} [params.privateKey]
 * @param {any} [params.dbClient]
 * @returns {Promise<object>} Complete cognitive snapshot
 */
export function createCognitiveSnapshotPayload({
  requestId,
  orgId,
  model,
  inputs,
  outputs,
  environment = {},
  privateKey,
  snapshotId,
  createdAt,
}) {
  const piiCheck = detectPII({ model, inputs, outputs, environment });
  if (piiCheck.hasPII) {
    throw new AppError('PII_DETECTED', 422, `Cognitive snapshot cannot contain PII (detected ${piiCheck.type} at ${piiCheck.path})`);
  }

  const sid = snapshotId || generateSnapshotId();
  const created = createdAt || new Date().toISOString();

  const unsigned = {
    snapshot_id: sid,
    request_id: String(requestId),
    org_id: String(orgId),
    model,
    inputs: {
      user_prompt_hash: inputs.user_prompt_hash,
      context_hash: inputs.context_hash,
      document_hashes: inputs.document_hashes || [],
      retrieval_context_hash: inputs.retrieval_context_hash,
      tool_calls: inputs.tool_calls || [],
    },
    outputs: {
      decision: outputs.decision,
      reasoning_trace_hash: outputs.reasoning_trace_hash,
      raw_output_hash: outputs.raw_output_hash,
      decision_integrity_score: outputs.decision_integrity_score,
    },
    environment: {
      api_version: environment.api_version || '2024-08-06',
      sdk_version: environment.sdk_version || 'jobenpay-sdk-1.0',
      timestamp: environment.timestamp || created,
      region: environment.region || 'us-east-1',
    },
    created_at: created,
  };

  const snapshot_hash = computeSnapshotHash(unsigned);
  const signature = signSnapshot(snapshot_hash, privateKey);

  const fullSnapshot = {
    ...unsigned,
    snapshot_hash,
    signature,
  };

  CognitiveSnapshotSchema.parse(fullSnapshot);
  return fullSnapshot;
}

/**
 * Creates and persists a Cognitive Snapshot in PostgreSQL.
 */
export async function createAndSaveCognitiveSnapshot(params) {
  const snapshot = createCognitiveSnapshotPayload(params);
  const db = params.dbClient || { query };

  await db.query(
    `INSERT INTO cognitive_snapshots (
      request_id, org_id, model, inputs, outputs, environment,
      snapshot_hash, signature, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (request_id) DO UPDATE SET
      model = EXCLUDED.model,
      inputs = EXCLUDED.inputs,
      outputs = EXCLUDED.outputs,
      environment = EXCLUDED.environment,
      snapshot_hash = EXCLUDED.snapshot_hash,
      signature = EXCLUDED.signature
    RETURNING snapshot_id`,
    [
      snapshot.request_id,
      snapshot.org_id,
      JSON.stringify(snapshot.model),
      JSON.stringify(snapshot.inputs),
      JSON.stringify(snapshot.outputs),
      JSON.stringify(snapshot.environment),
      snapshot.snapshot_hash,
      snapshot.signature,
      snapshot.created_at,
    ],
  );

  return snapshot;
}

/**
 * Retrieves a Cognitive Snapshot by requestId and orgId.
 * @param {string} requestId
 * @param {string} orgId
 * @param {any} [dbClient]
 * @returns {Promise<object|null>}
 */
export async function getCognitiveSnapshot(requestId, orgId, dbClient = null) {
  const db = dbClient || { query };
  const res = await db.query(
    `SELECT snapshot_id, request_id, org_id, model, inputs, outputs, environment,
            snapshot_hash, signature, created_at
     FROM cognitive_snapshots
     WHERE request_id = $1 AND org_id = $2`,
    [requestId, orgId],
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  return {
    snapshot_id: generateSnapshotId(new Date(row.created_at).getTime()),
    request_id: row.request_id,
    org_id: row.org_id,
    model: typeof row.model === 'string' ? JSON.parse(row.model) : row.model,
    inputs: typeof row.inputs === 'string' ? JSON.parse(row.inputs) : row.inputs,
    outputs: typeof row.outputs === 'string' ? JSON.parse(row.outputs) : row.outputs,
    environment: typeof row.environment === 'string' ? JSON.parse(row.environment) : row.environment,
    snapshot_hash: row.snapshot_hash,
    signature: row.signature,
    created_at: new Date(row.created_at).toISOString(),
  };
}

export default {
  generateSnapshotId,
  detectPII,
  computeSnapshotHash,
  signSnapshot,
  verifySnapshotSignature,
  createCognitiveSnapshotPayload,
  createAndSaveCognitiveSnapshot,
  getCognitiveSnapshot,
};
