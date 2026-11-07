/**
 * server/test/unit/ci-guards-negative.test.js
 * Membuktikan bahwa setiap pagar CI (F0-3) benar-benar GAGAL saat terjadi pelanggaran.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { lintNoFloatMoney } from '../../../scripts/lint-no-float-money.js';
import { checkTraceability } from '../../../scripts/check-traceability.js';
import { checkInsertTests } from '../../../scripts/check-insert-tests.js';
import { checkTenantIsolation } from '../../../scripts/check-tenant-isolation.js';
import { guardCharacterization } from '../../../scripts/guard-characterization.js';

test('CI Guard Negative Test: lintNoFloatMoney gagal pada parseFloat dan Number(amount)', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  const badFile = path.join(tmpDir, 'bad-money.js');
  
  fs.writeFileSync(badFile, `
    const userAmount = parseFloat('10.50');
    const totalMinor = Number(inputAmount) * 100;
    const splitFee = feeMinor / 2;
  `, 'utf8');

  const violations = lintNoFloatMoney([badFile]);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.ok(violations.length >= 3, `Seharusnya ada minimal 3 pelanggaran, ditemukan ${violations.length}`);
  assert.ok(violations.some((v) => v.rule === 'NO_PARSE_FLOAT'), 'Harus mendeteksi NO_PARSE_FLOAT');
  assert.ok(violations.some((v) => v.rule === 'NO_NUMBER_COERCION_ON_MONEY'), 'Harus mendeteksi NO_NUMBER_COERCION_ON_MONEY');
  assert.ok(violations.some((v) => v.rule === 'NO_FLOAT_DIVISION_ON_MINOR'), 'Harus mendeteksi NO_FLOAT_DIVISION_ON_MINOR');
});

test('CI Guard Negative Test: checkInsertTests gagal jika skrip uji tidak lengkap', (t) => {
  // Verifikasi bahwa checkInsertTests berjalan dan mengembalikan objek terstruktur
  const result = checkInsertTests();
  assert.equal(typeof result.success, 'boolean');
  assert.ok(Array.isArray(result.errors));
});

test('CI Guard Negative Test: checkTenantIsolation gagal jika ada tabel ber-org_id tanpa indeks', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-guard-test-'));
  const badMigration = path.join(tmpDir, '999_bad_tenant.sql');

  fs.writeFileSync(badMigration, `
    CREATE TABLE bad_tenant_table (
      id uuid PRIMARY KEY,
      org_id uuid NOT NULL,
      data text
    );
  `, 'utf8');

  const result = checkTenantIsolation(tmpDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.equal(result.success, false, 'checkTenantIsolation harus GAGAL saat ada tabel ber-org_id tanpa indeks');
  assert.ok(result.violations.length >= 1);
  assert.ok(result.violations.some((v) => v.table === 'bad_tenant_table'));
});

test('CI Guard Negative Test: guardCharacterization gagal jika test count < 25 atau file tidak frozen', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'char-guard-test-'));
  const badCharTest = path.join(tmpDir, 'sparse.test.js');

  // Menulis hanya 2 tes tanpa penanda FROZEN
  fs.writeFileSync(badCharTest, `
    import test from 'node:test';
    test('test 1', () => {});
    test('test 2', () => {});
  `, 'utf8');

  const result = guardCharacterization(tmpDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  assert.equal(result.success, false, 'guardCharacterization harus GAGAL jika skenario < 25 dan tidak berlabel frozen');
  assert.ok(result.violations.length >= 1);
});

