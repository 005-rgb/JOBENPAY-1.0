/**
 * server/test/unit/pact_service.test.js
 * PRD 1.4 Trust Infrastructure (Fase C: PACT Arbitration & Bonding, WP6 Unit Tests)
 *
 * Covers:
 * - test_pact_happy_path
 * - test_pact_dispute_slash
 * - test_pact_dispute_invalid
 * - test_pact_escrow_balanced
 * - test_pact_t0_reexec
 * - test_pact_t3_jury
 * - test_pact_coverage_edge_cases (100% c8 coverage)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import {
  createContract,
  deliverWork,
  disputeContract,
  fundEscrow,
  getContract,
  registerVerifier,
  settleEscrow,
  verifyWork,
} from '../../src/services/pact_service.js';
import { checkEscrowBalance } from '../../src/services/escrow_service.js';
import { verifyChain } from '../../src/services/ledger.js';
import {
  getContractHandler,
  postContract,
  postDeliver,
  postDispute,
  postFund,
  postSettle,
  postVerify,
} from '../../src/controllers/pact_controller.js';

async function createOrgFixture(namePrefix) {
  const orgId = crypto.randomUUID();
  const slug = `${namePrefix}-${orgId.slice(0, 8)}`;
  await pool.query(
    'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)',
    [orgId, `Org ${namePrefix}`, slug],
  );
  return orgId;
}

async function createIntentFixture(orgId) {
  const intentId = crypto.randomUUID();
  const agentId = crypto.randomUUID();
  const mandateVerId = crypto.randomUUID();
  const reqHash = `sha256:${crypto.randomBytes(32).toString('hex')}`;
  const idemKey = `idem_${crypto.randomUUID()}`;

  await pool.query(
    `INSERT INTO transaction_intents (
       intent_id, org_id, agent_id, category, sub_type, status,
       amount_minor, currency, mandate_version_id, request_hash, idempotency_key
     ) VALUES ($1, $2, $3, 'SALE', 'standard', 'APPROVED', 50000, 'USD', $4, $5, $6)`,
    [intentId, orgId, agentId, mandateVerId, reqHash, idemKey],
  );
  return intentId;
}

test('PRD 1.4 Fase C: PACT Arbitration & Bonding Unit Test Suite', async (t) => {
  await t.test('test_pact_happy_path: PROPOSED -> IN_PROGRESS -> DELIVERED -> VERIFIED -> SETTLED; ledger balanced', async () => {
    const buyerOrgId = await createOrgFixture('pact-buyer-hp');
    const sellerOrgId = await createOrgFixture('pact-seller-hp');
    const intentId = await createIntentFixture(buyerOrgId);

    // 1. Create Contract (PROPOSED)
    const contract = await createContract(buyerOrgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerOrgId,
      task_spec_hash: 'sha256:task-spec-1234',
      price_minor: 50000,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 5000,
      challenge_window_seconds: 3600,
    });

    assert.ok(contract.contract_id);
    assert.equal(contract.status, 'PROPOSED');
    assert.equal(contract.price_minor, 50000);
    assert.equal(contract.seller_bond_minor, 5000);

    // 2. Fund Escrow (PROPOSED -> IN_PROGRESS)
    const funded = await fundEscrow(contract.contract_id, buyerOrgId);
    assert.ok(funded.escrow_id);
    assert.equal(funded.held_minor, 50000);
    assert.equal(funded.status, 'FUNDED');

    const inProg = await getContract(contract.contract_id, buyerOrgId);
    assert.equal(inProg.status, 'IN_PROGRESS');

    // 3. Deliver Work (IN_PROGRESS -> DELIVERED)
    const delivered = await deliverWork(contract.contract_id, sellerOrgId, {
      execution_log_uri: 'https://storage.local/logs/task-1234.log',
      output_hash: 'sha256:output-abcd',
    });
    assert.equal(delivered.status, 'DELIVERED');

    const delContract = await getContract(contract.contract_id, sellerOrgId);
    assert.equal(delContract.status, 'DELIVERED');

    // 4. Verify Work (DELIVERED -> VERIFIED)
    const verified = await verifyWork(contract.contract_id, null, 'PASS');
    assert.equal(verified.status, 'VERIFIED');

    const verContract = await getContract(contract.contract_id, buyerOrgId);
    assert.equal(verContract.status, 'VERIFIED');

    // 5. Settle Escrow (VERIFIED -> SETTLED)
    const settled = await settleEscrow(contract.contract_id, sellerOrgId);
    assert.equal(settled.status, 'SETTLED');

    const setContract = await getContract(contract.contract_id, buyerOrgId);
    assert.equal(setContract.status, 'SETTLED');

    // 6. Check Escrow Balance Invariant
    const escrowBal = await checkEscrowBalance(contract.contract_id);
    assert.equal(escrowBal.held, '50000');
    assert.equal(escrowBal.released, '50000');
    assert.equal(escrowBal.slashed, '0');
    assert.equal(escrowBal.balanced, true);
    assert.equal(escrowBal.status, 'RELEASED');

    // 7. Verify Ledger Integrity
    const buyerLedger = await verifyChain(buyerOrgId);
    assert.equal(buyerLedger.valid, true);

    const sellerLedger = await verifyChain(sellerOrgId);
    assert.equal(sellerLedger.valid, true);
  });

  await t.test('test_pact_dispute_slash: DISPUTED -> SLASHED; escrow split buyer/seller', async () => {
    const buyerOrgId = await createOrgFixture('pact-buyer-slash');
    const sellerOrgId = await createOrgFixture('pact-seller-slash');
    const intentId = await createIntentFixture(buyerOrgId);

    const contract = await createContract(buyerOrgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerOrgId,
      task_spec_hash: 'sha256:task-spec-slash',
      price_minor: 60000,
      currency: 'USD',
      verification_tier: 'T1-tee',
      seller_bond_minor: 15000,
      challenge_window_seconds: 7200,
    });

    await fundEscrow(contract.contract_id, buyerOrgId);
    await deliverWork(contract.contract_id, sellerOrgId, { output: 'faulty_output' });

    // Dispute with valid fraud proof -> SLASHED
    const slashed = await disputeContract(contract.contract_id, {
      valid: true,
      reason: 'Output failed hash verification',
      evidence_url: 'https://fraud.io/proof/1',
    }, buyerOrgId);

    assert.equal(slashed.status, 'SLASHED');
    assert.equal(slashed.slashed_minor, 15000);
    assert.equal(slashed.released_minor, 45000);

    const postSlashContract = await getContract(contract.contract_id, buyerOrgId);
    assert.equal(postSlashContract.status, 'SLASHED');

    const escrowBal = await checkEscrowBalance(contract.contract_id);
    assert.equal(escrowBal.held, '60000');
    assert.equal(escrowBal.slashed, '15000');
    assert.equal(escrowBal.released, '45000');
    assert.equal(escrowBal.balanced, true);
    assert.equal(escrowBal.status, 'SLASHED');

    const buyerLedger = await verifyChain(buyerOrgId);
    assert.equal(buyerLedger.valid, true);
  });

  await t.test('test_pact_dispute_invalid: DISPUTED -> VERIFIED; escrow released to seller', async () => {
    const buyerOrgId = await createOrgFixture('pact-buyer-inv');
    const sellerOrgId = await createOrgFixture('pact-seller-inv');
    const intentId = await createIntentFixture(buyerOrgId);

    const contract = await createContract(buyerOrgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerOrgId,
      task_spec_hash: 'sha256:task-spec-inv',
      price_minor: 40000,
      currency: 'USD',
      verification_tier: 'T2-zkml',
      seller_bond_minor: 10000,
      challenge_window_seconds: 3600,
    });

    await fundEscrow(contract.contract_id, buyerOrgId);
    await deliverWork(contract.contract_id, sellerOrgId, { output: 'legitimate_output' });

    // Submit invalid fraud proof -> returns to VERIFIED
    const resInvalidProof = await disputeContract(contract.contract_id, {
      valid: false,
      reason: 'Frivolous challenge without zk-proof',
    }, buyerOrgId);

    assert.equal(resInvalidProof.status, 'VERIFIED');

    // Settle cleanly to seller
    const settled = await settleEscrow(contract.contract_id, sellerOrgId);
    assert.equal(settled.status, 'SETTLED');

    const escrowBal = await checkEscrowBalance(contract.contract_id);
    assert.equal(escrowBal.held, '40000');
    assert.equal(escrowBal.released, '40000');
    assert.equal(escrowBal.slashed, '0');
    assert.equal(escrowBal.balanced, true);
  });

  await t.test('test_pact_escrow_balanced: database trigger rejects unbalanced escrow updates', async () => {
    const buyerOrgId = await createOrgFixture('pact-trig');
    const sellerOrgId = await createOrgFixture('pact-trig-sel');
    const intentId = await createIntentFixture(buyerOrgId);

    const contract = await createContract(buyerOrgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerOrgId,
      task_spec_hash: 'sha256:task-spec-trig',
      price_minor: 30000,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 3000,
      challenge_window_seconds: 3600,
    });

    const funded = await fundEscrow(contract.contract_id, buyerOrgId);

    // Attempt unbalanced update on escrow_accounts to RELEASED status:
    // held=30000, but released=25000, slashed=0 (unbalanced by 5000!)
    await assert.rejects(
      () => pool.query(
        `UPDATE escrow_accounts
         SET released_minor = 25000, slashed_minor = 0, status = 'RELEASED'
         WHERE escrow_id = $1`,
        [funded.escrow_id],
      ),
      /ESCROW_UNBALANCED/,
      'Database constraint trigger trg_pact_settlement_balanced must reject unbalanced update',
    );
  });

  await t.test('test_pact_t0_reexec: T0 verifier registration and verdict pass', async () => {
    const orgId = await createOrgFixture('pact-t0');
    const sellerId = await createOrgFixture('pact-t0-sel');
    const intentId = await createIntentFixture(orgId);

    const verifier = await registerVerifier(orgId, {
      verification_tier: 'T0-reexec',
      attestation_jwks_uri: 'https://verifier-t0.internal/.well-known/jwks.json',
      status: 'ACTIVE',
    });
    assert.ok(verifier.verifier_id);
    assert.equal(verifier.verification_tier, 'T0-reexec');

    const contract = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'sha256:task-t0',
      price_minor: 25000,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 2500,
      challenge_window_seconds: 1800,
    });

    await fundEscrow(contract.contract_id, orgId);
    await deliverWork(contract.contract_id, sellerId, { run_reexec: true });

    const verified = await verifyWork(contract.contract_id, verifier.verifier_id, 'PASS');
    assert.equal(verified.status, 'VERIFIED');

    // Test suspended verifier rejection
    await pool.query(
      "UPDATE verifier_registry SET status = 'SUSPENDED' WHERE verifier_id = $1",
      [verifier.verifier_id],
    );

    const contract2 = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'sha256:task-t0-suspended',
      price_minor: 10000,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 1000,
      challenge_window_seconds: 1800,
    });
    await fundEscrow(contract2.contract_id, orgId);
    await deliverWork(contract2.contract_id, sellerId, {});

    await assert.rejects(
      () => verifyWork(contract2.contract_id, verifier.verifier_id, 'PASS'),
      (err) => err.code === 'VERIFIER_INACTIVE' || /active/i.test(err.message),
    );
  });

  await t.test('test_pact_t3_jury: T3 arbiter verdict fail transitions to DISPUTED', async () => {
    const orgId = await createOrgFixture('pact-t3');
    const sellerId = await createOrgFixture('pact-t3-sel');
    const intentId = await createIntentFixture(orgId);

    const jury = await registerVerifier(orgId, {
      verification_tier: 'T3-jury',
      attestation_jwks_uri: 'https://arbitration-jury.dao/jwks.json',
      status: 'ACTIVE',
    });

    const contract = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'sha256:task-t3',
      price_minor: 80000,
      currency: 'USD',
      verification_tier: 'T3-jury',
      seller_bond_minor: 20000,
      challenge_window_seconds: 7200,
    });

    await fundEscrow(contract.contract_id, orgId);
    await deliverWork(contract.contract_id, sellerId, { work_summary: 'partial work' });

    // Jury returns FAIL -> transitions to DISPUTED
    const verdictFail = await verifyWork(contract.contract_id, jury.verifier_id, 'FAIL');
    assert.equal(verdictFail.status, 'DISPUTED');

    const fetched = await getContract(contract.contract_id, orgId);
    assert.equal(fetched.status, 'DISPUTED');
  });

  await t.test('test_pact_coverage_edge_cases: 100% coverage of controllers, validations, and error paths', async () => {
    const orgId = await createOrgFixture('pact-cov');
    const sellerId = await createOrgFixture('pact-cov-sel');
    const intentId = await createIntentFixture(orgId);

    // 1. Validation errors in createContract
    await assert.rejects(() => createContract(null, {}), /orgId is required/);
    await assert.rejects(() => createContract(orgId, null), /buyer_intent_id must be a valid UUID/);
    await assert.rejects(() => createContract(orgId, { buyer_intent_id: 'bad' }), /buyer_intent_id must be a valid UUID/);
    await assert.rejects(() => createContract(orgId, { buyer_intent_id: intentId, seller_org_id: 'bad' }), /seller_org_id must be a valid UUID/);
    await assert.rejects(() => createContract(orgId, { buyer_intent_id: intentId, seller_org_id: sellerId }), /task_spec_hash is required/);
    await assert.rejects(() => createContract(orgId, {
      buyer_intent_id: intentId, seller_org_id: sellerId, task_spec_hash: 'h', price_minor: 0,
    }), /price_minor must be a positive integer/);
    await assert.rejects(() => createContract(orgId, {
      buyer_intent_id: intentId, seller_org_id: sellerId, task_spec_hash: 'h', price_minor: 100, currency: 'US',
    }), /currency must be a 3-character ISO code/);
    await assert.rejects(() => createContract(orgId, {
      buyer_intent_id: intentId, seller_org_id: sellerId, task_spec_hash: 'h', price_minor: 100, currency: 'USD', verification_tier: 'bad',
    }), /verification_tier must be one of/);
    await assert.rejects(() => createContract(orgId, {
      buyer_intent_id: intentId, seller_org_id: sellerId, task_spec_hash: 'h', price_minor: 100, currency: 'USD', verification_tier: 'T0-reexec', seller_bond_minor: -1,
    }), /seller_bond_minor must be a positive integer/);
    await assert.rejects(() => createContract(orgId, {
      buyer_intent_id: intentId, seller_org_id: sellerId, task_spec_hash: 'h', price_minor: 100, currency: 'USD', verification_tier: 'T0-reexec', seller_bond_minor: 10, challenge_window_seconds: 0,
    }), /challenge_window_seconds must be a positive integer/);

    // 2. Non-existent IDs in operations
    const fakeUuid = crypto.randomUUID();
    const isContractNotFound = (err) => err.code === 'CONTRACT_NOT_FOUND' || /not found/i.test(err.message);
    const isEscrowNotFound = (err) => err.code === 'ESCROW_NOT_FOUND' || /not found/i.test(err.message);
    const isForbidden = (err) => err.code === 'FORBIDDEN' || /forbidden/i.test(err.message);
    const isIllegalTransition = (err) => err.code === 'ILLEGAL_TRANSITION' || /illegal/i.test(err.message);
    const isVerifierNotFound = (err) => err.code === 'VERIFIER_NOT_FOUND' || /not found/i.test(err.message);
    const isInvalidVerdict = (err) => err.code === 'INVALID_VERDICT' || /verdict/i.test(err.message);
    const isWindowExpired = (err) => err.code === 'CHALLENGE_WINDOW_EXPIRED' || /expired/i.test(err.message);

    await assert.rejects(() => fundEscrow(fakeUuid, orgId), isContractNotFound);
    await assert.rejects(() => fundEscrow('not-a-uuid', orgId), isContractNotFound);
    await assert.rejects(() => deliverWork(fakeUuid, orgId), isContractNotFound);
    await assert.rejects(() => deliverWork('not-a-uuid', orgId), isContractNotFound);
    await assert.rejects(() => verifyWork(fakeUuid, null, 'PASS'), isContractNotFound);
    await assert.rejects(() => verifyWork('not-a-uuid', null, 'PASS'), isContractNotFound);
    await assert.rejects(() => settleEscrow(fakeUuid, orgId), isContractNotFound);
    await assert.rejects(() => settleEscrow('not-a-uuid', orgId), isContractNotFound);
    await assert.rejects(() => disputeContract(fakeUuid, {}, orgId), isContractNotFound);
    await assert.rejects(() => disputeContract('not-a-uuid', {}, orgId), isContractNotFound);
    await assert.rejects(() => getContract(fakeUuid, orgId), isContractNotFound);
    await assert.rejects(() => getContract('not-a-uuid', orgId), isContractNotFound);
    await assert.rejects(() => checkEscrowBalance(fakeUuid), isEscrowNotFound);
    await assert.rejects(() => checkEscrowBalance('not-a-uuid'), isEscrowNotFound);

    // 3. Illegal transitions
    const c = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'h',
      price_minor: 100,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 50,
      challenge_window_seconds: 1,
    });

    // Cross-tenant check on fund
    const otherOrgId = await createOrgFixture('pact-intruder');
    await assert.rejects(() => fundEscrow(c.contract_id, otherOrgId), isForbidden);

    // Cannot deliver before fund
    await assert.rejects(() => deliverWork(c.contract_id, sellerId), isIllegalTransition);
    // Cannot verify before deliver (PROPOSED status)
    await assert.rejects(() => verifyWork(c.contract_id, null, 'PASS'), isIllegalTransition);
    // Cannot settle before verify (PROPOSED status)
    await assert.rejects(() => settleEscrow(c.contract_id, orgId), isIllegalTransition);

    // Fund
    await fundEscrow(c.contract_id, orgId);
    // Cannot fund again
    await assert.rejects(() => fundEscrow(c.contract_id, orgId), isIllegalTransition);

    // Cross-tenant check on deliver
    await assert.rejects(() => deliverWork(c.contract_id, otherOrgId), isForbidden);

    // Deliver
    await deliverWork(c.contract_id, sellerId);
    // Cannot deliver again
    await assert.rejects(() => deliverWork(c.contract_id, sellerId), isIllegalTransition);

    // Invalid verdict / non-existent verifier
    await assert.rejects(() => verifyWork(c.contract_id, null, 'UNKNOWN'), isInvalidVerdict);
    await assert.rejects(() => verifyWork(c.contract_id, null, ''), isInvalidVerdict);
    await assert.rejects(() => verifyWork(c.contract_id, null, null), isInvalidVerdict);
    await assert.rejects(() => verifyWork(c.contract_id, 'not-a-uuid', 'PASS'), isVerifierNotFound);
    await assert.rejects(() => verifyWork(c.contract_id, fakeUuid, 'PASS'), isVerifierNotFound);

    // Challenge window expiry: wait 1.1s for window=1s
    await new Promise((r) => setTimeout(r, 1100));
    await assert.rejects(() => disputeContract(c.contract_id, {}, orgId), isWindowExpired);

    // Cross-tenant on dispute and settle
    await assert.rejects(() => disputeContract(c.contract_id, {}, otherOrgId), isForbidden);
    await assert.rejects(() => settleEscrow(c.contract_id, otherOrgId), isForbidden);

    // Cross-tenant on getContract
    await assert.rejects(() => getContract(c.contract_id, otherOrgId), isForbidden);

    // Register verifier validations
    await assert.rejects(() => registerVerifier(null, {}), /orgId is required/);
    await assert.rejects(() => registerVerifier(orgId, null), /verification_tier must be one of/);
    await assert.rejects(() => registerVerifier(orgId, { verification_tier: 'bad' }), /verification_tier must be one of/);
    await assert.rejects(() => registerVerifier(orgId, { verification_tier: 'T0-reexec' }), /attestation_jwks_uri is required/);
    const suspendedVerifier = await registerVerifier(orgId, {
      verification_tier: 'T0-reexec',
      attestation_jwks_uri: 'https://verifier.org/suspended',
      status: 'SUSPENDED',
    });
    assert.equal(suspendedVerifier.status, 'SUSPENDED');

    // Custom client query branch in pact_service & escrow_service
    const mockClient = { query: (sql, params) => pool.query(sql, params) };
    await getContract(c.contract_id, orgId, mockClient);
    await checkEscrowBalance(c.contract_id, mockClient);

    // 4. Controller methods coverage
    let statusCode = null;
    let jsonBody = null;
    const resMock = {
      status(s) { statusCode = s; return this; },
      json(b) { jsonBody = b; return this; },
    };

    const reqMock = {
      org: { id: orgId },
      params: { id: c.contract_id },
      body: {
        buyer_intent_id: intentId,
        seller_org_id: sellerId,
        task_spec_hash: 'controller_spec',
        price_minor: 500,
        currency: 'USD',
        verification_tier: 'T0-reexec',
        seller_bond_minor: 50,
        challenge_window_seconds: 3600,
      },
    };

    await postContract(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 201);
    assert.ok(jsonBody.contract_id);
    const newContractId = jsonBody.contract_id;

    reqMock.params.id = newContractId;
    await getContractHandler(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    await postFund(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    reqMock.body.work_attestation = { done: true };
    await postDeliver(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    reqMock.body.verdict = 'PASS';
    await postVerify(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    await postSettle(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    // Controller error propagation
    let caughtErr = null;
    await postContract({ org: {} }, resMock, (err) => { caughtErr = err; });
    assert.ok(caughtErr);

    let caughtFundErr = null;
    await postFund({ org: {}, params: {} }, resMock, (err) => { caughtFundErr = err; });
    assert.ok(caughtFundErr);

    let caughtDelErr = null;
    await postDeliver({ org: {}, params: {} }, resMock, (err) => { caughtDelErr = err; });
    assert.ok(caughtDelErr);

    let caughtVerErr = null;
    await postVerify({ params: {} }, resMock, (err) => { caughtVerErr = err; });
    assert.ok(caughtVerErr);

    let caughtSetErr = null;
    await postSettle({ org: {}, params: {} }, resMock, (err) => { caughtSetErr = err; });
    assert.ok(caughtSetErr);

    let caughtDispErr = null;
    await postDispute({ org: {}, params: {} }, resMock, (err) => { caughtDispErr = err; });
    assert.ok(caughtDispErr);

    let caughtGetErr = null;
    await getContractHandler({ org: {}, params: {} }, resMock, (err) => { caughtGetErr = err; });
    assert.ok(caughtGetErr);

    // Controller postDispute success path
    const dispContract = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'ctrl_disp',
      price_minor: 1000,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 200,
      challenge_window_seconds: 3600,
    });
    await fundEscrow(dispContract.contract_id, orgId);
    await deliverWork(dispContract.contract_id, sellerId);

    // Call postDispute controller endpoint successfully (covers pact_controller.js line 90)
    reqMock.params.id = dispContract.contract_id;
    reqMock.body = { fraud_proof: { valid: true, reason: 'test proof' } };
    await postDispute(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.status, 'SLASHED');

    // Test disputeContract with null/false fraud proof -> returns VERIFIED and covers line 429 branch
    const dispContractFalsy = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'ctrl_disp_falsy',
      price_minor: 1000,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 200,
      challenge_window_seconds: 3600,
    });
    await fundEscrow(dispContractFalsy.contract_id, orgId);
    await deliverWork(dispContractFalsy.contract_id, sellerId);
    const falsyProofRes = await disputeContract(dispContractFalsy.contract_id, null, orgId);
    assert.equal(falsyProofRes.status, 'VERIFIED');

    // Test disputeContract when contract.status === 'DISPUTED'
    await pool.query("UPDATE pact_contracts SET status = 'DISPUTED' WHERE contract_id = $1", [dispContractFalsy.contract_id]);
    const reDispute = await disputeContract(dispContractFalsy.contract_id, { valid: false }, orgId);
    assert.equal(reDispute.status, 'VERIFIED');

    // Test fundEscrow when contract.status === 'AGREED'
    const agreedContract = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'agreed_test',
      price_minor: 200,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 20,
      challenge_window_seconds: 3600,
    });
    await pool.query("UPDATE pact_contracts SET status = 'AGREED' WHERE contract_id = $1", [agreedContract.contract_id]);
    const fundedAgreed = await fundEscrow(agreedContract.contract_id, orgId);
    assert.equal(fundedAgreed.status, 'FUNDED');

    // Controller calls without req.body covering optional chaining branches
    await postDeliver({ org: { id: sellerId }, params: { id: agreedContract.contract_id } }, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    let verifyNoBodyErr = null;
    await postVerify({ params: { id: agreedContract.contract_id } }, resMock, (err) => { verifyNoBodyErr = err; });
    assert.ok(verifyNoBodyErr);

    await postDispute({ org: { id: orgId }, params: { id: agreedContract.contract_id } }, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    // Bond > Held branch test (slashed = held, released = 0)
    const bondOverPriceContract = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'bond_over_price',
      price_minor: 500,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 1000,
      challenge_window_seconds: 3600,
    });
    await fundEscrow(bondOverPriceContract.contract_id, orgId);
    await deliverWork(bondOverPriceContract.contract_id, sellerId);
    const bondOverRes = await disputeContract(bondOverPriceContract.contract_id, { valid: true }, orgId);
    assert.equal(bondOverRes.status, 'SLASHED');
    assert.equal(bondOverRes.slashed_minor, 500);
    assert.equal(bondOverRes.released_minor, 0);

    // Missing escrow rows in dispute and settle
    const orphanContract = await createContract(orgId, {
      buyer_intent_id: intentId,
      seller_org_id: sellerId,
      task_spec_hash: 'orphan_escrow',
      price_minor: 500,
      currency: 'USD',
      verification_tier: 'T0-reexec',
      seller_bond_minor: 100,
      challenge_window_seconds: 3600,
    });
    // Dispute before fund (in status PROPOSED) -> ILLEGAL_TRANSITION
    await assert.rejects(() => disputeContract(orphanContract.contract_id, {}, orgId), isIllegalTransition);

    // Manually set status to DELIVERED without funding escrow
    await pool.query("UPDATE pact_contracts SET status = 'DELIVERED' WHERE contract_id = $1", [orphanContract.contract_id]);
    await assert.rejects(() => disputeContract(orphanContract.contract_id, { valid: true }, orgId), isEscrowNotFound);

    // Manually set status to VERIFIED without funding escrow
    await pool.query("UPDATE pact_contracts SET status = 'VERIFIED' WHERE contract_id = $1", [orphanContract.contract_id]);
    await assert.rejects(() => settleEscrow(orphanContract.contract_id, orgId), isEscrowNotFound);

    // Alternative auth sources in pact_controller.resolveOrgId
    const reqSessionOrg = {
      session: { current_org_id: orgId },
      params: { id: c.contract_id },
      body: {},
    };
    await getContractHandler(reqSessionOrg, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);

    const reqUserOrg = {
      user: { org_id: orgId },
      params: { id: c.contract_id },
      body: {},
    };
    await getContractHandler(reqUserOrg, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);
  });
});
