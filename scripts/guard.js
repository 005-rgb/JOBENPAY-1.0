import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];

const check = (condition, message) => {
  if (!condition) {
    errors.push(message);
  }
};

const fileExists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

check(Number(process.versions.node.split('.')[0]) === 22, 'Node.js must be major version 22.');
check(fileExists('LICENSE'), 'LICENSE is required.');
check(fileExists('README.md'), 'README.md is required.');
check(fileExists('.nvmrc'), '.nvmrc is required.');
check(fileExists('.env.example'), '.env.example is required.');
check(fileExists('app.cjs'), 'app.cjs is required.');
check(fileExists('server/src/server.js'), 'server/src/server.js is required.');
check(fileExists('server/src/config.js'), 'server/src/config.js is required.');
check(fileExists('.github/workflows/ci.yml'), '.github/workflows/ci.yml is required.');

const licenseText = fileExists('LICENSE') ? readText('LICENSE') : '';
check(/MIT License/i.test(licenseText), 'LICENSE must be MIT.');

const readmeText = readText('README.md');
check(/## Overview/i.test(readmeText), 'README.md must contain Overview section.');
check(/## Quick start/i.test(readmeText), 'README.md must contain Quick start section.');
check(/## Architecture/i.test(readmeText), 'README.md must contain Architecture section.');

const packageJson = JSON.parse(readText('package.json'));
check(packageJson.type === 'module', 'package.json must use type: module');
check(packageJson.license === 'MIT', 'package.json license must be MIT');
check(packageJson.engines.node === '>=22.13 <23', 'package.json engines.node must be >=22.13 <23');

const repoFiles = [];
function walk(currentPath) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walk(fullPath);
      continue;
    }
    repoFiles.push(path.relative(root, fullPath));
  }
}
walk(root);

check(!repoFiles.some((file) => /\.ts$|\.tsx$/i.test(file)), 'TypeScript files are not allowed in S00.');

if (fileExists('web/package.json')) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const cssLint = spawnSync(npm, ['--prefix', 'web', 'run', 'lint:css'], {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (cssLint.error) {
    errors.push(`CSS lint could not run: ${cssLint.error.message}`);
  } else if (cssLint.status !== 0) {
    errors.push(`CSS lint failed.\n${cssLint.stdout || ''}${cssLint.stderr || ''}`);
  }
}

const nativeCandidates = ['node-gyp', 'sqlite3', 'better-sqlite3', 'sharp', 'bcrypt', 'argon2', 'node-addon-api', 'binding'];
const dependencyNames = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
const hasNativeDependency = dependencyNames.some((name) => nativeCandidates.includes(name));
check(!hasNativeDependency, 'Native dependencies are not allowed in S00.');

const scanPaths = repoFiles.filter((file) => !file.startsWith('.git') && !file.startsWith('node_modules') && !file.includes('package-lock.json'));
for (const file of scanPaths) {
  if (!file.endsWith('.md') && !file.endsWith('.js') && !file.endsWith('.cjs') && !file.endsWith('.json') && !file.endsWith('.yml') && !file.endsWith('.yaml') && !file.endsWith('.env') && !file.endsWith('.example')) {
    continue;
  }
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) continue;
  const content = fs.readFileSync(absolute, 'utf8');
  const withoutSandboxHost = content.replace(/api-m\.sandbox\.paypal\.com/ig, '');
  if (/api-m\.paypal\.com/i.test(withoutSandboxHost)) {
    errors.push(`Live PayPal host found in ${file}. Use sandbox URL only.`);
  }
}

if (fileExists('web/index.html')) {
  const indexHtml = readText('web/index.html');
  check(!/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(indexHtml), 'web/index.html must not contain inline scripts.');
  check(!/<style\b/i.test(indexHtml), 'web/index.html must not contain inline styles.');
}

const allowedPaypalPhrases = [
  'Connect PayPal Sandbox',
  'PayPal Sandbox',
  'not a PayPal product',
  'Connected to PayPal Sandbox only',
  'PayPal account',
];
for (const file of repoFiles.filter((name) => name.startsWith('web/src/'))) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  const remaining = allowedPaypalPhrases.reduce((result, phrase) => result.replaceAll(phrase, ''), content);
  if (/\bPayPal\b/.test(remaining)) {
    errors.push(`Unexpected PayPal branding in ${file}. Use factual allowlisted references only.`);
  }
}

if (fileExists('web/dist')) {
  const builtFiles = repoFiles.filter((file) => file.startsWith('web/dist/'));
  for (const file of builtFiles) {
    if (fs.readFileSync(path.join(root, file), 'utf8').includes('__parity')) {
      errors.push(`Development parity route leaked into production output: ${file}.`);
    }
  }
}

if (errors.length > 0) {
  console.error('Guard failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Guard passed.');
