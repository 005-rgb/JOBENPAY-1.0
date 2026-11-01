import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'coverage', 'node_modules', 'dist', 'var']);
const scannedExtensions = new Set(['.cjs', '.example', '.js', '.json', '.md', '.sh', '.yml', '.yaml']);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await collect(filename));
    } else if (entry.isFile()
      && scannedExtensions.has(path.extname(entry.name).toLowerCase())
      && entry.name !== '.env'
      && !(entry.name.startsWith('.env.') && entry.name !== '.env.example')) {
      files.push(filename);
    }
  }
  return files;
}

const findings = [];
for (const filename of await collect(root)) {
  const content = await readFile(filename, 'utf8');
  if (patterns.some((pattern) => pattern.test(content))) {
    findings.push(path.relative(root, filename));
  }
}
if (findings.length) {
  console.error(`Potential committed credentials found in:\n${findings.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Secret scan passed.');
}
