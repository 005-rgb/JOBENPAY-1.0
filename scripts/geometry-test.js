import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDirectory = path.join(root, 'web');
const webRequire = createRequire(path.join(webDirectory, 'package.json'));
const { chromium } = webRequire('@playwright/test');
const designSpec = JSON.parse(readFileSync(new URL('../docs/ui-reference/design-spec.json', import.meta.url), 'utf8'));
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4179', '--strictPort'],
  { cwd: webDirectory, stdio: 'ignore' },
);
const failures = [];
let browser;

function rgbToLab(rgb) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const x = (linear[0] * 0.4124564 + linear[1] * 0.3575761 + linear[2] * 0.1804375) / 0.95047;
  const y = (linear[0] * 0.2126729 + linear[1] * 0.7151522 + linear[2] * 0.072175) / 1;
  const z = (linear[0] * 0.0193339 + linear[1] * 0.119192 + linear[2] * 0.9503041) / 1.08883;
  const curve = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const fx = curve(x);
  const fy = curve(y);
  const fz = curve(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function parseColor(value) {
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join('') : hex[1];
    return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
  }

  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) {
    return rgb.slice(1, 4).map(Number);
  }

  return null;
}

function deltaE(left, right) {
  const leftLab = rgbToLab(left);
  const rightLab = rgbToLab(right);
  return Math.hypot(...leftLab.map((value, index) => value - rightLab[index]));
}

async function waitForServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before becoming ready (code ${server.exitCode}).`);
    }
    try {
      const response = await fetch('http://127.0.0.1:4179/__parity/s1');
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error('Vite did not become ready within 15 seconds.');
}

async function readValue(page, entry) {
  return page.locator(entry.selector).first().evaluate((element, property) => {
    if (property.startsWith('--')) {
      return getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    }

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const values = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      centerX: rect.x + rect.width / 2,
      centerY: rect.y + rect.height / 2,
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: Number.parseFloat(style.fontWeight),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
    return values[property] ?? style[property];
  }, entry.property);
}

try {
  await waitForServer();
  const launchOptions = { headless: true };
  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  }
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({
    viewport: { width: 1366, height: 768 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });

  for (const route of ['/__parity/s1', '/__parity/s2']) {
    await page.goto(`http://127.0.0.1:4179${route}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (dimensions.scrollWidth > dimensions.clientWidth) {
      failures.push(`${route}: horizontal overflow (${dimensions.scrollWidth}px > ${dimensions.clientWidth}px).`);
    }
    const entries = designSpec.filter((entry) => entry.route === route);

    for (const entry of entries) {
      const locator = page.locator(entry.selector);
      if ((await locator.count()) === 0) {
        failures.push(`${entry.id}: selector not found (${entry.selector}).`);
        continue;
      }

      const actual = await readValue(page, entry);
      if (typeof entry.expected === 'string' && entry.expected.startsWith('#')) {
        const actualRgb = parseColor(actual);
        const expectedRgb = parseColor(entry.expected);
        if (!actualRgb || !expectedRgb) {
          failures.push(`${entry.id}: could not parse color (${String(actual)}).`);
          continue;
        }
        const difference = deltaE(actualRgb, expectedRgb);
        if (difference > entry.tolerance) {
          failures.push(`${entry.id}: ΔE ${difference.toFixed(2)} > ${entry.tolerance}.`);
        }
        continue;
      }

      const numericActual = Number(actual);
      if (!Number.isFinite(numericActual) || Math.abs(numericActual - entry.expected) > entry.tolerance) {
        failures.push(`${entry.id}: expected ${entry.expected} ± ${entry.tolerance}, got ${String(actual)}.`);
      }
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
} finally {
  if (browser) await browser.close();
  server.kill();
}

if (failures.length > 0) {
  console.error(`Geometry parity failed (${failures.length} finding(s)):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Geometry parity passed (${designSpec.length} assertions).`);
}
