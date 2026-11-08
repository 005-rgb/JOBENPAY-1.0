// @ts-check
import pool from './pool.js';
import { checkMigrationStatus, runMigrations } from './migrate.js';

/**
 * Mengembalikan boolean true jika semua migrasi telah diterapkan dan checksum valid,
 * false jika masih ada migrasi pending atau terjadi kesalahan.
 */
export async function migrationStatus() {
  try {
    const res = await checkMigrationStatus(pool);
    return res.upToDate === true;
  } catch {
    return false;
  }
}

export { checkMigrationStatus, runMigrations };
export default { migrationStatus, checkMigrationStatus, runMigrations };
