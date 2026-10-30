import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const activeKeyPair = {
  publicKey: process.env.JOBENPAY_LEDGER_PUBLIC_KEY,
  privateKey: process.env.JOBENPAY_LEDGER_SIGNING_KEY,
};

const { generateEd25519Keys } = await import('../../src/lib/crypto.js');
if (!activeKeyPair.privateKey) {
  const generated = generateEd25519Keys();
  process.env.JOBENPAY_LEDGER_SIGNING_KEY = generated.privateKey;
  process.env.JOBENPAY_LEDGER_PUBLIC_KEY = generated.publicKey;
}

const ledgerModule = await import('../../src/services/ledger.js');
const { appendEntry, verifyChain, LEDGER_TYPES, assertSafePayload } = ledgerModule;
const { runMigrations } = await import('../../scripts/migrate.js');
const { withTx } = await import('../../src/db/tx.js');

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

async function createOrg(client) {
  const result = await client.query(`INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`, [`Org ${Date.now()}-${Math.random()}`, `org-${Date.now()}-${Math.random().toString(16).slice(2)}`]);
  return result.rows[0].id;
}

test('ledger helper guards unsafe payload keys', () => {
  assert.throws(() => assertSafePayload({ client_secret: 'value' }), /client_secret/i);
  assert.throws(() => assertSafePayload({ nested: { secret: 'value' } }), /secret/i);
  assert.doesNotThrow(() => assertSafePayload({ ok: true, nested: { safe: 'value' } }));
});

test('appendEntry writes a valid hash chain for a single org', { skip: !hasDatabase }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  await runMigrations(connectionString);

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const orgId = await createOrg(client);
    for (let i = 1; i <= 100; i += 1) {
      const result = await withTx(async (tx) => appendEntry(tx, {
        orgId,
        type: LEDGER_TYPES.REQUEST_RECEIVED,
        subjectType: 'REQUEST',
        subjectId: '11111111-1111-4111-8111-' + String(i).padStart(12, '0'),
        payload: { seq: i, event: 'created', ok: true },
      }));
      assert.equal(result.seq, i);
    }

    const verification = await verifyChain(orgId);
    assert.equal(verification.valid, true);
    assert.equal(verification.checkedEntries, 100);
    assert.equal(verification.firstBrokenSeq, null);
  } finally {
    await client.end();
  }
});

test('ledger chains are isolated by org', { skip: !hasDatabase }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const orgA = await createOrg(client);
    const orgB = await createOrg(client);
    await withTx(async (tx) => appendEntry(tx, { orgId: orgA, type: LEDGER_TYPES.REQUEST_RECEIVED, subjectType: 'REQUEST', subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', payload: { x: 1 } }));
    await withTx(async (tx) => appendEntry(tx, { orgId: orgB, type: LEDGER_TYPES.REQUEST_RECEIVED, subjectType: 'REQUEST', subjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', payload: { x: 2 } }));
    await withTx(async (tx) => appendEntry(tx, { orgId: orgA, type: LEDGER_TYPES.REQUEST_DECIDED, subjectType: 'REQUEST', subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', payload: { decision: 'approved' } }));

    const chainA = await verifyChain(orgA);
    const chainB = await verifyChain(orgB);
    assert.equal(chainA.valid, true);
    assert.equal(chainB.valid, true);
    assert.equal(chainA.checkedEntries, 2);
    assert.equal(chainB.checkedEntries, 1);
  } finally {
    await client.end();
  }
});

test('appendEntry rolled back in a transaction leaves no ledger tail', { skip: !hasDatabase }, async () => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();

  try {
    const orgId = await createOrg(client);
    await assert.rejects(async () => {
      await withTx(async (tx) => {
        await appendEntry(tx, { orgId, type: LEDGER_TYPES.REQUEST_RECEIVED, subjectType: 'REQUEST', subjectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', payload: { should: 'rollback' } });
        throw new Error('forced rollback');
      });
    }, /forced rollback/i);

    const verification = await verifyChain(orgId);
    assert.equal(verification.checkedEntries, 0);
    assert.equal(verification.valid, true);
  } finally {
    await client.end();
  }
});

test('tamper detection catches all required ledger mutations', { skip: !hasDatabase }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const orgId = await createOrg(client);
    const initial = [];
    for (let i = 1; i <= 3; i += 1) {
      const result = await withTx(async (tx) => appendEntry(tx, {
        orgId,
        type: LEDGER_TYPES.REQUEST_RECEIVED,
        subjectType: 'REQUEST',
        subjectId: `dddddddd-dddd-4ddd-8ddd-${String(i).padStart(12, '0')}`,
        payload: { seq: i, value: 'original' },
      }));
      initial.push(result);
    }

    await client.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable');

    const tamperCases = [
      { label: 'payload-byte', sql: `UPDATE ledger_entries SET payload = jsonb_set(payload, '{value}', '"changed"') WHERE org_id = $1 AND seq = 1`, params: [orgId], expectSeq: 1 },
      { label: 'delete-entry', sql: `DELETE FROM ledger_entries WHERE org_id = $1 AND seq = 2`, params: [orgId], expectSeq: 2 },
      { label: 'swap-seq', sql: `UPDATE ledger_entries SET seq = 3 WHERE org_id = $1 AND seq = 1; UPDATE ledger_entries SET seq = 1 WHERE org_id = $1 AND seq = 3`, params: [orgId], expectSeq: 1 },
      { label: 'signature', sql: `UPDATE ledger_entries SET signature = 'deadbeef' WHERE org_id = $1 AND seq = 1`, params: [orgId], expectSeq: 1 },
      { label: 'prev-hash', sql: `UPDATE ledger_entries SET prev_hash = 'ff' WHERE org_id = $1 AND seq = 2`, params: [orgId], expectSeq: 2 },
      { label: 'head', sql: `UPDATE ledger_heads SET last_hash = '00' WHERE org_id = $1`, params: [orgId], expectSeq: 3 },
    ];

    for (const tamper of tamperCases) {
      await client.query('BEGIN');
      try {
        await client.query(tamper.sql, tamper.params);
      } finally {
        await client.query('ROLLBACK');
      }

      const result = await verifyChain(orgId);
      assert.equal(result.valid, false, `expected invalid ledger after ${tamper.label}`);
      assert.equal(result.firstBrokenSeq, tamper.expectSeq, `${tamper.label} produced the wrong broken sequence`);

      // restore the clean state for the next case
      await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable');
      await client.query('TRUNCATE ledger_entries, ledger_heads RESTART IDENTITY');
      for (let i = 1; i <= 3; i += 1) {
        await withTx(async (tx) => appendEntry(tx, {
          orgId,
          type: LEDGER_TYPES.REQUEST_RECEIVED,
          subjectType: 'REQUEST',
          subjectId: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, '0')}`,
          payload: { seq: i, value: 'original' },
        }));
      }
      await client.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable');
    }
  } finally {
    await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable').catch(() => undefined);
    await client.end();
  }
});
