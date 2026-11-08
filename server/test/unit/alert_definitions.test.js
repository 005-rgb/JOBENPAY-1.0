// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ALERT_DEFINITIONS } from '../../src/../../shared/alert-definitions.js';

test('alert definitions suite', async (t) => {
  await t.test('test_alert_has_runbook', async () => {
    assert.equal(ALERT_DEFINITIONS.length, 4);

    for (const alert of ALERT_DEFINITIONS) {
      assert.ok(alert.id, 'Alert must have id');
      assert.ok(alert.name, 'Alert must have name');
      assert.ok(alert.runbook, `Alert ${alert.id} must define a runbook`);

      // Verify the runbook file actually exists on disk
      const runbookPath = path.resolve(process.cwd(), alert.runbook);
      const stat = await fs.stat(runbookPath);
      assert.ok(stat.isFile(), `Runbook file ${alert.runbook} must exist on disk`);
    }
  });

  await t.test('test_alert_has_severity', () => {
    const validSeverities = new Set(['critical', 'high', 'medium', 'low']);

    for (const alert of ALERT_DEFINITIONS) {
      assert.ok(alert.severity, `Alert ${alert.id} must have severity`);
      assert.ok(
        validSeverities.has(alert.severity),
        `Alert ${alert.id} has invalid severity: ${alert.severity}`,
      );
      assert.ok(Array.isArray(alert.notify), `Alert ${alert.id} must define notify channels`);
      assert.ok(alert.notify.length > 0, `Alert ${alert.id} notify channels cannot be empty`);
    }
  });
});
