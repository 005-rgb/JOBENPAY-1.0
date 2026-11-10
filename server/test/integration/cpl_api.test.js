// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { createSession } from '../../src/repositories/sessions.js';
import { createAgentApiKey, hashAgentApiKey } from '../../src/lib/agentApiKeys.js';
import { env } from '../../src/config.js';
import { createAndSaveCognitiveSnapshot } from '../../src/services/snapshot_service.js';

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

async function createAgentForOrg(orgId, name = 'CPL Agent') {
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

test('PRD 1.7 Cognitive Provenance Layer (CPL) API Integration Suite', async (t) => {
  const { url, server } = await startTestApp();

  await t.test('test_snapshot_created_and_queried: Cognitive Snapshot can be created and fetched via API', async () => {
    const { orgId, headers: userHeaders } = await createOrgUserAndSession('cpl-snap');
    const requestId = crypto.randomUUID();

    const snapshot = await createAndSaveCognitiveSnapshot({
      requestId,
      orgId,
      model: {
        provider: 'openai',
        model_id: 'gpt-4o',
        model_version: '2024-08-06',
        temperature: 0,
        seed: 42,
      },
      inputs: {
        user_prompt_hash: `sha256:${'1'.repeat(64)}`,
        context_hash: `sha256:${'2'.repeat(64)}`,
        document_hashes: [],
      },
      outputs: {
        decision: 'APPROVED',
        reasoning_trace_hash: `sha256:${'3'.repeat(64)}`,
        raw_output_hash: `sha256:${'4'.repeat(64)}`,
        decision_integrity_score: 95,
      },
    });

    assert.ok(snapshot.snapshot_hash);

    // Query snapshot via GET /api/v1/requests/:id/snapshot
    const res = await fetch(`${url}/api/v1/requests/${requestId}/snapshot`, {
      method: 'GET',
      headers: userHeaders,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.request_id, requestId);
    assert.equal(body.snapshot_hash, snapshot.snapshot_hash);
    assert.equal(body.outputs.decision, 'APPROVED');
  });

  await t.test('test_replay_endpoints: POST and GET /api/v1/requests/:id/replay', async () => {
    const { orgId, headers: userHeaders } = await createOrgUserAndSession('cpl-replay');
    const requestId = crypto.randomUUID();

    await createAndSaveCognitiveSnapshot({
      requestId,
      orgId,
      model: {
        provider: 'openai',
        model_id: 'gpt-4o',
        model_version: '2024-08-06',
        temperature: 0,
        seed: 42,
      },
      inputs: {
        user_prompt_hash: `sha256:${'a'.repeat(64)}`,
        context_hash: `sha256:${'b'.repeat(64)}`,
        document_hashes: [],
      },
      outputs: {
        decision: 'APPROVED',
        reasoning_trace_hash: `sha256:${'c'.repeat(64)}`,
        raw_output_hash: `sha256:${'d'.repeat(64)}`,
        decision_integrity_score: 90,
      },
    });

    // 1. POST /api/v1/requests/:id/replay
    const postRes = await fetch(`${url}/api/v1/requests/${requestId}/replay`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({}),
    });

    assert.equal(postRes.status, 200);
    const postBody = await postRes.json();
    assert.equal(postBody.reproducibility_score, 100);
    assert.equal(postBody.decision, 'AUTO_APPROVE');
    assert.equal(postBody.components.decision, 1);
    assert.equal(postBody.components.reasoning, 1);
    assert.equal(postBody.components.raw, 1);

    // 2. GET /api/v1/requests/:id/replay
    const getRes = await fetch(`${url}/api/v1/requests/${requestId}/replay`, {
      method: 'GET',
      headers: userHeaders,
    });

    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.reproducibility_score, 100);
    assert.equal(getBody.decision, 'AUTO_APPROVE');
  });

  await t.test('test_agent_transaction_generates_cpl_and_sar: Agent TX with DIP records CPL provenance in SAR', async () => {
    const { orgId, userId, headers: userHeaders } = await createOrgUserAndSession('cpl-tx');
    const agent = await createAgentForOrg(orgId, 'CPL Agent');

    // 1. Create Intent Anchor
    const anchorRes = await fetch(`${url}/api/v1/intents`, {
      method: 'POST',
      headers: userHeaders,
      body: JSON.stringify({
        natural_language_input: 'Purchase Dell Precision workstations under $2500 for development.',
        structured_intent: {
          purpose: 'equipment_purchase',
          constraints: {
            amount_range: { min: '1000', max: '250000' },
            vendor_categories: ['electronics', 'hardware'],
            allowed_brands: ['Dell'],
          },
        },
      }),
    });
    const anchor = await anchorRes.json();
    assert.equal(anchorRes.status, 201);

    // 2. Propose agent transaction with matching reasoning trace
    const txRes = await fetch(`${url}/agent/v1/transactions`, {
      method: 'POST',
      headers: agent.headers,
      body: JSON.stringify({
        org_id: orgId,
        category: 'SALE',
        sub_type: 'standard',
        amount_minor: 180000,
        currency: 'USD',
        intent_mandate_id: anchor.intent_id,
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
              claim: 'Price $1800 is under the $2500 maximum limit',
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

    assert.equal(txRes.status, 200);
    const txBody = await txRes.json();
    assert.equal(txBody.status, 'APPROVED');
    assert.equal(txBody.decision, 'AUTO_APPROVE');
    assert.equal(txBody.reproducibility_score, 100);
    assert.ok(txBody.sar);
    assert.ok(txBody.sar.cognitive_provenance);
    assert.equal(txBody.sar.cognitive_provenance.reproducibility_score, 100);
    assert.equal(txBody.sar.cognitive_provenance.model_id, 'gpt-4o');
  });

  await closeTestApp(server);
});
