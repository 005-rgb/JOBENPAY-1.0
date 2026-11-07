/**
 * spikes/lib/cassette-recorder.js
 * Perekam interaksi HTTP Sandbox ke format kaset deterministik.
 * Format baku sesuai PRD 1.3 WP F0-2:
 * { scenarioId, step, request:{method,path,headersAllowlist,body}, response:{status,headersAllowlist,body}, recordedAt, sandboxFlag:true }
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ALLOWED_HEADERS = ['content-type', 'paypal-request-id', 'paypal-debug-id'];

export function redactData(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactData);

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    const lk = key.toLowerCase();
    if (lk === 'authorization' || lk.includes('token') || lk.includes('secret') || lk.includes('password')) {
      clean[key] = '[REDACTED_SECRET]';
    } else if (lk.includes('email') && typeof value === 'string' && value.includes('@')) {
      clean[key] = 'sandbox-buyer@jobenpay.test';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = redactData(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export function saveCassette(scenarioId, step, request, response, options = {}) {
  const dir = options.dir || path.join(process.cwd(), 'cassettes');
  mkdirSync(dir, { recursive: true });

  const record = {
    scenarioId,
    step,
    request: {
      method: request.method,
      path: request.path,
      headers: filterHeaders(request.headers),
      body: redactData(request.body)
    },
    response: {
      status: response.status,
      headers: filterHeaders(response.headers),
      body: redactData(response.body)
    },
    recordedAt: '2026-11-06T00:00:00.000Z',
    sandboxFlag: true
  };

  const filePath = path.join(dir, `${scenarioId}-${step}.json`);
  writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  return record;
}

function filterHeaders(headers) {
  if (!headers) return {};
  const filtered = {};
  for (const [k, v] of Object.entries(headers)) {
    if (ALLOWED_HEADERS.includes(k.toLowerCase())) {
      filtered[k.toLowerCase()] = v;
    }
  }
  return filtered;
}

