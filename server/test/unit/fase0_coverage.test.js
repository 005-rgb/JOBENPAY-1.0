import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../../src/db/pool.js';
import {
  registerEntity,
  getEntity,
  listEntities,
  updateEntityStatus,
  updateReputationScore,
} from '../../src/services/entity_service.js';
import {
  createEscrow,
  getEscrow,
  checkEscrowBalance,
} from '../../src/services/escrow_service.js';
import { computeRequestHashV1, computeRequestHashV2 } from '../../../shared/request-hash.js';

test('Fase 0 100% Coverage Suite', async (t) => {
  let testOrgId;

  t.before(async () => {
    const orgRes = await pool.query('SELECT id FROM organizations LIMIT 1');
    if (orgRes.rows.length > 0) {
      testOrgId = orgRes.rows[0].id;
    } else {
      testOrgId = randomUUID();
      await pool.query(
        `INSERT INTO organizations (id, name, slug) VALUES ($1, 'Fase0 Coverage Org', 'fase0-cov-org')`,
        [testOrgId],
      );
    }
  });

  t.after(async () => {
    await pool.end();
  });

  // --- request-hash.js branch coverage ---
  await t.test('request-hash branch coverage for empty/falsy optional fields', () => {
    const minReq = {
      org_id: testOrgId,
      agent_id: randomUUID(),
      mandate_version_id: randomUUID(),
      action: 'PAY',
      category: 'TRANSFER',
      sub_type: 'WALLET_TRANSFER',
      amount_minor: 100n,
      currency: 'USD',
    };
    const h2 = computeRequestHashV2(minReq);
    assert.ok(h2.startsWith('sha256:'));
    const h1 = computeRequestHashV1(minReq);
    assert.ok(h1.startsWith('sha256:'));
  });

  // --- entity_service.js coverage ---
  await t.test('entity_service validation and CRUD branches', async () => {
    // 1. Invalid orgId
    await assert.rejects(() => registerEntity('invalid-uuid', {}), (err) => err.code === 'INVALID_ORG_ID');
    await assert.rejects(() => getEntity('invalid-uuid', randomUUID()), (err) => err.code === 'INVALID_ORG_ID');
    await assert.rejects(() => getEntity(testOrgId, 'invalid-uuid'), (err) => err.code === 'INVALID_ENTITY_ID');
    await assert.rejects(() => listEntities('invalid-uuid'), (err) => err.code === 'INVALID_ORG_ID');

    // 2. Invalid entity_type
    await assert.rejects(
      () => registerEntity(testOrgId, { entity_type: 'INVALID', display_name: 'Test' }),
      (err) => err.code === 'INVALID_ENTITY_TYPE',
    );

    // 3. Invalid display_name
    await assert.rejects(
      () => registerEntity(testOrgId, { entity_type: 'ISSUER', display_name: '' }),
      (err) => err.code === 'INVALID_DISPLAY_NAME',
    );
    await assert.rejects(
      () => registerEntity(testOrgId, { entity_type: 'ISSUER', display_name: null }),
      (err) => err.code === 'INVALID_DISPLAY_NAME',
    );

    // 4. Register VERIFIER and BOTH
    const verifier = await registerEntity(testOrgId, {
      entity_type: 'VERIFIER',
      display_name: 'Coverage Verifier',
      verification_tier: 'TIER_1',
      attestation_jwks_uri: 'https://example.com/jwks.json',
      reputation_score: 90,
    });
    assert.equal(verifier.entity_type, 'VERIFIER');

    const both = await registerEntity(testOrgId, {
      entity_type: 'BOTH',
      display_name: 'Coverage Both Entity',
      reputation_score: 80,
    });
    assert.equal(both.entity_type, 'BOTH');

    // 5. getEntity success and not found
    const fetched = await getEntity(testOrgId, verifier.entity_id);
    assert.equal(fetched.entity_id, verifier.entity_id);
    await assert.rejects(() => getEntity(testOrgId, randomUUID()), (err) => err.code === 'ENTITY_NOT_FOUND');

    // 6. listEntities with filters and cursor pagination
    const listType = await listEntities(testOrgId, { entity_type: 'VERIFIER', status: 'ACTIVE', limit: 1 });
    assert.ok(listType.entities.length >= 1);

    const listCursor = await listEntities(testOrgId, { cursor: verifier.entity_id, limit: 10 });
    assert.ok(Array.isArray(listCursor.entities));

    // 7. updateEntityStatus
    await assert.rejects(
      () => updateEntityStatus(testOrgId, verifier.entity_id, 'INVALID_STATUS'),
      (err) => err.code === 'INVALID_STATUS',
    );
    const updatedStatus = await updateEntityStatus(testOrgId, verifier.entity_id, 'SUSPENDED');
    assert.equal(updatedStatus.status, 'SUSPENDED');
    await assert.rejects(
      () => updateEntityStatus(testOrgId, randomUUID(), 'ACTIVE'),
      (err) => err.code === 'ENTITY_NOT_FOUND',
    );

    // 8. updateReputationScore
    await assert.rejects(
      () => updateReputationScore(testOrgId, verifier.entity_id, -5),
      (err) => err.code === 'INVALID_SCORE',
    );
    await assert.rejects(
      () => updateReputationScore(testOrgId, verifier.entity_id, 150),
      (err) => err.code === 'INVALID_SCORE',
    );
    await assert.rejects(
      () => updateReputationScore(testOrgId, verifier.entity_id, 'not-a-number'),
      (err) => err.code === 'INVALID_SCORE',
    );
    const updatedScore = await updateReputationScore(testOrgId, verifier.entity_id, 95);
    assert.equal(updatedScore.reputation_score, 95);
    await assert.rejects(
      () => updateReputationScore(testOrgId, randomUUID(), 75),
      (err) => err.code === 'ENTITY_NOT_FOUND',
    );

    // 9. Client passthrough and error branches
    const mockClient = { query: (sql, params) => pool.query(sql, params) };
    const viaClient = await getEntity(testOrgId, verifier.entity_id, mockClient);
    assert.equal(viaClient.entity_id, verifier.entity_id);

    // Cover has_more and dbClient in listEntities, updateEntityStatus, updateReputationScore
    const listMore = await listEntities(testOrgId, { limit: 1 }, mockClient);
    assert.equal(listMore.has_more, true);
    assert.ok(listMore.next_cursor);

    await updateEntityStatus(testOrgId, verifier.entity_id, 'ACTIVE', mockClient);
    await updateReputationScore(testOrgId, verifier.entity_id, 90, mockClient);

    // Test unique constraint duplicate error handler in registerEntity
    const duplicateClient = {
      query: async () => {
        const error = new Error('duplicate key');
        error.code = '23505';
        throw error;
      },
    };
    await assert.rejects(
      () => registerEntity(testOrgId, { entity_type: 'ISSUER', display_name: 'Dup' }, duplicateClient),
      (err) => err.code === 'ENTITY_ALREADY_EXISTS',
    );

    // Test generic error handler rethrow
    const genericErrorClient = {
      query: async () => {
        throw new Error('connection lost');
      },
    };
    await assert.rejects(
      () => registerEntity(testOrgId, { entity_type: 'ISSUER', display_name: 'Err' }, genericErrorClient),
      /connection lost/,
    );

    // Clean up created entities
    await pool.query('DELETE FROM entities WHERE entity_id IN ($1, $2)', [verifier.entity_id, both.entity_id]);
  });

  // --- escrow_service.js coverage ---
  await t.test('escrow_service validation and all escrow types', async () => {
    // 1. Invalid orgId
    await assert.rejects(() => createEscrow('invalid-uuid', {}), (err) => err.code === 'INVALID_ORG_ID');
    await assert.rejects(() => getEscrow('invalid-uuid', randomUUID()), (err) => err.code === 'INVALID_ORG_ID');
    await assert.rejects(() => getEscrow(testOrgId, 'invalid-uuid'), (err) => err.code === 'ESCROW_NOT_FOUND');

    // 2. Invalid escrowType
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'INVALID', heldMinor: 100 }),
      (err) => err.code === 'INVALID_ESCROW_TYPE',
    );

    // 3. PACT reference validation
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'PACT', heldMinor: 100 }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'PACT', contractId: randomUUID(), splitId: randomUUID(), heldMinor: 100 }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );

    // 4. SPLIT reference validation
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'SPLIT', heldMinor: 100 }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'SPLIT', splitId: randomUUID(), contractId: randomUUID(), heldMinor: 100 }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );

    // 5. DOWN_PAYMENT reference validation
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'DOWN_PAYMENT', heldMinor: 100 }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'DOWN_PAYMENT', dpId: randomUUID(), splitId: randomUUID(), heldMinor: 100 }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );

    // 6. Invalid amount
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'SPLIT', splitId: randomUUID(), heldMinor: 'not-an-int' }),
      (err) => err.code === 'INVALID_AMOUNT',
    );
    await assert.rejects(
      () => createEscrow(testOrgId, { escrowType: 'SPLIT', splitId: randomUUID(), heldMinor: -50n }),
      (err) => err.code === 'INVALID_AMOUNT',
    );

    // 7. Successful DOWN_PAYMENT creation
    const dpId = randomUUID();
    const dpEscrow = await createEscrow(testOrgId, {
      escrowType: 'DOWN_PAYMENT',
      dpId,
      heldMinor: 25000n,
    });
    assert.ok(dpEscrow.escrow_id);
    assert.equal(dpEscrow.status, 'FUNDED');

    const fetchedDp = await getEscrow(testOrgId, dpEscrow.escrow_id);
    assert.equal(fetchedDp.escrow_type, 'DOWN_PAYMENT');
    assert.equal(fetchedDp.held_minor, '25000');

    // 8. Successful PACT creation and checkEscrowBalance using mock dbClient
    const mockPactContractId = randomUUID();
    const mockEscrowId = randomUUID();
    const mockPactClient = {
      query: async (sql, params) => {
        if (sql.includes('INSERT INTO escrow_accounts')) {
          return {
            rows: [
              {
                escrow_id: mockEscrowId,
                status: 'FUNDED',
                created_at: new Date().toISOString(),
              },
            ],
          };
        }
        if (sql.includes('SELECT escrow_id, contract_id, held_minor')) {
          return {
            rows: [
              {
                escrow_id: mockEscrowId,
                contract_id: mockPactContractId,
                held_minor: '1000',
                released_minor: '600',
                slashed_minor: '400',
                status: 'RELEASED',
              },
            ],
          };
        }
        return { rows: [] };
      },
    };

    const pactEscrow = await createEscrow(
      testOrgId,
      {
        escrowType: 'PACT',
        contractId: mockPactContractId,
        heldMinor: 1000n,
      },
      mockPactClient,
    );
    assert.equal(pactEscrow.escrow_id, mockEscrowId);

    // Check balance for 1000 held === 600 released + 400 slashed (balanced = true)
    const bal = await checkEscrowBalance(mockPactContractId, mockPactClient);
    assert.equal(bal.balanced, true);
    assert.equal(bal.contract_id, mockPactContractId);
    assert.equal(bal.held, '1000');
    assert.equal(bal.released, '600');
    assert.equal(bal.slashed, '400');

    // checkEscrowBalance error branches
    await assert.rejects(() => checkEscrowBalance('not-a-uuid'), (err) => err.code === 'ESCROW_NOT_FOUND');
    await assert.rejects(() => checkEscrowBalance(randomUUID()), (err) => err.code === 'ESCROW_NOT_FOUND');

    // Clean up
    await pool.query('DELETE FROM escrow_accounts WHERE escrow_id = $1', [dpEscrow.escrow_id]);
  });
});
