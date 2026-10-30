import { parseArgs } from 'node:util';

import { listOrgIds, verifyChain } from '../src/services/ledger.js';

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      org: { type: 'string' },
      all: { type: 'boolean', default: false },
    },
    allowPositionals: false,
  });

  if (!values.org && !values.all) {
    console.error('Usage: node server/scripts/verify-ledger.js --org <uuid> | --all');
    process.exit(2);
  }

  const orgIds = values.all ? await listOrgIds() : [values.org];

  if (orgIds.length === 0) {
    console.log('No ledger entries found.');
    process.exit(0);
  }

  let exitCode = 0;

  for (const orgId of orgIds) {
    const result = await verifyChain(orgId);
    const status = result.valid ? 'VALID' : 'INVALID';
    console.log(JSON.stringify({ orgId, status, checkedEntries: result.checkedEntries, firstBrokenSeq: result.firstBrokenSeq, reason: result.reason }));

    if (!result.valid) {
      exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main().catch((error) => {
  console.error('Ledger verification failed:', error.message);
  process.exit(1);
});
