/**
 * server/test/concurrency/pact_concurrency.test.js
 * PRD 1.4 Trust Infrastructure (Fase C: PACT Concurrency Suite, WP7)
 * Tests 1000 concurrent PACT contract operations: guarantees 0 negative escrows, balanced ledgers, and index usage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { createContract, fundEscrow, deliverWork, verifyWork, settleEscrow } from '../../src/services/pact_service.js';
import { checkEscrowBalance } from '../../src/services/escrow_service.js';

test('PRD 1.4 Fase C: 1000 Concurrent PACT Suite', async (t) => {
  await t.test('test_1000_concurrent_pact: 1000 concurrent contracts produce 0 negative escrows and balanced ledger', async () => {
    const buyerOrgId = crypto.randomUUID();
    const sellerOrgId = crypto.randomUUID();
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      buyerOrgId, 'Concurrent Buyer Org', `buyer-${buyerOrgId.slice(0, 8)}`,
    ]);
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      sellerOrgId, 'Concurrent Seller Org', `seller-${sellerOrgId.slice(0, 8)}`,
    ]);

    const TOTAL_CONTRACTS = 1000;
    const CHUNK_SIZE = 50; // Chunks to respect Postgres connection pool limit

    // 1. Pre-generate transaction intents for buyer
    const intentIds = [];
    for (let i = 0; i < TOTAL_CONTRACTS; i += CHUNK_SIZE) {
      const chunk = Array.from({ length: Math.min(CHUNK_SIZE, TOTAL_CONTRACTS - i) }, () => {
        const intentId = crypto.randomUUID();
        const agentId = crypto.randomUUID();
        const mandateVerId = crypto.randomUUID();
        const reqHash = `sha256:${crypto.randomBytes(32).toString('hex')}`;
        const idemKey = `idem_${crypto.randomUUID()}`;

        return pool.query(
          `INSERT INTO transaction_intents (
             intent_id, org_id, agent_id, category, sub_type, status,
             amount_minor, currency, mandate_version_id, request_hash, idempotency_key
           ) VALUES ($1, $2, $3, 'SALE', 'standard', 'APPROVED', 10000, 'USD', $4, $5, $6)
           RETURNING intent_id`,
          [intentId, buyerOrgId, agentId, mandateVerId, reqHash, idemKey],
        );
      });
      const res = await Promise.all(chunk);
      intentIds.push(...res.map((r) => r.rows[0].intent_id));
    }

    assert.equal(intentIds.length, TOTAL_CONTRACTS);

    // 2. Concurrently create contracts
    const contractIds = [];
    for (let i = 0; i < TOTAL_CONTRACTS; i += CHUNK_SIZE) {
      const chunk = intentIds.slice(i, i + CHUNK_SIZE).map((intentId, idx) => {
        const price = 1000 + (idx * 10);
        const bond = 100 + idx;
        return createContract(buyerOrgId, {
          buyer_intent_id: intentId,
          seller_org_id: sellerOrgId,
          task_spec_hash: `sha256:spec-${i + idx}`,
          price_minor: price,
          currency: 'USD',
          verification_tier: 'T0-reexec',
          seller_bond_minor: bond,
          challenge_window_seconds: 3600,
        });
      });
      const created = await Promise.all(chunk);
      contractIds.push(...created.map((c) => c.contract_id));
    }

    assert.equal(contractIds.length, TOTAL_CONTRACTS);

    // 3. Concurrently fund escrow in chunks
    for (let i = 0; i < TOTAL_CONTRACTS; i += CHUNK_SIZE) {
      const chunk = contractIds.slice(i, i + CHUNK_SIZE).map((cId) => fundEscrow(cId, buyerOrgId));
      await Promise.all(chunk);
    }

    // 4. Concurrently deliver, verify, settle a subset (100 contracts) to verify full lifecycle concurrency
    const SETTLE_COUNT = 100;
    for (let i = 0; i < SETTLE_COUNT; i += CHUNK_SIZE) {
      const chunkIds = contractIds.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunkIds.map((cId) => deliverWork(cId, sellerOrgId, { concurrent: true })));
      await Promise.all(chunkIds.map((cId) => verifyWork(cId, null, 'PASS')));
      await Promise.all(chunkIds.map((cId) => settleEscrow(cId, sellerOrgId)));
    }

    // 5. Verification: Check that NO escrow account has negative values
    const negCheck = await pool.query(
      `SELECT count(*) as count
       FROM escrow_accounts
       WHERE held_minor < 0 OR released_minor < 0 OR slashed_minor < 0`,
    );
    assert.equal(Number(negCheck.rows[0].count), 0, 'Zero escrow accounts may have negative values');

    // 6. Verification: Check escrow mathematical balance for settled contracts
    for (let i = 0; i < 20; i++) {
      const bal = await checkEscrowBalance(contractIds[i]);
      assert.equal(bal.balanced, true, `Escrow for contract ${contractIds[i]} must be balanced`);
      assert.equal(bal.status, 'RELEASED');
    }

    // 7. Verify Index scan usage
    await pool.query('BEGIN');
    await pool.query('SET LOCAL enable_seqscan = off');

    const explainPact = await pool.query(
      'EXPLAIN ANALYZE SELECT * FROM pact_contracts WHERE org_id = $1 AND status = $2',
      [buyerOrgId, 'IN_PROGRESS'],
    );
    const planPact = explainPact.rows.map((r) => r['QUERY PLAN']).join('\n');
    assert.ok(
      planPact.includes('Index Scan') || planPact.includes('Bitmap Index Scan') || planPact.includes('idx_pact_contracts'),
      `Query must utilize index: ${planPact}`,
    );

    const explainEscrow = await pool.query(
      'EXPLAIN ANALYZE SELECT * FROM escrow_accounts WHERE contract_id = $1',
      [contractIds[0]],
    );
    const planEscrow = explainEscrow.rows.map((r) => r['QUERY PLAN']).join('\n');
    assert.ok(
      planEscrow.includes('Index Scan') || planEscrow.includes('Bitmap Index Scan') || planEscrow.includes('idx_escrow_accounts'),
      `Query must utilize index: ${planEscrow}`,
    );

    await pool.query('COMMIT');
  });
});
