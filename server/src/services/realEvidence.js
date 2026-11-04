import pool from '../db/pool.js';
import { env } from '../config.js';

export function maskEmail(email) {
  if (typeof email !== 'string') return email;
  const match = email.match(/^([^@]+)@([^@]+)\.([a-zA-Z0-9_-]+)$/);
  if (!match) return 'a***@d***.tld';
  const local = match[1];
  const domain = match[2];
  const tld = match[3];
  const maskedLocal = (local[0] || 'a') + '***';
  const maskedDomain = (domain[0] || 'd') + '***';
  return `${maskedLocal}@${maskedDomain}.${tld}`;
}

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

export function redactString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(EMAIL_PATTERN, (match) => maskEmail(match));
}

const REDACT_KEY_PATTERN = /^(email|receiver|payer_email|payer_id|phone|name|given_name|surname|address.*)$/i;
const FORBIDDEN_SECRET_KEY_PATTERN = /^(secret|password|token|api[_-]?key|client[_-]?secret|authorization|identifier_enc)$/i;

export function redactEvidencePayload(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return redactString(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactEvidencePayload(item));
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_SECRET_KEY_PATTERN.test(k)) {
        continue;
      }
      if (REDACT_KEY_PATTERN.test(k)) {
        if (typeof v === 'string') {
          output[k] = v.includes('@') ? maskEmail(v) : '[REDACTED]';
        } else if (v && typeof v === 'object') {
          output[k] = redactEvidencePayload(v);
        } else {
          output[k] = '[REDACTED]';
        }
      } else {
        output[k] = redactEvidencePayload(v);
      }
    }
    return output;
  }
  return value;
}

export function maskUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  try {
    const parsed = new URL(urlStr);
    const hostParts = parsed.hostname.split('.');
    if (hostParts.length <= 1) {
      return `${parsed.protocol}//${parsed.hostname.slice(0, 1)}***`;
    }
    const maskedHost = `${hostParts[0].slice(0, 1)}***.${hostParts.slice(1).join('.')}`;
    return `${parsed.protocol}//${maskedHost}`;
  } catch {
    return 'https://***';
  }
}

export async function exportEvidence(orgId, requestId, options = {}) {
  if (!orgId || !requestId) {
    throw new TypeError('orgId and requestId are required to export evidence.');
  }

  const db = options.db ?? pool;

  // 1. Fetch request (scoped to orgId)
  const reqResult = await db.query(
    `SELECT id, org_id, agent_id, mandate_version_id, action, status,
            amount_minor, currency, payee_id, target_ref, document_id,
            agent_reason, agent_idempotency_key, request_hash, decision,
            reason_codes, risk_score, explanation, created_at
     FROM payment_requests
     WHERE org_id = $1 AND id = $2
     LIMIT 1`,
    [orgId, requestId],
  );

  const requestRow = reqResult.rows[0] ?? null;
  if (!requestRow) {
    return null;
  }

  // 2. Fetch executions
  const execResult = await db.query(
    `SELECT id, attempts, status, paypal_ref, http_status, response_redacted, created_at
     FROM executions
     WHERE org_id = $1 AND request_id = $2
     ORDER BY created_at ASC`,
    [orgId, requestId],
  );

  const executions = execResult.rows.map((row) => {
    const resp = row.response_redacted;
    const batchHeader = resp?.batch_header;
    const items = resp?.items;
    const item = Array.isArray(items) ? items[0] : null;

    const paypalPayoutBatchId = row.paypal_ref
      || batchHeader?.payout_batch_id
      || null;

    const paypalItemId = item?.payout_item_id
      || resp?.payout_item_id
      || null;

    const errorCode = resp?.name
      || resp?.error?.code
      || (row.http_status && row.http_status >= 400 ? `HTTP_${row.http_status}` : null);

    const errorMessage = resp?.message
      || resp?.error?.message
      || null;

    return {
      id: row.id,
      attempt: Number(row.attempts || 0),
      status: row.status,
      paypal_payout_batch_id: paypalPayoutBatchId,
      paypal_item_id: paypalItemId,
      response_code: row.http_status === null ? null : Number(row.http_status),
      error_code: errorCode,
      error_message: errorMessage ? redactString(errorMessage) : null,
      latency_ms: resp?.latency_ms ? Number(resp.latency_ms) : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    };
  });

  // 3. Fetch matched webhook events
  const batchIds = executions.map((e) => e.paypal_payout_batch_id).filter(Boolean);
  const webhookResult = await db.query(
    `SELECT id, paypal_event_id, event_type, payload, status, received_at, processed_at
     FROM webhook_events
     WHERE org_id = $1
       AND (
         payload->'resource'->>'sender_item_id' = $2
         OR payload->'resource'->>'sender_batch_id' = $3
         OR ($4::boolean AND payload->'resource'->>'payout_batch_id' = ANY($5::text[]))
       )
     ORDER BY received_at ASC`,
    [orgId, requestId, `jp_${requestId}`, batchIds.length > 0, batchIds],
  );

  const webhookEvents = webhookResult.rows.map((event) => ({
    event_type: event.event_type,
    payload: redactEvidencePayload(event.payload),
    received_at: event.received_at ? new Date(event.received_at).toISOString() : null,
    processed_at: event.processed_at ? new Date(event.processed_at).toISOString() : null,
  }));

  // 4. Fetch ledger entries
  const ledgerResult = await db.query(
    `SELECT seq, type, subject_type, subject_id, payload, signature, created_at
     FROM ledger_entries
     WHERE org_id = $1
       AND (
         subject_id::text = $2::text
         OR payload->>'requestId' = $2
         OR payload->>'request_id' = $2
       )
     ORDER BY seq ASC`,
    [orgId, requestId],
  );

  const ledger = ledgerResult.rows.map((entry) => ({
    entry_type: entry.type,
    amount: entry.payload?.amountMinor ?? entry.payload?.amount_minor ?? entry.payload?.amount ?? null,
    balance_after: entry.payload?.balanceAfter ?? entry.payload?.remaining_budget ?? null,
    signature: entry.signature,
    created_at: entry.created_at ? new Date(entry.created_at).toISOString() : null,
  }));

  // 5. Timings calculation
  const requestedAt = requestRow.created_at ? new Date(requestRow.created_at).toISOString() : null;
  const firstExec = executions[0];
  const lastExec = executions[executions.length - 1];
  const firstAttemptAt = firstExec?.created_at ?? null;

  const isCompletedOrFailed = ['COMPLETED', 'EXECUTED', 'RECONCILED', 'FAILED'].includes(requestRow.status);
  const completedAt = isCompletedOrFailed
    ? (lastExec?.created_at ?? requestedAt)
    : null;

  const elapsedSec = (completedAt && requestedAt)
    ? Math.max(0, Math.round(((new Date(completedAt) - new Date(requestedAt)) / 1000) * 1000) / 1000)
    : null;

  const referenceDate = firstAttemptAt ? new Date(firstAttemptAt) : (requestedAt ? new Date(requestedAt) : null);
  const webhookDelaysSec = webhookEvents
    .map((event) => {
      if (!event.received_at || !referenceDate) return null;
      const delay = (new Date(event.received_at) - referenceDate) / 1000;
      return Math.round(delay * 1000) / 1000;
    })
    .filter((d) => d !== null);

  const timings = {
    requested_at: requestedAt,
    first_attempt_at: firstAttemptAt,
    completed_at: completedAt,
    elapsed_sec: elapsedSec,
    webhook_delays_sec: webhookDelaysSec,
  };

  // 6. Metadata
  const meta = {
    exported_at: new Date().toISOString(),
    jobenpay_version: '0.1.0',
    node_env: env.NODE_ENV || 'production',
    app_url_masked: maskUrl(env.PUBLIC_BASE_URL),
  };

  // Clean request row: redact string fields if any sensitive emails/data
  const requestClean = {
    ...requestRow,
    agent_reason: requestRow.agent_reason ? redactString(requestRow.agent_reason) : null,
    explanation: requestRow.explanation ? redactString(requestRow.explanation) : null,
    created_at: requestRow.created_at ? new Date(requestRow.created_at).toISOString() : null,
  };

  return {
    request: requestClean,
    executions,
    webhook_events: webhookEvents,
    ledger,
    timings,
    meta,
  };
}

