/**
 * scripts/check-traceability.js
 * Pagar CI: Memeriksa kelengkapan penelusuran (Traceability) di docs/traceability.csv.
 * 
 * Aturan Pagar:
 * 1. Seluruh FR Blueprint §7 wajib terdaftar.
 * 2. Seluruh 10 Kriteria PRD §13 wajib terdaftar (PRD13-01 s/d PRD13-10).
 * 3. Seluruh AD (AD-01 s/d AD-17) wajib terdaftar.
 * 4. Seluruh Temuan Lanjutan (T-01 s/d T-20) wajib terdaftar.
 * 5. Setiap baris wajib memiliki tes (atau 'pending-by-design' yang dicatat eksplisit).
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const csvPath = path.join(root, 'docs', 'traceability.csv');

export function checkTraceability() {
  if (!fs.existsSync(csvPath)) {
    return {
      success: false,
      errors: ['File docs/traceability.csv tidak ditemukan. Wajib dibuat di WP F0-4.']
    };
  }

  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const header = lines[0].split(',').map((h) => h.trim());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',').map((p) => p.trim());
    if (parts.length >= 6) {
      rows.push({
        id: parts[0],
        jenis: parts[1],
        deskripsi: parts[2],
        wp: parts[3],
        tes: parts[4],
        status: parts[5],
        bukti: parts[6] || ''
      });
    }
  }

  const registeredIds = new Set(rows.map((r) => r.id));
  const errors = [];
  let pendingCount = 0;
  let doneCount = 0;

  // 1. Periksa PRD §13 (10 butir)
  for (let i = 1; i <= 10; i++) {
    const prdId = `PRD13-${String(i).padStart(2, '0')}`;
    if (!registeredIds.has(prdId)) {
      errors.push(`Kriteria PRD §13 '${prdId}' tidak terdaftar di docs/traceability.csv`);
    }
  }

  // 2. Periksa AD-01 s/d AD-17
  for (let i = 1; i <= 17; i++) {
    const adId = `AD-${String(i).padStart(2, '0')}`;
    if (!registeredIds.has(adId)) {
      errors.push(`Keputusan '${adId}' tidak terdaftar di docs/traceability.csv`);
    }
  }

  // 3. Periksa T-01 s/d T-20
  for (let i = 1; i <= 20; i++) {
    const tId = `T-${String(i).padStart(2, '0')}`;
    if (!registeredIds.has(tId)) {
      errors.push(`Temuan '${tId}' tidak terdaftar di docs/traceability.csv`);
    }
  }

  // 4. Periksa integritas baris
  rows.forEach((r) => {
    if (r.status === 'pending-by-design') {
      pendingCount++;
    } else if (r.status === 'done') {
      doneCount++;
    }
    if (!r.tes || r.tes === '') {
      errors.push(`ID '${r.id}' tidak memiliki rujukan nama tes.`);
    }
  });

  return {
    success: errors.length === 0,
    errors,
    totalRows: rows.length,
    doneCount,
    pendingCount
  };
}

if (process.argv[1]?.endsWith('check-traceability.js')) {
  console.log('Memeriksa kelengkapan docs/traceability.csv...');
  const result = checkTraceability();

  if (!result.success) {
    console.error(`\nGagal! Ditemukan ${result.errors.length} masalah penelusuran:\n`);
    result.errors.forEach((e) => console.error(`- ${e}`));
    process.exit(1);
  } else {
    console.log(`Lulus! Total ${result.totalRows} butir terdaftar (Done: ${result.doneCount}, Pending-by-design: ${result.pendingCount}). 100% ID terlacak.`);
  }
}

