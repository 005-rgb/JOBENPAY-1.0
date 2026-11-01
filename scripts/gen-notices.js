import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD']);
const projects = [
  { name: 'Server', directory: root, lockfile: 'package-lock.json' },
  { name: 'Web', directory: path.join(root, 'web'), lockfile: 'web/package-lock.json' },
];

function packageLicense(project, lockPath, lockPackage) {
  const packageDirectory = path.join(project.directory, lockPath);
  const manifestPath = path.join(packageDirectory, 'package.json');
  let manifest = {};
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    if (lockPackage.license) return String(lockPackage.license);
    throw new Error(`Missing installed package metadata for ${project.name} dependency ${lockPath}.`);
  }
  const declared = lockPackage.license
    || manifest.license
    || manifest.licenses?.map((license) => license.type).filter(Boolean).join(' OR ');
  if (declared) return typeof declared === 'string' ? declared : declared.type;

  const licenseFile = fs.readdirSync(packageDirectory)
    .find((name) => /^licen[cs]e(?:\.|$)/i.test(name));
  if (licenseFile) {
    const text = fs.readFileSync(path.join(packageDirectory, licenseFile), 'utf8');
    if (/Apache License\s*,?\s*Version 2\.0/i.test(text)) return 'Apache-2.0';
    if (/BSD 2-Clause/i.test(text)) return 'BSD-2-Clause';
    if (/BSD 3-Clause/i.test(text)) return 'BSD-3-Clause';
    if (/Zero-Clause BSD/i.test(text)) return '0BSD';
    if (/ISC License/i.test(text)) return 'ISC';
    if (/MIT License/i.test(text)) return 'MIT';
    if (/Redistribution and use in source and binary forms/i.test(text)
      && !/endorse or promote products/i.test(text)) return 'BSD-2-Clause';
  }
  throw new Error(`Could not determine an allowlisted license for ${project.name} dependency ${manifest.name || lockPath}@${manifest.version || lockPackage.version}.`);
}

function licenseIds(expression) {
  return String(expression)
    .replace(/\([^)]*\)/g, (group) => group.slice(1, -1))
    .split(/\s+(?:OR|AND)\s+|[|&]/i)
    .map((license) => license.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function collectDependencies() {
  const rows = [];
  for (const project of projects) {
    const lock = JSON.parse(fs.readFileSync(path.join(root, project.lockfile), 'utf8'));
    for (const [lockPath, pkg] of Object.entries(lock.packages || {})) {
      if (!lockPath.startsWith('node_modules/') || !pkg.version || pkg.link) continue;
      const license = packageLicense(project, lockPath, pkg);
      const ids = licenseIds(license);
      if (!ids.length || ids.some((id) => !allowed.has(id))) {
        throw new Error(`Disallowed license for ${project.name} dependency ${lockPath}: ${license}`);
      }
      const name = lockPath.slice('node_modules/'.length);
      rows.push({ project: project.name, name, version: pkg.version, license });
    }
  }
  return rows.sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name));
}

function render(rows) {
  const lines = [
    '# Third-party notices',
    '',
    'Generated from the complete server and web npm lockfiles by `npm run notices:generate`.',
    'Only dependencies with licenses in the repository allowlist are included.',
    '',
  ];
  for (const project of ['Server', 'Web']) {
    lines.push(`## ${project} dependency tree`, '');
    for (const row of rows.filter((entry) => entry.project === project)) {
      lines.push(`- \`${row.name}\` ${row.version} — ${row.license}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

const outputPath = path.join(root, 'THIRD_PARTY_NOTICES.md');
const expected = render(collectDependencies());
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== expected) {
    console.error('THIRD_PARTY_NOTICES.md is stale; run npm run notices:generate.');
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(outputPath, expected);
}
