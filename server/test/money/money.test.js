// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../src/db/pool.js';
import { createEscrow, getEscrow, checkEscrowBalance } from '../../src/services/escrow_service.js';
import { randomUUID, randomBytes } from 'node:crypto';

test('PRD 2.1: Money Coverage Suite (100% Invariant Target)', async (t) => {
  let orgId;
  let contractId;
  let pactContractId;
  let buyerIntentId;

  t.before(async () => {
    const orgResult = await pool.query('SELECT id FROM organizations LIMIT 1');
    orgId = orgResult.rows[0].id;

    // Create an intent and pact_contract for real FK tests
    buyerIntentId = randomUUID();
    pactContractId = randomUUID();
    const agentId = randomUUID();
    const mandateVerId = randomUUID();
    const reqHash = `sha256:${randomBytes(32).toString('hex')}`;
    const idemKey = `idem_${randomUUID()}`;

    await pool.query(
      `INSERT INTO transaction_intents (
         intent_id, org_id, agent_id, category, sub_type, status,
         amount_minor, currency, mandate_version_id, request_hash, idempotency_key
       ) VALUES ($1, $2, $3, 'SALE', 'standard', 'APPROVED', 50000, 'USD', $4, $5, $6)`,
      [buyerIntentId, orgId, agentId, mandateVerId, reqHash, idemKey],
    );

    await pool.query(
      `INSERT INTO pact_contracts (
         contract_id, org_id, buyer_intent_id, seller_org_id, task_spec_hash,
         price_minor, currency, verification_tier, seller_bond_minor, challenge_window_seconds, status
       ) VALUES ($1, $2, $3, $2, 'sha256:task-hash', 50000, 'USD', 'T0-reexec', 5000, 3600, 'IN_PROGRESS')`,
      [pactContractId, orgId, buyerIntentId],
    );

    contractId = pactContractId;
  });

  t.after(async () => {
    // Clean up test data
    if (contractId) {
      await pool.query('DELETE FROM escrow_accounts WHERE contract_id = $1', [contractId]);
      await pool.query('DELETE FROM pact_contracts WHERE contract_id = $1', [contractId]);
    }
    if (buyerIntentId) {
      await pool.query('DELETE FROM transaction_intents WHERE intent_id = $1', [buyerIntentId]);
    }
    await pool.end();
  });

  await t.test('createEscrow and getEscrow with environment isolation', async () => {
    const escrow = await createEscrow(orgId, {
      escrowType: 'PACT',
      contractId,
      heldMinor: '5000',
      environment: 'SANDBOX',
    });

    assert.ok(escrow.escrow_id);
    assert.equal(escrow.status, 'FUNDED');
    assert.equal(escrow.environment, 'SANDBOX');

    const fetched = await getEscrow(orgId, escrow.escrow_id, 'SANDBOX');
    assert.equal(fetched.escrow_id, escrow.escrow_id);
    assert.equal(fetched.held_minor, '5000');
    assert.equal(fetched.environment, 'SANDBOX');
  });

  await t.test('checkEscrowBalance with environment isolation', async () => {
    const balance = await checkEscrowBalance(contractId, 'SANDBOX');
    assert.equal(balance.contract_id, contractId);
    assert.equal(balance.held, '5000');
    assert.equal(balance.environment, 'SANDBOX');
  });

  await t.test('createEscrow SPLIT and DOWN_PAYMENT with client passed', async () => {
    const splitId = randomUUID();
    const dpId = randomUUID();
    const client = await pool.connect();
    try {
      const splitEscrow = await createEscrow(
        orgId,
        {
          escrowType: 'SPLIT',
          splitId,
          heldMinor: 10000n,
        },
        client,
      );
      assert.ok(splitEscrow.escrow_id);
      assert.equal(splitEscrow.environment, 'SANDBOX');

      // Test getEscrow with dbClient
      const fetchedSplit = await getEscrow(orgId, splitEscrow.escrow_id, client);
      assert.equal(fetchedSplit.escrow_type, 'SPLIT');

      // Test getEscrow with object options
      const fetchedSplitObj = await getEscrow(orgId, splitEscrow.escrow_id, { environment: 'SANDBOX' });
      assert.equal(fetchedSplitObj.escrow_id, splitEscrow.escrow_id);

      const dpEscrow = await createEscrow(
        orgId,
        {
          escrowType: 'DOWN_PAYMENT',
          dpId,
          heldMinor: '2500',
          environment: 'SIMULATED',
        },
        client,
      );
      assert.ok(dpEscrow.escrow_id);
      assert.equal(dpEscrow.environment, 'SIMULATED');

      const fetchedDp = await getEscrow(orgId, dpEscrow.escrow_id, 'SIMULATED', client);
      assert.equal(fetchedDp.escrow_type, 'DOWN_PAYMENT');
      assert.equal(fetchedDp.environment, 'SIMULATED');

      // Clean up
      await client.query('DELETE FROM escrow_accounts WHERE escrow_id IN ($1, $2)', [
        splitEscrow.escrow_id,
        dpEscrow.escrow_id,
      ]);
    } finally {
      client.release();
    }
  });

  await t.test('checkEscrowBalance with dbClient and object options', async () => {
    const client = await pool.connect();
    try {
      const balanceClient = await checkEscrowBalance(contractId, client);
      assert.equal(balanceClient.contract_id, contractId);

      const balanceObj = await checkEscrowBalance(contractId, { environment: 'SANDBOX' });
      assert.equal(balanceObj.contract_id, contractId);

      const balanceBoth = await checkEscrowBalance(contractId, 'SANDBOX', client);
      assert.equal(balanceBoth.contract_id, contractId);
    } finally {
      client.release();
    }
  });

  await t.test('createEscrow validations', async () => {
    // Invalid orgId
    await assert.rejects(
      async () => createEscrow('invalid-uuid', { escrowType: 'PACT', contractId, heldMinor: '100' }),
      (err) => err.code === 'INVALID_ORG_ID',
    );
    await assert.rejects(
      async () => createEscrow(null, { escrowType: 'PACT', contractId, heldMinor: '100' }),
      (err) => err.code === 'INVALID_ORG_ID',
    );

    // Invalid escrowType
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'INVALID', contractId, heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_TYPE',
    );

    // PACT invalid ref
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'PACT', heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'PACT', contractId: 'bad-uuid', heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'PACT', contractId, splitId: randomUUID(), heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );

    // SPLIT invalid ref
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'SPLIT', heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'SPLIT', splitId: 'bad-uuid', heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'SPLIT', splitId: randomUUID(), contractId, heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );

    // DOWN_PAYMENT invalid ref
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'DOWN_PAYMENT', heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'DOWN_PAYMENT', dpId: 'bad-uuid', heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'DOWN_PAYMENT', dpId: randomUUID(), contractId, heldMinor: '100' }),
      (err) => err.code === 'INVALID_ESCROW_REF',
    );

    // Invalid amounts
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'PACT', contractId, heldMinor: 'not-an-int' }),
      (err) => err.code === 'INVALID_AMOUNT',
    );
    await assert.rejects(
      async () => createEscrow(orgId, { escrowType: 'PACT', contractId, heldMinor: -10n }),
      (err) => err.code === 'INVALID_AMOUNT',
    );
  });

  await t.test('getEscrow validations and not found', async () => {
    await assert.rejects(
      async () => getEscrow('invalid-uuid', randomUUID()),
      (err) => err.code === 'INVALID_ORG_ID',
    );
    await assert.rejects(
      async () => getEscrow(null, randomUUID()),
      (err) => err.code === 'INVALID_ORG_ID',
    );
    await assert.rejects(
      async () => getEscrow(orgId, 'invalid-uuid'),
      (err) => err.code === 'ESCROW_NOT_FOUND',
    );
    await assert.rejects(
      async () => getEscrow(orgId, randomUUID()),
      (err) => err.code === 'ESCROW_NOT_FOUND',
    );

    // Non-matching environment
    const createdProd = await createEscrow(orgId, {
      escrowType: 'PACT',
      contractId,
      heldMinor: '1000',
      environment: 'PRODUCTION',
    });
    await assert.rejects(
      async () => getEscrow(orgId, createdProd.escrow_id, 'SANDBOX'),
      (err) => err.code === 'ESCROW_NOT_FOUND',
    );
  });

  await t.test('checkEscrowBalance validations and not found', async () => {
    await assert.rejects(
      async () => checkEscrowBalance('invalid-uuid'),
      (err) => err.code === 'ESCROW_NOT_FOUND',
    );
    await assert.rejects(
      async () => checkEscrowBalance(null),
      (err) => err.code === 'ESCROW_NOT_FOUND',
    );
    await assert.rejects(
      async () => checkEscrowBalance(randomUUID()),
      (err) => err.code === 'ESCROW_NOT_FOUND',
    );
  });

  await t.test('balanced invariant check for both balanced and unbalanced escrow', async () => {
    // Unbalanced record test
    const insertRes = await pool.query(
      `INSERT INTO escrow_accounts (
         org_id, escrow_type, contract_id, held_minor, released_minor, slashed_minor, status, environment
       )
       VALUES ($1, 'PACT', $2, 1000, 200, 300, 'FUNDED', 'SANDBOX')
       RETURNING escrow_id`,
      [orgId, contractId],
    );
    const unbEscrowId = insertRes.rows[0].escrow_id;

    const unbFetched = await getEscrow(orgId, unbEscrowId, 'SANDBOX');
    assert.equal(unbFetched.balanced, false); // 1000 != 200 + 300

    const unbBalance = await checkEscrowBalance(contractId, 'SANDBOX');
    assert.equal(unbBalance.balanced, false);

    // Balanced record test (1000 == 700 + 300)
    const updateRes = await pool.query(
      `UPDATE escrow_accounts
       SET held_minor = 1000, released_minor = 700, slashed_minor = 300
       WHERE escrow_id = $1`,
      [unbEscrowId],
    );

    const bFetched = await getEscrow(orgId, unbEscrowId, 'SANDBOX');
    assert.equal(bFetched.balanced, true);

    const bBalance = await checkEscrowBalance(contractId, 'SANDBOX');
    assert.equal(bBalance.balanced, true);

    // Clean up
    await pool.query('DELETE FROM escrow_accounts WHERE escrow_id = $1', [unbEscrowId]);
  });
});
