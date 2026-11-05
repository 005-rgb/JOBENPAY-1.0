import pool, { query } from '../db/pool.js';
import { env } from '../config.js';
import { encrypt, decrypt, sha256Hex } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { appendAudit } from '../repositories/audit.js';
import { enqueue } from '../jobs/queue.js';
import { sendMail } from './transport.js';
import * as templates from './templates.js';

const AAD_EMAIL_PAYLOAD = 'email_outbox:payload';
const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000000';

export async function enqueueEmail(dbOrPool, {
  orgId = null,
  to,
  template,
  data = {},
}) {
  const db = dbOrPool || pool;
  const normalizedTo = String(to).trim().toLowerCase();
  const toHash = sha256Hex(normalizedTo);

  const payloadPlain = JSON.stringify({
    to: normalizedTo,
    ...data,
  });

  const encKey = env.JOBENPAY_ENC_KEY || process.env.JOBENPAY_ENC_KEY || (env.NODE_ENV === 'test' ? 'k'.repeat(32) : null);
  const encryptedPayload = encrypt({
    key: encKey,
    plaintext: payloadPlain,
    aad: AAD_EMAIL_PAYLOAD,
  });

  const result = await db.query(`
    INSERT INTO email_outbox (org_id, to_hash, template, payload, status)
    VALUES ($1, $2, $3, $4, 'PENDING')
    RETURNING id, org_id, to_hash, template, status, attempts, created_at
  `, [orgId, toHash, template, encryptedPayload]);

  const outboxEntry = result.rows[0];

  // Enqueue send_email job so the worker can pick it up
  await enqueue(db, {
    type: 'send_email',
    orgId,
    payload: { outboxId: outboxEntry.id },
  });

  return outboxEntry;
}

export async function claimAndSendEmail(outboxId, { db = pool } = {}) {
  // Claim with FOR UPDATE SKIP LOCKED
  const claimed = await db.query(`
    SELECT *
    FROM email_outbox
    WHERE id = $1 AND status = 'PENDING'
    FOR UPDATE SKIP LOCKED
  `, [outboxId]);

  if (claimed.rowCount === 0) {
    return null; // Already claimed or not pending
  }

  const row = claimed.rows[0];

  let payload;
  try {
    const encKey = env.JOBENPAY_ENC_KEY || process.env.JOBENPAY_ENC_KEY || (env.NODE_ENV === 'test' ? 'k'.repeat(32) : null);
    const decrypted = decrypt({
      key: encKey,
      payload: row.payload,
      aad: AAD_EMAIL_PAYLOAD,
    });
    payload = JSON.parse(decrypted);
  } catch (decryptErr) {
    logger.error({ outboxId: row.id, status: 'FAILED' }, 'Email payload decryption failed');
    await db.query(`
      UPDATE email_outbox
      SET status = 'FAILED', last_error = 'DECRYPT_FAILED', updated_at = now()
      WHERE id = $1
    `, [row.id]);
    return null;
  }

  // Render template
  let rendered;
  if (row.template === 'verifyEmail') {
    rendered = templates.verifyEmail(payload.link, payload.expiresHours);
  } else if (row.template === 'accountExistsNotice') {
    rendered = templates.accountExistsNotice(payload.loginLink);
  } else if (row.template === 'welcome') {
    rendered = templates.welcome();
  } else if (row.template === 'approvalNeeded') {
    rendered = templates.approvalNeeded(payload);
  } else {
    logger.error({ outboxId: row.id, template: row.template, status: 'FAILED' }, 'Unknown email template');
    await db.query(`
      UPDATE email_outbox
      SET status = 'FAILED', last_error = 'UNKNOWN_TEMPLATE', updated_at = now()
      WHERE id = $1
    `, [row.id]);
    return null;
  }

  try {
    const result = await sendMail({
      to: payload.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    await db.query(`
      UPDATE email_outbox
      SET status = 'SENT',
          message_id = $1,
          attempts = attempts + 1,
          last_error = NULL,
          updated_at = now()
      WHERE id = $2
    `, [result.messageId, row.id]);

    // Requirement: Log only message_id and status, NEVER email, token, or address
    logger.info({ messageId: result.messageId, status: 'SENT' }, 'Email sent');
    return { ok: true, messageId: result.messageId };
  } catch (sendErr) {
    const newAttempts = row.attempts + 1;
    const isFinalFailure = newAttempts >= 5;
    const errorMessage = String(sendErr?.message || sendErr).slice(0, 500);

    await db.query(`
      UPDATE email_outbox
      SET status = CASE WHEN $1 THEN 'FAILED' ELSE 'PENDING' END,
          attempts = $2,
          last_error = $3,
          updated_at = now()
      WHERE id = $4
    `, [isFinalFailure, newAttempts, errorMessage, row.id]);

    if (isFinalFailure) {
      logger.error({ outboxId: row.id, attempts: newAttempts, status: 'FAILED' }, 'Email outbox delivery permanently failed');
      try {
        await appendAudit({
          orgId: row.org_id || GLOBAL_ORG_ID,
          action: 'EMAIL_SEND_FAILED',
          details: { outboxId: row.id, template: row.template, attempts: newAttempts },
        });
      } catch (auditErr) {
        logger.error({ err: auditErr }, 'Could not append audit for email send failure');
      }
    } else {
      logger.warn({ outboxId: row.id, attempts: newAttempts, status: 'RETRY' }, 'Email outbox delivery failed, will retry');
    }

    throw sendErr;
  }
}

export async function processOutboxBatch(db = pool, limit = 5) {
  const candidates = await db.query(`
    SELECT id
    FROM email_outbox
    WHERE status = 'PENDING' AND attempts < 5
    ORDER BY created_at ASC
    LIMIT $1
  `, [limit]);

  for (const row of candidates.rows) {
    try {
      await claimAndSendEmail(row.id, { db });
    } catch {
      // Handled and logged inside claimAndSendEmail
    }
  }
}

