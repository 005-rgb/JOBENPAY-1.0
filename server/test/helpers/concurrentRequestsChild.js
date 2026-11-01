import pool from '../../src/db/pool.js';
import { submitPaymentRequest } from '../../src/services/requests.js';

const { payload } = JSON.parse(process.env.S13_CONCURRENT_REQUESTS || '{}');
if (!payload) throw new TypeError('S13_CONCURRENT_REQUESTS payload is required.');

try {
  const sameKeyResults = await Promise.all(Array.from({ length: 100 }, () => submitPaymentRequest({
    ...payload,
    idempotencyKey: 's13-concurrent-same-key',
  }, { db: pool })));
  const distinctKeyResults = await Promise.all(Array.from({ length: 100 }, (_, index) => submitPaymentRequest({
    ...payload,
    idempotencyKey: `s13-concurrent-invoice-${index}`,
  }, { db: pool })));

  process.stdout.write(`${JSON.stringify({
    sameKeyIds: sameKeyResults.map(({ id }) => id),
    distinct: distinctKeyResults.map(({ decision, reason_codes }) => ({ decision, reason_codes })),
  })}\n`);
} finally {
  await pool.end();
}
