// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('capacity model documentation suite', async (t) => {
  const modelPath = path.resolve(process.cwd(), 'docs/capacity-model.md');

  await t.test('test_capacity_model_exists', async () => {
    const stat = await fs.stat(modelPath);
    assert.ok(stat.isFile(), 'docs/capacity-model.md must exist');
    const content = await fs.readFile(modelPath, 'utf8');
    assert.ok(content.includes('# Capacity Model'));
    assert.ok(content.includes('## Per-Instance Capacity'));
    assert.ok(content.includes('## Required Instances'));
    assert.ok(content.includes('## Cost Estimate'));
  });

  await t.test('test_capacity_has_assumptions', async () => {
    const content = await fs.readFile(modelPath, 'utf8');
    assert.ok(content.includes('## Assumptions'));
    assert.ok(content.includes('tenants'));
    assert.ok(content.includes('active agents'));
    assert.ok(content.includes('transactions'));
    assert.ok(content.includes('TPS'));
  });
});
