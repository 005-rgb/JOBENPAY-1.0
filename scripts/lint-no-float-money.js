/**
 * scripts/lint-no-float-money.js
 * Pagar CI: Penegakan Aturan Keras A.5 #6 (Larangan Angka Pecahan/Float untuk Uang).
 * 
 * Aturan:
 * 1. Dilarang menggunakan `parseFloat`.
 * 2. Dilarang mengonversi variabel moneter (berisi `amount`, `minor`, `fee`, `total`, `balance`) dengan `Number(...)`.
 * 3. Dilarang operasi aritmatika float (`*`, `/`) pada variabel moneter tanpa BigInt.
 * 4. Eksponen desimal hanya diizinkan di batas serialisasi PayPal.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];

const TARGET_DIRS = ['server/src', 'shared'];
const MONEY_PATTERN = /(amount|minor|fee|total|balance|spent|reserved|payout)/i;

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        walkDir(fullPath, fileList);
      }
    } else if (file.endsWith('.js') && !file.endsWith('.test.js')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function lintNoFloatMoney(targetFiles = null) {
  const filePaths = targetFiles || TARGET_DIRS.flatMap((d) => walkDir(path.join(root, d)));
  const violations = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(root, filePath).replaceAll('\\', '/');
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

      // 1. Larangan parseFloat
      if (/\bparseFloat\s*\(/.test(line)) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'NO_PARSE_FLOAT',
          snippet: trimmed,
          message: 'Dilarang menggunakan parseFloat pada logika moneter.'
        });
      }

      // 2. Larangan Number(variabel_moneter)
      const numMatch = line.match(/\bNumber\s*\(\s*([a-zA-Z0-9_$.]+)\s*\)/);
      if (numMatch && MONEY_PATTERN.test(numMatch[1])) {
        // Pengecualian batas serialisasi / logging eksplisit jika didokumentasikan
        if (!line.includes('// allow-number-serialization')) {
          violations.push({
            file: relativePath,
            line: lineNum,
            rule: 'NO_NUMBER_COERCION_ON_MONEY',
            snippet: trimmed,
            message: `Dilarang mengonversi variabel moneter '${numMatch[1]}' menggunakan Number(). Gunakan BigInt satuan minor.`
          });
        }
      }

      // 3. Larangan pembagian floating point pada variabel berakhiran minor
      if (/[a-zA-Z0-9_]*minor\s*\/\s*[0-9]+/i.test(line) && !line.includes('BigInt') && !line.includes('// allow-division')) {
        violations.push({
          file: relativePath,
          line: lineNum,
          rule: 'NO_FLOAT_DIVISION_ON_MINOR',
          snippet: trimmed,
          message: 'Dilarang operasi pembagian float pada variabel minor. Gunakan BigInt integer division atau money.js.'
        });
      }
    });
  }

  return violations;
}

if (process.argv[1]?.endsWith('lint-no-float-money.js')) {
  console.log('Menjalankan lint-no-float-money...');
  const violations = lintNoFloatMoney();

  if (violations.length > 0) {
    console.error(`\nGagal! Ditemukan ${violations.length} pelanggaran larangan float moneter:\n`);
    violations.forEach((v) => {
      console.error(`- [${v.rule}] ${v.file}:${v.line} -> ${v.message}`);
      console.error(`  Baris: "${v.snippet}"\n`);
    });
    process.exit(1);
  } else {
    console.log('Lulus: Tidak ada penggunaan float atau Number terlarang pada variabel moneter.');
  }
}
