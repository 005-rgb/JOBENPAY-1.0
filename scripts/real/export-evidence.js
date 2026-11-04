import fs from 'node:fs';
import { parseArgs } from 'node:util';
import pool from '../../server/src/db/pool.js';
import { exportEvidence } from '../../server/src/services/realEvidence.js';

async function main() {
  const options = {
    request: { type: 'string' },
    org: { type: 'string' },
    out: { type: 'string' },
  };

  let values;
  try {
    const parsed = parseArgs({ options, allowPositionals: true });
    values = parsed.values;
  } catch (err) {
    console.error('Invalid CLI options:', err.message);
    process.exit(1);
  }

  const requestId = values.request;
  if (!requestId) {
    console.error('Usage: npm run real:evidence -- --request <requestId> [--org <orgId>] [--out <filePath>]');
    process.exit(1);
  }

  try {
    let orgId = values.org;
    if (!orgId) {
      const row = await pool.query('SELECT org_id FROM payment_requests WHERE id = $1 LIMIT 1', [requestId]);
      if (!row.rows[0]?.org_id) {
        console.error(`Error: Payment request '${requestId}' not found.`);
        await pool.end();
        process.exit(1);
      }
      orgId = row.rows[0].org_id;
    }

    const evidence = await exportEvidence(orgId, requestId);
    if (!evidence) {
      console.error(`Error: Evidence not found for request '${requestId}' in org '${orgId}'.`);
      await pool.end();
      process.exit(1);
    }

    const jsonStr = JSON.stringify(evidence, null, 2);

    if (values.out) {
      fs.writeFileSync(values.out, jsonStr, 'utf8');
      console.log(`Evidence written to ${values.out}`);
    } else {
      console.log(jsonStr);
    }

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Failed to export evidence:', err);
    await pool.end();
    process.exit(1);
  }
}

main();

