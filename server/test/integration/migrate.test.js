import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { runMigrations } from '../../scripts/migrate.js';
import { reserve } from '../../src/services/budget.js';
import { withTx } from '../../src/db/tx.js';

const hasDatabaseEnv = Boolean(process.env.TEST_DATABASE_URL);

test('migration suite is available when a test database is configured', { skip: !hasDatabaseEnv }, async () => {
  const connectionString = process.env.TEST_DATABASE_URL;
  const admin = new pg.Client({ connectionString });
  await admin.connect();

  try {
    await admin.query('SELECT 1');
  } finally {
    await admin.end();
  }

  await runMigrations(connectionString);

  const client = new pg.Client({ connectionString });
  const pool = new pg.Pool({ connectionString, max: 10 });
  await client.connect();

  try {
    const tableCheck = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('users','mandates','mandate_versions','mandate_budget_periods','ledger_entries','jobs')
    `);

    assert.ok(tableCheck.rowCount >= 6);

    const orgSlug = `org-a-${randomUUID()}`;
    const insert = await client.query(`
      INSERT INTO organizations (name, slug) VALUES ($1, $2)
      RETURNING id
    `, [`Org ${orgSlug}`, orgSlug]);
    const orgId = insert.rows[0].id;

    await client.query(`
      INSERT INTO agents (org_id, name, status) VALUES ($1, 'Test Agent', 'ACTIVE'), ($2, 'Other Agent', 'ACTIVE')
    `, [orgId, orgId]);

    const mandate = await client.query(`
      INSERT INTO mandates (org_id, agent_id, name, status)
      VALUES ($1, (SELECT id FROM agents WHERE org_id = $1 LIMIT 1), 'Primary', 'ACTIVE')
      RETURNING id
    `, [orgId]);

    await client.query(`
      INSERT INTO mandate_versions (org_id, mandate_id, version, policy, policy_canonical, policy_hash, signature, signing_kid, valid_from, valid_to, prompt_version)
    VALUES ($1, $2, 1,
      '{"currency":"USD","budget":{"limitMinor":100},"schedule":{"timezone":"UTC"}}',
      '{}', 'hash', 'sig', 'kid', now(), now() + interval '1 day', 'p1')
    `, [orgId, mandate.rows[0].id]);

    const versionId = (await client.query(
      'SELECT id FROM mandate_versions WHERE mandate_id = $1 AND version = 1',
      [mandate.rows[0].id],
    )).rows[0].id;
    await client.query(
      'UPDATE mandates SET current_version_id = $1 WHERE id = $2',
      [versionId, mandate.rows[0].id],
    );

    const attempts = await Promise.allSettled(Array.from({ length: 50 }, () => (
      withTx((tx) => reserve(tx, versionId, 20), pool)
    )));
    const successfulReservations = attempts.filter((attempt) => attempt.status === 'fulfilled').length;
    assert.equal(successfulReservations, 5);
    assert.ok(successfulReservations * 20 <= 100);
    const reservedPeriod = await client.query(
      'SELECT reserved_minor, spent_minor, limit_minor FROM mandate_budget_periods WHERE version_id = $1',
      [versionId],
    );
    assert.deepEqual(reservedPeriod.rows[0], {
      reserved_minor: '100',
      spent_minor: '0',
      limit_minor: '100',
    });

    const periodRows = [
      { limit_minor: 100n, reserved_minor: 40n, spent_minor: 61n },
      { limit_minor: 100n, reserved_minor: 50n, spent_minor: 51n },
      { limit_minor: 100n, reserved_minor: 40n, spent_minor: 70n },
    ];

    for (const row of periodRows) {
      await assert.rejects(async () => {
        await client.query(
          `INSERT INTO mandate_budget_periods (org_id, version_id, period_start, period_end, limit_minor, reserved_minor, spent_minor, currency)
           VALUES ($1, $2, now(), now() + interval '1 month', $3, $4, $5, 'USD')`,
          [orgId, (await client.query('SELECT id FROM mandate_versions WHERE mandate_id = $1 LIMIT 1', [mandate.rows[0].id])).rows[0].id, row.limit_minor, row.reserved_minor, row.spent_minor],
        );
      }, /reserved_minor|spent_minor|check/i);
    }

    await client.query(`
      INSERT INTO ledger_entries (org_id, seq, type, subject_type, subject_id, payload, prev_hash, entry_hash, signature, kid, created_at)
      VALUES ($1, 1, 'INIT', 'ORG', $1, '{}', 'prev', 'hash', 'sig', 'kid', now())
    `, [orgId]);

    await assert.rejects(async () => {
      await client.query(`UPDATE ledger_entries SET payload = '{"x":1}' WHERE org_id = $1 AND seq = 1`, [orgId]);
    }, /immutable/i);

    await assert.rejects(async () => {
      await client.query(`DELETE FROM ledger_entries WHERE org_id = $1 AND seq = 1`, [orgId]);
    }, /immutable/i);

    await client.query(
      'UPDATE mandate_versions SET activated_at = now() WHERE mandate_id = $1',
      [mandate.rows[0].id],
    );
    await assert.rejects(async () => {
      await client.query(`UPDATE mandate_versions SET policy = '{}' WHERE mandate_id = $1`, [mandate.rows[0].id]);
    }, /immutable/i);

    await assert.rejects(async () => {
      await client.query(`DELETE FROM mandate_versions WHERE mandate_id = $1`, [mandate.rows[0].id]);
    }, /immutable/i);

    await client.query('ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable');
    try {
      await client.query('DELETE FROM ledger_entries WHERE org_id = $1', [orgId]);
      await client.query('DELETE FROM ledger_heads WHERE org_id = $1', [orgId]);
    } finally {
      await client.query('ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable');
    }

    await runMigrations(connectionString);
  } finally {
    await pool.end();
    await client.end();
  }
});
