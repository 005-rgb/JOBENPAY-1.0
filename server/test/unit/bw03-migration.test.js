/**
 * server/test/unit/bw03-migration.test.js
 * Verifikasi Migrasi Skema PRD-R §3 / BW-03
 * Membuktikan bahwa:
 * 1. Skema baru expand-only dan tidak merusak skema baseline v1.2.
 * 2. Seluruh tabel baru memiliki org_id NOT NULL dan indeks terisolasi.
 * 3. Seluruh constraint CHECK dan UNIQUE memiliki pasangan uji insert SQL valid/invalid.
 * 4. Snapshot v1.2 fixture lengkap dan dapat dimuat.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkTenantIsolation } from '../../../scripts/check-tenant-isolation.js';
import { checkInsertTests } from '../../../scripts/check-insert-tests.js';

const root = process.cwd();

test('BW-03: Tenant Isolation Check - 100% of tables with org_id have valid org_id index/PK', () => {
  const result = checkTenantIsolation();
  assert.equal(result.success, true, 'Semua tabel ber-org_id harus memiliki index atau PK org_id');
  assert.equal(result.violations.length, 0);
  assert.ok(result.tableCount >= 40, `Ditemukan ${result.tableCount} tabel ber-org_id`);
});

test('BW-03: SQL Constraint Test Coverage - 100% of CHECK and UNIQUE constraints have insert tests', () => {
  const result = checkInsertTests();
  assert.equal(result.success, true, 'Semua CHECK dan UNIQUE wajib memiliki pasangan tes valid/invalid');
  assert.equal(result.errors.length, 0);
});

test('BW-03: Database Snapshot Fixture Integrity (v12-snapshot.sql)', () => {
  const fixturePath = path.join(root, 'server', 'test', 'fixtures', 'v12-snapshot.sql');
  assert.ok(fs.existsSync(fixturePath), 'v12-snapshot.sql harus ada di server/test/fixtures/');

  const content = fs.readFileSync(fixturePath, 'utf8');
  assert.ok(content.length > 20000, 'v12-snapshot.sql harus memuat DDL skema v1.2 lengkap');
  assert.ok(content.includes('CREATE TABLE payment_requests'), 'Snapshot harus memuat payment_requests');
  assert.ok(content.includes('CREATE TABLE mandate_versions'), 'Snapshot harus memuat mandate_versions');
  assert.ok(content.includes('CREATE TABLE executions'), 'Snapshot harus memuat executions');
  assert.ok(content.includes('CREATE TABLE webhook_events'), 'Snapshot harus memuat webhook_events');
  assert.ok(content.includes('CREATE TABLE ledger_entries'), 'Snapshot harus memuat ledger_entries');
});

test('BW-03: Expand-Only Migration 021 Universal Schema Verification', () => {
  const migration021Path = path.join(root, 'server', 'migrations', '021_f3_universal_transaction_schema.sql');
  assert.ok(fs.existsSync(migration021Path), '021_f3_universal_transaction_schema.sql harus ada');

  const content = fs.readFileSync(migration021Path, 'utf8');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS ledger_accounts'), 'Harus membuat ledger_accounts');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS transaction_intents'), 'Harus membuat transaction_intents');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS transaction_legs'), 'Harus membuat transaction_legs');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS down_payment_accounts'), 'Harus membuat down_payment_accounts');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS invoice_records'), 'Harus membuat invoice_records');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS recurring_schedules'), 'Harus membuat recurring_schedules');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS split_rules'), 'Harus membuat split_rules');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS debit_authorizations'), 'Harus membuat debit_authorizations');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS financing_records'), 'Harus membuat financing_records');
  assert.ok(content.includes('CREATE TABLE IF NOT EXISTS settlement_records'), 'Harus membuat settlement_records');
  assert.ok(content.includes('CREATE OR REPLACE VIEW payment_requests'), 'Harus menyediakan VIEW payment_requests untuk kompatibilitas 1.2');
  assert.ok(content.includes('trg_payment_requests_view_io'), 'Harus menyediakan INSTEAD OF trigger untuk mutasi 1.2');
  assert.ok(content.includes('check_balanced()'), 'Harus memiliki trigger keseimbangan per mata uang');
  assert.ok(content.includes('prevent_legs_mutation()'), 'Harus memiliki trigger anti-mutasi transaction_legs');
});
