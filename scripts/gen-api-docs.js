/**
 * scripts/gen-api-docs.js
 * Generates docs/API_REFERENCE.md dynamically from Zod schemas in shared/
 * PRD 1.3 §5, §10, Work Packet F9-3
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  TRANSACTION_CATEGORIES,
  CATEGORY_SUBTYPES,
  CATEGORY_PROVIDERS,
  createTransactionSchema,
} from '../shared/transaction.js';
import { policySchema } from '../shared/policy.schema.js';
import { bulkProposalSchema, bulkItemSchema } from '../shared/bulk.js';
import { financingProposalSchema } from '../shared/financing.js';
import { debitProposalSchema, debitAuthorizationSchema } from '../shared/debit.js';
import { downPaymentProposalSchema } from '../shared/down_payment.js';

function describeZodType(schema) {
  if (!schema || !schema._def) return 'any';
  const def = schema._def;
  const type = (def.type || def.typeName || '').replace(/^Zod/, '').toLowerCase();

  switch (type) {
    case 'string':
      if (def.checks) {
        const regexCheck = def.checks.find((c) => c.kind === 'regex' || c.type === 'regex');
        if (regexCheck) return `string (regex: \`${regexCheck.regex?.source || regexCheck.pattern?.source || 'pattern'}\`)`;
        const minCheck = def.checks.find((c) => c.kind === 'min' || c.type === 'min');
        const maxCheck = def.checks.find((c) => c.kind === 'max' || c.type === 'max');
        if (minCheck && maxCheck) return `string (length: ${minCheck.value}-${maxCheck.value})`;
        if (minCheck) return `string (min: ${minCheck.value})`;
      }
      return 'string';
    case 'number': {
      const isInt = def.checks?.some((c) => c.kind === 'int' || c.type === 'int');
      const minCheck = def.checks?.find((c) => c.kind === 'min' || c.type === 'min');
      const maxCheck = def.checks?.find((c) => c.kind === 'max' || c.type === 'max');
      let res = isInt ? 'integer' : 'number';
      if (minCheck && maxCheck) res += ` (${minCheck.value}..${maxCheck.value})`;
      else if (minCheck) res += ` (>= ${minCheck.value})`;
      return res;
    }
    case 'bigint':
      return 'bigint (minor currency unit)';
    case 'boolean':
      return 'boolean';
    case 'enum': {
      const vals = schema.options || (Array.isArray(def.values) ? def.values : Object.keys(def.entries || {}));
      return `enum [${vals.map((v) => `\`"${v}"\``).join(', ')}]`;
    }
    case 'union':
      return (def.options || []).map(describeZodType).join(' | ');
    case 'array':
      return `array<${describeZodType(def.type || def.element)}>`;
    case 'optional':
      return `${describeZodType(def.innerType || def.schema)} (optional)`;
    case 'default':
      return `${describeZodType(def.innerType || def.schema)} (default: \`${JSON.stringify(typeof def.defaultValue === 'function' ? def.defaultValue() : def.defaultValue)}\`)`;
    case 'record':
      return `record<string, ${describeZodType(def.valueType || def.element)}>`;
    case 'literal':
      return `literal \`${JSON.stringify(def.value)}\``;
    case 'object':
      return 'object';
    default:
      return type || 'any';
  }
}

function parseObjectFields(zodObject) {
  if (!zodObject) return [];
  let shape = {};
  if (typeof zodObject.shape === 'function') {
    shape = zodObject.shape();
  } else if (zodObject.shape && typeof zodObject.shape === 'object') {
    shape = zodObject.shape;
  } else if (zodObject._def?.shape) {
    shape = typeof zodObject._def.shape === 'function' ? zodObject._def.shape() : zodObject._def.shape;
  } else if (zodObject._def?.schema) {
    return parseObjectFields(zodObject._def.schema);
  }

  const fields = [];
  for (const [key, fieldDef] of Object.entries(shape)) {
    const fieldType = (fieldDef._def?.type || fieldDef._def?.typeName || '').toLowerCase();
    const isOptional = fieldType.includes('optional') || fieldType.includes('default');
    fields.push({
      field: key,
      type: describeZodType(fieldDef),
      required: isOptional ? 'No' : 'Yes',
      description: fieldDef.description || '-',
    });
  }
  return fields;
}

function renderTable(fields) {
  let md = '| Parameter | Tipe | Wajib | Keterangan |\n';
  md += '|---|---|---|---|\n';
  for (const f of fields) {
    md += `| \`${f.field}\` | ${f.type} | ${f.required} | ${f.description} |\n`;
  }
  return md;
}

export function generateApiDocs() {
  const lines = [];

  lines.push('# JOBENPAY Universal Transaction Engine — Referensi API (Otomatis dari Skema Zod)');
  lines.push('');
  lines.push('> Dokumen ini dibangkitkan secara deterministik dari skema validasi Zod di `shared/`.');
  lines.push('> Kepatuhan: PRD 1.3 §5, §10, dan Work Packet F9-3. Dilarang mengubah dokumen ini secara manual.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Daftar 15 Kategori & 28 Pasangan Kategori/Sub-tipe');
  lines.push('');
  lines.push('| No | Kategori | Sub-tipe | Mode Provider | Arah Uang | Mengonsumsi Anggaran |');
  lines.push('|---|---|---|---|---|---|');

  let pairIndex = 1;
  for (const cat of TRANSACTION_CATEGORIES) {
    const subtypes = CATEGORY_SUBTYPES[cat] || [];
    const provider = CATEGORY_PROVIDERS[cat] || 'SANDBOX';
    for (const sub of subtypes) {
      let direction = 'OUT';
      let consumes = 'YA';
      if (['SALE', 'INVOICE'].includes(cat)) {
        direction = 'IN';
        consumes = 'TIDAK';
      } else if (cat === 'DOWN_PAYMENT') {
        direction = sub === 'forfeit' ? 'INTERNAL' : 'IN';
        consumes = 'TIDAK';
      } else if (cat === 'VOID') {
        direction = 'INTERNAL';
        consumes = 'TIDAK (melepas reservasi)';
      } else if (cat === 'REFUND') {
        direction = 'OUT (pengembalian)';
        consumes = 'TIDAK';
      } else if (cat === 'SPLIT') {
        direction = sub === 'collect' ? 'IN' : 'OUT';
        consumes = sub === 'collect' ? 'TIDAK' : 'YA';
      } else if (cat === 'FINANCING') {
        direction = sub === 'po' ? 'OUT' : 'OUT';
        consumes = 'YA (limit fasilitas)';
      } else if (cat === 'DEBIT') {
        direction = 'IN';
        consumes = 'TIDAK';
      }
      lines.push(`| ${pairIndex++} | **${cat}** | \`${sub}\` | \`${provider}\` | ${direction} | ${consumes} |`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. Universal Transaction Endpoint: `POST /api/v1/transactions`');
  lines.push('');
  lines.push('Semua 15 kategori dapat dibuat melalui satu endpoint terpadu yang aman.');
  lines.push('');
  lines.push('### Headers Wajib');
  lines.push('- `Idempotency-Key: <UUID>` (Wajib untuk semua mutasi uang, unik per organisasi).');
  lines.push('- `Authorization: Bearer <AGENT_API_KEY>` atau Cookie Sesi Browser Aktif.');
  lines.push('- `Content-Type: application/json`');
  lines.push('');
  lines.push('### Skema Parameter (`createTransactionSchema`)');
  lines.push('');
  lines.push(renderTable(parseObjectFields(createTransactionSchema)));
  lines.push('');
  lines.push('### Contoh Permintaan Universal (cURL)');
  lines.push('```bash');
  lines.push('curl -X POST https://api.jobenpay.cloud/api/v1/transactions \\');
  lines.push('  -H "Authorization: Bearer jp_live_..." \\');
  lines.push('  -H "Idempotency-Key: a4c8d327-89e4-411a-bc0d-7db0714b9c10" \\');
  lines.push('  -H "Content-Type: application/json" \\');
  lines.push('  -d \'{');
  lines.push('    "category": "PAYOUT",');
  lines.push('    "subType": "standard",');
  lines.push('    "amountMinor": "15000",');
  lines.push('    "currency": "USD",');
  lines.push('    "counterpartyId": "0e90c885-3cf7-4a07-8e68-ffaeef121bb7",');
  lines.push('    "agentReason": "Monthly supplier disbursement"');
  lines.push('  }\'');
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. Skema Parameter Spesifik Kategori');
  lines.push('');

  lines.push('### 3.1 BULK (`shared/bulk.js`)');
  lines.push('Digunakan untuk batch payout hingga 15.000 penerima dengan chunking otomatis 500 item.');
  lines.push('');
  lines.push('#### Proposal (`bulkProposalSchema`)');
  lines.push(renderTable(parseObjectFields(bulkProposalSchema)));
  lines.push('');
  lines.push('#### Item Skema (`bulkItemSchema`)');
  lines.push(renderTable(parseObjectFields(bulkItemSchema)));
  lines.push('');

  lines.push('### 3.2 FINANCING (`shared/financing.js`) — [SIMULATED]');
  lines.push('Fasilitas supply chain financing (Purchase Order & Invoice financing) dengan underwriting otomatis.');
  lines.push('');
  lines.push(renderTable(parseObjectFields(financingProposalSchema)));
  lines.push('');

  lines.push('### 3.3 DEBIT (`shared/debit.js`) — [SIMULATED]');
  lines.push('Penarikan debit langsung terotorisasi.');
  lines.push('');
  lines.push('#### Penarikan Debit (`debitProposalSchema`)');
  lines.push(renderTable(parseObjectFields(debitProposalSchema)));
  lines.push('');
  lines.push('#### Otorisasi Mandat Debit (`debitAuthorizationSchema`)');
  lines.push(renderTable(parseObjectFields(debitAuthorizationSchema)));
  lines.push('');

  lines.push('### 3.4 DOWN_PAYMENT (`shared/down_payment.js`)');
  lines.push('Uang muka bertahap (initial capture -> settlement capture / forfeit void).');
  lines.push('');
  lines.push(renderTable(parseObjectFields(downPaymentProposalSchema)));
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## 4. Skema Mandat Kebijakan (`shared/policy.schema.js`)');
  lines.push('Mandat immutable versioning untuk pembatasan wewenang AI dan agen.');
  lines.push('');
  lines.push(renderTable(parseObjectFields(policySchema)));
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## 5. Respon & Penanganan Error');
  lines.push('');
  lines.push('| Kode HTTP | Error Code | Deskripsi |');
  lines.push('|---|---|---|');
  lines.push('| 400 | `VALIDATION_ERROR` | Format body JSON tidak sesuai skema Zod |');
  lines.push('| 401 | `UNAUTHORIZED` | API key tidak valid atau sesi login berakhir |');
  lines.push('| 403 | `FORBIDDEN` | Akses peran (RBAC) tidak memadai atau tenant terisolasi |');
  lines.push('| 404 | `NOT_FOUND` | Sumber daya tidak ditemukan |');
  lines.push('| 409 | `ILLEGAL_TRANSITION` | Mutasi melanggar aturan state machine kategori |');
  lines.push('| 422 | `IDEMPOTENCY_KEY_REUSED` | Idempotency-Key sama digunakan dengan payload berbeda |');
  lines.push('| 422 | `INSUFFICIENT_BUDGET` | Anggaran bulanan organisasi tidak mencukupi |');
  lines.push('| 422 | `CAP_EXCEEDED` | Jumlah transaksi melebihi batas mandat per transaksi |');
  lines.push('| 429 | `RATE_LIMITED` | Batas kecepatan request terlampaui |');
  lines.push('| 500 | `INTERNAL` | Kesalahan internal server (detail SQL/stack disamarkan) |');
  lines.push('');

  return lines.join('\n');
}

if (process.argv[1]?.endsWith('gen-api-docs.js')) {
  const docs = generateApiDocs();
  const targetPath = path.join(process.cwd(), 'docs', 'API_REFERENCE.md');
  fs.writeFileSync(targetPath, docs, 'utf8');
  console.log(`Berhasil membangkitkan dokumentasi API: ${targetPath}`);
}
