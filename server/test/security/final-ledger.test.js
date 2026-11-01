import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { runMigrations } from '../../scripts/migrate.js';
import pool from '../../src/db/pool.js';
import { withTx } from '../../src/db/tx.js';
import { appendEntry, LEDGER_TYPES, verifyChain } from '../../src/services/ledger.js';

const connectionString = process.env.TEST_DATABASE_URL;

async function appendFixture(orgId, prefix) {
  for (let seq = 1; seq <= 3; seq += 1) {
    await withTx((tx) => appendEntry(tx, {
      orgId,
      type: LEDGER_TYPES.REQUEST_RECEIVED,
      subjectType: 'SECURITY_TEST',
      subjectId: crypto.randomUUID(),
      payload: { fixture: prefix, seq },
    }));
  }
}

test('after all test suites every ledger verifies and six tamper classes are detected', {
  skip: !connectionString,
}, async () => {
  await runMigrations(connectionString);
  const organizations = await pool.query(`
    SELECT DISTINCT org_id FROM ledger_entries ORDER BY org_id
  `);
  for (const { org_id: orgId } of organizations.rows) {
    const result = await verifyChain(orgId);
    assert.equal(result.valid, true, `ledger for ${orgId} must be valid after the full suite: ${result.reason}`);
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  const orgId = crypto.randomUUID();
  const slug = `s17-final-${orgId}`;
  let triggerDisabled = false;
  try {
    await client.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      orgId, 'SYNTHETIC final ledger verification', slug,
    ]);
    await appendFixture(orgId, 'original');
    await client.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable');
    triggerDisabled = true;

    const cases = [
      {
        name: 'payload byte',
        statements: [`UPDATE ledger_entries SET payload = jsonb_set(payload, '{fixture}', '"modified"') WHERE org_id = $1 AND seq = 1`],
        brokenSeq: 1,
      },
      {
        name: 'entry deletion',
        statements: [`DELETE FROM ledger_entries WHERE org_id = $1 AND seq = 2`],
        brokenSeq: 2,
      },
      {
        name: 'sequence reorder',
        statements: [
          'UPDATE ledger_entries SET seq = 4 WHERE org_id = $1 AND seq = 3',
          'UPDATE ledger_entries SET seq = 3 WHERE org_id = $1 AND seq = 1',
          'UPDATE ledger_entries SET seq = 1 WHERE org_id = $1 AND seq = 4',
        ],
        brokenSeq: 1,
      },
      {
        name: 'signature',
        statements: [`UPDATE ledger_entries SET signature = 'deadbeef' WHERE org_id = $1 AND seq = 1`],
        brokenSeq: 1,
      },
      {
        name: 'previous hash',
        statements: [`UPDATE ledger_entries SET prev_hash = repeat('f', 64) WHERE org_id = $1 AND seq = 2`],
        brokenSeq: 2,
      },
      {
        name: 'ledger head',
        statements: [`UPDATE ledger_heads SET last_hash = repeat('0', 64) WHERE org_id = $1`],
        brokenSeq: 3,
      },
    ];

    for (const [index, tamper] of cases.entries()) {
      await client.query('BEGIN');
      try {
        for (const statement of tamper.statements) await client.query(statement, [orgId]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      const verification = await verifyChain(orgId);
      assert.equal(verification.valid, false, `${tamper.name} must be detected`);
      assert.equal(verification.firstBrokenSeq, tamper.brokenSeq, `${tamper.name} reports the first broken sequence`);

      await client.query('DELETE FROM ledger_entries WHERE org_id = $1', [orgId]);
      await client.query('DELETE FROM ledger_heads WHERE org_id = $1', [orgId]);
      await appendFixture(orgId, `restored-${index}`);
    }
    await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable');
    triggerDisabled = false;
    assert.equal((await verifyChain(orgId)).valid, true);

    console.log(`S17 ledger security: ${organizations.rowCount} existing org ledgers verified; ${cases.length}/${cases.length} tamper classes detected.`);
  } finally {
    if (triggerDisabled) {
      await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable').catch(() => undefined);
    }
    await client.end();
  }
});
