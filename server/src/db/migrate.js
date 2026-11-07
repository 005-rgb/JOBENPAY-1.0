/**
 * server/src/db/migrate.js
 * Runner migrasi database maju-saja (forward-only) dengan penegakan advisory lock dan checksum SHA-256.
 * 
 * Aturan Pagar:
 * 1. Menjalankan di bawah advisory lock PostgreSQL agar dua proses paralel tidak bentrok.
 * 2. Tabel schema_migrations melacak filename, checksum SHA-256, dan applied_at.
 * 3. Gagal keras (throw hard error) jika checksum migrasi yang telah diterapkan berubah (anti-tamper).
 * 4. Kompatibilitas mundur: backfill checksum jika kolom sebelumnya kosong.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

import { env } from '../config.js';
import { databaseConnectionOptions } from './connection.js';

const { Client } = pg;
const migrationDir = path.resolve(process.cwd(), 'server/migrations');
export const MIGRATION_LOCK_KEY = 20261030;

function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export async function runMigrations(connectionString = env.DATABASE_URL) {
  const client = new Client({
    ...databaseConnectionOptions(connectionString),
    statement_timeout: 15000,
  });
  await client.connect();

  try {
    // 1. Peroleh advisory lock
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    // 2. Pastikan tabel schema_migrations ada dan memiliki kolom checksum
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename text PRIMARY KEY,
        checksum text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text
    `);

    // 3. Baca daftar file migrasi dari disk
    const files = (await fs.readdir(migrationDir))
      .filter((name) => /^\d+_.*\.sql$/i.test(name))
      .sort();

    // 4. Periksa file yang sudah diterapkan dan verifikasi checksum
    const appliedRows = await client.query('SELECT filename, checksum FROM schema_migrations');
    const appliedMap = new Map(appliedRows.rows.map((r) => [r.filename, r.checksum]));

    for (const file of files) {
      const fullPath = path.join(migrationDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      const checksum = computeChecksum(sql);

      if (appliedMap.has(file)) {
        const storedChecksum = appliedMap.get(file);
        if (storedChecksum && storedChecksum !== checksum) {
          throw new Error(
            `MIGRATION_CHECKSUM_MISMATCH: Migration file '${file}' has been altered after execution. ` +
            `Expected checksum ${storedChecksum}, got ${checksum}. Modifying applied migrations is strictly forbidden!`
          );
        } else if (!storedChecksum) {
          // Backfill checksum untuk migrasi lama
          await client.query('UPDATE schema_migrations SET checksum = $1 WHERE filename = $2', [checksum, file]);
        }
        continue;
      }

      // Migrasi baru: terapkan dalam transaksi
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum, applied_at) VALUES ($1, $2, now())',
          [file, checksum]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        const position = error.position ? ` at SQL position ${error.position}` : '';
        throw new Error(`Migration ${file} failed${position}: ${error.message}`, { cause: error });
      }
    }
  } finally {
    // 5. Lepaskan advisory lock selalu
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

/**
 * Memeriksa status migrasi untuk endpoint /readyz
 */
export async function checkMigrationStatus(client) {
  try {
    const tableExists = await client.query(`
      SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_migrations'
    `);
    if (tableExists.rowCount === 0) {
      return { upToDate: false, pendingCount: -1, error: 'schema_migrations table does not exist' };
    }

    const files = (await fs.readdir(migrationDir))
      .filter((name) => /^\d+_.*\.sql$/i.test(name))
      .sort();

    const applied = await client.query('SELECT filename, checksum FROM schema_migrations');
    const appliedMap = new Map(applied.rows.map((r) => [r.filename, r.checksum]));

    let pendingCount = 0;
    for (const file of files) {
      if (!appliedMap.has(file)) {
        pendingCount++;
      } else {
        const sql = await fs.readFile(path.join(migrationDir, file), 'utf8');
        const checksum = computeChecksum(sql);
        const stored = appliedMap.get(file);
        if (stored && stored !== checksum) {
          return { upToDate: false, pendingCount, error: `Checksum mismatch on ${file}` };
        }
      }
    }

    return {
      upToDate: pendingCount === 0,
      pendingCount,
      appliedCount: applied.rowCount,
    };
  } catch (err) {
    return { upToDate: false, pendingCount: -1, error: err.message };
  }
}

