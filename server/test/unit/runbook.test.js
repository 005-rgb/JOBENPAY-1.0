// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_RUNBOOKS = [
  '01-database-down.md',
  '02-paypal-unavailable.md',
  '03-llm-timeout.md',
  '04-worker-stuck.md',
  '05-ledger-verification-failed.md',
  '06-double-payout-detected.md',
  '07-high-error-rate.md',
  '08-high-latency.md',
  '09-circuit-breaker-open.md',
  '10-webhook-processing-delayed.md',
];

const REQUIRED_SECTIONS = [
  '## Symptom',
  '## Impact',
  '## Diagnosis',
  '## Resolution',
  '## Escalation',
  '## Post-Incident',
];

const RUNBOOK_DIR = path.resolve(process.cwd(), 'docs/runbook');

test('runbook documentation suite', async (t) => {
  await t.test('test_runbook_all_exist', async () => {
    const readmePath = path.join(RUNBOOK_DIR, 'README.md');
    const readmeStat = await fs.stat(readmePath);
    assert.ok(readmeStat.isFile(), 'README.md must exist in docs/runbook/');

    for (const filename of EXPECTED_RUNBOOKS) {
      const fullPath = path.join(RUNBOOK_DIR, filename);
      const stat = await fs.stat(fullPath);
      assert.ok(stat.isFile(), `Runbook ${filename} must exist`);
    }
  });

  await t.test('test_runbook_has_sections', async () => {
    for (const filename of EXPECTED_RUNBOOKS) {
      const fullPath = path.join(RUNBOOK_DIR, filename);
      const content = await fs.readFile(fullPath, 'utf8');
      for (const section of REQUIRED_SECTIONS) {
        assert.ok(
          content.includes(section),
          `Runbook ${filename} must contain section "${section}"`,
        );
      }
    }
  });
});
