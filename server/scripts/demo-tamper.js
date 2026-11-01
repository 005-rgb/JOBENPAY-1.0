import { createHash } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { canonicalJson } from '../../shared/canonical.js';
import { verifyChain } from '../src/services/ledger.js';

const { Client } = pg;

function usage() {
  return 'Usage: npm run demo:tamper -- --i-know --org <demo-org-uuid> --seq <sequence> [--restore]';
}

function parseArgs(args) {
  const parsed = { confirmed: args.includes('--i-know'), restore: args.includes('--restore') };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--org') parsed.orgId = args[index + 1];
    if (args[index] === '--seq') parsed.seq = Number(args[index + 1]);
  }
  return parsed;
}

function defaultSnapshotPath(connectionString) {
  const fingerprint = createHash('sha256').update(connectionString).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `jobenpay-demo-tamper-${fingerprint}.json`);
}

function mutateString(value) {
  const bytes = Buffer.from(value, 'utf8');
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] >= 0x20 && bytes[index] <= 0x7e) {
      bytes[index] = bytes[index] === 0x41 ? 0x42 : 0x41;
      return bytes.toString('utf8');
    }
  }
  return null;
}

function mutatePayload(payload) {
  let changed = false;
  const walk = (value) => {
    if (typeof value === 'string') {
      if (changed) return value;
      const replacement = mutateString(value);
      if (replacement !== null) changed = true;
      return replacement ?? value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child)]));
    }
    return value;
  };
  const result = walk(payload);
  if (!changed) throw new Error('Ledger payload has no printable ASCII byte to change.');
  return result;
}

async function assertDemoOrganization(client, orgId, requiredSlug = 'jobenpay-demo') {
  const result = await client.query('SELECT slug FROM organizations WHERE id = $1 LIMIT 1', [orgId]);
  if (result.rows[0]?.slug !== requiredSlug) {
    throw new Error('The requested organization is not the synthetic demo organization.');
  }
}

async function updatePayload(client, { orgId, seq, payload }) {
  await client.query('BEGIN');
  try {
    await client.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable');
    const updated = await client.query(
      'UPDATE ledger_entries SET payload = $3::jsonb WHERE org_id = $1 AND seq = $2',
      [orgId, seq, JSON.stringify(payload)],
    );
    if (updated.rowCount !== 1) throw new Error('The selected ledger entry no longer exists.');
    await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

export async function runDemoTamper(client, {
  orgId,
  seq,
  connectionString,
  snapshotPath = defaultSnapshotPath(connectionString),
  requiredSlug = 'jobenpay-demo',
  verify = verifyChain,
} = {}) {
  if (!orgId || !Number.isSafeInteger(seq) || seq < 1 || !connectionString) {
    throw new TypeError('orgId, positive seq, and connectionString are required.');
  }
  await assertDemoOrganization(client, orgId, requiredSlug);
  const baseline = await verify(orgId);
  if (!baseline.valid) {
    throw new Error(`The demo ledger must verify cleanly before tampering; first broken sequence is ${baseline.firstBrokenSeq}.`);
  }
  const selected = await client.query(
    'SELECT payload FROM ledger_entries WHERE org_id = $1 AND seq = $2 LIMIT 1',
    [orgId, seq],
  );
  if (!selected.rowCount) throw new Error('The selected ledger entry does not exist.');
  const originalPayload = selected.rows[0].payload ?? {};
  const tamperedPayload = mutatePayload(originalPayload);
  const snapshot = {
    databaseFingerprint: createHash('sha256').update(connectionString).digest('hex'),
    orgId,
    seq,
    originalPayload,
    tamperedPayload,
  };
  await writeFile(snapshotPath, JSON.stringify(snapshot), { flag: 'wx', mode: 0o600 });
  try {
    await updatePayload(client, { orgId, seq, payload: tamperedPayload });
  } catch (error) {
    await rm(snapshotPath, { force: true });
    throw error;
  }
  const verification = await verify(orgId);
  if (verification.firstBrokenSeq !== seq) {
    throw new Error(`Tamper verification detected sequence ${verification.firstBrokenSeq}, expected ${seq}.`);
  }
  return { orgId, seq, valid: verification.valid, firstBrokenSeq: verification.firstBrokenSeq };
}

export async function restoreDemoTamper(client, {
  connectionString,
  snapshotPath = defaultSnapshotPath(connectionString),
  requiredSlug = 'jobenpay-demo',
  verify = verifyChain,
} = {}) {
  if (!connectionString) throw new TypeError('connectionString is required.');
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  const fingerprint = createHash('sha256').update(connectionString).digest('hex');
  if (snapshot.databaseFingerprint !== fingerprint) {
    throw new Error('The restore snapshot belongs to a different database.');
  }
  await assertDemoOrganization(client, snapshot.orgId, requiredSlug);
  const selected = await client.query(
    'SELECT payload FROM ledger_entries WHERE org_id = $1 AND seq = $2 LIMIT 1',
    [snapshot.orgId, snapshot.seq],
  );
  if (!selected.rowCount || canonicalJson(selected.rows[0].payload ?? {}) !== canonicalJson(snapshot.tamperedPayload)) {
    throw new Error('The selected entry changed after the demo tamper; refusing to overwrite it.');
  }
  await updatePayload(client, {
    orgId: snapshot.orgId,
    seq: snapshot.seq,
    payload: snapshot.originalPayload,
  });
  const verification = await verify(snapshot.orgId);
  if (!verification.valid) {
    throw new Error(`Ledger is still invalid after restore at sequence ${verification.firstBrokenSeq}.`);
  }
  await rm(snapshotPath, { force: true });
  return { orgId: snapshot.orgId, seq: snapshot.seq, valid: true };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.env.NODE_ENV === 'production' || !options.confirmed) {
    throw new Error(`Demo tampering is disabled in production and requires --i-know. ${usage()}`);
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  if (!options.restore && (!options.orgId || !Number.isSafeInteger(options.seq) || options.seq < 1)) {
    throw new Error(usage());
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = options.restore
      ? await restoreDemoTamper(client, { connectionString })
      : await runDemoTamper(client, {
        orgId: options.orgId,
        seq: options.seq,
        connectionString,
      });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`Demo tamper failed: ${error.message}`);
    process.exitCode = 1;
  });
}
