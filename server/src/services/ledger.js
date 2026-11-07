import crypto from 'node:crypto';

import { canonicalJson } from '../../../shared/canonical.js';
import { env } from '../config.js';
import { query } from '../db/pool.js';
import { kidFromPublicKey, signEd25519, verifyEd25519 } from '../lib/crypto.js';

export const LEDGER_TYPES = Object.freeze({
  MANDATE_ACTIVATED: 'MANDATE_ACTIVATED',
  MANDATE_SUSPENDED: 'MANDATE_SUSPENDED',
  MANDATE_REVOKED: 'MANDATE_REVOKED',
  MANDATE_EXPIRED: 'MANDATE_EXPIRED',
  REQUEST_RECEIVED: 'REQUEST_RECEIVED',
  REQUEST_EVALUATING: 'REQUEST_EVALUATING',
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
  LEGS_POSTED: 'LEGS_POSTED',
  TRANSACTION_POSTED: 'TRANSACTION_POSTED',
  ENTRY: 'ENTRY',
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

/**
 * Computes deterministic canonical legs hash per AD-02:
 * 1. Sort legs by account_ref ASC, leg_type ASC, currency ASC, amount_minor ASC.
 * 2. Format each line: {account_ref}:{leg_type}:{currency}:{amount_minor}
 * 3. Join with \n.
 * 4. SHA-256 hex digest.
 */
export function computeLegsHash(legs) {
  if (!Array.isArray(legs) || legs.length === 0) {
    return null;
  }

  const sorted = [...legs].sort((a, b) => {
    const accCmp = String(a.account_ref ?? '').localeCompare(String(b.account_ref ?? ''));
    if (accCmp !== 0) return accCmp;

    const typeCmp = String(a.leg_type ?? '').localeCompare(String(b.leg_type ?? ''));
    if (typeCmp !== 0) return typeCmp;

    const curCmp = String(a.currency ?? '').localeCompare(String(b.currency ?? ''));
    if (curCmp !== 0) return curCmp;

    const aAmount = String(a.amount_minor ?? '0');
    const bAmount = String(b.amount_minor ?? '0');
    if (aAmount === bAmount) return 0;
    try {
      const aBig = BigInt(aAmount);
      const bBig = BigInt(bAmount);
      return aBig < bBig ? -1 : 1;
    } catch {
      return aAmount.localeCompare(bAmount);
    }
  });

  const lines = sorted.map((leg) => {
    const acc = leg.account_ref ?? '';
    const type = leg.leg_type ?? '';
    const cur = leg.currency ?? '';
    const amt = String(leg.amount_minor ?? '0');
    return `${acc}:${type}:${cur}:${amt}`;
  });

  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex');
}

/**
 * Appends an entry to the hash-chained Ed25519 signed ledger.
 * Polymorphic signatures:
 * - appendEntry(tx, { orgId, type, subjectType, subjectId, payload, entryId, legs })
 * - appendEntry(tx, orgId, payload)
 */
export async function appendEntry(tx, optionsOrOrgId, maybePayload) {
  requireTx(tx);

  let orgId;
  let type;
  let subjectType;
  let subjectId;
  let payload;
  let entryId;

  if (typeof optionsOrOrgId === 'string') {
    orgId = optionsOrOrgId;
    payload = maybePayload ?? {};
    type = payload.type || LEDGER_TYPES.REQUEST_RECEIVED;
    subjectType = payload.subject_type || payload.subjectType || null;
    subjectId = payload.subject_id || payload.subjectId || null;
    entryId = payload.entry_id || payload.entryId || null;
    if (payload.legs && !payload.legs_hash) {
      const legsHash = computeLegsHash(payload.legs);
      if (legsHash) {
        payload = { ...payload, legs_hash: legsHash };
      }
    }
  } else if (optionsOrOrgId && typeof optionsOrOrgId === 'object') {
    orgId = optionsOrOrgId.orgId;
    type = optionsOrOrgId.type || LEDGER_TYPES.REQUEST_RECEIVED;
    subjectType = optionsOrOrgId.subjectType ?? null;
    subjectId = optionsOrOrgId.subjectId ?? null;
    payload = optionsOrOrgId.payload ?? {};
    entryId = optionsOrOrgId.entryId ?? optionsOrOrgId.entry_id ?? null;
    if (optionsOrOrgId.legs && !payload.legs_hash) {
      const legsHash = computeLegsHash(optionsOrOrgId.legs);
      if (legsHash) {
        payload = { ...payload, legs_hash: legsHash };
      }
    }
  } else {
    throw new Error('orgId is required for ledger operations.');
  }

  requireOrgId(orgId);
  ensureType(type);
  assertSafePayload(payload);

  const privateKey = getCurrentSigningKey();
  const publicKey = derivePublicKeyFromPrivateKey(privateKey);
  const kid = kidFromPublicKey(publicKey);
  const signingKeyId = kid;

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
  const finalEntryId = entryId || crypto.randomUUID();

  await tx.query(
    `INSERT INTO ledger_entries (
      org_id, seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, signing_key_id, created_at, entry_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [orgId, seq, type, subjectType ?? null, subjectId ?? null, payload ?? {}, prevHash, entryHash, signature, kid, signingKeyId, createdAtIso, finalEntryId],
  );

  await tx.query(
    `UPDATE ledger_heads
     SET last_seq = $1, last_hash = $2
     WHERE org_id = $3`,
    [seq, entryHash, orgId],
  );

  return { seq, entryHash, entryId: finalEntryId, signingKeyId, prevHash };
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
      `SELECT seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, signing_key_id, entry_id, created_at
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

      const keyId = row.kid || row.signing_key_id;
      const pubKey = keys.get(keyId);
      if (!pubKey) {
        firstBrokenSeq = seq;
        reason = `unknown or missing verification key for kid ${keyId}`;
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

  if (!headRow && checkedEntries > 0) {
    firstBrokenSeq = checkedEntries;
    reason = 'ledger head is missing';
    return { valid: false, checkedEntries, firstBrokenSeq, reason };
  }

  if (headRow) {
    const lastSeq = Number(headRow.last_seq ?? 0);
    if (lastSeq !== checkedEntries) {
      firstBrokenSeq = Math.min(lastSeq, checkedEntries) + 1;
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

export function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Mitigate CSV Formula Injection: if str starts with =, +, -, @, \t, \r, prepend a single quote
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  // Wrap in quotes if cell contains commas, newlines, or quotes
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export async function* exportLedger(orgId, { format = 'json' } = {}) {
  requireOrgId(orgId);
  if (format !== 'json' && format !== 'csv') {
    throw new Error(`Unsupported ledger export format: ${format}. Supported formats are json and csv.`);
  }

  if (format === 'csv') {
    yield 'seq,created_at,type,subject_type,subject_id,entry_hash,prev_hash,kid,signature,payload\r\n';
    let offset = 0;
    while (true) {
      const rows = await query(
        `SELECT org_id, seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, signing_key_id, entry_id, created_at
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
        const line = [
          row.seq,
          new Date(row.created_at).toISOString(),
          escapeCsvCell(row.type),
          escapeCsvCell(row.subject_type),
          escapeCsvCell(row.subject_id),
          row.entry_hash,
          row.prev_hash,
          escapeCsvCell(row.kid),
          escapeCsvCell(row.signature),
          escapeCsvCell(row.payload),
        ].join(',') + '\r\n';

        yield line;
      }

      offset += rows.rows.length;
    }
    return;
  }

  let offset = 0;
  let emitted = false;

  yield '[';

  while (true) {
    const rows = await query(
      `SELECT org_id, seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, signing_key_id, entry_id, created_at
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
        signing_key_id: row.signing_key_id ?? row.kid,
        entry_id: row.entry_id ?? null,
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

export const exportChain = exportLedger;

/**
 * Cross-verifies that transaction legs in database match canonical legs_hash in ledger_entries per AD-02.
 */
export async function verifyIntentLegs(client, orgId, intentId) {
  requireOrgId(orgId);
  if (!intentId) throw new Error('intentId is required.');

  const legsResult = await client.query(
    `SELECT leg_id, intent_id, leg_type, amount_minor, currency, account_ref, status, external_ref, created_at
     FROM transaction_legs
     WHERE intent_id = $1
     ORDER BY account_ref ASC, leg_type ASC, currency ASC, amount_minor ASC`,
    [intentId],
  );

  const legs = legsResult.rows;
  const calculatedLegsHash = computeLegsHash(legs);

  const entryResult = await client.query(
    `SELECT seq, payload, entry_hash
     FROM ledger_entries
     WHERE org_id = $1 AND (subject_id = $2 OR payload->>'intent_id' = $2::text)
     ORDER BY seq DESC
     LIMIT 1`,
    [orgId, intentId],
  );

  const entry = entryResult.rows[0];
  if (!entry) {
    return {
      valid: false,
      reason: `No ledger entry found for intent ${intentId}`,
      legsCount: legs.length,
      calculatedLegsHash,
      recordedLegsHash: null,
    };
  }

  const recordedLegsHash = entry.payload?.legs_hash ?? null;
  if (!recordedLegsHash) {
    return {
      valid: false,
      reason: `Ledger entry seq ${entry.seq} has no legs_hash in payload`,
      legsCount: legs.length,
      calculatedLegsHash,
      recordedLegsHash: null,
    };
  }

  if (calculatedLegsHash !== recordedLegsHash) {
    return {
      valid: false,
      reason: `Legs hash mismatch: calculated ${calculatedLegsHash}, recorded ${recordedLegsHash}`,
      legsCount: legs.length,
      calculatedLegsHash,
      recordedLegsHash,
    };
  }

  return {
    valid: true,
    reason: 'valid',
    legsCount: legs.length,
    calculatedLegsHash,
    recordedLegsHash,
  };
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
  exportChain,
  computeLegsHash,
  verifyIntentLegs,
  escapeCsvCell,
  listOrgIds,
};
