/**
 * scripts/guard-characterization.js
 * CI Guard: Memeriksa integritas dan freeze status folder test/characterization/.
 * Aturan BW-00:
 * - test/characterization/ wajib memiliki minimal 25 skenario golden behavioral.
 * - File golden tidak boleh dimodifikasi tanpa label eksplisit 'test-changed'.
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

export function guardCharacterization(charDir = path.join(root, 'test', 'characterization')) {
  const violations = [];

  if (!fs.existsSync(charDir)) {
    return {
      success: false,
      testCount: 0,
      violations: [{ error: `Directory ${charDir} does not exist.` }],
    };
  }

  const files = fs.readdirSync(charDir).filter((f) => f.endsWith('.test.js'));
  if (files.length === 0) {
    return {
      success: false,
      testCount: 0,
      violations: [{ error: 'No test files found in test/characterization/' }],
    };
  }

  let totalGoldenTests = 0;

  for (const file of files) {
    const fullPath = path.join(charDir, file);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Count test('GOLDEN ...') or test(...)
    const matches = content.match(/test\s*\(\s*['"`](?:GOLDEN\s+)?([^'"`]+)['"`]/g);
    const count = matches ? matches.length : 0;
    totalGoldenTests += count;

    // Check if the file is marked frozen or has test-changed label
    const isFrozen = /FROZEN|@frozen/i.test(content);
    const isExplicitlyChanged = /test-changed/i.test(content);

    if (!isFrozen && !isExplicitlyChanged) {
      violations.push({
        file,
        error: `File ${file} is not marked FROZEN and lacks 'test-changed' label.`,
      });
    }
  }

  if (totalGoldenTests < 25) {
    violations.push({
      error: `Expected at least 25 golden tests in test/characterization/, found ${totalGoldenTests}.`,
    });
  }

  return {
    success: violations.length === 0,
    testCount: totalGoldenTests,
    violations,
  };
}

if (process.argv[1] && process.argv[1].endsWith('guard-characterization.js')) {
  const result = guardCharacterization();
  console.log(`[CI Guard] Checked test/characterization/: ${result.testCount} golden tests found.`);
  if (!result.success) {
    console.error(`[CI Guard FAIL] Found ${result.violations.length} characterization guard violations:`);
    for (const v of result.violations) {
      console.error(` - ${v.file ? `[${v.file}] ` : ''}${v.error}`);
    }
    process.exit(1);
  }
  console.log('[CI Guard PASS] test/characterization/ is properly frozen with >= 25 goldens.');
}
