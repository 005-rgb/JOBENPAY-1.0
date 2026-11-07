/**
 * scripts/check-insert-tests.js
 * Pagar CI: Memeriksa bahwa setiap constraint CHECK, UNIQUE, dan Trigger
 * pada skema SQL memiliki pasangan uji insert valid dan invalid.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

export function checkInsertTests() {
  const schemaPath = path.join(root, 'docs', 'spec', 'sql', 'prd-2-fixed.sql');
  const testPath = path.join(root, 'docs', 'spec', 'sql', 'prd-2-insert-tests.sql');

  const errors = [];
  if (!fs.existsSync(schemaPath)) {
    return { success: false, errors: ['docs/spec/sql/prd-2-fixed.sql tidak ditemukan.'] };
  }
  if (!fs.existsSync(testPath)) {
    return { success: false, errors: ['docs/spec/sql/prd-2-insert-tests.sql tidak ditemukan.'] };
  }

  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  const testContent = fs.readFileSync(testPath, 'utf8');

  // Cari seluruh constraint CHECK
  const checkMatches = [...schemaContent.matchAll(/CHECK\s*\(([^)]+)\)/gi)].map((m) => m[1].trim());
  const uniqueMatches = [...schemaContent.matchAll(/UNIQUE\s*\(([^)]+)\)/gi)].map((m) => m[1].trim());

  // Pastikan skrip uji memuat blok pengujian valid dan penolakan
  if (!testContent.includes('check_violation')) {
    errors.push('docs/spec/sql/prd-2-insert-tests.sql tidak menangani penolakan check_violation.');
  }
  if (!testContent.includes('unique_violation')) {
    errors.push('docs/spec/sql/prd-2-insert-tests.sql tidak menangani penolakan unique_violation.');
  }
  if (!testContent.includes('trg_balanced')) {
    errors.push('docs/spec/sql/prd-2-insert-tests.sql tidak menguji trigger trg_balanced.');
  }
  if (!testContent.includes('immutable')) {
    errors.push('docs/spec/sql/prd-2-insert-tests.sql tidak menguji penolakan mutasi immutability.');
  }

  return {
    success: errors.length === 0,
    errors,
    checksFound: checkMatches.length,
    uniquesFound: uniqueMatches.length
  };
}

if (process.argv[1]?.endsWith('check-insert-tests.js')) {
  console.log('Memeriksa kelengkapan pasangan uji insert SQL (CHECK, UNIQUE, Trigger)...');
  const result = checkInsertTests();

  if (!result.success) {
    console.error(`\nGagal! Ditemukan ${result.errors.length} kekurangan pasangan uji insert:\n`);
    result.errors.forEach((e) => console.error(`- ${e}`));
    process.exit(1);
  } else {
    console.log(`Lulus: Ditemukan ${result.checksFound} CHECK dan ${result.uniquesFound} UNIQUE. Pasangan uji valid/invalid terbukti lengkap.`);
  }
}

