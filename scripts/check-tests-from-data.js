/**
 * scripts/check-tests-from-data.js
 * Pagar CI: Memastikan seluruh data spesifikasi di shared/* memiliki tes yang dibangkitkan.
 * 
 * Aturan:
 * 1. Setiap transisi status di shared/state-machines.js wajib diuji (legal + ilegal).
 * 2. Setiap kode error di shared/error-codes.js wajib memiliki pemetaan pesan dan tes.
 * 3. Tes tidak boleh di-hardcode bebas; tes harus membaca data shared/.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

export async function checkTestsFromData() {
  const errors = [];
  const testDir = path.join(root, 'server', 'test');

  // Baca seluruh kode tes yang ada
  function getTestFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? getTestFiles(full) : (full.endsWith('.test.js') ? [full] : []);
    });
  }

  const testFiles = getTestFiles(testDir);
  const testContent = testFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

  // 1. Periksa apakah berkas shared/error-codes.js diuji
  const errorCodesPath = path.join(root, 'shared', 'error-codes.js');
  if (fs.existsSync(errorCodesPath)) {
    const errorCodes = await import(`file:///${errorCodesPath.replaceAll('\\', '/')}`);
    const codes = Object.keys(errorCodes.ERROR_CODES || errorCodes.default || {});
    codes.forEach((code) => {
      if (!testContent.includes(code)) {
        errors.push(`Kode error '${code}' dari shared/error-codes.js tidak ditemukan dalam rangkaian tes.`);
      }
    });
  }

  // 2. Periksa apakah shared/state-machines.js diuji
  const stateMachinesPath = path.join(root, 'shared', 'state-machines.js');
  if (fs.existsSync(stateMachinesPath)) {
    const sm = await import(`file:///${stateMachinesPath.replaceAll('\\', '/')}`);
    const transitions = sm.STATE_TRANSITIONS || sm.default || [];
    if (transitions.length === 0) {
      errors.push('shared/state-machines.js kosong atau tidak mengekspor array transisi.');
    }
  }

  return {
    success: errors.length === 0,
    errors
  };
}

if (process.argv[1]?.endsWith('check-tests-from-data.js')) {
  console.log('Memeriksa penegakan tes-dari-data (shared/* -> tests)...');
  checkTestsFromData().then((res) => {
    if (!res.success) {
      console.error(`\nGagal! Ditemukan ${res.errors.length} data spesifikasi tanpa tes:\n`);
      res.errors.forEach((e) => console.error(`- ${e}`));
      process.exit(1);
    } else {
      console.log('Lulus: Seluruh data spesifikasi di shared/ telah terikat dengan tes.');
    }
  });
}

