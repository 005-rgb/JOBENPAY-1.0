// @ts-check
import {
  verifySarReceipt,
  verifyBatchReceipts,
} from '../services/verify_service.js';
import {
  initiateHandshake,
  respondHandshake,
  getHandshake as fetchHandshake,
  listHandshakes,
} from '../services/handshake_service.js';
import {
  createPublicProof,
  getPublicProof,
  revokePublicProof,
  listPublicProofs,
  listRevocations,
  subscribeRevocationWebhook,
  getProtocolVersions,
  getConformanceVectors,
} from '../services/protocol_service.js';
import { AppError } from '../lib/errors.js';
import pool from '../db/pool.js';

/**
 * POST /v1/verify/receipt
 */
export async function postVerifyReceipt(req, res, next) {
  try {
    const { sar, mode = 'online', revocationSnapshot = null, trustedPublicKey = null, simulateRegistryDown = false } = req.body || {};
    if (!sar || typeof sar !== 'object') {
      throw new AppError('VALIDATION_FAILED', 400, 'sar object is required in request body');
    }

    const result = await verifySarReceipt(sar, {
      mode,
      revocationSnapshot,
      trustedPublicKey,
      simulateRegistryDown: Boolean(simulateRegistryDown),
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /v1/verify/receipt/:sar_id
 */
export async function getVerifyReceipt(req, res, next) {
  try {
    const sarId = req.params.sar_id;
    if (!sarId) {
      throw new AppError('VALIDATION_FAILED', 400, 'sar_id parameter is required');
    }

    // Try finding in public_proofs first
    const proofRes = await pool.query(
      `SELECT sar_json, revoked_at, expires_at FROM public_proofs WHERE sar_id = $1 OR proof_id::text = $1 LIMIT 1`,
      [sarId],
    );

    let sar = null;
    if (proofRes.rows.length > 0) {
      const p = proofRes.rows[0];
      if (p.revoked_at || new Date(p.expires_at) <= new Date()) {
        throw new AppError('RECEIPT_NOT_FOUND', 404, 'SAR receipt is expired or revoked');
      }
      sar = typeof p.sar_json === 'string' ? JSON.parse(p.sar_json) : p.sar_json;
    } else {
      // Try finding in signed_receipts
      const recRes = await pool.query(
        `SELECT sar_json FROM signed_receipts WHERE receipt_id = $1 OR sar_json->>'sar_id' = $1 LIMIT 1`,
        [sarId],
      );
      if (recRes.rows.length > 0) {
        sar = typeof recRes.rows[0].sar_json === 'string'
          ? JSON.parse(recRes.rows[0].sar_json)
          : recRes.rows[0].sar_json;
      }
    }

    if (!sar) {
      throw new AppError('RECEIPT_NOT_FOUND', 404, `SAR receipt with ID ${sarId} not found`);
    }

    const result = await verifySarReceipt(sar, { mode: 'online' });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /v1/verify/batch
 */
export async function postVerifyBatch(req, res, next) {
  try {
    const { receipts, options = {} } = req.body || {};
    if (!Array.isArray(receipts)) {
      throw new AppError('VALIDATION_FAILED', 400, 'receipts array is required');
    }

    const result = await verifyBatchReceipts(receipts, options);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /v1/handshake/initiate
 */
export async function postHandshakeInitiate(req, res, next) {
  try {
    const { requester_org_id, target_org_id, agent_id, request_intent } = req.body || {};

    const result = await initiateHandshake({
      requesterOrgId: requester_org_id,
      targetOrgId: target_org_id,
      agentId: agent_id,
      requestIntent: request_intent,
    });

    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /v1/handshake/:handshake_id/respond
 */
export async function postHandshakeRespond(req, res, next) {
  try {
    const handshakeId = req.params.handshake_id;
    const { handshake_nonce, verdict, sar, signature } = req.body || {};

    const result = await respondHandshake(handshakeId, {
      handshakeNonce: handshake_nonce,
      verdict,
      sar,
      signature,
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /v1/handshake/:handshake_id
 */
export async function getHandshake(req, res, next) {
  try {
    const handshakeId = req.params.handshake_id;
    const result = await fetchHandshake(handshakeId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /v1/revocations
 */
export async function getRevocations(req, res, next) {
  try {
    const since = typeof req.query.since === 'string' ? req.query.since : null;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;

    const result = await listRevocations({ since, limit });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /v1/revocations/subscribe
 */
export async function postRevocationSubscribe(req, res, next) {
  try {
    const { url, events } = req.body || {};
    const orgId = req.org?.id || req.session?.current_org_id || null;

    const result = await subscribeRevocationWebhook({
      orgId,
      url,
      events,
    });

    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /v1/protocol/versions
 */
export async function getProtocolVersionsHandler(_req, res, next) {
  try {
    const versions = await getProtocolVersions();
    return res.status(200).json({ versions });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /v1/protocol/conformance/vectors
 */
export async function getConformanceVectorsHandler(_req, res, next) {
  try {
    const vectors = await getConformanceVectors();
    return res.status(200).json({ vectors });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /protocol (Public HTML Documentation)
 */
export function getProtocolHtml(_req, res) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JOBENPAY Open Trust Exchange — Protocol Specification</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
      --code-bg: #090d16;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container { max-width: 960px; margin: 0 auto; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; margin-bottom: 2rem; }
    h1 { font-size: 2.25rem; font-weight: 700; color: #fff; margin-bottom: 0.5rem; }
    h2 { font-size: 1.5rem; font-weight: 600; margin-top: 2rem; margin-bottom: 1rem; color: var(--primary); }
    h3 { font-size: 1.15rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; color: #e2e8f0; }
    p, li { color: var(--text-muted); font-size: 1rem; margin-bottom: 0.75rem; }
    ul { list-style: disc; margin-left: 1.5rem; }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.2);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.875rem;
      color: #38bdf8;
      margin: 1rem 0;
    }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { text-align: left; padding: 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
    th { color: #fff; background: rgba(255,255,255,0.02); }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h1>JOBENPAY Open Trust Exchange</h1>
        <span class="badge">Protocol v1.0 • RFC-Draft</span>
      </div>
      <p>Open Protocol for Cross-Platform Autonomous Agent Payment Authorization and Cryptographic Verification.</p>
    </header>

    <div class="card">
      <h2>1. Overview & Golden Rules</h2>
      <p>The Open Trust Exchange enables cross-platform verification of agentic transactions without vendor lock-in. Powered by Signed Authorization Receipts (SAR) signed with Ed25519.</p>
      <ul>
        <li><strong>Fail-Closed Guarantee:</strong> Any registry unavailability or unverified condition deterministically yields <code>INDETERMINATE</code> — never <code>VERIFIED</code>.</li>
        <li><strong>Zero-PII Wire Format:</strong> Transmitted artifacts contain exclusively cryptographic hashes, HMAC identifiers, ISO timestamps, and Ed25519 signatures.</li>
        <li><strong>Deterministic Canonicalization:</strong> Signatures are calculated strictly over RFC 8785 canonical JSON representations.</li>
      </ul>
    </div>

    <div class="card">
      <h2>2. Standard Endpoints</h2>
      <table>
        <thead>
          <tr><th>Endpoint</th><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td><code>/v1/verify/receipt</code></td><td>POST</td><td>Public offline/online verification of a SAR v1.0 artifact.</td></tr>
          <tr><td><code>/v1/verify/batch</code></td><td>POST</td><td>Batch verification for up to 100 SAR artifacts in parallel.</td></tr>
          <tr><td><code>/v1/handshake/initiate</code></td><td>POST</td><td>Initiates a 5-minute pre-transaction cryptographic trust handshake.</td></tr>
          <tr><td><code>/v1/handshake/{id}/respond</code></td><td>POST</td><td>Target counterparty responds with verdict and signed SAR.</td></tr>
          <tr><td><code>/v1/revocations</code></td><td>GET</td><td>Cursor-paginated public feed of revoked mandates, keys, and orgs.</td></tr>
          <tr><td><code>/v1/revocations/subscribe</code></td><td>POST</td><td>Register HMAC-signed webhooks for instant revocation updates.</td></tr>
          <tr><td><code>/v1/protocol/versions</code></td><td>GET</td><td>Active protocol specifications and JSON schema locations.</td></tr>
          <tr><td><code>/v1/protocol/conformance/vectors</code></td><td>GET</td><td>Download standard 10 conformance test vectors for 3rd-party validation.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card">
      <h2>3. SAR v1.0 Schema Reference</h2>
      <p>JSON Schema location: <a href="/schemas/sar-v1.0.json" target="_blank">/schemas/sar-v1.0.json</a></p>
      <pre>{
  "sar_version": "1.0",
  "sar_id": "sar_01HX4Z8K9M2N3P4Q5R6S7T8V9W",
  "issuer": {
    "org_id": "org_01HX4Z8K9M2N3P4Q5R6S7T8V9W",
    "issuer_key_id": "kid_01HX4Z8K9M2N3P4Q5R6S7T8V9W",
    "display_name": "Acme Corp"
  },
  "mandate": {
    "mandate_id": "mnd_01HX...",
    "mandate_version": 3,
    "policy_hash": "sha256:...",
    "valid_from": "2026-11-01T00:00:00Z",
    "valid_to": "2026-12-01T00:00:00Z"
  },
  "request": {
    "request_id": "req_01HX...",
    "request_hash": "sha256:...",
    "category": "PAYOUT",
    "sub_type": "standard",
    "amount_minor": "45000",
    "currency": "USD",
    "payee_id_hmac": "hmac:..."
  },
  "decision": {
    "result": "APPROVED",
    "reason_codes": ["PAYEE_TRUSTED"],
    "policy_version": "pol_12",
    "decided_at": "2026-11-07T10:00:00Z"
  },
  "ledger": {
    "org_id": "org_01HX...",
    "seq": 1042,
    "entry_hash": "sha256:...",
    "prev_hash": "sha256:..."
  },
  "signature": {
    "alg": "Ed25519",
    "kid": "kid_01HX...",
    "sig": "base64:..."
  }
}</pre>
    </div>
  </div>
</body>
</html>`;
  return res.status(200).type('text/html').send(html);
}

/**
 * GET /proof/:proof_id (Public Proof Verification Page & API)
 */
export async function getProofHandler(req, res, next) {
  try {
    const proofId = req.params.proof_id;
    const proof = await getPublicProof(proofId);

    // Verify SAR
    const rawSar = proof.sar_json || proof.sar;
    const sar = typeof rawSar === 'string' ? JSON.parse(rawSar) : rawSar;
    const verification = await verifySarReceipt(sar, { mode: 'online' });

    // If client requested JSON
    if (req.headers.accept?.includes('application/json') || req.query.format === 'json') {
      return res.status(200).json({
        proof: {
          proof_id: proof.proof_id,
          sar_id: proof.sar_id,
          proof_url: proof.proof_url,
          created_at: proof.created_at,
          expires_at: proof.expires_at,
          access_count: proof.access_count,
        },
        verification,
        sar,
      });
    }

    // Render HTML page
    const statusColor = verification.status === 'VERIFIED'
      ? '#34d399'
      : verification.status === 'INVALID'
        ? '#f87171'
        : '#fbbf24';

    const checksRows = (verification.checks || []).map((c) => `
      <tr>
        <td style="font-weight:600; text-transform:uppercase;">${c.name}</td>
        <td>
          <span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:bold; background:${c.result === 'PASS' ? '#065f46' : '#7f1d1d'}; color:#fff;">
            ${c.result}
          </span>
        </td>
        <td style="color:#94a3b8;">${c.reason || 'Verified ok'}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proof of Authorization — JOBENPAY Open Trust Exchange</title>
  <style>
    body {
      background: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      margin: 0;
      padding: 2rem 1rem;
      display: flex;
      justify-content: center;
    }
    .proof-card {
      background: #151d2f;
      border: 1px solid #23314d;
      border-radius: 12px;
      max-width: 680px;
      width: 100%;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5);
      overflow: hidden;
    }
    .header {
      padding: 1.5rem;
      background: #1a233a;
      border-bottom: 1px solid #23314d;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .title { font-size: 1.25rem; font-weight: 700; color: #fff; }
    .status-badge {
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.05em;
      border: 1px solid ${statusColor};
      color: ${statusColor};
      background: rgba(0,0,0,0.3);
    }
    .content { padding: 1.5rem; }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #38bdf8;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .field-label { font-size: 12px; color: #64748b; margin-bottom: 2px; }
    .field-value { font-size: 14px; font-weight: 500; word-break: break-all; }
    table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #23314d; font-size: 13px; }
    th { color: #94a3b8; font-weight: 600; }
    .raw-sar {
      background: #090d16;
      border: 1px solid #23314d;
      border-radius: 8px;
      padding: 1rem;
      font-family: monospace;
      font-size: 12px;
      color: #94a3b8;
      max-height: 200px;
      overflow-y: auto;
      margin-top: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="proof-card">
    <div class="header">
      <div>
        <div class="title">Proof of Authorization</div>
        <div style="font-size:12px; color:#64748b;">JOBENPAY Open Trust Exchange • Proof ID: ${proof.proof_id}</div>
      </div>
      <div class="status-badge">${verification.status}</div>
    </div>
    <div class="content">
      <div class="grid">
        <div>
          <div class="field-label">Issuer Organization</div>
          <div class="field-value">${sar?.issuer?.display_name || 'N/A'}</div>
          <div style="font-size:11px; color:#64748b;">${sar?.issuer?.org_id || ''}</div>
        </div>
        <div>
          <div class="field-label">Transaction Category</div>
          <div class="field-value">${sar?.request?.category || 'N/A'} (${sar?.request?.sub_type || 'standard'})</div>
        </div>
        <div>
          <div class="field-label">Authorized Amount</div>
          <div class="field-value">${sar?.request?.amount_minor ? `${BigInt(sar.request.amount_minor) / 100n}.${(BigInt(sar.request.amount_minor) % 100n).toString().padStart(2, '0')}` : '0.00'} ${sar?.request?.currency || 'USD'}</div>
        </div>
        <div>
          <div class="field-label">Verification Timestamp</div>
          <div class="field-value">${verification.verified_at}</div>
        </div>
      </div>

      <div class="section-title">Cryptographic Checks</div>
      <table>
        <thead>
          <tr><th>Check</th><th>Result</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${checksRows}
        </tbody>
      </table>

      <div class="section-title">Signed Receipt Artifact (SAR v1.0)</div>
      <pre class="raw-sar">${JSON.stringify(sar, null, 2)}</pre>
    </div>
  </div>
</body>
</html>`;

    return res.status(200).type('text/html').send(html);
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/v1/proofs (Tenant Authenticated)
 */
export async function createProofHandler(req, res, next) {
  try {
    const orgId = req.org?.id || req.session?.current_org_id;
    const userId = req.user?.id || req.session?.user_id;

    if (!orgId || !userId) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }

    const { sar_id, sar_json, expires_in_days } = req.body || {};
    const result = await createPublicProof({
      orgId,
      sarId: sar_id,
      sarJson: sar_json,
      userId,
      expiresInDays: expires_in_days ? Number(expires_in_days) : 30,
    });

    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/proofs (Tenant Authenticated)
 */
export async function listProofsHandler(req, res, next) {
  try {
    const orgId = req.org?.id || req.session?.current_org_id;
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }

    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;

    const result = await listPublicProofs(orgId, { status, limit, cursor });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * DELETE /api/v1/proofs/:proof_id (Tenant Authenticated)
 */
export async function revokeProofHandler(req, res, next) {
  try {
    const orgId = req.org?.id || req.session?.current_org_id;
    const userId = req.user?.id || req.session?.user_id;

    if (!orgId || !userId) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }

    const proofId = req.params.proof_id;
    const result = await revokePublicProof(orgId, proofId, userId);
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/handshakes (Tenant Authenticated)
 */
export async function listHandshakesHandler(req, res, next) {
  try {
    const orgId = req.org?.id || req.session?.current_org_id;
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }

    const status = typeof req.query.status === 'string' ? req.query.status : null;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;

    const result = await listHandshakes(orgId, { status, limit, offset });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/handshakes/:handshake_id (Tenant Authenticated)
 */
export async function getTenantHandshakeHandler(req, res, next) {
  try {
    const orgId = req.org?.id || req.session?.current_org_id;
    if (!orgId) {
      throw new AppError('UNAUTHORIZED', 401, 'Authentication required');
    }

    const handshakeId = req.params.handshake_id;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(handshakeId)) {
      throw new AppError('NOT_FOUND', 404, `Handshake ${handshakeId} not found`);
    }

    const result = await fetchHandshake(handshakeId);
    if (result.requester_org_id !== orgId && result.target_org_id !== orgId) {
      throw new AppError('NOT_FOUND', 404, `Handshake ${handshakeId} not found`);
    }
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

export default {
  postVerifyReceipt,
  getVerifyReceipt,
  postVerifyBatch,
  postHandshakeInitiate,
  postHandshakeRespond,
  getHandshake,
  getRevocations,
  postRevocationSubscribe,
  getProtocolVersionsHandler,
  getConformanceVectorsHandler,
  getProtocolHtml,
  getProofHandler,
  createProofHandler,
  listProofsHandler,
  revokeProofHandler,
  listHandshakesHandler,
  getTenantHandshakeHandler,
};
