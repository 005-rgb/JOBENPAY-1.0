import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(filename));
    else if (/\.(?:js|cjs)$/.test(entry.name)) files.push(filename);
  }
  return files;
}

test('server source contains no live PayPal API hostname', async () => {
  const files = await sourceFiles(path.join(root, 'server', 'src'));
  const liveHost = /api-m\.paypal\.com/ig;
  for (const filename of files) {
    const contents = await readFile(filename, 'utf8');
    const withoutSandboxHost = contents.replace(/api-m\.sandbox\.paypal\.com/ig, '');
    assert.equal(liveHost.test(withoutSandboxHost), false, path.relative(root, filename));
    liveHost.lastIndex = 0;
  }
});
