import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'coverage', 'node_modules', 'dist']);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await collect(path.join(directory, entry.name)));
    } else if (/\.(?:js|cjs)$/.test(entry.name)) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

const failures = [];
for (const filename of await collect(root)) {
  const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(result.stderr.trim() || `${path.relative(root, filename)} failed syntax check`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('JavaScript syntax checks passed.');
}
