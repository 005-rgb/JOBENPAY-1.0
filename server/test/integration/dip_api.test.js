// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';
import { createAgentApiKey, hashAgentApiKey } from '../../src/lib/agentApiKeys.js';
import { env } from '../../src/config.js';

async function createOrgUserAndSession(slugPrefix) {
  const orgId = crypto.randomUUID();
  const slug = `${slugPrefix}-${orgId.slice(0, 8)}`;
  await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, `Org ${slugPrefix}`, slug]);

  const userId = crypto.randomUUID();
  await pool.query(
    'INSERT INTO users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
    [userId, `owner-${slug}@jobenpay.test`, 'dummy-hash', `Owner ${slugPrefix}`]
  );
  await pool.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, userId, 'OWNER', false]
  );

  const csrfToken = crypto.randomUUID();
  const { token: sessionToken } = await createSession(orgId, {
    userId,
    currentOrgId: orgId,
    csrfSecret: csrfToken,
    expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
  });

  return {
    orgId,
    userId,
    headers: {
      'content-type': 'application/json',
      'Cookie': `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
      'x-jobenpay-environment': 'SANDBOX',
      'x-environment': 'SANDBOX',
    },
  };
}

async function createAgentForOrg(orgId, name = 'DIP Agent') {
  const agentId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO agents (id, org_id, name, status) VALUES ($1, $2, $3, 'ACTIVE')`,
    [agentId, orgId, name]
  );

  const { prefix, apiKey } = createAgentApiKey();
  const pepper = env.JOBENPAY_HMAC_PEPPER || 'RTlFNRGMX+eEl4+GpEjOWcVJhMOHiXkAe1kIAdy2hZA=';
  const keyHash = hashAgentApiKey(pepper, apiKey);

  await pool.query(
    `INSERT INTO agent_api_keys (id, org_id, agent_id, prefix, key_hash) VALUES ($1, $2, $3, $4, $5)`,
    [crypto.randomUUID(), orgId, agentId, prefix, keyHash]
  );

  return {
    agentId,
    apiKey,
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
  };
}

test('PRD 1.6 §10.2 Decision Integrity Proof (DIP) Integration Tests', async (t) => {
  const { server, url } = await startTestApp();

  t.after(async () => {
    await closeTestApp(server);
  });

  let fixture;
  let agentFixture;
  let createdAnchor;
  let approvedTxId;

  // 1. test_intent_create_with_signature
  await t.test('test_intent_create_with_signature: POST /api/v1/intents -> 201 + signature valid', async () => {
    fixture = await createOrgUserAndSession('dip-intents');
    agentFixture = await createAgentForOrg(fixture.orgId);

    const res = await fetch(`${url}/api/v1/intents`, {
      method: 'POST',
      headers: fixture.headers,
      body: JSON.stringify({
        natural_language_input: 'Pengadaan laptop engineering Dell/Apple dengan RAM minimal 32GB budget $2000',
        structured_intent: {
          purpose: 'equipment_purchase',
          constraints: {
            amount_range: { min: '0', max: '200000' },
            vendor_categories: ['electronics', 'it_hardware'],
            allowed_brands: ['Apple', 'Dell'],
            required_attributes: [
              { key: 'ram_gb', operator: 'gte', value: 32 },
            ],
            deadline: '2027-12-31T23:59:59Z',
          },
        },
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.intent_id);
    assert.equal(body.status, 'ACTIVE');
    assert.ok(body.intent_hash.startsWith('sha256:'));
    assert.ok(body.signature);
    createdAnchor = body;
  });

  // 2. test_reasoning_trace_required
  await t.test('test_reasoning_trace_required: Transaksi tanpa trace -> REJECTED REASONING_TRACE_MISSING', async () => {
    const res = await fetch(`${url}/agent/v1/transactions`, {
      method: 'POST',
      headers: agentFixture.headers,
      body: JSON.stringify({
        category: 'SALE',
        sub_type: 'standard',
        amount_minor: 180000,
        currency: 'USD',
        intent_mandate_id: createdAnchor.intent_id,
        // No reasoning_trace provided
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'REJECTED');
    assert.equal(body.decision, 'REJECT');
    assert.ok(body.reason_codes.includes('REASONING_TRACE_MISSING'));
    assert.equal(body.dis_score, 0);
  });

  // 3. test_dip_computed_on_request
  await t.test('test_dip_computed_on_request: Transaksi dengan trace -> DIP dihitung & AUTO_APPROVE', async () => {
    const res = await fetch(`${url}/agent/v1/transactions`, {
      method: 'POST',
      headers: agentFixture.headers,
      body: JSON.stringify({
        category: 'SALE',
        sub_type: 'standard',
        amount_minor: 180000,
        currency: 'USD',
        counterparty_id: null,
        intent_mandate_id: createdAnchor.intent_id,
        metadata: {
          brand: 'Dell',
          counterparty_category: 'electronics',
          ram_gb: 32,
        },
        reasoning_trace: {
          request_id: 'tx_req_1',
          reasons: [
            {
              claim: 'RAM 32GB matches hardware engineering requirement',
              evidence_ref: 'field:request.metadata.ram_gb',
              data_source: 'request_metadata',
              extracted_attributes: { ram_gb: 32, brand: 'Dell' },
            },
            {
              claim: 'Price $1800 is under the $2000 maximum limit',
              evidence_ref: 'field:request.amount_minor',
              data_source: 'request_metadata',
              extracted_attributes: { amount_minor: '180000' },
            },
            {
              claim: 'Vendor categorized under electronics in inventory record',
              evidence_ref: 'record:rec_vendor_01',
              data_source: 'vendor_profile',
              extracted_attributes: { vendor_category: 'electronics' },
            },
          ],
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'APPROVED');
    assert.equal(body.decision, 'AUTO_APPROVE');
    assert.ok(body.dis_score >= 80, `Expected score >= 80, got ${body.dis_score}`);
    assert.ok(body.sar_id);
    approvedTxId = body.intent_id;
  });

  // 4. test_dip_sar_includes_score
  await t.test('test_dip_sar_includes_score: SAR memuat decision_integrity.score', async () => {
    const res = await fetch(`${url}/agent/v1/transactions`, {
      method: 'POST',
      headers: agentFixture.headers,
      body: JSON.stringify({
        category: 'SALE',
        sub_type: 'standard',
        amount_minor: 150000,
        currency: 'USD',
        intent_mandate_id: createdAnchor.intent_id,
        metadata: {
          brand: 'Apple',
          counterparty_category: 'electronics',
          ram_gb: 64,
        },
        reasoning_trace: {
          request_id: 'tx_req_sar_test',
          reasons: [
            {
              claim: 'Apple MacBook Pro 64GB fulfills developer spec',
              evidence_ref: 'field:request.metadata.ram_gb',
              data_source: 'request_metadata',
              extracted_attributes: { ram_gb: 64, brand: 'Apple' },
            },
            {
              claim: 'Amount $1500 within limits',
              evidence_ref: 'field:request.amount_minor',
              data_source: 'request_metadata',
              extracted_attributes: { amount_minor: '150000' },
            },
            {
              claim: 'Supplier record confirmed in electronics category',
              evidence_ref: 'record:rec_apple_store',
              data_source: 'vendor_profile',
              extracted_attributes: { vendor_category: 'electronics' },
            },
          ],
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.sar, 'SAR object should be returned on approved transaction');
    assert.ok(body.sar.decision_integrity, 'SAR must include decision_integrity');
    assert.equal(body.sar.decision_integrity.score, body.dis_score);
    assert.ok(body.sar.decision_integrity.components);
  });

  // 5. test_dip_low_score_requires_approval
  await t.test('test_dip_low_score_requires_approval: 50 <= DIS < 80 -> PENDING_APPROVAL / DIP_LOW_SCORE', async () => {
    // Amount out of range (C_amount = 0), unclassified vendor category (C_vendor = 0.5)
    // DIS = 100 * (0.15*1 + 0.15*0 + 0.20*0.5 + 0.10*1 + 0.20*1 + 0.20*0.5) = 15 + 0 + 10 + 10 + 20 + 10 = 65
    const res = await fetch(`${url}/agent/v1/transactions`, {
      method: 'POST',
      headers: agentFixture.headers,
      body: JSON.stringify({
        category: 'SALE',
        sub_type: 'standard',
        amount_minor: 350000, // Out of range -> C_amount = 0
        currency: 'USD',
        intent_mandate_id: createdAnchor.intent_id,
        metadata: {
          brand: 'Apple',
          counterparty_category: null, // Unclassified -> C_vendor = 0.5
          ram_gb: 32,
        },
        reasoning_trace: {
          request_id: 'tx_req_low_score',
          reasons: [
            {
              claim: 'RAM 32GB meets specification',
              evidence_ref: 'field:request.metadata.ram_gb',
              data_source: 'request_metadata',
              extracted_attributes: { ram_gb: 32, brand: 'Apple' },
            },
            {
              claim: 'General supplier profile',
              evidence_ref: 'record:rec_v_99',
              data_source: 'vendor_profile',
              extracted_attributes: {},
            },
            {
              claim: 'Hardware equipment category standard',
              evidence_ref: 'record:rec_v_100',
              data_source: 'vendor_profile',
              extracted_attributes: {},
            },
          ],
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.dis_score >= 50 && body.dis_score < 80, `Expected 50 <= DIS < 80, got ${body.dis_score}`);
    assert.equal(body.status, 'PENDING_APPROVAL');
    assert.equal(body.decision, 'REQUIRE_APPROVAL');
    assert.ok(body.reason_codes.includes('DIP_LOW_SCORE'));
  });

  // 6. test_dip_critical_rejects
  await t.test('test_dip_critical_rejects: DIS < 50 -> REJECTED / DIP_CRITICAL', async () => {
    // Wrong category (DISPUTE != SALE -> C_purpose = 0), amount way over budget (500000 -> C_amount = 0),
    // wrong vendor (hospitality -> C_vendor = 0), matching brand Apple (C_brand = 1), attributes pass (C_attributes = 1),
    // neutral evidence (C_evidence = 0.5).
    // DIS = 100 * (0 + 0 + 0 + 0.10*1 + 0.20*1 + 0.20*0.5) = 40 < 50
    const res = await fetch(`${url}/agent/v1/transactions`, {
      method: 'POST',
      headers: agentFixture.headers,
      body: JSON.stringify({
        category: 'DISPUTE',
        sub_type: 'chargeback',
        amount_minor: 500000,
        currency: 'USD',
        intent_mandate_id: createdAnchor.intent_id,
        metadata: {
          brand: 'Apple',
          counterparty_category: 'hospitality', // Mismatch vendor
          ram_gb: 32,
        },
        reasoning_trace: {
          request_id: 'tx_req_crit',
          reasons: [
            {
              claim: 'Hardware RAM spec',
              evidence_ref: 'field:request.metadata.ram_gb',
              data_source: 'request_metadata',
              extracted_attributes: { ram_gb: 32, brand: 'Apple' },
            },
            {
              claim: 'Vendor verification',
              evidence_ref: 'record:rec_hosp',
              data_source: 'vendor_profile',
              extracted_attributes: {},
            },
            {
              claim: 'General equipment category standard',
              evidence_ref: 'record:rec_v_101',
              data_source: 'vendor_profile',
              extracted_attributes: {},
            },
          ],
        },
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.dis_score < 50, `Expected DIS < 50, got ${body.dis_score}`);
    assert.equal(body.status, 'REJECTED');
    assert.equal(body.decision, 'REJECT');
    assert.ok(body.reason_codes.includes('DIP_CRITICAL'));
  });

  // 7. test_get_dip_endpoint
  await t.test('test_get_dip_endpoint: GET /api/v1/requests/:id/dip -> returns score & component details', async () => {
    assert.ok(approvedTxId, 'approvedTxId should be defined from test 3');
    const res = await fetch(`${url}/api/v1/requests/${approvedTxId}/dip`, {
      headers: fixture.headers,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.request_id, approvedTxId);
    assert.ok(typeof body.score === 'number');
    assert.ok(body.components);
    assert.ok(typeof body.components.purpose === 'number');
    assert.ok(typeof body.components.amount === 'number');
    assert.ok(typeof body.components.vendor === 'number');
    assert.ok(typeof body.components.brand === 'number');
    assert.ok(typeof body.components.attributes === 'number');
    assert.ok(typeof body.components.evidence === 'number');
    assert.ok(body.reasoning_trace);
    assert.ok(Array.isArray(body.reasoning_trace.reasons));
    assert.ok(body.intent_anchor);
    assert.equal(body.intent_anchor.intent_id, createdAnchor.intent_id);
  });
});
