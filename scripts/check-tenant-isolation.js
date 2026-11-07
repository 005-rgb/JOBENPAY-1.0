/**
 * scripts/check-tenant-isolation.js
 * CI Guard: Memeriksa kepatuhan isolasi multi-tenant pada seluruh skema database.
 * Aturan BW-00:
 * - Setiap tabel dengan kolom `org_id` wajib memiliki indeks atau PK yang diawali `org_id`.
 * - Pengambilan data dari tabel ber-`org_id` wajib terisolasi per tenant.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

export function checkTenantIsolation(migrationsDir = path.join(root, 'server', 'migrations')) {
  const violations = [];
  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const tables = new Map(); // tableName -> { hasOrgId: boolean, hasOrgIndex: boolean, file: string }

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Parse CREATE TABLE statements
    const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
    let match;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      const body = match[2];

      const hasOrgId = /\borg_id\b/i.test(body);
      const isPkOrgId = /PRIMARY\s+KEY\s*\(\s*org_id/i.test(body) || /org_id[^\n,]+PRIMARY\s+KEY/i.test(body);
      const isUniqueOrgId = /UNIQUE\s*\(\s*org_id/i.test(body) || /org_id[^\n,]+UNIQUE/i.test(body);

      if (hasOrgId) {
        if (!tables.has(tableName)) {
          tables.set(tableName, {
            hasOrgId: true,
            hasOrgIndex: isPkOrgId || isUniqueOrgId,
            file,
          });
        }
      }
    }

    // Parse CREATE INDEX statements
    const indexRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+[a-zA-Z0-9_]+\s+ON\s+([a-zA-Z0-9_]+)\s*\(\s*org_id/gi;
    while ((match = indexRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      if (tables.has(tableName)) {
        tables.get(tableName).hasOrgIndex = true;
      }
    }

    // Parse ALTER TABLE ... ADD PRIMARY KEY (org_id)
    const alterPkRegex = /ALTER\s+TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+PRIMARY\s+KEY\s*\(\s*org_id/gi;
    while ((match = alterPkRegex.exec(content)) !== null) {
      const tableName = match[1].toLowerCase();
      if (tables.has(tableName)) {
        tables.get(tableName).hasOrgIndex = true;
      }
    }
  }

  // Exempt internal or system-wide tables that do not belong to tenants
  const exemptions = new Set(['rate_limit_buckets', 'schema_migrations']);

  for (const [tableName, info] of tables) {
    if (exemptions.has(tableName)) continue;
    if (!info.hasOrgIndex) {
      violations.push({
        table: tableName,
        file: info.file,
        error: `Table '${tableName}' has org_id but lacks an index or PK starting with org_id.`,
      });
    }
  }

  return {
    success: violations.length === 0,
    tableCount: tables.size,
    violations,
  };
}

if (process.argv[1] && process.argv[1].endsWith('check-tenant-isolation.js')) {
  const result = checkTenantIsolation();
  console.log(`[CI Guard] Checked ${result.tableCount} tables with org_id.`);
  if (!result.success) {
    console.error(`[CI Guard FAIL] Found ${result.violations.length} tenant isolation violations:`);
    for (const v of result.violations) {
      console.error(` - [${v.table}] in ${v.file}: ${v.error}`);
    }
    process.exit(1);
  }
  console.log('[CI Guard PASS] 100% of tables with org_id have valid org_id index/PK.');
}
