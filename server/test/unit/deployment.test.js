// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('deployment and operational readiness suite', async (t) => {
  await t.test('test_rollback_plan_exists', async () => {
    const rollbackPath = path.resolve(process.cwd(), 'docs/runbook/rollback.md');
    const stat = await fs.stat(rollbackPath);
    assert.ok(stat.isFile(), 'docs/runbook/rollback.md must exist');

    const content = await fs.readFile(rollbackPath, 'utf8');
    assert.ok(content.includes('# Rollback Plan'));
    assert.ok(content.includes('## Prerequisites'));
    assert.ok(content.includes('## Procedure'));
    assert.ok(content.includes('## Testing'));
    assert.ok(content.includes('git checkout'));
  });

  await t.test('test_canary_procedure_exists', async () => {
    const canaryPath = path.resolve(process.cwd(), 'docs/runbook/canary.md');
    const stat = await fs.stat(canaryPath);
    assert.ok(stat.isFile(), 'docs/runbook/canary.md must exist');

    const content = await fs.readFile(canaryPath, 'utf8');
    assert.ok(content.includes('# Canary Release Procedure'));
    assert.ok(content.includes('## When to Use'));
    assert.ok(content.includes('## Procedure'));
    assert.ok(content.includes('## Rollback'));
    assert.ok(content.includes('CANARY_TENANT_IDS'));
  });
});
