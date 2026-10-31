import pool from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { expireMandates } from '../services/mandates.js';

export async function runCleanup(job, { db = pool } = {}) {
  const execute = async (tx) => {
    await tx.query("DELETE FROM rate_limit_buckets WHERE window_start < now() - interval '1 day'");
    await tx.query('DELETE FROM sessions WHERE expires_at < now()');
    await tx.query("DELETE FROM jobs WHERE status = 'COMPLETED' AND created_at < now() - interval '7 days'");
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
