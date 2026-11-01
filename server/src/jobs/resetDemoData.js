import pool from '../db/pool.js';
import { resetDemoOrganization } from '../services/demoReset.js';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function nextDemoReset(now = new Date()) {
  const wibNow = new Date(now.getTime() + WIB_OFFSET_MS);
  const targetUtc = Date.UTC(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate(),
    3 - 7,
    0,
    0,
  );
  const target = new Date(targetUtc <= now.getTime() ? targetUtc + 24 * 60 * 60 * 1000 : targetUtc);
  const targetWib = new Date(target.getTime() + WIB_OFFSET_MS);
  const date = targetWib.toISOString().slice(0, 10);
  return { runAt: target, dedupeKey: `demo-reset:${date}` };
}

export async function scheduleDemoReset(db = pool, now = new Date()) {
  const { runAt, dedupeKey } = nextDemoReset(now);
  const result = await db.query(`
    INSERT INTO jobs (type, payload, run_at, dedupe_key, status)
    VALUES ('reset_demo_data', '{}', $1, $2, 'PENDING')
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  `, [runAt, dedupeKey]);
  return { runAt, dedupeKey, scheduled: result.rowCount === 1 };
}

export async function resetDemoDataJob(_job, { db = pool } = {}) {
  return resetDemoOrganization(db);
}
