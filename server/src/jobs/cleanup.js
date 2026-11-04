import pool from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { sha256Hex } from '../lib/crypto.js';
import { expireMandates } from '../services/mandates.js';

export async function runCleanup(job, { db = pool } = {}) {
  const execute = async (tx) => {
    await tx.query("DELETE FROM rate_limit_buckets WHERE window_start < now() - interval '1 day'");
    await tx.query('DELETE FROM sessions WHERE expires_at < now()');
    await tx.query("DELETE FROM jobs WHERE status = 'COMPLETED' AND created_at < now() - interval '7 days'");

    // Cleanup unverified users older than 7 days, along with their tokens and outbox records
    const oldUnverified = await tx.query(`
      SELECT id, email FROM users
      WHERE email_verified_at IS NULL
        AND created_at < now() - interval '7 days'
    `);
    for (const u of oldUnverified.rows) {
      await tx.query("DELETE FROM email_tokens WHERE meta->>'userId' = $1", [u.id]);
      if (u.email) {
        await tx.query("DELETE FROM email_outbox WHERE org_id IS NULL AND to_hash = $1", [sha256Hex(String(u.email).toLowerCase().trim())]);
      }
      await tx.query('DELETE FROM users WHERE id = $1', [u.id]);
    }
    await expireMandates(tx);

    const rescheduled = await tx.query(`
      UPDATE jobs
      SET status = 'PENDING',
          run_at = now() + interval '1 hour',
          attempts = 0,
          locked_until = NULL,
          last_error = NULL
      WHERE id = $1 AND type = 'cleanup' AND status = 'RUNNING'
      RETURNING id
    `, [job.id]);
    if (rescheduled.rowCount !== 1) {
      throw new Error(`Cannot schedule the next cleanup run for job ${job.id}.`);
    }
  };

  if (db === pool) {
    await withTx(execute);
    return;
  }

  await execute(db);
}
