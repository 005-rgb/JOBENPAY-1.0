import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const results = [];
const allowedLicenses = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Python-2.0',
  'Unlicense',
]);
const livePaypalHosts = [
  ['api-m', 'paypal.com'].join('.'),
  ['api', 'paypal.com'].join('.'),
  ['www', 'paypal.com/v1'].join('.'),
  ['paypal.com', 'webapps'].join('/'),
];
const expectedErrorCodes = [
  'ORG_FROZEN', 'AGENT_DISABLED', 'MANDATE_INACTIVE', 'MANDATE_EXPIRED', 'ACTION_NOT_ALLOWED',
  'CURRENCY_NOT_ALLOWED', 'CAP_EXCEEDED', 'PAYEE_BLOCKED', 'TARGET_INVALID', 'PREFLIGHT_UNAVAILABLE',
  'OUTSIDE_TIME_WINDOW', 'VELOCITY_EXCEEDED', 'DUPLICATE_SUSPECTED', 'INVOICE_REQUIRED',
  'INVOICE_MISMATCH_AMOUNT', 'BUDGET_EXCEEDED', 'PAYEE_NEW', 'PAYEE_CHANGED',
  'INVOICE_PAYEE_MISMATCH', 'AMOUNT_REQUIRES_APPROVAL', 'DOC_INJECTION_SUSPECTED', 'AI_HIGH_RISK',
  'AI_INTENT_MISMATCH', 'AI_INJECTION_SUSPECTED', 'AI_ANOMALY', 'AI_UNAVAILABLE',
  'PAYEE_NOT_ALLOWED', 'UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION_FAILED', 'NOT_FOUND',
  'RATE_LIMITED', 'IDEMPOTENCY_CONFLICT', 'STEP_UP_REQUIRED', 'REGISTRATION_DISABLED', 'INTERNAL',
];
const requiredScripts = [
  'dev', 'start', 'migrate', 'seed', 'setup', 'test', 'test:unit', 'lint', 'guard',
  'keys:gen', 'verify-ledger',
];

function record(id, passed, detail) {
  results.push(`${id}\t${passed ? 'PASS' : 'FAIL'}\t${String(detail).replace(/[\r\n\t]+/g, ' ')}`);
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativePath, predicate = () => true, output = []) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) return output;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) continue;
      walk(child, predicate, output);
    } else if (predicate(child)) {
      output.push(child);
    }
  }
  return output;
}

function packageTree(packageRoot) {
  const packages = [];
  if (!fs.existsSync(packageRoot)) return packages;
  const pending = [packageRoot];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = path.join(directory, entry.name);
      if (entry.name.startsWith('@')) pending.push(child);
      else {
        packages.push(child);
        const nested = path.join(child, 'node_modules');
        if (fs.existsSync(nested)) pending.push(nested);
      }
    }
  }
  return packages;
}

const files = walk('', () => true);
const textFiles = files.filter((file) => /\.(?:js|cjs|mjs|json|md|yml|yaml|html|css|txt|env|example|sql)$/i.test(file));
const packageJson = JSON.parse(read('package.json'));
const typedFiles = walk('', (file) => /\.(?:ts|tsx|mts|cts)$/i.test(file));
record('ST-01', typedFiles.length === 0, typedFiles.length ? `TypeScript files: ${typedFiles.join(', ')}` : 'No TypeScript source files outside dependencies.');

const packageChecks = packageJson.type === 'module'
  && packageJson.engines?.node === '>=22.13 <23'
  && packageJson.license === 'MIT'
  && exists('.nvmrc')
  && read('.nvmrc').trim() === '22'
  && exists('LICENSE')
  && /MIT License/.test(read('LICENSE'));
record('ST-02', packageChecks, 'Root package metadata, .nvmrc, and MIT license.');

const nativeNames = new Set(['pg-native', 'bcrypt', 'argon2', 'sharp', 'canvas', 'better-sqlite3']);
const nativeFindings = [];
for (const packageRoot of ['node_modules', 'web/node_modules']) {
  for (const directory of packageTree(path.join(root, packageRoot))) {
    const manifestPath = path.join(directory, 'package.json');
    let manifest = {};
    if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (nativeNames.has(manifest.name)
      || manifest.gypfile === true
      || fs.existsSync(path.join(directory, 'binding.gyp'))) {
      nativeFindings.push(manifest.name || directory);
    }
  }
}
record('ST-03', nativeFindings.length === 0, nativeFindings.length ? `Native package/build metadata: ${nativeFindings.join(', ')}` : 'No native dependency markers found.');

const licenseFindings = [];
for (const [prefix, lockPath] of [['', 'package-lock.json'], ['web/', 'web/package-lock.json']]) {
  if (!exists(lockPath)) {
    licenseFindings.push(`${lockPath} missing`);
    continue;
  }
  const lock = JSON.parse(read(lockPath));
  for (const [packagePath, entry] of Object.entries(lock.packages || {})) {
    if (!packagePath || entry.dev === true || entry.optional === true || !packagePath.includes('node_modules/')) continue;
    const manifestPath = path.join(root, prefix, packagePath, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let license = typeof manifest.license === 'string'
      ? manifest.license
      : manifest.license?.type;
    if (!license) {
      const legalFiles = fs.readdirSync(path.dirname(manifestPath))
        .filter((name) => /^(?:license|licence|copying)(?:\.|$)/i.test(name));
      const legalText = legalFiles.map((name) => fs.readFileSync(path.join(path.dirname(manifestPath), name), 'utf8')).join('\n');
      if (/MIT License/i.test(legalText) || /Permission is hereby granted, free of charge/i.test(legalText)) license = 'MIT';
      else if (/ISC License/i.test(legalText)) license = 'ISC';
      else if (/Apache License\s*[\r\n]+Version 2\.0/i.test(legalText)) license = 'Apache-2.0';
      else if (/BSD 3-Clause License/i.test(legalText)) license = 'BSD-3-Clause';
      else if (/BSD 2-Clause License/i.test(legalText)) license = 'BSD-2-Clause';
    }
    if (!license || !allowedLicenses.has(license)) {
      licenseFindings.push(`${manifest.name || packagePath}: ${license || 'license missing'}`);
    }
  }
}
record('ST-04', licenseFindings.length === 0, licenseFindings.length ? licenseFindings.slice(0, 30).join('; ') : 'Production dependency licenses are allowlisted.');

const sourceFiles = walk('', (file) => /^(server|web[\\/]src|shared|scripts)[\\/]/.test(file) && /\.(?:js|cjs|mjs|jsx|css)$/i.test(file));
const liveFindings = [];
for (const file of sourceFiles) {
  if (file.replaceAll('\\', '/') === 'scripts/guard.js') continue;
  const contents = read(file);
  for (const host of livePaypalHosts) {
    if (contents.toLowerCase().includes(host)) liveFindings.push(`${file}: ${host}`);
  }
}
record('ST-05', liveFindings.length === 0, liveFindings.length ? liveFindings.join('; ') : 'No live PayPal API hosts in application sources.');

const moneyFindings = [];
for (const file of walk('server/src').concat(walk('shared'))) {
  if (!file.endsWith('.js')) continue;
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/\b(?:parseFloat|Number\s*\([^)]*\)|toFixed|Math\.round)\s*\(/.test(line)
      && /\b(?:amount|minor|price|total|balance|limit)\b/i.test(line)) {
      moneyFindings.push(`${file}:${index + 1}`);
    }
  });
}
record('ST-06', moneyFindings.length === 0, moneyFindings.length ? `Review possible money conversions: ${moneyFindings.join(', ')}` : 'No money conversion heuristic hits.');

let gitTrackedFiles = [];
let gitAvailable = true;
try {
  gitTrackedFiles = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0').filter(Boolean);
} catch {
  gitAvailable = false;
}
const secretPattern = /-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|client_secret\s*[:=]\s*["'][^"']{8,}|JOBENPAY_[A-Z_]*KEY\s*=\s*[^ \r\n#]{8,}/i;
const secretFindings = [];
for (const file of (gitAvailable ? gitTrackedFiles : textFiles)) {
  if (!exists(file) || file === '.env' || file === '.env.example' || file.includes('package-lock.json')) continue;
  const contents = read(file);
  if (secretPattern.test(contents)) secretFindings.push(file);
}
let envIgnored = false;
try {
  envIgnored = execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: root, stdio: 'ignore' }) === undefined;
} catch {
  envIgnored = /(^|\r?\n)\.env(?:\.\*)?(?:\r?\n|$)/.test(read('.gitignore'));
}
record('ST-07', gitAvailable && envIgnored && !secretFindings.length,
  !gitAvailable ? 'Git metadata unavailable; tracked-file and ignore status cannot be verified.'
    : secretFindings.length ? `Potential secret pattern in: ${secretFindings.join(', ')}`
      : envIgnored ? '.env is ignored; no secret patterns found in tracked files.' : '.env is not ignored.');

const repositoryFiles = walk('server/src/repositories', (file) => file.endsWith('.js'));
const globalRepositories = new Set(['users.js', 'sessions.js', 'rateLimit.js']);
const tenantFindings = [];
const tenantLookupExceptions = new Map([
  ['agents.js:getAgentKeysByPrefix', 'D21 prefix-only authentication lookup; candidate keys are verified by HMAC before tenant-scoped operations.'],
  ['paypalConnections.js:findPaypalConnectionByWebhookToken', 'Public webhook token resolves the tenant before request processing; token is a high-entropy secret and globally unique.'],
]);
for (const file of repositoryFiles) {
  if (globalRepositories.has(path.basename(file))) continue;
  const source = read(file);
  const functions = source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g);
  for (const match of functions) {
    const name = match[1] || match[3];
    const params = match[2] || match[4] || '';
    const end = source.indexOf('\nexport ', match.index + match[0].length);
    const body = source.slice(match.index, end < 0 ? undefined : end);
    if (tenantLookupExceptions.has(`${path.basename(file)}:${name}`)) continue;
    if (/\b(?:FROM|JOIN|UPDATE|INTO|DELETE\s+FROM)\s+(?:public\.)?["a-z_]+/i.test(body)
      && !/\borgId\b/.test(params)
      && !/const\s*\{[^}]*\borgId\b[^}]*\}\s*=\s*options/.test(body)
      && !/if\s*\(\s*!orgId\s*\)/.test(body)) {
      tenantFindings.push(`${file}:${name}`);
    }
  }
}
record('ST-08', tenantFindings.length === 0,
  `${tenantFindings.length ? `Review tenant repository exports: ${tenantFindings.join(', ')}; ` : ''}Explicit global lookup exceptions: ${[...tenantLookupExceptions.keys()].join(', ')}.`);

const errorCodesPath = 'shared/error-codes.js';
const errorSource = exists(errorCodesPath) ? read(errorCodesPath) : '';
const actualCodes = [...errorSource.matchAll(/\b([A-Z][A-Z0-9_]+)\s*:/g)].map((match) => match[1]);
const missingCodes = expectedErrorCodes.filter((code) => !actualCodes.includes(code));
const extraCodes = actualCodes.filter((code) => !expectedErrorCodes.includes(code));
record('ST-09', exists(errorCodesPath) && missingCodes.length === 0 && extraCodes.length === 0,
  `Missing: ${missingCodes.join(', ') || 'none'}; unexpected: ${extraCodes.join(', ') || 'none'}.`);

const styleFiles = walk('web', (file) => /\.(?:css|jsx)$/i.test(file) && !file.endsWith('tokens.css'));
const styleFindings = [];
const colorPattern = /(?:^|[;{]\s*)(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left))?(?:-color)?|outline-color)\s*:\s*(?:#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(|(?:red|green|blue|white|black|gray|grey|orange|purple|yellow|pink|transparent)\b)/i;
for (const file of styleFiles) {
  const contents = read(file);
  if (file.endsWith('.css') && colorPattern.test(contents)) styleFindings.push(`${file}: literal color`);
  if (file.endsWith('.jsx')) {
    const inlineStyles = [...contents.matchAll(/style\s*=\s*\{\s*\{([^}]*)\}\s*\}/gs)].map((match) => match[1]);
    if (inlineStyles.some((style) => colorPattern.test(style.replace(/([a-z])([A-Z])/g, '$1-$2')))) {
      styleFindings.push(`${file}: inline literal color`);
    }
    if (inlineStyles.some((style) => /(?:width|height|margin|padding|gap|top|right|bottom|left)\s*:\s*['"]?(?:[2-9]|[1-9]\d+)px\b/i.test(style))) {
      styleFindings.push(`${file}: inline literal px size`);
    }
  }
  if (file.endsWith('.css') && /(?:@custom-media[^{\n]*|\([^)]*(?:min|max)-(?:width|height)\s*:\s*)(?:[2-9]|[1-9]\d+)px\b/i.test(contents)) {
    styleFindings.push(`${file}: literal media breakpoint size`);
  }
  if (file.endsWith('.css') && /(?:^|[;{]\s*)(?:width|height|min-width|max-width|min-height|max-height|margin(?:-(?:top|right|bottom|left))?|padding(?:-(?:top|right|bottom|left))?|gap|top|right|bottom|left|font-size|line-height|letter-spacing)\s*:\s*(?:[2-9]|[1-9]\d+)px\b/im.test(contents)) {
    styleFindings.push(`${file}: literal px size`);
  }
}
record('ST-10', styleFindings.length === 0, styleFindings.length ? styleFindings.join('; ') : 'No color or non-token pixel literals found.');

const paypalFindings = [];
const paypalAllowlist = [
  'Connect PayPal Sandbox', 'PayPal Sandbox', 'not a PayPal product',
  'Connected to PayPal Sandbox only', 'PayPal account', 'not affiliated with PayPal',
];
for (const file of walk('web/src', (name) => /\.(?:jsx|js)$/i.test(name))) {
  let contents = read(file);
  for (const phrase of paypalAllowlist) contents = contents.replaceAll(phrase, '');
  if (/\bPayPal\b/.test(contents)) paypalFindings.push(file);
}
record('ST-11', paypalFindings.length === 0, paypalFindings.length ? `Unapproved PayPal branding: ${paypalFindings.join(', ')}` : 'UI PayPal references are factual/allowlisted.');

const distFiles = walk('web/dist');
const parityFiles = distFiles.filter((file) => read(file).includes('__parity'));
let distTracked = false;
if (gitAvailable) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', 'web/dist'], { cwd: root, stdio: 'ignore' });
    distTracked = true;
  } catch {
    distTracked = false;
  }
}
record('ST-12', gitAvailable && !distTracked && parityFiles.length === 0,
  `${distTracked ? 'web/dist is tracked; ' : ''}${parityFiles.length ? `parity string in ${parityFiles.join(', ')}` : 'no parity strings in production output'}${!gitAvailable ? '; Git tracking status unavailable' : ''}.`);

const html = exists('web/index.html') ? read('web/index.html') : '';
record('ST-13', exists('web/index.html') && !/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(html) && !/<style\b/i.test(html),
  'web/index.html has no inline script or style elements.');

const missingScripts = requiredScripts.filter((script) => !packageJson.scripts?.[script]);
record('ST-14', missingScripts.length === 0, missingScripts.length ? `Missing npm scripts: ${missingScripts.join(', ')}` : 'All required root npm scripts are present.');

const poolSource = exists('server/src/db/pool.js') ? read('server/src/db/pool.js') : '';
const pgNativeImports = walk('server/src', (file) => file.endsWith('.js'))
  .filter((file) => /\bfrom\s+['"]pg-native['"]|\brequire\s*\(\s*['"]pg-native['"]/.test(read(file)));
const maxPool = Number(poolSource.match(/\bmax\s*:\s*(\d+)/)?.[1]);
const statementTimeout = Number(poolSource.match(/\bstatement_timeout\s*:\s*(\d+)/)?.[1]);
record('ST-15', pgNativeImports.length === 0 && maxPool > 0 && maxPool <= 5 && statementTimeout === 10000,
  `pg-native imports: ${pgNativeImports.length}; pool max: ${maxPool || 'missing'}; statement_timeout: ${statementTimeout || 'missing'}.`);

console.log(results.join('\n'));
if (results.some((result) => result.includes('\tFAIL\t'))) process.exitCode = 1;
