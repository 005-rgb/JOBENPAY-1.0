import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../src/db/pool.js';
import { randomUUID } from 'node:crypto';

test('test_entities_migration', async () => {
  const result = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'entities'
  `);
  assert.ok(result.rows.length > 0, 'entities table must exist');

  const cols = new Set(result.rows.map((r) => r.column_name));
  assert.ok(cols.has('entity_id'));
  assert.ok(cols.has('entity_type'));
  assert.ok(cols.has('org_id'));
  assert.ok(cols.has('display_name'));
  assert.ok(cols.has('legal_entity_lei'));
  assert.ok(cols.has('public_key_jwk'));
  assert.ok(cols.has('status'));
  assert.ok(cols.has('reputation_score'));
  assert.ok(cols.has('environment'));

  // Test insert valid entity
  const orgResult = await pool.query('SELECT id FROM organizations LIMIT 1');
  assert.ok(orgResult.rows.length > 0, 'organizations must have at least one record');
  const orgId = orgResult.rows[0].id;

  // Clean up any existing ISSUER for this org in SANDBOX to satisfy unique(org_id, environment, entity_type)
  await pool.query(
    "DELETE FROM entities WHERE org_id = $1 AND entity_type = 'ISSUER' AND environment = 'SANDBOX'",
    [orgId]
  );

  const testEntityId = randomUUID();
  await pool.query(
    `INSERT INTO entities (entity_id, entity_type, org_id, display_name, legal_entity_lei, status, reputation_score)
     VALUES ($1, 'ISSUER', $2, 'Test Issuer Inc', '5493001KJTIIGC8Y1R12', 'ACTIVE', 85)`,
    [testEntityId, orgId],
  );

  const inserted = await pool.query('SELECT * FROM entities WHERE entity_id = $1', [testEntityId]);
  assert.equal(inserted.rows.length, 1);
  assert.equal(inserted.rows[0].entity_type, 'ISSUER');
  assert.equal(inserted.rows[0].reputation_score, 85);

  // Clean up
  await pool.query('DELETE FROM entities WHERE entity_id = $1', [testEntityId]);
});

test('test_escrow_type_check', async () => {
  const orgResult = await pool.query('SELECT id FROM organizations LIMIT 1');
  const orgId = orgResult.rows[0].id;

  // 1. Invalid escrow_type must be rejected
  await assert.rejects(
    async () => {
      await pool.query(
        `INSERT INTO escrow_accounts (org_id, escrow_type, held_minor, released_minor, slashed_minor, status)
         VALUES ($1, 'INVALID_TYPE', 100, 0, 0, 'FUNDED')`,
        [orgId],
      );
    },
    /check constraint|chk_escrow_type_ref|invalid/i,
  );

  // 2. Reference alignment check: PACT requires contract_id and no split_id or dp_id
  await assert.rejects(
    async () => {
      await pool.query(
        `INSERT INTO escrow_accounts (org_id, escrow_type, contract_id, split_id, held_minor, released_minor, slashed_minor, status)
         VALUES ($1, 'PACT', $2, $3, 100, 0, 0, 'FUNDED')`,
        [orgId, randomUUID(), randomUUID()],
      );
    },
    /chk_escrow_type_ref/i,
  );

  // 3. Valid SPLIT insert with split_id
  const testSplitId = randomUUID();
  const insertSplit = await pool.query(
    `INSERT INTO escrow_accounts (org_id, escrow_type, split_id, held_minor, released_minor, slashed_minor, status)
     VALUES ($1, 'SPLIT', $2, 5000, 0, 0, 'FUNDED')
     RETURNING escrow_id, escrow_type`,
    [orgId, testSplitId],
  );
  assert.equal(insertSplit.rows[0].escrow_type, 'SPLIT');

  // Clean up
  await pool.query('DELETE FROM escrow_accounts WHERE escrow_id = $1', [insertSplit.rows[0].escrow_id]);
});

test('test_outcome_contract_migration', async () => {
  const result = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'outcome_contracts'
  `);
  assert.ok(result.rows.length > 0, 'outcome_contracts table must exist');

  const cols = new Set(result.rows.map((r) => r.column_name));
  assert.ok(cols.has('contract_id'));
  assert.ok(cols.has('contract_type'));
  assert.ok(cols.has('org_id'));
  assert.ok(cols.has('counterparty_id'));
  assert.ok(cols.has('amount_minor'));
  assert.ok(cols.has('currency'));
  assert.ok(cols.has('due_date'));
  assert.ok(cols.has('criteria'));
  assert.ok(cols.has('status'));
  assert.ok(cols.has('environment'));
  assert.ok(cols.has('created_at'));
});

test.after(async () => {
  await pool.end();
});
