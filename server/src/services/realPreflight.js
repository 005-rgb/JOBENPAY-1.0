import net from 'node:net';
import { URL } from 'node:url';

import pool from '../db/pool.js';
import { env as configEnv } from '../config.js';
import { decrypt } from '../lib/crypto.js';
import { paypalFor as defaultPaypalFor } from '../paypal/client.js';
import { getProcessorHealth } from '../jobs/tick.js';
import { verifyChain } from './ledger.js';
import { getBudget } from './budget.js';
import { ruleA9Schedule } from './decision/rulesA.js';

export async function runRealPreflight(orgId, options = {}) {
  if (!orgId) {
    throw new TypeError('orgId is required for real-payout preflight.');
  }

  const db = options.db ?? pool;
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const paypalFor = options.paypalFor ?? defaultPaypalFor;
  const encryptionKey = options.encryptionKey ?? configEnv.JOBENPAY_ENC_KEY ?? configEnv.ENCRYPTION_KEY;

  const checks = [];

  // PF-01: NODE_ENV=production and no PAYPAL_API_BASE_OVERRIDE
  const nodeEnv = env.NODE_ENV;
  const paypalOverride = env.PAYPAL_API_BASE_OVERRIDE;
  if (nodeEnv !== 'production') {
    checks.push({
      id: 'PF-01',
      status: 'FAIL',
      detail: `NODE_ENV is '${nodeEnv}', expected 'production'.`,
    });
  } else if (paypalOverride) {
    checks.push({
      id: 'PF-01',
      status: 'FAIL',
      detail: `PAYPAL_API_BASE_OVERRIDE is set ('${paypalOverride}'). Real sandbox payouts require production mode without overrides.`,
    });
  } else {
    checks.push({
      id: 'PF-01',
      status: 'PASS',
      detail: 'NODE_ENV is production and PAYPAL_API_BASE_OVERRIDE is not set.',
    });
  }

  // PF-02: PayPal connection status CONNECTED, webhook_id set, webhookUrl is https and not localhost/IP
  const connResult = await db.query(
    'SELECT org_id, status, webhook_id, webhook_token FROM paypal_connections WHERE org_id = $1 LIMIT 1',
    [orgId],
  );
  const conn = connResult.rows[0] ?? null;
  const publicBaseUrl = options.publicBaseUrl ?? env.PUBLIC_BASE_URL ?? configEnv.PUBLIC_BASE_URL ?? '';
  let webhookUrlValid = false;
  let webhookUrlReason = '';

  if (conn?.webhook_token && publicBaseUrl) {
    try {
      const parsed = new URL(`/api/v1/paypal/webhook/${conn.webhook_token}`, publicBaseUrl);
      const isHttps = parsed.protocol === 'https:';
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost');
      const isIp = net.isIP(parsed.hostname) !== 0;
      if (!isHttps) {
        webhookUrlReason = 'Webhook URL scheme must be https:';
      } else if (isLocalhost || isIp) {
        webhookUrlReason = `Webhook host '${parsed.hostname}' cannot be localhost or an IP address.`;
      } else {
        webhookUrlValid = true;
      }
    } catch (err) {
      webhookUrlReason = `Invalid webhook URL: ${err.message}`;
    }
  } else if (!conn?.webhook_token) {
    webhookUrlReason = 'Webhook token is missing from connection.';
  } else {
    webhookUrlReason = 'PUBLIC_BASE_URL is not configured.';
  }

  if (!conn) {
    checks.push({
      id: 'PF-02',
      status: 'FAIL',
      detail: 'No PayPal connection found for this organization.',
    });
  } else if (conn.status !== 'CONNECTED') {
    checks.push({
      id: 'PF-02',
      status: 'FAIL',
      detail: `PayPal connection status is '${conn.status}', expected 'CONNECTED'.`,
    });
  } else if (!conn.webhook_id) {
    checks.push({
      id: 'PF-02',
      status: 'FAIL',
      detail: 'PayPal webhook_id is not set.',
    });
  } else if (!webhookUrlValid) {
    checks.push({
      id: 'PF-02',
      status: 'FAIL',
      detail: `PayPal webhook URL is invalid: ${webhookUrlReason}`,
    });
  } else {
    checks.push({
      id: 'PF-02',
      status: 'PASS',
      detail: `PayPal connection is CONNECTED, webhook_id is set (${conn.webhook_id}), and webhook URL is valid HTTPS.`,
    });
  }

  // PF-03: Processor alive (tickHeartbeatAgeSec < 120 OR workerHeartbeatAgeSec < 30)
  const health = options.processorHealth ?? await getProcessorHealth(db);
  const tickOk = health.tickHeartbeatAgeSec !== null && health.tickHeartbeatAgeSec < 120;
  const workerOk = health.workerHeartbeatAgeSec !== null && health.workerHeartbeatAgeSec < 30;

  if (tickOk || workerOk) {
    checks.push({
      id: 'PF-03',
      status: 'PASS',
      detail: `Processor is alive (tick: ${health.tickHeartbeatAgeSec ?? 'none'}s, worker: ${health.workerHeartbeatAgeSec ?? 'none'}s).`,
    });
  } else {
    checks.push({
      id: 'PF-03',
      status: 'FAIL',
      detail: `Processor heartbeat is stale or missing (tick: ${health.tickHeartbeatAgeSec ?? 'none'}s >= 120s, worker: ${health.workerHeartbeatAgeSec ?? 'none'}s >= 30s). Saran: pasang cron tick.js tiap menit.`,
    });
  }

  // PF-04: Queue (deadJobs == 0, oldestPendingJobAgeSec < 300)
  if (health.oldestPendingJobAgeSec >= 300) {
    checks.push({
      id: 'PF-04',
      status: 'FAIL',
      detail: `Oldest pending job is waiting too long (${health.oldestPendingJobAgeSec}s >= 300s).`,
    });
  } else if (health.deadJobs > 0) {
    checks.push({
      id: 'PF-04',
      status: 'WARN',
      detail: `Queue has ${health.deadJobs} dead job(s). Oldest pending job age: ${health.oldestPendingJobAgeSec}s.`,
    });
  } else {
    checks.push({
      id: 'PF-04',
      status: 'PASS',
      detail: `Queue is healthy (0 dead jobs, oldest pending job: ${health.oldestPendingJobAgeSec}s).`,
    });
  }

  // PF-05: Org not frozen and not archived
  const orgResult = await db.query(
    'SELECT id, frozen_at, archived_at FROM organizations WHERE id = $1 LIMIT 1',
    [orgId],
  );
  const org = orgResult.rows[0] ?? null;
  if (!org) {
    checks.push({ id: 'PF-05', status: 'FAIL', detail: 'Organization not found.' });
  } else if (org.frozen_at) {
    checks.push({ id: 'PF-05', status: 'FAIL', detail: `Organization is frozen (frozen_at: ${new Date(org.frozen_at).toISOString()}).` });
  } else if (org.archived_at) {
    checks.push({ id: 'PF-05', status: 'FAIL', detail: `Organization is archived (archived_at: ${new Date(org.archived_at).toISOString()}).` });
  } else {
    checks.push({ id: 'PF-05', status: 'PASS', detail: 'Organization is active (not frozen and not archived).' });
  }

  // PF-06: Active agent with at least one unrevoked API key
  const agentResult = await db.query(`
    SELECT a.id, a.name, count(k.id)::integer AS active_key_count
    FROM agents a
    JOIN agent_api_keys k ON k.agent_id = a.id AND k.org_id = a.org_id
    WHERE a.org_id = $1 AND a.status = 'ACTIVE' AND k.revoked_at IS NULL
    GROUP BY a.id, a.name
    ORDER BY a.created_at ASC
    LIMIT 1
  `, [orgId]);
  const activeAgent = agentResult.rows[0] ?? null;

  if (!activeAgent) {
    checks.push({
      id: 'PF-06',
      status: 'FAIL',
      detail: 'No ACTIVE agent with an unrevoked API key found in this organization.',
    });
  } else {
    checks.push({
      id: 'PF-06',
      status: 'PASS',
      detail: `Active agent '${activeAgent.name}' has ${activeAgent.active_key_count} active API key(s).`,
    });
  }

  // PF-07: Active mandate for that agent: USD, not expired, schedule window includes now, remaining budget >= 100 minor
  let activeMandate = null;
  let activePolicy = null;
  if (!activeAgent) {
    checks.push({
      id: 'PF-07',
      status: 'FAIL',
      detail: 'Cannot verify mandate because no active agent was found (PF-06 failed).',
    });
  } else {
    const mandateResult = await db.query(`
      SELECT m.id, m.name, m.status, m.current_version_id,
             v.id AS version_id, v.policy, v.valid_from, v.valid_to
      FROM mandates m
      JOIN mandate_versions v ON v.id = m.current_version_id
      WHERE m.org_id = $1 AND m.agent_id = $2 AND m.status = 'ACTIVE'
      ORDER BY m.created_at DESC
      LIMIT 1
    `, [orgId, activeAgent.id]);
    activeMandate = mandateResult.rows[0] ?? null;

    if (!activeMandate) {
      checks.push({
        id: 'PF-07',
        status: 'FAIL',
        detail: `No ACTIVE mandate found for agent '${activeAgent.name}'.`,
      });
    } else {
      activePolicy = activeMandate.policy;
      const currency = activePolicy?.currency;
      const validFrom = new Date(activeMandate.valid_from);
      const validTo = new Date(activeMandate.valid_to);
      const isExpired = now < validFrom || now > validTo;

      const scheduleCheck = ruleA9Schedule({ policy: activePolicy, now });

      let budgetOk = false;
      let remainingMinor = 0n;
      try {
        const budget = await getBudget(orgId, activeMandate.id, db);
        if (budget) {
          remainingMinor = BigInt(budget.limit_minor) - BigInt(budget.reserved_minor) - BigInt(budget.spent_minor);
          budgetOk = remainingMinor >= 100n;
        }
      } catch {}

      if (currency !== 'USD') {
        checks.push({
          id: 'PF-07',
          status: 'FAIL',
          detail: `Mandate currency is '${currency}', expected 'USD'.`,
        });
      } else if (isExpired) {
        checks.push({
          id: 'PF-07',
          status: 'FAIL',
          detail: `Mandate validity window expired or not yet active (${validFrom.toISOString()} to ${validTo.toISOString()}).`,
        });
      } else if (!scheduleCheck.ok) {
        checks.push({
          id: 'PF-07',
          status: 'FAIL',
          detail: `Current time is outside mandate schedule: ${scheduleCheck.detail}`,
        });
      } else if (!budgetOk) {
        checks.push({
          id: 'PF-07',
          status: 'FAIL',
          detail: `Mandate remaining budget is ${remainingMinor.toString()} minor (< 100 minor / $1.00 USD required).`,
        });
      } else {
        checks.push({
          id: 'PF-07',
          status: 'PASS',
          detail: `Active USD mandate '${activeMandate.name}' is within validity/schedule window with ${remainingMinor.toString()} minor budget remaining.`,
        });
      }
    }
  }

  // PF-08: Payee TRUSTED (kind EMAIL) included in mandate allowlist; display identifier_masked only
  let trustedPayee = null;
  if (!activeMandate || !activePolicy) {
    checks.push({
      id: 'PF-08',
      status: 'FAIL',
      detail: 'Cannot verify allowlisted payee because active mandate is missing (PF-07 failed).',
    });
  } else {
    const payeesResult = await db.query(`
      SELECT id, display_name, kind, identifier_masked, trust
      FROM payees
      WHERE org_id = $1 AND kind = 'EMAIL' AND trust = 'TRUSTED'
      ORDER BY created_at ASC
    `, [orgId]);

    const allowlistIds = activePolicy?.payees?.ids ?? [];
    const allowNewPayees = activePolicy?.allowNewPayees !== false;

    trustedPayee = payeesResult.rows.find((p) => allowlistIds.includes(p.id) || allowNewPayees);

    if (!trustedPayee) {
      checks.push({
        id: 'PF-08',
        status: 'FAIL',
        detail: 'No TRUSTED payee with kind EMAIL matching the mandate allowlist was found.',
      });
    } else {
      checks.push({
        id: 'PF-08',
        status: 'PASS',
        detail: `Found TRUSTED email payee '${trustedPayee.display_name}' (${trustedPayee.identifier_masked}) allowlisted in mandate.`,
      });
    }
  }

  // PF-09: If mandate requireInvoice: document status EXTRACTED with matching payeeName and detected amount
  if (!activePolicy?.requireInvoice) {
    checks.push({
      id: 'PF-09',
      status: 'PASS',
      detail: 'Mandate policy does not require invoice verification (requireInvoice is false).',
    });
  } else if (!trustedPayee) {
    checks.push({
      id: 'PF-09',
      status: 'FAIL',
      detail: 'Mandate requires an invoice, but no trusted payee is available to match (PF-08 failed).',
    });
  } else {
    const docsResult = await db.query(`
      SELECT d.id, d.status, e.payee_name, e.amount_minor, e.currency
      FROM documents d
      JOIN document_extractions e ON e.document_id = d.id AND e.org_id = d.org_id
      WHERE d.org_id = $1 AND d.status = 'EXTRACTED'
        AND e.amount_minor IS NOT NULL AND e.amount_minor > 0
      ORDER BY d.created_at DESC
    `, [orgId]);

    const matchingDoc = docsResult.rows.find((doc) => {
      if (!doc.payee_name) return false;
      const docName = doc.payee_name.toLowerCase().trim();
      const payeeName = trustedPayee.display_name.toLowerCase().trim();
      return docName.includes(payeeName) || payeeName.includes(docName);
    });

    if (matchingDoc) {
      checks.push({
        id: 'PF-09',
        status: 'PASS',
        detail: `Found EXTRACTED invoice document (${matchingDoc.id}) with detected payee '${matchingDoc.payee_name}' and amount ${matchingDoc.amount_minor} ${matchingDoc.currency}.`,
      });
    } else {
      checks.push({
        id: 'PF-09',
        status: 'FAIL',
        detail: `Mandate requires an invoice, but no EXTRACTED document matching payee '${trustedPayee.display_name}' with detected amount was found. Petunjuk: unggah invoice dan tunggu ekstraksi selesai.`,
      });
    }
  }

  // PF-10: verifyChain org = valid
  try {
    const chain = await verifyChain(orgId);
    if (chain.valid) {
      checks.push({
        id: 'PF-10',
        status: 'PASS',
        detail: `Ledger chain is valid (${chain.checkedEntries} entries verified).`,
      });
    } else {
      checks.push({
        id: 'PF-10',
        status: 'FAIL',
        detail: `Ledger chain verification failed: ${chain.reason} (at seq ${chain.firstBrokenSeq}).`,
      });
    }
  } catch (err) {
    checks.push({
      id: 'PF-10',
      status: 'FAIL',
      detail: `Ledger chain verification error: ${err.message}`,
    });
  }

  // PF-11: Encryption key can decrypt stored PayPal credentials without returning them
  const credsResult = await db.query(
    'SELECT client_id_enc, client_secret_enc FROM paypal_connections WHERE org_id = $1 LIMIT 1',
    [orgId],
  );
  const creds = credsResult.rows[0] ?? null;

  if (!creds?.client_id_enc || !creds?.client_secret_enc) {
    checks.push({
      id: 'PF-11',
      status: 'FAIL',
      detail: 'No encrypted PayPal credentials found for this organization.',
    });
  } else {
    try {
      decrypt({
        key: encryptionKey,
        payload: creds.client_id_enc,
        aad: `paypal_connections:client_id_enc:${orgId}`,
      });
      decrypt({
        key: encryptionKey,
        payload: creds.client_secret_enc,
        aad: `paypal_connections:client_secret_enc:${orgId}`,
      });
      checks.push({
        id: 'PF-11',
        status: 'PASS',
        detail: 'Stored PayPal credentials decrypted successfully with configured ENCRYPTION_KEY.',
      });
    } catch {
      checks.push({
        id: 'PF-11',
        status: 'FAIL',
        detail: 'KEY_MISMATCH: Stored PayPal credentials could not be decrypted with current ENCRYPTION_KEY.',
      });
    }
  }

  // PF-12: PayPal Sandbox OAuth endpoint reachable (read-only, no connection status update)
  try {
    const client = await paypalFor(orgId, { db, encryptionKey });
    await client.testConnection();
    checks.push({
      id: 'PF-12',
      status: 'PASS',
      detail: 'PayPal Sandbox OAuth endpoint reached and token acquired successfully.',
    });
  } catch (err) {
    checks.push({
      id: 'PF-12',
      status: 'FAIL',
      detail: `PayPal Sandbox OAuth endpoint unreachable: ${err.message}`,
    });
  }

  const ready = checks.every((check) => check.status !== 'FAIL');

  return {
    ready,
    checks,
  };
}

