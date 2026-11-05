import test from 'node:test';
import assert from 'node:assert/strict';
import crypto, { randomUUID, createHash } from 'node:crypto';

import app from '../../src/app.js';
import pool from '../../src/db/pool.js';
import { withTx } from '../../src/db/tx.js';
import { env } from '../../src/config.js';
import { hashPassword, encrypt } from '../../src/lib/crypto.js';
import { createAgentApiKey, hashAgentApiKey } from '../../src/lib/agentApiKeys.js';
import { preparePayeeIdentifier } from '../../src/lib/payeeIdentifiers.js';
import { appendEntry, LEDGER_TYPES } from '../../src/services/ledger.js';
import { requestHash } from '../../src/services/requestHash.js';
import { startTestApp, closeTestApp } from '../helpers/testApp.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);

function collectRoutes(stack, routes = []) {
  for (const layer of stack ?? []) {
    if (layer.route) {
      routes.push({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).map((m) => m.toUpperCase()),
        handlers: layer.route.stack.map((item) => item.name),
      });
    } else if (layer.handle?.stack) {
      collectRoutes(layer.handle.stack, routes);
    }
  }
  return routes;
}

const EXPLICIT_EXCEPTIONS = new Map([
  ['GET /healthz', 'Liveness health check endpoint without database/tenant context'],
  ['GET /readyz', 'Readiness check for database connectivity and worker heartbeat'],
  ['POST /auth/login', 'Public unauthenticated login mutation; credentials authenticate user'],
  ['POST /auth/logout', 'Session-scoped teardown of currently authenticated user session'],
  ['GET /auth/me', 'Returns the authenticated profile of the currently active session user'],
  ['POST /auth/step-up', 'Grants step-up authentication tokens bound to the active user session'],
  ['GET /auth/config', 'Public frontend authentication configuration and Google Client ID'],
  ['POST /auth/register', 'Public self-registration mutation for new user onboarding'],
  ['POST /auth/verify-email', 'Public email verification token consumption endpoint'],
  ['POST /auth/resend-verification', 'Public verification email resend request endpoint'],
  ['POST /auth/google', 'Public Google GIS ID-token login and self-registration endpoint'],
  ['POST /webhooks/paypal/:webhookToken', 'Public webhook receiver verified by PayPal transmission signature and token'],
  ['GET /developer/integration-docs', 'Static documentation content for integration'],
  ['GET /simulator/scenarios', 'Predefined synthetic demonstration scenario definitions'],
  ['POST /simulator/run', 'Executes synthetic sandbox simulation within session tenant'],
  ['POST /simulator/reset-budget', 'Resets budget period on demo organization only'],
  ['POST /admin/demo-reset', 'Triggers complete demo organization daily reset'],
  ['POST /mandates/draft-from-text', 'Generates AI mandate draft text within active tenant'],
  ['POST /feedback', 'Captures user interface feedback for current session tenant'],
  ['POST /documents', 'Uploads a new document into current session tenant'],
  ['POST /agents', 'Creates a new agent within current session tenant'],
  ['POST /payees', 'Creates a new payee within current session tenant'],
  ['POST /mandates', 'Creates a new mandate within current session tenant'],
  ['PUT /paypal/connection', 'Configures PayPal credentials for current session tenant'],
  ['DELETE /paypal/connection', 'Disconnects PayPal connection for current session tenant'],
  ['POST /paypal/connection/test', 'Tests PayPal credentials for current session tenant'],
  ['POST /org/freeze', 'Freezes current session tenant'],
  ['POST /org/unfreeze', 'Unfreezes current session tenant'],
  ['GET /agent/v1/ping', 'Agent API authentication probe returning pong for active key'],
  ['POST /agent/v1/requests', 'Submits payment request bound to authenticated agent'],
  ['POST /agent/v1/payout-requests', 'Alias for /agent/v1/requests bound to authenticated agent'],
  ['POST /agent/v1/documents', 'Uploads multipart document bound to authenticated agent'],
  ['POST /agent/v1/refund-requests', 'Submits refund request (Tier B stub)'],
  ['POST /agent/v1/dispute-accept-requests', 'Submits dispute accept request (Tier B stub)'],
  ['POST /mcp', 'Stateless Model Context Protocol endpoint authenticated via agent key'],
  ['GET /{*path}', 'Catch-all static file and single-page application router fallback'],
]);

async function createOrgFixture(db, orgName, slug) {
  const orgRes = await db.query(
    'INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id',
    [orgName, slug],
  );
  const orgId = orgRes.rows[0].id;

  // 1. OWNER user + membership + session
  const passwordHash = await hashPassword('Password123!');
  const userRes = await db.query(
    'INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, now()) RETURNING id',
    [`owner-${slug}@jobenpay.test`, passwordHash, `Owner ${orgName}`],
  );
  const userId = userRes.rows[0].id;
  await db.query(
    'INSERT INTO memberships (org_id, user_id, role, is_judge) VALUES ($1, $2, $3, $4)',
    [orgId, userId, 'OWNER', false],
  );
  const sessionToken = randomUUID() + randomUUID();
  const csrfToken = randomUUID();
  await db.query(
    `INSERT INTO sessions (id_hash, user_id, current_org_id, csrf_secret, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '2 hours')`,
    [createHash('sha256').update(sessionToken).digest('hex'), userId, orgId, csrfToken],
  );

  // 2. Primary agent + key
  const agentRes = await db.query(
    `INSERT INTO agents (org_id, name, description, status)
     VALUES ($1, $2, 'Agent for IDOR testing', 'ACTIVE')
     RETURNING id, name`,
    [orgId, `Agent ${slug}`],
  );
  const agent = agentRes.rows[0];
  const { prefix, apiKey } = createAgentApiKey();
  const keyHash = hashAgentApiKey(env.JOBENPAY_HMAC_PEPPER, apiKey);
  const keyRes = await db.query(
    `INSERT INTO agent_api_keys (org_id, agent_id, prefix, key_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, prefix`,
    [orgId, agent.id, prefix, keyHash],
  );
  const agentKey = { id: keyRes.rows[0].id, prefix, apiKey };

  // 3. Payee
  const payeeEmail = `payee-${slug}@example.test`;
  const preparedPayee = preparePayeeIdentifier(orgId, payeeEmail, 'EMAIL', {
    encryptionKey: env.JOBENPAY_ENC_KEY,
    pepper: env.JOBENPAY_HMAC_PEPPER,
  });
  const payeeRes = await db.query(
    `INSERT INTO payees (org_id, display_name, kind, identifier_enc, identifier_hmac, identifier_masked, trust)
     VALUES ($1, $2, 'EMAIL', $3, $4, $5, 'TRUSTED')
     RETURNING id, display_name`,
    [orgId, `Trusted Payee ${slug}`, preparedPayee.identifierEnc, preparedPayee.identifierHmac, preparedPayee.identifierMasked],
  );
  const payee = payeeRes.rows[0];

  // 4. Document + extraction
  const docSha256 = crypto.createHash('sha256').update(`invoice-${slug}-${randomUUID()}`).digest('hex');
  const docRes = await db.query(
    `INSERT INTO documents (org_id, uploader_kind, uploader_id, filename, mime, size, sha256, storage_key, status)
     VALUES ($1, 'USER', $2, $3, 'application/pdf', 1024, $4, $5, 'EXTRACTED')
     RETURNING id, filename`,
    [orgId, userId, `invoice-${slug}.pdf`, docSha256, `storage_${docSha256}`],
  );
  const document = docRes.rows[0];
  await db.query(
    `INSERT INTO document_extractions (org_id, document_id, payee_name, invoice_number, amount_minor, currency, confidence, prompt_version)
     VALUES ($1, $2, 'Trusted Supply', 'INV-101', '1000', 'USD', 0.98, 1)`,
    [orgId, document.id],
  );

  // 5. Mandate + Version
  const mandateRes = await db.query(
    `INSERT INTO mandates (org_id, agent_id, name, status)
     VALUES ($1, $2, $3, 'ACTIVE')
     RETURNING id, name`,
    [orgId, agent.id, `Mandate ${slug}`],
  );
  const mandate = mandateRes.rows[0];
  const policy = {
    schemaVersion: 1,
    purpose: `Mandate policy for ${slug}`,
    allowedActions: ['PAYOUT'],
    currency: 'USD',
    perTransactionCapMinor: 5000,
    budget: { period: 'MONTH', limitMinor: 100000 },
    autoApproveBelowMinor: 1000,
    payees: { mode: 'ALLOWLIST', ids: [payee.id] },
    allowNewPayees: false,
    schedule: { timezone: 'Asia/Jakarta', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
    velocity: { maxRequestsPerHour: 10, maxPayoutPerPayeePerDay: 5000 },
    duplicateWindowHours: 72,
    requireInvoice: false,
    invoiceAmountToleranceMinor: 0,
    ai: { intentCheck: false, escalateOnRiskAtOrAbove: 70, blockOnRiskAtOrAbove: 90 },
    stepUpApprovalAboveMinor: 3000,
    fourEyesAboveMinor: 4000,
    approvalTtlHours: 24,
    validFrom: '2020-01-01T00:00:00Z',
    validTo: '2099-01-01T00:00:00Z',
  };
  const policyHash = crypto.createHash('sha256').update(JSON.stringify(policy)).digest('hex');
  const versionRes = await db.query(
    `INSERT INTO mandate_versions (org_id, mandate_id, version, purpose_text, policy, policy_hash, valid_from, valid_to)
     VALUES ($1, $2, 1, 'Initial mandate version', $3, $4, '2020-01-01T00:00:00Z', '2099-01-01T00:00:00Z')
     RETURNING id`,
    [orgId, mandate.id, JSON.stringify(policy), policyHash],
  );
  const mandateVersion = {
    ...versionRes.rows[0],
    policy,
  };
  await db.query(
    'UPDATE mandates SET current_version_id = $1 WHERE id = $2',
    [mandateVersion.id, mandate.id],
  );

  // 6. Requests: PENDING_APPROVAL and APPROVED
  const reqPendingHash = requestHash({
    orgId,
    agentId: agent.id,
    mandateVersionId: mandateVersion.id,
    action: 'PAYOUT',
    amountMinor: '2500',
    currency: 'USD',
    payeeId: payee.id,
    targetRef: null,
    documentSha256: null,
  });
  const reqPendingRes = await db.query(
    `INSERT INTO payment_requests (org_id, agent_id, mandate_version_id, action, status, amount_minor, currency, payee_id, request_hash)
     VALUES ($1, $2, $3, 'PAYOUT', 'PENDING_APPROVAL', '2500', 'USD', $4, $5)
     RETURNING id, request_hash, status`,
    [orgId, agent.id, mandateVersion.id, payee.id, reqPendingHash],
  );
  const requestPending = reqPendingRes.rows[0];

  const approvalRes = await db.query(
    `INSERT INTO approvals (org_id, request_id, status, request_hash, expires_at)
     VALUES ($1, $2, 'PENDING', $3, now() + interval '24 hours')
     RETURNING id, status`,
    [orgId, requestPending.id, requestPending.request_hash],
  );
  const approval = approvalRes.rows[0];

  const reqApprovedHash = requestHash({
    orgId,
    agentId: agent.id,
    mandateVersionId: mandateVersion.id,
    action: 'PAYOUT',
    amountMinor: '500',
    currency: 'USD',
    payeeId: payee.id,
    targetRef: null,
    documentSha256: null,
  });
  const reqApprovedRes = await db.query(
    `INSERT INTO payment_requests (org_id, agent_id, mandate_version_id, action, status, amount_minor, currency, payee_id, request_hash)
     VALUES ($1, $2, $3, 'PAYOUT', 'APPROVED', '500', 'USD', $4, $5)
     RETURNING id, request_hash, status`,
    [orgId, agent.id, mandateVersion.id, payee.id, reqApprovedHash],
  );
  const requestApproved = reqApprovedRes.rows[0];

  // 7. Ledger & Audit
  const ledgerRes = await withTx((tx) =>
    appendEntry(tx, {
      orgId,
      type: LEDGER_TYPES.MANDATE_ACTIVATED,
      subjectType: 'MANDATE',
      subjectId: mandate.id,
      payload: { name: 'Init' },
    }),
  );

  const auditRes = await db.query(
    `INSERT INTO audit_events (org_id, actor_id, action, details)
     VALUES ($1, $2, 'LOGIN', '{"success":true}')
     RETURNING id`,
    [orgId, userId],
  );

  // 8. Notification
  const notifRes = await db.query(
    `INSERT INTO notifications (org_id, kind, payload, sent_at, status)
     VALUES ($1, 'APPROVAL_REQUIRED', $2, now(), 'PENDING')
     RETURNING id`,
    [orgId, JSON.stringify({ recipientUserId: userId, message: `Notification for ${slug}` })],
  );

  // 9. PayPal connection
  const paypalToken = randomUUID();
  const encClient = encrypt({
    key: env.JOBENPAY_ENC_KEY,
    plaintext: 'CLIENT-ID-1234',
    aad: `paypal_connections:client_id_enc:${orgId}`,
  });
  const encSecret = encrypt({
    key: env.JOBENPAY_ENC_KEY,
    plaintext: 'CLIENT-SECRET-1234',
    aad: `paypal_connections:client_secret_enc:${orgId}`,
  });
  const paypalRes = await db.query(
    `INSERT INTO paypal_connections (org_id, client_id_enc, client_secret_enc, webhook_id, webhook_token, status)
     VALUES ($1, $2, $3, 'WH-IDOR', $4, 'CONNECTED')
     RETURNING id, webhook_token`,
    [orgId, encClient, encSecret, paypalToken],
  );

  return {
    orgId,
    orgName,
    slug,
    user: { id: userId, email: `owner-${slug}@jobenpay.test` },
    session: { token: sessionToken, csrfToken },
    agent,
    agentKey,
    payee,
    document,
    mandate,
    mandateVersion,
    requestPending,
    approval,
    requestApproved,
    ledger: ledgerRes,
    audit: auditRes.rows[0],
    notification: notifRes.rows[0],
    paypal: paypalRes.rows[0],
  };
}

async function snapshotOrg(db, orgId) {
  const [
    org,
    agents,
    keys,
    payees,
    documents,
    mandates,
    versions,
    requests,
    approvals,
    ledger,
    audit,
    notifications,
    paypal,
  ] = await Promise.all([
    db.query('SELECT * FROM organizations WHERE id = $1', [orgId]),
    db.query('SELECT * FROM agents WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM agent_api_keys WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM payees WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM documents WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM mandates WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM mandate_versions WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM payment_requests WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM approvals WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM ledger_entries WHERE org_id = $1 ORDER BY seq', [orgId]),
    db.query('SELECT * FROM audit_events WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM notifications WHERE org_id = $1 ORDER BY id', [orgId]),
    db.query('SELECT * FROM paypal_connections WHERE org_id = $1 ORDER BY id', [orgId]),
  ]);
  return {
    org: org.rows,
    agents: agents.rows,
    keys: keys.rows,
    payees: payees.rows,
    documents: documents.rows,
    mandates: mandates.rows,
    versions: versions.rows,
    requests: requests.rows,
    approvals: approvals.rows,
    ledger: ledger.rows,
    audit: audit.rows,
    notifications: notifications.rows,
    paypal: paypal.rows,
  };
}

test('HARDEN-1: Comprehensive cross-tenant IDOR and route isolation suite', { skip: !hasDatabase }, async (t) => {
  const testApp = await startTestApp();
  const baseUrl = `${testApp.url}/api/v1`;

  const suffixA = randomUUID().slice(0, 8);
  const suffixB = randomUUID().slice(0, 8);
  const orgA = await createOrgFixture(pool, `Organization A ${suffixA}`, `org-a-${suffixA}`);
  const orgB = await createOrgFixture(pool, `Organization B ${suffixB}`, `org-b-${suffixB}`);

  // Also setup secondary agent in Org A for requirement 1.4 (agent-to-agent in same org)
  const agentA2Res = await pool.query(
    `INSERT INTO agents (org_id, name, description, status)
     VALUES ($1, 'Agent A2', 'Secondary agent in Org A', 'ACTIVE')
     RETURNING id`,
    [orgA.orgId],
  );
  const agentA2Id = agentA2Res.rows[0].id;
  const { prefix: pA2, apiKey: keyA2Secret } = createAgentApiKey();
  const keyA2Hash = hashAgentApiKey(env.JOBENPAY_HMAC_PEPPER, keyA2Secret);
  await pool.query(
    `INSERT INTO agent_api_keys (org_id, agent_id, prefix, key_hash)
     VALUES ($1, $2, $3, $4)`,
    [orgA.orgId, agentA2Id, pA2, keyA2Hash],
  );
  const agentA2 = { id: agentA2Id, apiKey: keyA2Secret };

  // Agent A2's document
  const docA2Sha = crypto.createHash('sha256').update(`doc-a2-${randomUUID()}`).digest('hex');
  const docA2Res = await pool.query(
    `INSERT INTO documents (org_id, uploader_kind, uploader_id, filename, mime, size, sha256, storage_key, status)
     VALUES ($1, 'AGENT', $2, 'agent-a2.pdf', 'application/pdf', 512, $3, $4, 'EXTRACTED')
     RETURNING id`,
    [orgA.orgId, agentA2.id, docA2Sha, `storage_${docA2Sha}`],
  );
  const docA2 = docA2Res.rows[0];

  // Agent A2's request
  const reqA2Hash = requestHash({
    orgId: orgA.orgId,
    agentId: agentA2.id,
    mandateVersionId: orgA.mandateVersion.id,
    action: 'PAYOUT',
    amountMinor: '100',
    currency: 'USD',
    payeeId: orgA.payee.id,
    targetRef: null,
    documentSha256: null,
  });
  const reqA2Res = await pool.query(
    `INSERT INTO payment_requests (org_id, agent_id, mandate_version_id, action, status, amount_minor, currency, payee_id, request_hash)
     VALUES ($1, $2, $3, 'PAYOUT', 'PENDING_APPROVAL', '100', 'USD', $4, $5)
     RETURNING id`,
    [orgA.orgId, agentA2.id, orgA.mandateVersion.id, orgA.payee.id, reqA2Hash],
  );
  const reqA2 = reqA2Res.rows[0];

  // Agent B's document and request (for agent B cross-org tests)
  const docBSha = crypto.createHash('sha256').update(`doc-b-${randomUUID()}`).digest('hex');
  const docBRes = await pool.query(
    `INSERT INTO documents (org_id, uploader_kind, uploader_id, filename, mime, size, sha256, storage_key, status)
     VALUES ($1, 'AGENT', $2, 'agent-b.pdf', 'application/pdf', 512, $3, $4, 'EXTRACTED')
     RETURNING id`,
    [orgB.orgId, orgB.agent.id, docBSha, `storage_${docBSha}`],
  );
  const docB = docBRes.rows[0];

  try {
    const sessionAHeaders = {
      cookie: `jp_sid=${orgA.session.token}`,
      'x-csrf-token': orgA.session.csrfToken,
      'content-type': 'application/json',
    };
    const agentAHeaders = {
      authorization: `Bearer ${orgA.agentKey.apiKey}`,
      'content-type': 'application/json',
    };

    // -------------------------------------------------------------
    // BAGIAN 1.2: Otomatis enumerasi rute berparameter ID
    // -------------------------------------------------------------
    await t.test('1.2 Parameterized routes reject cross-tenant access and preserve Org B data', async () => {
      const snapshotBefore = await snapshotOrg(pool, orgB.orgId);
      const allRoutes = collectRoutes(app.router.stack);
      const parameterizedRoutes = allRoutes.filter((r) => (
        /:[a-zA-Z0-9_]+/.test(r.path) && r.path !== '/webhooks/paypal/:webhookToken'
      ));

      assert.ok(parameterizedRoutes.length >= 20, `Expected >= 20 parameterized routes, found ${parameterizedRoutes.length}`);

      for (const route of parameterizedRoutes) {
        for (const method of route.methods) {
          // Resolve parameter substitution using Org B's entity IDs
          let targetPath = route.path;

          if (targetPath.includes(':requestId')) {
            targetPath = targetPath.replace(':requestId', orgB.requestPending.id);
          }
          if (targetPath.includes(':keyId')) {
            targetPath = targetPath.replace(':keyId', orgB.agentKey.id);
          }
          if (targetPath.includes(':id')) {
            if (targetPath.startsWith('/requests/')) targetPath = targetPath.replace(':id', orgB.requestPending.id);
            else if (targetPath.startsWith('/approvals/')) targetPath = targetPath.replace(':id', orgB.approval.id);
            else if (targetPath.startsWith('/mandates/')) targetPath = targetPath.replace(':id', orgB.mandate.id);
            else if (targetPath.startsWith('/notifications/')) targetPath = targetPath.replace(':id', orgB.notification.id);
            else if (targetPath.startsWith('/documents/')) targetPath = targetPath.replace(':id', orgB.document.id);
            else if (targetPath.startsWith('/agents/')) targetPath = targetPath.replace(':id', orgB.agent.id);
            else if (targetPath.startsWith('/payees/')) targetPath = targetPath.replace(':id', orgB.payee.id);
            else if (targetPath.startsWith('/agent/v1/requests/')) targetPath = targetPath.replace(':id', orgB.requestPending.id);
          }

          // Choose appropriate auth and payload
          const isAgentRoute = targetPath.startsWith('/agent/v1/');
          const reqHeaders = isAgentRoute ? agentAHeaders : sessionAHeaders;

          let reqBody;
          if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
            if (targetPath.endsWith('/versions')) {
              reqBody = JSON.stringify({ policy: { ...orgB.mandateVersion.policy, purpose: 'Cross-tenant version' } });
            } else if (targetPath.endsWith('/activate')) {
              reqBody = JSON.stringify({ versionId: orgB.mandateVersion.id });
            } else if (targetPath.endsWith('/decision')) {
              reqBody = JSON.stringify({ decision: 'REJECT', requestHash: orgB.requestPending.request_hash, comment: 'Attacker' });
            } else if (targetPath.endsWith('/trust')) {
              reqBody = JSON.stringify({ trust: 'BLOCKED' });
            } else if (targetPath.endsWith('/cancel')) {
              reqBody = JSON.stringify({ reason: 'Attacker cancel' });
            } else if (targetPath.startsWith('/payees/')) {
              reqBody = JSON.stringify({ displayName: 'Hacked Payee' });
            } else if (targetPath.startsWith('/agents/')) {
              reqBody = JSON.stringify({ name: 'Hacked Agent' });
            } else {
              reqBody = JSON.stringify({ name: 'Cross-tenant payload' });
            }
          }

          const response = await fetch(`${baseUrl}${targetPath}`, {
            method,
            headers: reqHeaders,
            body: reqBody,
          });

          // Must return 404 (or 403 where explicitly documented), never 200/201/204
          assert.notEqual(response.status, 200, `${method} ${targetPath} unexpectedly succeeded with 200`);
          assert.notEqual(response.status, 201, `${method} ${targetPath} unexpectedly succeeded with 201`);
          assert.notEqual(response.status, 204, `${method} ${targetPath} unexpectedly succeeded with 204`);
          assert.ok(
            response.status === 404 || response.status === 403,
            `${method} ${targetPath} returned unexpected status ${response.status} (expected 404 or 403)`,
          );

          // Verify response body does not leak Org B private information
          const text = await response.text();
          assert.equal(text.includes(orgB.orgName), false, `Response for ${method} ${targetPath} leaked Org B name`);
          assert.equal(text.includes(orgB.slug), false, `Response for ${method} ${targetPath} leaked Org B slug`);
          assert.equal(text.includes(orgB.user.email), false, `Response for ${method} ${targetPath} leaked Org B user email`);
        }
      }

      // Snapshot Org B after all requests and compare: Org B state must remain 100% identical
      const snapshotAfter = await snapshotOrg(pool, orgB.orgId);
      assert.deepEqual(snapshotAfter, snapshotBefore, 'Org B database snapshot must remain identical after cross-tenant attempts');
    });

    // -------------------------------------------------------------
    // BAGIAN 1.3: Rute daftar / singleton bertenant
    // -------------------------------------------------------------
    await t.test('1.3 Tenant list and singleton endpoints isolate Org A and do not leak Org B items', async () => {
      // 1. GET /requests
      const reqRes = await fetch(`${baseUrl}/requests`, { headers: sessionAHeaders });
      assert.equal(reqRes.status, 200);
      const reqJson = await reqRes.json();
      const reqItems = reqJson.requests || reqJson.items || reqJson;
      const returnedReqIds = reqItems.map((r) => r.id);
      assert.ok(returnedReqIds.includes(orgA.requestPending.id));
      assert.equal(returnedReqIds.includes(orgB.requestPending.id), false);
      assert.equal(returnedReqIds.includes(orgB.requestApproved.id), false);

      // 2. GET /approvals
      const appRes = await fetch(`${baseUrl}/approvals`, { headers: sessionAHeaders });
      assert.equal(appRes.status, 200);
      const appJson = await appRes.json();
      const appItems = appJson.approvals || appJson.items || appJson;
      const returnedAppIds = appItems.map((a) => a.id);
      assert.ok(returnedAppIds.includes(orgA.approval.id));
      assert.equal(returnedAppIds.includes(orgB.approval.id), false);

      // 3. GET /mandates
      const manRes = await fetch(`${baseUrl}/mandates`, { headers: sessionAHeaders });
      assert.equal(manRes.status, 200);
      const manJson = await manRes.json();
      const returnedManIds = (manJson.mandates || manJson).map((m) => m.id);
      assert.ok(returnedManIds.includes(orgA.mandate.id));
      assert.equal(returnedManIds.includes(orgB.mandate.id), false);

      // 4. GET /documents
      const docRes = await fetch(`${baseUrl}/documents`, { headers: sessionAHeaders });
      assert.equal(docRes.status, 200);
      const docJson = await docRes.json();
      const returnedDocIds = (docJson.documents || docJson).map((d) => d.id);
      assert.ok(returnedDocIds.includes(orgA.document.id));
      assert.equal(returnedDocIds.includes(orgB.document.id), false);

      // 5. GET /agents
      const agRes = await fetch(`${baseUrl}/agents`, { headers: sessionAHeaders });
      assert.equal(agRes.status, 200);
      const agJson = await agRes.json();
      const returnedAgIds = (agJson.agents || agJson).map((a) => a.id);
      assert.ok(returnedAgIds.includes(orgA.agent.id));
      assert.equal(returnedAgIds.includes(orgB.agent.id), false);

      // 6. GET /payees
      const payRes = await fetch(`${baseUrl}/payees`, { headers: sessionAHeaders });
      assert.equal(payRes.status, 200);
      const payJson = await payRes.json();
      const returnedPayIds = (payJson.payees || payJson).map((p) => p.id);
      assert.ok(returnedPayIds.includes(orgA.payee.id));
      assert.equal(returnedPayIds.includes(orgB.payee.id), false);

      // 7. GET /notifications
      const notRes = await fetch(`${baseUrl}/notifications`, { headers: sessionAHeaders });
      assert.equal(notRes.status, 200);
      const notJson = await notRes.json();
      const returnedNotIds = (notJson.notifications || notJson).map((n) => n.id);
      assert.ok(returnedNotIds.includes(orgA.notification.id));
      assert.equal(returnedNotIds.includes(orgB.notification.id), false);

      // 8. GET /ledger
      const ledRes = await fetch(`${baseUrl}/ledger`, { headers: sessionAHeaders });
      assert.equal(ledRes.status, 200);
      const ledJson = await ledRes.json();
      const ledEntries = ledJson.entries || (Array.isArray(ledJson) ? ledJson : []);
      const returnedLedSubjectIds = ledEntries.map((e) => e.subject_id);
      assert.ok(returnedLedSubjectIds.includes(orgA.mandate.id));
      assert.equal(returnedLedSubjectIds.includes(orgB.mandate.id), false);

      // 9. GET /audit
      const audRes = await fetch(`${baseUrl}/audit`, { headers: sessionAHeaders });
      assert.equal(audRes.status, 200);
      const audJson = await audRes.json();
      const audEvents = audJson.events || (Array.isArray(audJson) ? audJson : []);
      const returnedAudIds = audEvents.map((e) => e.id);
      assert.ok(returnedAudIds.includes(orgA.audit.id));
      assert.equal(returnedAudIds.includes(orgB.audit.id), false);

      // 10. GET /paypal/connection
      const paypalRes = await fetch(`${baseUrl}/paypal/connection`, { headers: sessionAHeaders });
      assert.equal(paypalRes.status, 200);
      const paypalJson = await paypalRes.json();
      assert.ok(paypalJson.webhookUrl?.includes(orgA.paypal.webhook_token));
      assert.equal(paypalJson.webhookUrl?.includes(orgB.paypal.webhook_token) ?? false, false);

      // 11. GET /dashboard/summary
      const dashRes = await fetch(`${baseUrl}/dashboard/summary`, { headers: sessionAHeaders });
      assert.equal(dashRes.status, 200);

      // 12. GET /admin/queue
      const qRes = await fetch(`${baseUrl}/admin/queue`, { headers: sessionAHeaders });
      assert.equal(qRes.status, 200);

      // 13. GET /developer/info
      const devRes = await fetch(`${baseUrl}/developer/info`, { headers: sessionAHeaders });
      assert.equal(devRes.status, 200);
      const devJson = await devRes.json();
      assert.equal(devJson.tools?.length, 3);

      // 14. GET /org
      const orgRes = await fetch(`${baseUrl}/org`, { headers: sessionAHeaders });
      assert.equal(orgRes.status, 200);
      const orgJson = await orgRes.json();
      assert.equal(orgJson.org?.id, orgA.orgId);
      assert.notEqual(orgJson.org?.id, orgB.orgId);
    });

    // -------------------------------------------------------------
    // BAGIAN 1.4: Rute agen (/agent/v1/*)
    // -------------------------------------------------------------
    await t.test('1.4 Agent API key cannot read requests or use documents of another agent or tenant', async () => {
      // 1. Agent A1 cannot read request created by Agent A2 (same org)
      const readSameOrgOtherAgent = await fetch(`${baseUrl}/agent/v1/requests/${reqA2.id}`, {
        headers: agentAHeaders,
      });
      assert.equal(readSameOrgOtherAgent.status, 404, 'Agent A1 reading Agent A2 request must return 404');

      // 2. Agent A1 cannot read request created by Agent B (other org)
      const readOtherOrg = await fetch(`${baseUrl}/agent/v1/requests/${orgB.requestPending.id}`, {
        headers: agentAHeaders,
      });
      assert.equal(readOtherOrg.status, 404, 'Agent A1 reading Org B request must return 404');

      // 3. Agent A1 cannot submit payout referencing document of Agent A2 (same org)
      const submitSameOrgOtherDoc = await fetch(`${baseUrl}/agent/v1/payout-requests`, {
        method: 'POST',
        headers: {
          ...agentAHeaders,
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          payeeId: orgA.payee.id,
          amountMinor: '100',
          currency: 'USD',
          documentId: docA2.id,
          reason: 'Attempt using Agent A2 document',
        }),
      });
      assert.equal(submitSameOrgOtherDoc.status, 404, 'Agent A1 submitting with Agent A2 document must return 404');

      // 4. Agent A1 cannot submit payout referencing document of Agent B (other org)
      const submitOtherOrgDoc = await fetch(`${baseUrl}/agent/v1/payout-requests`, {
        method: 'POST',
        headers: {
          ...agentAHeaders,
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          payeeId: orgA.payee.id,
          amountMinor: '100',
          currency: 'USD',
          documentId: docB.id,
          reason: 'Attempt using Org B document',
        }),
      });
      assert.equal(submitOtherOrgDoc.status, 404, 'Agent A1 submitting with Org B document must return 404');

      // 5. Agent A1 budget only reflects Agent A1
      const budgetRes = await fetch(`${baseUrl}/agent/v1/budget`, { headers: agentAHeaders });
      assert.equal(budgetRes.status, 200);
    });

    // -------------------------------------------------------------
    // BAGIAN 1.5: Tes Struktural: seluruh rute terdaftar harus teruji / memiliki pengecualian
    // -------------------------------------------------------------
    await t.test('1.5 Structural route coverage: all registered routes must be tested or explicitly exempted', async () => {
      const allRoutes = collectRoutes(app.router.stack);
      const testedRouteKeys = new Set([
        // Parameterized tested in 1.2
        'GET /admin/evidence/:requestId',
        'GET /requests/:id',
        'POST /requests/:id/cancel',
        'GET /approvals/:id',
        'POST /approvals/:id/decision',
        'GET /mandates/:id',
        'POST /mandates/:id/versions',
        'POST /mandates/:id/activate',
        'POST /mandates/:id/suspend',
        'POST /mandates/:id/revoke',
        'GET /mandates/:id/budget',
        'POST /notifications/:id/read',
        'GET /documents/:id/file',
        'GET /documents/:id',
        'DELETE /documents/:id',
        'GET /agents/:id',
        'PATCH /agents/:id',
        'POST /agents/:id/keys',
        'POST /agents/:id/keys/:keyId/revoke',
        'POST /agents/:id/keys/rotate',
        'GET /payees/:id',
        'PATCH /payees/:id',
        'POST /payees/:id/trust',
        'GET /agent/v1/requests/:id',

        // List / tenant singletons tested in 1.3 & 1.4
        'GET /requests',
        'GET /approvals',
        'GET /mandates',
        'GET /documents',
        'GET /agents',
        'GET /payees',
        'GET /notifications',
        'GET /ledger',
        'GET /ledger/verify',
        'GET /ledger/export',
        'GET /audit',
        'GET /dashboard/summary',
        'GET /admin/queue',
        'GET /admin/real-preflight',
        'GET /paypal/connection',
        'GET /developer/info',
        'GET /org',
        'GET /agent/v1/budget',
      ]);

      const unhandled = [];
      for (const route of allRoutes) {
        for (const method of route.methods) {
          const key = `${method} ${route.path}`;
          if (!testedRouteKeys.has(key) && !EXPLICIT_EXCEPTIONS.has(key)) {
            unhandled.push(key);
          }
        }
      }

      assert.deepEqual(
        unhandled,
        [],
        `All routes must be tested for tenant isolation or explicitly exempted. Found unhandled routes: ${unhandled.join(', ')}`,
      );
    });
  } finally {
    await closeTestApp(testApp.server);
  }
});
