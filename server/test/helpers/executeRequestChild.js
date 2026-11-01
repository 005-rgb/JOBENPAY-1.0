import pool from '../../src/db/pool.js';
import { executeRequest } from '../../src/jobs/handlers/executeRequest.js';
import { paypalFor } from '../../src/paypal/client.js';

const { orgId, requestId } = process.env;

executeRequest({
  type: 'execute_request',
  attempts: 1,
  payload: { orgId, requestId },
}, {
  db: pool,
  encryptionKey: process.env.S13_ENC_KEY,
  paypalFor: (id, options) => paypalFor(id, {
    ...options,
    encryptionKey: process.env.S13_ENC_KEY,
  }),
}).then(async () => {
  await pool.end();
  process.exitCode = 0;
}).catch(async (error) => {
  process.stderr.write(`${error.code || 'EXECUTION_FAILED'}\n`);
  await pool.end();
  process.exitCode = 1;
});
