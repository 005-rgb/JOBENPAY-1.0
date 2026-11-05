import { parseArgs } from 'node:util';
import pool from '../../server/src/db/pool.js';
import { runRealPreflight } from '../../server/src/services/realPreflight.js';

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000000';

async function main() {
  const options = {
    org: { type: 'string' },
    json: { type: 'boolean', default: false },
    'retry-dead': { type: 'boolean', default: false },
    'clear-dead': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  };

  let values;
  try {
    const parsed = parseArgs({ options, allowPositionals: true });
    values = parsed.values;
  } catch (err) {
    console.error('Invalid CLI options:', err.message);
    process.exit(1);
  }

  if (values.help) {
    console.log(`
JOBENPAY Real-Payout Preflight Verifier

Usage:
  npm run real:preflight [-- [options]]

Options:
  --org <id|slug>    Target organization ID or slug (default: first active org)
  --retry-dead       Reset all DEAD jobs back to PENDING to clear queue warnings
  --clear-dead       Delete DEAD jobs from queue
  --json             Output results in JSON format
  --help             Show this help message
`);
    process.exit(0);
  }

  if (values['retry-dead']) {
    const res = await pool.query(
      "UPDATE jobs SET status = 'PENDING', attempts = 0, run_at = now(), locked_until = NULL WHERE status = 'DEAD' RETURNING id",
    );
    console.log(`[QUEUE] Reset ${res.rowCount} DEAD job(s) back to PENDING.`);
  } else if (values['clear-dead']) {
    const res = await pool.query("DELETE FROM jobs WHERE status = 'DEAD' RETURNING id");
    console.log(`[QUEUE] Removed ${res.rowCount} DEAD job(s) from queue.`);
  }

  let orgId = values.org;
  let orgName = '';
  let orgSlug = '';
  if (orgId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId);
    const orgRes = isUuid
      ? await pool.query('SELECT id, name, slug FROM organizations WHERE id = $1 LIMIT 1', [orgId])
      : await pool.query('SELECT id, name, slug FROM organizations WHERE slug = $1 OR name ILIKE $1 LIMIT 1', [orgId]);
    if (orgRes.rows[0]) {
      orgId = orgRes.rows[0].id;
      orgName = orgRes.rows[0].name;
      orgSlug = orgRes.rows[0].slug;
    } else {
      console.error(`Error: Organization '${values.org}' not found.`);
      await pool.end();
      process.exit(1);
    }
  } else {
    const orgRes = await pool.query('SELECT id, name, slug FROM organizations ORDER BY created_at ASC LIMIT 1');
    orgId = orgRes.rows[0]?.id || GLOBAL_ORG_ID;
    orgName = orgRes.rows[0]?.name || 'Default';
    orgSlug = orgRes.rows[0]?.slug || 'default';
  }

  try {
    const result = await runRealPreflight(orgId);

    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n======================================================`);
      console.log(` JOBENPAY Real-Payout Preflight Checks`);
      console.log(` Target Organization: ${orgId} (${orgName} [${orgSlug}])`);
      console.log(` Overall Status:      ${result.ready ? 'READY (PASS)' : 'NOT READY (FAIL)'}`);
      console.log(`======================================================\n`);

      for (const check of result.checks) {
        const badge = check.status === 'PASS' ? '[PASS]' : (check.status === 'WARN' ? '[WARN]' : '[FAIL]');
        console.log(`${badge} ${check.id}: ${check.detail}`);
      }

      if (result.checks.some((c) => c.id === 'PF-04' && c.status === 'WARN')) {
        const deadInfo = await pool.query(
          "SELECT id, type, attempts, substring(last_error from 1 for 70) AS err FROM jobs WHERE status = 'DEAD' ORDER BY created_at DESC LIMIT 3",
        );
        if (deadInfo.rows.length > 0) {
          console.log('\n[INFO] Dead jobs detail:');
          for (const row of deadInfo.rows) {
            console.log(`  - Job ${row.id} (${row.type}, ${row.attempts} attempts): ${row.err || 'No error message'}`);
          }
          console.log('  Tip: Run `npm run real:preflight -- --retry-dead` to reset dead jobs back to PENDING.');
        }
      }

      console.log(`\nSummary: ${result.ready ? 'All critical checks passed. Ready for real PayPal Sandbox payout.' : 'One or more checks failed. Address the issues above before running a real payout.'}\n`);
    }

    await pool.end();
    process.exit(result.ready ? 0 : 1);
  } catch (err) {
    console.error('Preflight execution failed:', err);
    await pool.end();
    process.exit(1);
  }
}

main();

