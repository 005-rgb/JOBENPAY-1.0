import crypto from 'node:crypto';

import { canonicalJson } from '../../../shared/canonical.js';
import { env } from '../config.js';
import { query } from '../db/pool.js';
import { kidFromPublicKey, signEd25519, verifyEd25519 } from '../lib/crypto.js';

export const LEDGER_TYPES = Object.freeze({
  MANDATE_ACTIVATED: 'MANDATE_ACTIVATED',
  MANDATE_SUSPENDED: 'MANDATE_SUSPENDED',
  MANDATE_REVOKED: 'MANDATE_REVOKED',
  REQUEST_RECEIVED: 'REQUEST_RECEIVED',
  REQUEST_DECIDED: 'REQUEST_DECIDED',
  APPROVAL_DECIDED: 'APPROVAL_DECIDED',
  REQUEST_CANCELLED: 'REQUEST_CANCELLED',
  EXECUTION_STARTED: 'EXECUTION_STARTED',
  EXECUTION_RESULT: 'EXECUTION_RESULT',
  RECONCILED: 'RECONCILED',
  MISMATCH: 'MISMATCH',
  ORG_FROZEN: 'ORG_FROZEN',
  ORG_UNFROZEN: 'ORG_UNFROZEN',
  DOCUMENT_ADDED: 'DOCUMENT_ADDED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',
  PAYEE_TRUST_CHANGED: 'PAYEE_TRUST_CHANGED',
  AGENT_KEY_ROTATED: 'AGENT_KEY_ROTATED',
  DEMO_RESET: 'DEMO_RESET',
});

const ZERO_HASH = '0'.repeat(64);
const BATCH_SIZE = 500;
const FORBIDDEN_KEY_RE = /(?:^|[_-])(secret|password|token|api[_-]?key|client[_-]?secret|identifier)(?:$|[_-])/i;

export function assertSafePayload(payload) {
  if (payload === undefined || payload === null) {
    return;
  }

  if (typeof payload === 'bigint') {
    throw new Error('BigInt is not allowed in ledger payloads. Use string minor-unit values instead.');
  }

  const visited = new WeakSet();

  const walk = (value, path = 'payload') => {
    if (value === null || value === undefined) {
      return;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return;
    }

    if (typeof value === 'bigint') {
      throw new Error(`BigInt is not allowed in ledger payload at ${path}.`);
    }

    if (typeof value === 'object') {
      if (visited.has(value)) {
        return;
      }
      visited.add(value);

      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`));
        return;
      }

      for (const [key, child] of Object.entries(value)) {
        const lowered = String(key).toLowerCase();
        if (FORBIDDEN_KEY_RE.test(lowered) || /secret|password|token|api[_-]?key|client[_-]?secret|identifier/i.test(lowered)) {
          throw new Error(`Unsafe ledger payload key rejected: ${key}`);
        }
        walk(child, `${path}.${key}`);
      }
    }
  };

  walk(payload);
}

function requireOrgId(orgId) {
  if (!orgId) {
    throw new Error('orgId is required for ledger operations.');
  }
}

function requireTx(tx) {
  if (!tx || typeof tx.query !== 'function') {
    throw new Error('appendEntry requires a transaction client (tx).');
  }
}

function getCurrentSigningKey() {
  if (!env.JOBENPAY_LEDGER_SIGNING_KEY) {
    throw new Error('JOBENPAY_LEDGER_SIGNING_KEY is required for ledger signing.');
  }
  return env.JOBENPAY_LEDGER_SIGNING_KEY;
}

function derivePublicKeyFromPrivateKey(privateKeyBase64) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });

  return crypto.createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .toString('base64');
}

function parseLegacyPublicKeys(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getVerificationKeyMap() {
  const map = new Map();
  const activePublic = derivePublicKeyFromPrivateKey(getCurrentSigningKey());
  map.set(kidFromPublicKey(activePublic), activePublic);

  for (const key of parseLegacyPublicKeys(process.env.JOBENPAY_LEDGER_OLD_PUBLIC_KEYS)) {
    map.set(kidFromPublicKey(key), key);
  }

  return map;
}

function ensureType(value) {
  if (!Object.values(LEDGER_TYPES).includes(value)) {
    throw new Error(`Unsupported ledger type: ${value}`);
  }
}

export async function appendEntry(tx, { orgId, type, subjectType, subjectId, payload }) {
  requireOrgId(orgId);
  requireTx(tx);
  ensureType(type);
  assertSafePayload(payload);

  const privateKey = getCurrentSigningKey();
  const publicKey = derivePublicKeyFromPrivateKey(privateKey);
  const kid = kidFromPublicKey(publicKey);

  await tx.query(
    `INSERT INTO ledger_heads (org_id, last_seq, last_hash)
     VALUES ($1, 0, $2)
     ON CONFLICT (org_id) DO NOTHING`,
    [orgId, ZERO_HASH],
  );

  const head = await tx.query(
    `SELECT last_seq, last_hash
     FROM ledger_heads
     WHERE org_id = $1
     FOR UPDATE`,
    [orgId],
  );

  const row = head.rows[0];
  const lastSeq = Number(row?.last_seq ?? 0);
  const prevHash = row?.last_hash ?? ZERO_HASH;
  const seq = lastSeq + 1;
  const createdAtIso = new Date().toISOString();
  const canonical = canonicalJson(payload ?? {});
  const entryHash = crypto.createHash('sha256')
    .update(`${prevHash}\n${canonical}\n${seq}\n${orgId}\n${type}\n${createdAtIso}`)
    .digest('hex');
  const signature = signEd25519(privateKey, entryHash);

  await tx.query(
    `INSERT INTO ledger_entries (
      org_id, seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [orgId, seq, type, subjectType ?? null, subjectId ?? null, payload ?? {}, prevHash, entryHash, signature, kid, createdAtIso],
  );

  await tx.query(
    `UPDATE ledger_heads
     SET last_seq = $1, last_hash = $2
     WHERE org_id = $3`,
    [seq, entryHash, orgId],
  );

  return { seq, entryHash };
}

export async function verifyChain(orgId) {
  requireOrgId(orgId);

  const headResult = await query('SELECT last_seq, last_hash FROM ledger_heads WHERE org_id = $1', [orgId]);
  const headRow = headResult.rows[0] ?? null;
  const keys = getVerificationKeyMap();

  let checkedEntries = 0;
  let expectedSeq = 1;
  let prevHash = ZERO_HASH;
  let firstBrokenSeq = null;
  let reason = 'valid';

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const rowsResult = await query(
      `SELECT seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, created_at
       FROM ledger_entries
       WHERE org_id = $1
       ORDER BY seq ASC
       LIMIT $2 OFFSET $3`,
      [orgId, BATCH_SIZE, offset],
    );

    const rows = rowsResult.rows;
    if (rows.length === 0) {
      break;
    }

    for (const row of rows) {
      checkedEntries += 1;
      const seq = Number(row.seq);

      if (seq !== expectedSeq) {
        firstBrokenSeq = expectedSeq;
        reason = `sequence gap or reorder: expected ${expectedSeq}, found ${seq}`;
        return { valid: false, checkedEntries, firstBrokenSeq, reason };
      }

      if (row.prev_hash !== prevHash) {
        firstBrokenSeq = seq;
        reason = `prev_hash mismatch at seq ${seq}: expected ${prevHash}, found ${row.prev_hash}`;
        return { valid: false, checkedEntries, firstBrokenSeq, reason };
      }

      const createdAtIso = new Date(row.created_at).toISOString();
      const expectedEntryHash = crypto.createHash('sha256')
        .update(`${row.prev_hash}\n${canonicalJson(row.payload ?? {})}\n${seq}\n${orgId}\n${row.type}\n${createdAtIso}`)
        .digest('hex');

      if (expectedEntryHash !== row.entry_hash) {
        firstBrokenSeq = seq;
        reason = `entry_hash mismatch at seq ${seq}`;
        return { valid: false, checkedEntries, firstBrokenSeq, reason };
      }

      const pubKey = keys.get(row.kid);
      if (!pubKey) {
        firstBrokenSeq = seq;
        reason = `unknown or missing verification key for kid ${row.kid}`;
        return { valid: false, checkedEntries, firstBrokenSeq, reason };
      }

      const signatureValid = verifyEd25519(pubKey, row.signature, row.entry_hash);
      if (!signatureValid) {
        firstBrokenSeq = seq;
        reason = `signature mismatch at seq ${seq}`;
        return { valid: false, checkedEntries, firstBrokenSeq, reason };
      }

      prevHash = row.entry_hash;
      expectedSeq += 1;
    }
  }

  if (headRow) {
    const lastSeq = Number(headRow.last_seq ?? 0);
    if (lastSeq !== checkedEntries) {
      firstBrokenSeq = checkedEntries + 1;
      reason = `ledger_heads.last_seq mismatch: expected ${checkedEntries}, found ${lastSeq}`;
      return { valid: false, checkedEntries, firstBrokenSeq, reason };
    }

    if (headRow.last_hash !== prevHash) {
      firstBrokenSeq = checkedEntries;
      reason = `ledger_heads.last_hash mismatch: expected ${prevHash}, found ${headRow.last_hash}`;
      return { valid: false, checkedEntries, firstBrokenSeq, reason };
    }
  }

  if (checkedEntries === 0 && headRow) {
    firstBrokenSeq = 1;
    reason = 'head exists without entries';
    return { valid: false, checkedEntries, firstBrokenSeq, reason };
  }

  return { valid: true, checkedEntries, firstBrokenSeq: null, reason: 'valid' };
}

export async function* exportLedger(orgId, { format = 'json' } = {}) {
  requireOrgId(orgId);
  if (format !== 'json') {
    throw new Error('Only JSON ledger export is supported in this tier.');
  }

  let offset = 0;
  let emitted = false;

  yield '[';

  while (true) {
    const rows = await query(
      `SELECT org_id, seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, created_at
       FROM ledger_entries
       WHERE org_id = $1
       ORDER BY seq ASC
       LIMIT $2 OFFSET $3`,
      [orgId, BATCH_SIZE, offset],
    );

    if (rows.rowCount === 0) {
      break;
    }

    for (const row of rows.rows) {
      const entry = {
        org_id: row.org_id,
        seq: Number(row.seq),
        type: row.type,
        subject_type: row.subject_type,
        subject_id: row.subject_id,
        payload: row.payload,
        prev_hash: row.prev_hash,
        entry_hash: row.entry_hash,
        signature: row.signature,
        kid: row.kid,
        created_at: new Date(row.created_at).toISOString(),
      };

      if (emitted) {
        yield ',';
      }

      yield JSON.stringify(entry);
      emitted = true;
    }

    offset += rows.rows.length;
  }

  yield ']';
}

export async function listOrgIds() {
  const result = await query('SELECT DISTINCT org_id FROM ledger_entries ORDER BY org_id');
  return result.rows.map((row) => row.org_id);
}

export default {
  LEDGER_TYPES,
  assertSafePayload,
  appendEntry,
  verifyChain,
  exportLedger,
  listOrgIds,
};
