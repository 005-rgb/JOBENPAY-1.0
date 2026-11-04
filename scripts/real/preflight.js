import { parseArgs } from 'node:util';
import pool from '../../server/src/db/pool.js';
import { runRealPreflight } from '../../server/src/services/realPreflight.js';

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000000';

async function main() {
  const options = {
    org: { type: 'string' },
    json: { type: 'boolean', default: false },
  };

  let values;
  try {
    const parsed = parseArgs({ options, allowPositionals: true });
    values = parsed.values;
  } catch (err) {
    console.error('Invalid CLI options:', err.message);
    process.exit(1);
  }

  let orgId = values.org;
  if (!orgId) {
    const orgRes = await pool.query('SELECT id, name FROM organizations ORDER BY created_at ASC LIMIT 1');
    orgId = orgRes.rows[0]?.id || GLOBAL_ORG_ID;
  }

  try {
    const result = await runRealPreflight(orgId);

    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n======================================================`);
      console.log(` JOBENPAY Real-Payout Preflight Checks`);
      console.log(` Target Organization: ${orgId}`);
      console.log(` Overall Status:      ${result.ready ? 'READY (PASS)' : 'NOT READY (FAIL)'}`);
      console.log(`======================================================\n`);

      for (const check of result.checks) {
        const badge = check.status === 'PASS' ? '[PASS]' : (check.status === 'WARN' ? '[WARN]' : '[FAIL]');
        console.log(`${badge} ${check.id}: ${check.detail}`);
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

