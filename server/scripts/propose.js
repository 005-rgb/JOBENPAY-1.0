import { submitPaymentRequest } from '../src/services/requests.js';
import pool from '../src/db/pool.js';
import crypto from 'node:crypto';

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const agentId = argument('agent');
const orgId = process.env.ORG_ID
  || (await pool.query('SELECT org_id FROM agents WHERE id = $1', [agentId])).rows[0]?.org_id;

try {
  const result = await submitPaymentRequest({
    orgId,
    agentId,
    payeeId: argument('payee'),
    amountMinor: argument('amount'),
    currency: argument('currency'),
    documentId: argument('doc'),
    action: 'PAYOUT',
    idempotencyKey: `cli-${crypto.randomUUID()}`,
  });
  console.log(JSON.stringify({
    decision: result.decision,
    reasonCodes: result.reason_codes,
    explanation: result.explanation,
    requestId: result.id,
  }, null, 2));
} finally {
  await pool.end();
}
