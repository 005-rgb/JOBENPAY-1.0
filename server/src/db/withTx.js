/**
 * server/src/db/withTx.js
 * Transaksi database ACID dengan penanganan rollback otomatis dan retry terbatas
 * khusus untuk error konkurensi (serialization failure 40001 dan deadlock 40P01).
 * 
 * Aturan Pagar:
 * 1. Mendukung signature withTx(fn, db) dan withTx(fn, { maxRetries, db }).
 * 2. Menerima pool, client, atau mock db yang memiliki query/connect.
 * 3. Tidak ada retry pada error bisnis (constraint, validasi, logic, dll).
 * 4. Retry dibatasi (default maxRetries = 3) dengan exponential backoff dan jitter.
 * 5. Client dilepas dengan benar ke pool di blok finally.
 */

import pool from './pool.js';

const RETRYABLE_SQLSTATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

export async function withTx(fn, optionsOrDb = {}) {
  let db = pool;
  let maxRetries = 3;

  if (optionsOrDb && (typeof optionsOrDb.query === 'function' || typeof optionsOrDb.connect === 'function')) {
    db = optionsOrDb;
  } else if (optionsOrDb && typeof optionsOrDb === 'object') {
    if (optionsOrDb.db) db = optionsOrDb.db;
    if (typeof optionsOrDb.maxRetries === 'number') maxRetries = optionsOrDb.maxRetries;
  }

  let attempt = 0;

  while (true) {
    const isPool = typeof db.connect === 'function';
    const client = isPool ? await db.connect() : db;

    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);

      const isRetryable = error?.code && RETRYABLE_SQLSTATES.has(error.code);
      if (isRetryable && attempt < maxRetries) {
        attempt++;
        const backoffMs = Math.floor(Math.pow(2, attempt) * 50 + Math.random() * 25);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }

      // Non-retryable error atau batas retry habis -> lempar error asli
      throw error;
    } finally {
      if (isPool && typeof client.release === 'function') {
        client.release();
      }
    }
  }
}

export default withTx;
