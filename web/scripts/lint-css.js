import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(filename));
    else if (entry.isFile() && entry.name.endsWith('.css')) files.push(filename);
  }
  return files;
}

for (const filename of await collect(sourceRoot)) {
  postcss.parse(await readFile(filename, 'utf8'), { from: filename });
}
console.log('CSS syntax lint passed.');
