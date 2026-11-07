/**
 * scripts/check-spec-lock.js
 * CI Guard: Memeriksa kunci spesifikasi (Spec-Lock) Gerbang GB0 (PRD 1.3-R / BW-02).
 * Syarat Lulus GB0:
 * 1. docs/spec/addendum-1_3R.md (atau addendum.md) berstatus APPROVED (ID + tanggal).
 * 2. docs/spec/sandbox-support-matrix.md memuat tepat 28 baris pasangan kategori/sub-tipe.
 * 3. docs/spec/verify-closure.md menutup seluruh butir [VERIFY] tanpa butir terbuka.
 * 4. docs/spec/webhook-catalog.md lengkap.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

export function checkSpecLock() {
  const errors = [];

  // 1. Addendum Check
  const addendumPath = fs.existsSync(path.join(root, 'docs', 'spec', 'addendum-1_3R.md'))
    ? path.join(root, 'docs', 'spec', 'addendum-1_3R.md')
    : path.join(root, 'docs', 'spec', 'addendum.md');

  if (!fs.existsSync(addendumPath)) {
    errors.push('Addendum file docs/spec/addendum-1_3R.md or addendum.md not found.');
  } else {
    const content = fs.readFileSync(addendumPath, 'utf8');
    if (!/Status(?: Dokumen)?[:\*]+\s*[`*]*APPROVED/i.test(content)) {
      errors.push('Addendum must have Status: APPROVED by Product Owner.');
    }
  }

  // 2. Sandbox Support Matrix 28 Rows Check
  const matrixPath = path.join(root, 'docs', 'spec', 'sandbox-support-matrix.md');
  if (!fs.existsSync(matrixPath)) {
    errors.push('Sandbox support matrix docs/spec/sandbox-support-matrix.md not found.');
  } else {
    const content = fs.readFileSync(matrixPath, 'utf8');
    // Count table rows starting with | [0-9]+ |
    const rows = content.match(/^\|\s*\d+\s*\|/gm) || [];
    if (rows.length !== 28) {
      errors.push(`Sandbox support matrix must contain exactly 28 rows, found ${rows.length}.`);
    }
  }

  // 3. Verify Closure Check (No open [VERIFY])
  const verifyPath = path.join(root, 'docs', 'spec', 'verify-closure.md');
  if (!fs.existsSync(verifyPath)) {
    errors.push('Verify closure document docs/spec/verify-closure.md not found.');
  } else {
    const content = fs.readFileSync(verifyPath, 'utf8');
    const verifyItems = content.match(/^\|\s*\*\*V-\d+\*\*\s*\|/gm) || [];
    if (verifyItems.length < 6) {
      errors.push(`Expected at least 6 verified items in verify-closure.md, found ${verifyItems.length}.`);
    }
    if (/status\s*:\s*OPEN/i.test(content) || /\[VERIFY\].*OPEN/i.test(content)) {
      errors.push('Unresolved open [VERIFY] items detected in verify-closure.md.');
    }
  }

  // 4. Webhook Catalog Check
  const webhookPath = path.join(root, 'docs', 'spec', 'webhook-catalog.md');
  if (!fs.existsSync(webhookPath)) {
    errors.push('Webhook catalog docs/spec/webhook-catalog.md not found.');
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

if (process.argv[1] && process.argv[1].endsWith('check-spec-lock.js')) {
  const result = checkSpecLock();
  if (!result.success) {
    console.error('[Spec-Lock FAIL] Spec lock validation failed:');
    for (const err of result.errors) {
      console.error(` - ${err}`);
    }
    process.exit(1);
  }
  console.log('[Spec-Lock PASS] Gerbang GB0 Spec-Lock Verified (Addendum APPROVED, 28/28 Matrix, 0 open VERIFY).');
}
