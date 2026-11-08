// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { pool } from '../../src/db/pool.js';

test('unified fase 0 ops api integration', async (t) => {
  let appInfo;
  let testOrgId;

  t.before(async () => {
    appInfo = await startTestApp();
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length > 0) {
      testOrgId = orgRes.rows[0].id;
    } else {
      testOrgId = randomUUID();
      await pool.query(
        `INSERT INTO organizations (id, name, slug) VALUES ($1, 'Fase0 Test Org', 'fase0-test-org')`,
        [testOrgId],
      );
    }
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.end();
  });

  await t.test('GET /api/v1/ops/fail-closed-matrix returns full failure matrix', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/fail-closed-matrix`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.matrix);
    assert.ok(data.matrix.DB_UNAVAILABLE);
    assert.equal(data.matrix.DB_UNAVAILABLE.outcome, 'REJECT');
    assert.equal(data.matrix.DB_UNAVAILABLE.alert, 'critical');
    assert.ok(data.matrix.DIP_INDETERMINATE);
    assert.equal(data.matrix.DIP_INDETERMINATE.outcome, 'REQUIRE_APPROVAL');
  });

  let createdEntityId;
  await t.test('POST /api/v1/ops/entities registers new entity', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/entities`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': testOrgId,
      },
      body: JSON.stringify({
        entity_type: 'ISSUER',
        display_name: 'Fase0 Acme Entity',
        legal_entity_lei: '5493001KJTIIGC8Y1R12',
        public_key_jwk: { kty: 'OKP', crv: 'Ed25519', x: 'abc123xyz' },
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.entity_id);
    assert.equal(data.status, 'ACTIVE');
    assert.ok(data.created_at);
    createdEntityId = data.entity_id;
  });

  await t.test('GET /api/v1/ops/entities lists registered entities', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/entities`, {
      headers: {
        'x-org-id': testOrgId,
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.entities));
    const found = data.entities.find((e) => e.entity_id === createdEntityId);
    assert.ok(found, 'Created entity must be in listed entities');
    assert.equal(found.display_name, 'Fase0 Acme Entity');
    assert.equal(found.legal_entity_lei, '5493001KJTIIGC8Y1R12');
  });

  let createdEscrowId;
  const testSplitId = randomUUID();
  await t.test('POST /api/v1/ops/escrow creates unified escrow', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/escrow`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': testOrgId,
      },
      body: JSON.stringify({
        escrow_type: 'SPLIT',
        split_id: testSplitId,
        held_minor: '50000',
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.escrow_id);
    assert.equal(data.status, 'FUNDED');
    assert.ok(data.created_at);
    createdEscrowId = data.escrow_id;
  });

  await t.test('GET /api/v1/ops/escrow/:escrow_id fetches escrow status and balance invariant', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/escrow/${createdEscrowId}`, {
      headers: {
        'x-org-id': testOrgId,
      },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.escrow_id, createdEscrowId);
    assert.equal(data.escrow_type, 'SPLIT');
    assert.equal(data.held_minor, '50000');
    assert.equal(data.released_minor, '0');
    assert.equal(data.slashed_minor, '0');
    assert.equal(data.status, 'FUNDED');
    assert.equal(data.balanced, false); // 50000 !== 0 + 0 until released/slashed
  });

  await t.test('POST /api/v1/ops/escrow rejects invalid escrow_type', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/escrow`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-org-id': testOrgId,
      },
      body: JSON.stringify({
        escrow_type: 'UNKNOWN',
        held_minor: '100',
      }),
    });
    assert.equal(res.status, 400);
  });

  await t.test('GET /api/v1/ops/escrow/:escrow_id returns 404 for unknown escrow', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/escrow/${randomUUID()}`, {
      headers: {
        'x-org-id': testOrgId,
      },
    });
    assert.equal(res.status, 404);
  });

  await t.test('GET /api/v1/ops/entities returns 401 when organization context is missing', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/ops/entities`);
    assert.equal(res.status, 401);
  });
});
