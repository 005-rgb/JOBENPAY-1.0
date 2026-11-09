// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';
import { hashPassword } from '../../src/lib/crypto.js';

test('DX Endpoints & Environment Webhooks (PRD 3.0)', async (t) => {
  let appInfo;
  const orgId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  let sessionToken = '';
  let csrfToken = '';
  let liveIntentId = '';

  t.before(async () => {
    appInfo = await startTestApp();

    // 1. Create Organization & User
    await pool.query(
      `INSERT INTO organizations (id, name, slug, display_name, legal_name, billing_email)
       VALUES ($1, 'Acme Test Corp', $2, 'Acme Test Corp', 'Acme Test Inc', 'billing@acmetest.cloud')`,
      [orgId, `acme-${orgId.slice(0, 8)}`],
    );

    const pwdHash = await hashPassword('Password123!Safe');
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, $3, 'Acme Owner')`,
      [userId, `owner-${orgId.slice(0, 8)}@acmetest.cloud`, pwdHash],
    );

    await pool.query(
      `INSERT INTO memberships (org_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [orgId, userId],
    );

    sessionToken = crypto.randomBytes(32).toString('hex');
    csrfToken = crypto.randomBytes(16).toString('hex');
    const idHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    await pool.query(
      `INSERT INTO sessions (id_hash, user_id, current_org_id, csrf_secret, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
      [idHash, userId, orgId, csrfToken],
    );

    // Create an agent and mandate
    const agentRes = await pool.query(
      `INSERT INTO agents (org_id, name, status, environment)
       VALUES ($1, 'Live Bot', 'ACTIVE', 'LIVE')
       RETURNING id`,
      [orgId],
    );
    const agentId = agentRes.rows[0].id;

    // Create a failed LIVE transaction for time-travel testing
    liveIntentId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO transaction_intents (
         intent_id, org_id, agent_id, category, sub_type, status,
         amount_minor, currency, mandate_version_id, request_hash, idempotency_key, metadata, environment
       ) VALUES ($1, $2, $3, 'PAYOUT', 'standard', 'FAILED', 15000, 'USD',
         '00000000-0000-4000-8000-000000000000', 'hash_live_fail', $4, '{"error":"PAYPAL_SIMULATED_REJECT"}', 'LIVE')`,
      [liveIntentId, orgId, agentId, `idemp_live_${liveIntentId.slice(0, 8)}`],
    );
  });

  t.after(async () => {
    if (appInfo?.server) {
      await closeTestApp(appInfo.server);
    }
    await pool.query('DELETE FROM transaction_intents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM payees WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM agents WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM memberships WHERE org_id = $1', [orgId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM organizations WHERE id = $1', [orgId]);
    await pool.end();
  });

  function authHeaders(extra = {}) {
    return {
      cookie: `jp_sid=${sessionToken}`,
      'x-csrf-token': csrfToken,
      ...extra,
    };
  }

  await t.test('POST /api/v1/sandbox/seed scrubs PII and populates Sandbox data', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/sandbox/seed`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.seededCount > 0);

    // Verify all seeded transactions are strictly in SANDBOX environment
    const sbxTxs = await pool.query(
      `SELECT * FROM transaction_intents WHERE org_id = $1 AND environment = 'SANDBOX'`,
      [orgId],
    );
    assert.ok(sbxTxs.rows.length >= body.seededCount);
    for (const row of sbxTxs.rows) {
      assert.equal(row.environment, 'SANDBOX');
      assert.ok(Number(row.amount_minor) <= 10000); // small nominal amount
    }
  });

  await t.test('POST /api/v1/debug/time-travel/:live_tx_id clones failed LIVE tx into Sandbox', async () => {
    const res = await fetch(`${appInfo.url}/api/v1/debug/time-travel/${liveIntentId}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.sandbox_intent_id);
    assert.equal(body.replay_url, `/transactions/${body.sandbox_intent_id}`);

    // Verify the newly created transaction exists in SANDBOX
    const cloned = await pool.query(
      `SELECT * FROM transaction_intents WHERE intent_id = $1 AND environment = 'SANDBOX'`,
      [body.sandbox_intent_id],
    );
    assert.equal(cloned.rows.length, 1);
    assert.equal(cloned.rows[0].status, 'FAILED');
    assert.equal(cloned.rows[0].metadata?.cloned_from_live, liveIntentId);
  });

  await t.test('POST /api/v1/webhooks/sbx/paypal blocks mutation of LIVE transactions', async () => {
    const payload = {
      id: `wh_evt_${Date.now()}`,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: liveIntentId, // Points to LIVE transaction
        custom_id: liveIntentId,
      },
    };

    const res = await fetch(`${appInfo.url}/api/v1/webhooks/sbx/paypal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': orgId,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error.code, 'CROSS_ENVIRONMENT_MUTATION_BLOCKED');
  });

  await t.test('Shadow Mode evaluates without executing payout', async () => {
    const { evaluateUnifiedDecision } = await import('../../src/services/decision_engine.js');
    const result = await evaluateUnifiedDecision(orgId, {
      require_vlei: false,
      require_intent: false,
      dip_score: 95,
      cpl_score: 95,
      shadow_mode: true,
    });

    assert.equal(result.decision, 'APPROVE');
    assert.equal(result.state, 'SHADOW_COMPLETED');
    assert.equal(result.is_shadow, true);
    assert.ok(result.reason_codes.includes('SHADOW_MODE_EVALUATED'));
  });
});

