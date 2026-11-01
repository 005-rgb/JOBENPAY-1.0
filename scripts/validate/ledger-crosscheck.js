import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';

import { canonicalJson } from '../../shared/canonical.js';
import { env } from '../../server/src/config.js';

const { Client } = pg;
const ZERO_HASH = '0'.repeat(64);
const BATCH_SIZE = 500;

function publicKeyId(publicKey) {
  return crypto.createHash('sha256')
    .update(Buffer.from(publicKey, 'base64'))
    .digest('hex')
    .slice(0, 16);
}

function verificationKeys() {
  if (!env.JOBENPAY_LEDGER_SIGNING_KEY) {
    throw new Error('JOBENPAY_LEDGER_SIGNING_KEY is required for ledger verification.');
  }

  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(env.JOBENPAY_LEDGER_SIGNING_KEY, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const activePublicKey = crypto.createPublicKey(privateKey)
    .export({ format: 'der', type: 'spki' })
    .toString('base64');
  const keys = new Map([[publicKeyId(activePublicKey), activePublicKey]]);

  for (const encodedKey of String(env.JOBENPAY_LEDGER_OLD_PUBLIC_KEYS || '')
    .split(/[\n,;]+/)
    .map((key) => key.trim())
    .filter(Boolean)) {
    keys.set(publicKeyId(encodedKey), encodedKey);
  }

  return keys;
}

function createdAtIso(row) {
  const match = /^(.+T\d{2}:\d{2}:\d{2})\.(\d{6})Z$/.exec(row.created_at_precise);
  if (!match || match[2].slice(3) !== '000') {
    throw new Error(`created_at for seq ${row.seq} is not stored at millisecond precision.`);
  }

  const exactIso = `${match[1]}.${match[2].slice(0, 3)}Z`;
  if (new Date(row.created_at).toISOString() !== exactIso) {
    throw new Error(`created_at round-trip mismatch at seq ${row.seq}.`);
  }
  return exactIso;
}

async function verifyOrg(client, orgId, keys) {
  let expectedSeq = 1;
  let previousHash = ZERO_HASH;
  let checkedEntries = 0;

  for (let offset = 0; ; offset += BATCH_SIZE) {
    const result = await client.query(`
      SELECT org_id, seq, type, payload, prev_hash, entry_hash, signature, kid, created_at,
             to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_precise
      FROM public.ledger_entries
      WHERE org_id = $1
      ORDER BY seq
      LIMIT $2 OFFSET $3
    `, [orgId, BATCH_SIZE, offset]);
    if (result.rows.length === 0) break;

    for (const row of result.rows) {
      const seq = Number(row.seq);
      if (seq !== expectedSeq) {
        return { valid: false, checkedEntries, firstBrokenSeq: expectedSeq, reason: `expected sequence ${expectedSeq}, found ${seq}` };
      }
      if (row.prev_hash !== previousHash) {
        return { valid: false, checkedEntries, firstBrokenSeq: seq, reason: 'previous hash mismatch' };
      }

      let timestamp;
      try {
        timestamp = createdAtIso(row);
      } catch (error) {
        return { valid: false, checkedEntries, firstBrokenSeq: seq, reason: error.message };
      }

      const expectedHash = crypto.createHash('sha256')
        .update(`${row.prev_hash}\n${canonicalJson(row.payload ?? {})}\n${seq}\n${orgId}\n${row.type}\n${timestamp}`, 'utf8')
        .digest('hex');
      if (expectedHash !== row.entry_hash) {
        return { valid: false, checkedEntries, firstBrokenSeq: seq, reason: 'entry hash mismatch' };
      }

      const encodedPublicKey = keys.get(row.kid);
      if (!encodedPublicKey) {
        return { valid: false, checkedEntries, firstBrokenSeq: seq, reason: `unknown key id ${row.kid}` };
      }
      const publicKey = crypto.createPublicKey({
        key: Buffer.from(encodedPublicKey, 'base64'),
        format: 'der',
        type: 'spki',
      });
      const signatureValid = crypto.verify(
        null,
        Buffer.from(row.entry_hash, 'utf8'),
        publicKey,
        Buffer.from(row.signature, 'base64'),
      );
      if (!signatureValid) {
        return { valid: false, checkedEntries, firstBrokenSeq: seq, reason: 'signature mismatch' };
      }

      checkedEntries += 1;
      expectedSeq += 1;
      previousHash = row.entry_hash;
    }
  }

  const headResult = await client.query(
    'SELECT last_seq, last_hash FROM public.ledger_heads WHERE org_id = $1',
    [orgId],
  );
  const head = headResult.rows[0];
  if (!head && checkedEntries > 0) {
    return { valid: false, checkedEntries, firstBrokenSeq: checkedEntries, reason: 'ledger head is missing' };
  }
  if (checkedEntries === 0 && head) {
    return { valid: false, checkedEntries, firstBrokenSeq: 1, reason: 'head exists without entries' };
  }
  if (head && (Number(head.last_seq) !== checkedEntries || head.last_hash !== previousHash)) {
    return {
      valid: false,
      checkedEntries,
      firstBrokenSeq: Number(head.last_seq) !== checkedEntries
        ? Math.min(Number(head.last_seq), checkedEntries) + 1
        : checkedEntries,
      reason: 'ledger head does not match entries',
    };
  }
  return { valid: true, checkedEntries, firstBrokenSeq: null, reason: 'valid' };
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      org: { type: 'string' },
      all: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });
  if (!values.org && !values.all) {
    console.error('Usage: node scripts/validate/ledger-crosscheck.js --org <uuid> | --all');
    process.exitCode = 2;
    return;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for ledger cross-check.');
  }

  const keys = verificationKeys();
  const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    const orgIds = values.all
      ? (await client.query('SELECT DISTINCT org_id FROM public.ledger_entries ORDER BY org_id')).rows.map((row) => row.org_id)
      : [values.org];
    let failed = false;
    for (const orgId of orgIds) {
      const result = await verifyOrg(client, orgId, keys);
      console.log(`${orgId}\t${result.valid ? 'PASS' : 'FAIL'}\tchecked=${result.checkedEntries}; firstBrokenSeq=${result.firstBrokenSeq ?? 'none'}; ${result.reason}`);
      failed ||= !result.valid;
    }
    if (failed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Ledger cross-check failed: ${error.message}`);
  process.exitCode = 1;
});
