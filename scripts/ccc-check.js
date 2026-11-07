#!/usr/bin/env node
/**
 * scripts/ccc-check.js
 * Category Completeness Checklist (CCC) Validator
 *
 * Memeriksa 14 butir kelayakan implementasi untuk kategori transaksi tertentu.
 * Penggunaan: node scripts/ccc-check.js <KATEGORI>
 * Contoh: node scripts/ccc-check.js PAYOUT
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const categoryArg = process.argv[2];
if (!categoryArg) {
  console.error('Penggunaan: node scripts/ccc-check.js <KATEGORI>');
  console.error('Contoh: node scripts/ccc-check.js PAYOUT');
  process.exit(1);
}

const category = categoryArg.toUpperCase();
const catLower = category.toLowerCase();

// 14 Butir CCC
const items = [
  {
    id: 1,
    name: 'Migrasi DB & Insert Tests',
    check: () => {
      // Memeriksa migrasi spesifik domain kategori di server/migrations
      const migrationsDir = path.join(root, 'server', 'migrations');
      if (!fs.existsSync(migrationsDir)) return false;
      const migFiles = fs.readdirSync(migrationsDir);
      const hasMigration = migFiles.some((f) => f.toLowerCase().includes(catLower));

      // Memeriksa tes insert SQL
      const insertSql = path.join(root, 'docs', 'spec', 'sql', 'prd-2-insert-tests.sql');
      const hasInsertTest = fs.existsSync(insertSql) && fs.readFileSync(insertSql, 'utf8').includes(category);

      return hasMigration && hasInsertTest;
    }
  },
  {
    id: 2,
    name: 'Definisi Spesifikasi Shared (shared/)',
    check: () => {
      const smFile = path.join(root, 'shared', 'state-machines.js');
      const catFile = path.join(root, 'shared', 'categories.js');
      const domainFile = path.join(root, 'shared', `${catLower}.js`);

      if (fs.existsSync(domainFile)) return true;
      if (fs.existsSync(catFile) && fs.readFileSync(catFile, 'utf8').includes(category)) return true;
      if (fs.existsSync(smFile) && fs.readFileSync(smFile, 'utf8').includes(category)) return true;
      return false;
    }
  },
  {
    id: 3,
    name: 'Tes Terbangkit dari Data (Data-Driven Tests)',
    check: () => {
      const testDir = path.join(root, 'server', 'test', 'unit');
      if (!fs.existsSync(testDir)) return false;
      const files = fs.readdirSync(testDir);
      return files.some((f) => f.includes(catLower) && (f.includes('generated') || f.includes('state-machine') || f.includes('policy')));
    }
  },
  {
    id: 4,
    name: 'Aturan Ledger Berimbang & Property Test',
    check: () => {
      const lrFile = path.join(root, 'shared', 'ledger-rules.js');
      if (!fs.existsSync(lrFile)) return false;
      const content = fs.readFileSync(lrFile, 'utf8');
      if (!content.includes(category)) return false;

      const testDir = path.join(root, 'server', 'test', 'unit');
      const files = fs.readdirSync(testDir);
      return files.some((f) => f.includes('ledger') && f.includes(catLower));
    }
  },
  {
    id: 5,
    name: 'Provider Adapter + Fake Server + Contract Test',
    check: () => {
      const adapterFile = path.join(root, 'server', 'src', 'services', 'paypal', `${catLower}.js`);
      const contractTest = path.join(root, 'tests', 'contract', `${catLower}.contract.test.js`);
      return fs.existsSync(adapterFile) && fs.existsSync(contractTest);
    }
  },
  {
    id: 6,
    name: 'Webhook Handler + 4 Skenario Tes Wajib',
    check: () => {
      const webhookDir = path.join(root, 'server', 'src', 'jobs');
      const testDir = path.join(root, 'server', 'test', 'unit');
      if (!fs.existsSync(testDir)) return false;
      const files = fs.readdirSync(testDir);
      return files.some((f) => f.includes('webhook') && f.includes(catLower));
    }
  },
  {
    id: 7,
    name: 'Idempotensi Mutasi Teruji',
    check: () => {
      const testDir = path.join(root, 'server', 'test', 'unit');
      if (!fs.existsSync(testDir)) return false;
      const files = fs.readdirSync(testDir);
      return files.some((f) => f.includes(catLower) && f.includes('idempotenc'));
    }
  },
  {
    id: 8,
    name: 'Konkurensi & Row Locking (withTx + SELECT FOR UPDATE)',
    check: () => {
      const testDir = path.join(root, 'server', 'test', 'unit');
      if (!fs.existsSync(testDir)) return false;
      const files = fs.readdirSync(testDir);
      return files.some((f) => f.includes(catLower) && f.includes('concurrency'));
    }
  },
  {
    id: 9,
    name: 'Skema SAR v1.1 (category, sub_type, legs_summary, paypal_refs)',
    check: () => {
      const sarService = path.join(root, 'server', 'src', 'services', 'sar.js');
      const testDir = path.join(root, 'server', 'test', 'unit');
      if (!fs.existsSync(sarService) || !fs.existsSync(testDir)) return false;
      const hasSarCat = fs.readFileSync(sarService, 'utf8').includes(category);
      const files = fs.readdirSync(testDir);
      const hasSarTest = files.some((f) => f.includes('sar') && f.includes(catLower));
      return hasSarCat && hasSarTest;
    }
  },
  {
    id: 10,
    name: 'API RESTful + Validasi Zod + MCP Tool Exposure',
    check: () => {
      const routesDir = path.join(root, 'server', 'src', 'routes');
      if (!fs.existsSync(routesDir)) return false;
      const routeFiles = fs.readdirSync(routesDir);
      const hasRoute = routeFiles.some((f) => f.toLowerCase().includes(catLower));

      const mcpFile = path.join(root, 'server', 'src', 'mcp', 'tools.js');
      const hasMcp = fs.existsSync(mcpFile) && fs.readFileSync(mcpFile, 'utf8').includes(catLower);
      return hasRoute && hasMcp;
    }
  },
  {
    id: 11,
    name: 'Visualisasi State UI & Kontrol Maker/Checker',
    check: () => {
      const webPagesDir = path.join(root, 'web', 'src', 'pages');
      if (!fs.existsSync(webPagesDir)) return false;
      const pages = fs.readdirSync(webPagesDir);
      return pages.some((p) => p.toLowerCase().includes(catLower));
    }
  },
  {
    id: 12,
    name: 'Uji Serangan Adversarial AI-Eval (Minimal 2 Kasus)',
    check: () => {
      const secTestDir = path.join(root, 'server', 'test', 'security');
      if (!fs.existsSync(secTestDir)) return false;
      const files = fs.readdirSync(secTestDir);
      return files.some((f) => f.includes('ai-eval') && f.includes(catLower));
    }
  },
  {
    id: 13,
    name: 'E2E Record & Rekonsiliasi Otomatis',
    check: () => {
      const e2eDir = path.join(root, 'server', 'test', 'e2e');
      if (!fs.existsSync(e2eDir)) return false;
      const files = fs.readdirSync(e2eDir);
      return files.some((f) => f.includes(catLower));
    }
  },
  {
    id: 14,
    name: 'Dokumentasi & Traceability Lengkap (100% ID done)',
    check: () => {
      // Memeriksa dokumen spesifikasi domain di docs/spec/<category>.md
      const specFile = path.join(root, 'docs', 'spec', `${catLower}.md`);
      if (!fs.existsSync(specFile)) return false;

      // Memeriksa keberadaan entri di docs/traceability.csv
      const csvPath = path.join(root, 'docs', 'traceability.csv');
      if (!fs.existsSync(csvPath)) return false;
      const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
      const catLines = lines.filter((l) => l.toUpperCase().includes(`CAT-${category}`) || l.toUpperCase().includes(`WP-${category}`));
      if (catLines.length === 0) return false;
      return catLines.every((l) => {
        const parts = l.split(',');
        return parts.length >= 6 && parts[5].trim() === 'done';
      });
    }
  }
];

console.log(`\n================================================================`);
console.log(` Category Completeness Checklist (CCC) — Kategori: ${category}`);
console.log(`================================================================\n`);

let passedCount = 0;
for (const item of items) {
  let passed = false;
  try {
    passed = item.check();
  } catch (err) {
    passed = false;
  }
  if (passed) passedCount++;

  const mark = passed ? '\x1b[32m[✓]\x1b[0m' : '\x1b[31m[✗]\x1b[0m';
  console.log(` ${mark}  Butir ${String(item.id).padStart(2, '0')}: ${item.name}`);
}

console.log(`\n----------------------------------------------------------------`);
console.log(` Total Terpenuhi: ${passedCount} / ${items.length} butir`);
console.log(` Status: ${passedCount === items.length ? '\x1b[32mLULUS (100% LENGKAP)\x1b[0m' : '\x1b[31mBELUM LENGKAP\x1b[0m'}`);
console.log(`================================================================\n`);

if (passedCount !== items.length) {
  process.exit(1);
}
