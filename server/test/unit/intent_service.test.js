/**
 * server/test/unit/intent_service.test.js
 * PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP6 Unit Test Suite)
 * Tests 100% coverage of intent_service logic: creation, validation, matching, hashing, and revocation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import {
  createIntent,
  revokeIntent,
  getIntentMandate,
  validateIntentMatch,
  verifyIntentSignature,
} from '../../src/services/intent_service.js';
import { evaluateIntentMandateStageA } from '../../src/services/decision_engine_intent.js';
import { postIntent, postRevokeIntent, getIntentHandler } from '../../src/controllers/intent_controller.js';
import { generateEd25519Keys, signEd25519 } from '../../src/lib/crypto.js';

async function createOrgFixture(namePrefix) {
  const orgId = crypto.randomUUID();
  const slug = `${namePrefix}-${orgId.slice(0, 8)}`;
  await pool.query(
    'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)',
    [orgId, `Org ${namePrefix}`, slug]
  );
  return orgId;
}

async function createUserFixture() {
  const userId = crypto.randomUUID();
  const email = `test-user-${userId.slice(0, 8)}@example.com`;
  await pool.query(
    'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
    [userId, email, 'hash123']
  );
  return userId;
}

test('PRD 1.4 Fase B: Intent Service Unit Tests', async (t) => {
  await t.test('test_intent_valid_passes: creates valid intent and passes matching transaction', async () => {
    const orgId = await createOrgFixture('intent-valid');
    const userId = await createUserFixture();

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'Beli laptop untuk tim engineering, budget maks $2000, hanya dari vendor terdaftar',
      structured_intent: {
        purpose: 'equipment_purchase',
        amount_range: { min: 0, max: 200000 },
        vendor_categories: ['electronics', 'office_equipment'],
        deadline: '2026-12-31T23:59:59Z',
      },
    });

    assert.ok(created.intent_id);
    assert.equal(created.status, 'ACTIVE');
    assert.ok(created.intent_hash.startsWith('sha256:'));
    assert.ok(created.signature.startsWith('ed25519:'));

    // Matching transaction
    const tx = {
      purpose: 'equipment_purchase',
      amount_minor: 150000,
      currency: 'USD',
      counterparty_id: 'electronics',
    };

    const match = await validateIntentMatch(orgId, created.intent_id, tx);
    assert.equal(match.valid, true);

    const deResult = await evaluateIntentMandateStageA({
      orgId,
      mandate: { ai: { intentCheck: true } },
      transaction: { ...tx, intent_mandate_id: created.intent_id },
    });
    assert.equal(deResult.valid, true);
  });

  await t.test('test_intent_missing_rejects: rejects when mandate requires intent but none provided', async () => {
    const orgId = await createOrgFixture('intent-missing');

    const result = await evaluateIntentMandateStageA({
      orgId,
      mandate: { ai: { intentCheck: true } },
      transaction: {
        purpose: 'equipment_purchase',
        amount_minor: 1000,
        currency: 'USD',
      },
    });

    assert.equal(result.valid, false);
    assert.equal(result.code, 'INTENT_MANDATE_MISSING');
    assert.deepEqual(result.reason_codes, ['INTENT_MANDATE_MISSING']);
  });

  await t.test('test_intent_expired_rejects: rejects transaction when intent validity window is expired', async () => {
    const orgId = await createOrgFixture('intent-expired');
    const userId = await createUserFixture();

    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const olderDate = new Date(Date.now() - 7200 * 1000).toISOString();

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'Short lived intent',
      structured_intent: {
        purpose: 'cloud_hosting',
        amount_range: { min: 0, max: 50000 },
        vendor_categories: ['cloud'],
      },
      valid_from: olderDate,
      valid_to: pastDate,
    });

    const tx = {
      purpose: 'cloud_hosting',
      amount_minor: 1000,
      currency: 'USD',
      counterparty_id: 'cloud',
    };

    const match = await validateIntentMatch(orgId, created.intent_id, tx);
    assert.equal(match.valid, false);
    assert.equal(match.reason, 'INTENT_MANDATE_EXPIRED');

    const deResult = await evaluateIntentMandateStageA({
      orgId,
      mandate: { ai: { intentCheck: true } },
      transaction: { ...tx, intent_mandate_id: created.intent_id },
    });
    assert.equal(deResult.valid, false);
    assert.equal(deResult.code, 'INTENT_MANDATE_EXPIRED');
  });

  await t.test('test_intent_purpose_mismatch: rejects when transaction purpose differs from intent', async () => {
    const orgId = await createOrgFixture('intent-purpose');
    const userId = await createUserFixture();

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'Beli laptop untuk tim engineering',
      structured_intent: {
        purpose: 'equipment_purchase',
        amount_range: { min: 0, max: 200000 },
        vendor_categories: ['electronics'],
      },
    });

    const tx = {
      purpose: 'marketing_advertisement',
      amount_minor: 50000,
      currency: 'USD',
      counterparty_id: 'electronics',
    };

    const match = await validateIntentMatch(orgId, created.intent_id, tx);
    assert.equal(match.valid, false);
    assert.equal(match.reason, 'INTENT_MISMATCH');

    const deResult = await evaluateIntentMandateStageA({
      orgId,
      mandate: { ai: { intentCheck: true } },
      transaction: { ...tx, intent_mandate_id: created.intent_id },
    });
    assert.equal(deResult.valid, false);
    assert.equal(deResult.code, 'INTENT_MISMATCH');
  });

  await t.test('test_intent_amount_exceeded: rejects when transaction amount exceeds intent max', async () => {
    const orgId = await createOrgFixture('intent-amount');
    const userId = await createUserFixture();

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'Budget maksimal $500',
      structured_intent: {
        purpose: 'office_supplies',
        amount_range: { min: 1000, max: 50000 },
        vendor_categories: ['stationery'],
      },
    });

    // Exceeds max
    const txTooHigh = {
      purpose: 'office_supplies',
      amount_minor: 60000,
      currency: 'USD',
      counterparty_id: 'stationery',
    };
    const matchHigh = await validateIntentMatch(orgId, created.intent_id, txTooHigh);
    assert.equal(matchHigh.valid, false);
    assert.equal(matchHigh.reason, 'INTENT_AMOUNT_EXCEEDED');

    // Below min
    const txTooLow = {
      purpose: 'office_supplies',
      amount_minor: 500,
      currency: 'USD',
      counterparty_id: 'stationery',
    };
    const matchLow = await validateIntentMatch(orgId, created.intent_id, txTooLow);
    assert.equal(matchLow.valid, false);
    assert.equal(matchLow.reason, 'INTENT_AMOUNT_EXCEEDED');
  });

  await t.test('test_intent_vendor_mismatch: rejects when counterparty category is not in allowed categories', async () => {
    const orgId = await createOrgFixture('intent-vendor');
    const userId = await createUserFixture();

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'Beli laptop khusus vendor electronics',
      structured_intent: {
        purpose: 'equipment_purchase',
        amount_range: { min: 0, max: 200000 },
        vendor_categories: ['electronics', 'authorized_distributor'],
      },
    });

    const tx = {
      purpose: 'equipment_purchase',
      amount_minor: 100000,
      currency: 'USD',
      counterparty_id: 'unauthorized_blackmarket_vendor',
    };

    const match = await validateIntentMatch(orgId, created.intent_id, tx);
    assert.equal(match.valid, false);
    assert.equal(match.reason, 'INTENT_VENDOR_MISMATCH');
  });

  await t.test('test_intent_signature_verify: verifies cryptographic Ed25519 signature', async () => {
    const keys = generateEd25519Keys();
    const orgId = await createOrgFixture('intent-sig');
    const userId = await createUserFixture();

    const hashPayload = 'sha256:d55580665f9736c0';
    const sig = signEd25519(keys.privateKey, hashPayload);

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'User signed intent',
      structured_intent: {
        purpose: 'cloud_services',
        amount_range: { min: 0, max: 10000 },
        vendor_categories: ['aws'],
      },
      signature: `ed25519:${sig}`,
      signing_key_id: 'custom-principal-key',
    });

    const isMatch = verifyIntentSignature(
      { signature: `ed25519:${sig}`, intent_hash: hashPayload },
      keys.publicKey
    );
    assert.equal(isMatch, true);

    const isFake = verifyIntentSignature(
      { signature: `ed25519:invalid`, intent_hash: hashPayload },
      keys.publicKey
    );
    assert.equal(isFake, false);

    assert.equal(verifyIntentSignature(null, keys.publicKey), false);
    assert.equal(verifyIntentSignature({ signature: 'foo' }, keys.publicKey), false);
  });

  await t.test('test_intent_revocation: revokes intent mandate and subsequent match rejects', async () => {
    const orgId = await createOrgFixture('intent-revoke');
    const userId = await createUserFixture();

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'Temporary intent to be revoked',
      structured_intent: {
        purpose: 'consulting',
        amount_range: { min: 0, max: 100000 },
        vendor_categories: ['legal'],
      },
    });

    const fetchedBefore = await getIntentMandate(orgId, created.intent_id);
    assert.equal(fetchedBefore.status, 'ACTIVE');

    const revoked = await revokeIntent(orgId, created.intent_id);
    assert.equal(revoked.status, 'REVOKED');
    assert.equal(revoked.intent_id, created.intent_id);

    const fetchedAfter = await getIntentMandate(orgId, created.intent_id);
    assert.equal(fetchedAfter.status, 'REVOKED');

    const tx = {
      purpose: 'consulting',
      amount_minor: 50000,
      currency: 'USD',
      counterparty_id: 'legal',
    };
    const match = await validateIntentMatch(orgId, created.intent_id, tx);
    assert.equal(match.valid, false);
    assert.equal(match.reason, 'INTENT_MANDATE_EXPIRED');
  });

  await t.test('test_intent_coverage_edge_cases: covers 100% of branches, errors, and controller methods', async () => {
    const orgId = await createOrgFixture('intent-cov');
    const userId = await createUserFixture();

    // Missing orgId / payload errors
    await assert.rejects(() => createIntent(null, userId, {}), /orgId is required/);
    await assert.rejects(() => createIntent(orgId, userId, { natural_language_input: '' }), /Invalid intent mandate payload/);
    await assert.rejects(() => createIntent(orgId, userId, {
      natural_language_input: 'Test',
      structured_intent: { purpose: 'x', amount_range: { min: 10, max: 5 }, vendor_categories: ['v'] },
      valid_from: 'invalid-date',
    }), /Invalid timestamp in valid_from/);
    await assert.rejects(() => createIntent(orgId, userId, {
      natural_language_input: 'Test',
      structured_intent: { purpose: 'x', amount_range: { min: 0, max: 100 }, vendor_categories: ['v'] },
      valid_from: '2026-12-01T00:00:00Z',
      valid_to: '2026-11-01T00:00:00Z',
    }), /valid_to must be after valid_from/);

    // Revoke and Get invalid IDs
    await assert.rejects(() => revokeIntent(null, crypto.randomUUID()), /orgId and intentId are required/);
    await assert.rejects(() => revokeIntent(orgId, 'not-a-uuid'), /Intent mandate not found/);
    await assert.rejects(() => revokeIntent(orgId, crypto.randomUUID()), /Intent mandate not found/);
    await assert.rejects(() => getIntentMandate(null, crypto.randomUUID()), /orgId and intentId are required/);
    await assert.rejects(() => getIntentMandate(orgId, 'not-a-uuid'), /Intent mandate not found/);
    await assert.rejects(() => getIntentMandate(orgId, crypto.randomUUID()), /Intent mandate not found/);

    // validateIntentMatch edge cases
    assert.equal((await validateIntentMatch(orgId, null, {})).reason, 'INTENT_MANDATE_MISSING');
    assert.equal((await validateIntentMatch(orgId, crypto.randomUUID(), {})).reason, 'INTENT_NOT_FOUND');

    const created = await createIntent(orgId, userId, {
      natural_language_input: 'Edge case test',
      structured_intent: {
        purpose: 'testing',
        amount_range: { min: 0, max: 100 },
        vendor_categories: ['test_vendor'],
      },
    });

    // Invalid amount string
    assert.equal((await validateIntentMatch(orgId, created.intent_id, {
      purpose: 'testing',
      amount_minor: 'invalid_bigint',
      counterparty_id: 'test_vendor',
    })).reason, 'INTENT_AMOUNT_EXCEEDED');

    // Future valid_from
    await pool.query(
      "UPDATE intent_mandates SET valid_from = now() + interval '1 day', valid_to = now() + interval '2 days' WHERE intent_id = $1",
      [created.intent_id]
    );
    assert.equal((await validateIntentMatch(orgId, created.intent_id, {
      purpose: 'testing',
      amount_minor: 50,
      counterparty_id: 'test_vendor',
    })).reason, 'INTENT_MANDATE_EXPIRED');

    // Controller edge cases
    const reqMock = {
      org: { id: orgId },
      session: { user_id: userId },
      body: {
        natural_language_input: 'Mock test',
        structured_intent: {
          purpose: 'mock',
          amount_range: { min: 0, max: 1000 },
          vendor_categories: ['mock_vendor'],
        },
      },
      params: {},
    };

    let statusCode = null;
    let jsonBody = null;
    const resMock = {
      status(s) { statusCode = s; return this; },
      json(b) { jsonBody = b; return this; },
    };

    await postIntent(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 201);
    assert.ok(jsonBody.intent_id);

    reqMock.params.intent_id = jsonBody.intent_id;
    await getIntentHandler(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.status, 'ACTIVE');

    await postRevokeIntent(reqMock, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 200);
    assert.equal(jsonBody.status, 'REVOKED');

    // Controller error propagation
    let caughtErr = null;
    await postIntent({ org: {} }, resMock, (err) => { caughtErr = err; });
    assert.ok(caughtErr);

    let caughtRevokeErr = null;
    await postRevokeIntent({ org: {}, params: {} }, resMock, (err) => { caughtRevokeErr = err; });
    assert.ok(caughtRevokeErr);

    let caughtGetErr = null;
    await getIntentHandler({ org: {}, params: {} }, resMock, (err) => { caughtGetErr = err; });
    assert.ok(caughtGetErr);

    // evaluateIntentMandateStageA edge branches
    assert.equal((await evaluateIntentMandateStageA({ mandate: {} })).valid, true);
    assert.equal((await evaluateIntentMandateStageA({
      orgId,
      mandate: { policy: { ai: { intentCheck: true } } },
      transaction: { intentMandateId: created.intent_id },
    })).valid, false);
    assert.equal((await evaluateIntentMandateStageA({
      orgId,
      mandate: {},
      transaction: { requireIntentCheck: true, intentMandateId: created.intent_id },
    })).valid, false);

    // Fallback key generation when env key is unset
    const { env: runtimeEnv } = await import('../../src/config.js');
    const savedKey = runtimeEnv.JOBENPAY_LEDGER_SIGNING_KEY;
    try {
      runtimeEnv.JOBENPAY_LEDGER_SIGNING_KEY = null;
      const genFallback = await createIntent(orgId, userId, {
        natural_language_input: 'Fallback generated key test',
        structured_intent: {
          purpose: 'fallback_purpose',
          amount_range: { min: 0, max: 100 },
          vendor_categories: ['v'],
        },
      });
      assert.ok(genFallback.intent_id);
    } finally {
      runtimeEnv.JOBENPAY_LEDGER_SIGNING_KEY = savedKey;
    }

    // Signature without ed25519 prefix & without signing_key_id
    const keys = generateEd25519Keys();
    const rawSig = signEd25519(keys.privateKey, 'sha256:abcd');
    const rawSigCreated = await createIntent(orgId, userId, {
      natural_language_input: 'Raw signature test',
      structured_intent: {
        purpose: 'raw_sig',
        amount_range: { min: 0, max: 200 },
        vendor_categories: ['v'],
        deadline: '2028-01-01T00:00:00Z',
      },
      signature: rawSig,
    });
    assert.ok(rawSigCreated.signature.startsWith('ed25519:'));

    // Invalid deadline
    await assert.rejects(() => createIntent(orgId, userId, {
      natural_language_input: 'Bad deadline',
      structured_intent: {
        purpose: 'bad_dl',
        amount_range: { min: 0, max: 100 },
        vendor_categories: ['v'],
        deadline: 'not-a-date',
      },
    }), /Invalid timestamp in structured_intent.deadline/);

    // Invalid signature verify throws in try/catch
    assert.equal(verifyIntentSignature({ signature: 'ed25519:notbase64', intent_hash: 'hash' }, 'invalid-pub-key'), false);

    // Controller resolveOrgId and resolveUserId alternatives
    const reqSessionOrg = {
      session: { current_org_id: orgId, user_id: userId },
      body: {
        natural_language_input: 'Session org test',
        structured_intent: { purpose: 'session_org', amount_range: { min: 0, max: 10 }, vendor_categories: ['v'] },
      },
      params: {},
    };
    await postIntent(reqSessionOrg, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 201);

    const reqUserOrg = {
      user: { org_id: orgId, id: userId, user_id: userId },
      body: {
        natural_language_input: 'User org test',
        structured_intent: { purpose: 'user_org', amount_range: { min: 0, max: 10 }, vendor_categories: ['v'] },
      },
      params: {},
    };
    await postIntent(reqUserOrg, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 201);

    const reqUserIdAlt = {
      org: { id: orgId },
      user: { user_id: userId },
      body: {
        natural_language_input: 'User id alt test',
        structured_intent: { purpose: 'user_id_alt', amount_range: { min: 0, max: 10 }, vendor_categories: ['v'] },
      },
      params: {},
    };
    await postIntent(reqUserIdAlt, resMock, (err) => { if (err) throw err; });
    assert.equal(statusCode, 201);
    // Test passing custom dbClient
    const mockClient = { query: (sql, params) => pool.query(sql, params) };
    const customClientIntent = await createIntent(orgId, userId, {
      natural_language_input: 'Custom db client test',
      structured_intent: { purpose: 'client_test', amount_range: { min: 0, max: 100 }, vendor_categories: ['c'] },
    }, mockClient);
    await getIntentMandate(orgId, customClientIntent.intent_id, mockClient);
    await revokeIntent(orgId, customClientIntent.intent_id, mockClient);
    await validateIntentMatch(orgId, customClientIntent.intent_id, {
      purpose: 'client_test',
      amount_minor: 10,
      counterparty_id: 'c',
    }, mockClient);

    // Test alternate decision_engine_intent flags
    assert.equal((await evaluateIntentMandateStageA({
      orgId,
      mandate: { ai: { intent_check: true } },
      transaction: { intentMandateId: created.intent_id },
    })).valid, false);
    assert.equal((await evaluateIntentMandateStageA({
      orgId,
      mandate: { policy: { ai: { intent_check: true } } },
      transaction: { intentMandateId: created.intent_id },
    })).valid, false);

    // Test vendor candidates variations (counterpartyId, counterparty, vendorCategory, metadata, etc.)
    const candIntent = await createIntent(orgId, userId, {
      natural_language_input: 'Candidate variations',
      structured_intent: {
        purpose: 'candidate_test',
        amount_range: { min: 0, max: 1000 },
        vendor_categories: ['cand_vendor', 'meta_vendor'],
      },
    });

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      metadata: { purpose: 'candidate_test', vendor_category: 'cand_vendor' },
      amountMinor: 50,
    })).valid, true);

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      sub_type: 'candidate_test',
      amount: 60,
      counterparty: 'cand_vendor',
    })).valid, true);

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      category: 'candidate_test',
      amount: 70,
      vendorCategory: 'cand_vendor',
    })).valid, true);

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      purpose: 'candidate_test',
      amount: 80,
      counterpartyId: 'cand_vendor',
    })).valid, true);

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      purpose: 'candidate_test',
      amount: 90,
      metadata: { counterparty: 'meta_vendor' },
    })).valid, true);

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      purpose: 'candidate_test',
      amount: 95,
      metadata: { vendor: 'meta_vendor' },
    })).valid, true);

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      purpose: 'candidate_test',
      amount: 99,
      payee_id: 'cand_vendor',
    })).valid, true);

    assert.equal((await validateIntentMatch(orgId, candIntent.intent_id, {
      purpose: 'candidate_test',
      amount: 99,
      payeeId: 'cand_vendor',
    })).valid, true);

    // Mock client returning mandate with null structured_intent to cover fallback branches
    const nullStructuredMockClient = {
      query: async () => ({
        rows: [{
          intent_id: crypto.randomUUID(),
          org_id: orgId,
          status: 'ACTIVE',
          valid_from: new Date(Date.now() - 60000).toISOString(),
          valid_to: new Date(Date.now() + 60000).toISOString(),
          structured_intent: null,
        }],
      }),
    };
    const nullStructuredResult = await validateIntentMatch(
      orgId,
      crypto.randomUUID(),
      {}, // tx without purpose or counterparty -> tests normalize(undefined)
      nullStructuredMockClient
    );
    assert.equal(nullStructuredResult.valid, false);
    assert.equal(nullStructuredResult.reason, 'INTENT_VENDOR_MISMATCH');
  });
});
