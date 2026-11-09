import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentAuth, parseAgentApiKey, assertOwnedByAgent } from '../../src/auth/agentAuth.js';
import { createAgentApiKey, hashAgentApiKey } from '../../src/lib/agentApiKeys.js';

const pepper = Buffer.alloc(32, 13).toString('base64');

test('agent API keys use the sandbox format and parse only complete keys', () => {
  const generated = createAgentApiKey();
  assert.match(generated.apiKey, /^jp_sbx_[A-Za-z0-9_-]{8}_[A-Za-z0-9_-]{32}$/);
  assert.equal(parseAgentApiKey(generated.apiKey).prefix, generated.prefix);
  assert.equal(parseAgentApiKey(`${generated.apiKey}x`), null);
});

test('agent authentication verifies HMAC and applies disabled, revoked, and rate-limit states', async () => {
  const generated = createAgentApiKey();
  const stored = {
    id: 'key-id',
    org_id: 'org-id',
    agent_id: 'agent-id',
    key_hash: hashAgentApiKey(pepper, generated.apiKey),
    agent_status: 'ACTIVE',
    revoked_at: null,
  };
  let touched = 0;
  let limited = false;
  const middleware = createAgentAuth({
    pepper,
    findKeys: async (prefix) => (prefix === generated.prefix
      ? [{ ...stored, id: 'prefix-collision', key_hash: '0'.repeat(64) }, stored]
      : []),
    touchKey: async () => { touched += 1; return true; },
    applyRateLimit: async () => limited,
    findOrganization: async () => ({ rows: [{ archived_at: null }] }),
  });
  const request = (key = generated.apiKey) => ({
    get(name) {
      return name === 'authorization' && key ? `Bearer ${key}` : '';
    },
  });
  const invoke = async (req) => new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error || null));
  });

  const accepted = request();
  assert.equal(await invoke(accepted), null);
  assert.deepEqual(accepted.agent, { id: 'agent-id', orgId: 'org-id' });
  assert.equal(touched, 1);

  const alteredKey = `${generated.apiKey.slice(0, -1)}${generated.apiKey.endsWith('x') ? 'y' : 'x'}`;
  assert.equal((await invoke(request(alteredKey))).statusCode, 401);
  stored.agent_status = 'DISABLED';
  assert.equal((await invoke(request())).statusCode, 403);
  stored.agent_status = 'ACTIVE';
  stored.revoked_at = new Date();
  assert.equal((await invoke(request())).statusCode, 401);
  stored.revoked_at = null;
  limited = true;
  assert.equal((await invoke(request())).statusCode, 429);
});

test('assertOwnedByAgent denies cross-agent resource access', () => {
  assert.doesNotThrow(() => assertOwnedByAgent('agent-a', 'agent-a'));
  assert.throws(
    () => assertOwnedByAgent('agent-a', 'agent-b'),
    (error) => error.code === 'NOT_FOUND' && error.statusCode === 404,
  );
});

test('agent API rate limit permits 60 requests per key per minute and rejects the 61st', async () => {
  const generated = createAgentApiKey();
  const stored = {
    id: 'key-limit-id',
    org_id: 'org-id',
    agent_id: 'agent-id',
    key_hash: hashAgentApiKey(pepper, generated.apiKey),
    agent_status: 'ACTIVE',
    revoked_at: null,
  };
  let calls = 0;
  const middleware = createAgentAuth({
    pepper,
    findKeys: async () => [stored],
    touchKey: async () => true,
    findOrganization: async () => ({ rows: [{ archived_at: null }] }),
    applyRateLimit: async () => {
      calls += 1;
      return calls > 60;
    },
  });
  const invoke = async () => new Promise((resolve) => {
    middleware({
      get(name) {
        return name === 'authorization' ? `Bearer ${generated.apiKey}` : '';
      },
    }, {}, (error) => resolve(error || null));
  });
  for (let attempt = 0; attempt < 60; attempt += 1) assert.equal(await invoke(), null);
  assert.equal((await invoke()).statusCode, 429);
});

test('Langkah 1.1: rejects cross-environment contamination between Sandbox and Live', async () => {
  const liveKey = createAgentApiKey('LIVE');
  assert.ok(liveKey.apiKey.startsWith('jp_live_'));

  const sbxKey = createAgentApiKey('SANDBOX');
  assert.ok(sbxKey.apiKey.startsWith('jp_sbx_'));

  const middleware = createAgentAuth({
    pepper,
    findKeys: async () => [],
    touchKey: async () => true,
    findOrganization: async () => ({ rows: [{ archived_at: null }] }),
    applyRateLimit: async () => false,
  });

  // 1. Live key with Sandbox header -> rejected with 400
  const err1 = await new Promise((resolve) => {
    middleware({
      get(name) {
        if (name === 'authorization') return `Bearer ${liveKey.apiKey}`;
        if (name === 'x-jobenpay-environment') return 'SANDBOX';
        return '';
      },
      headers: { 'x-jobenpay-environment': 'SANDBOX' },
    }, {}, resolve);
  });
  assert.equal(err1?.statusCode, 400);
  assert.equal(err1?.code, 'CROSS_ENVIRONMENT_CONTAMINATION');
  assert.equal(err1?.message, 'Cross-Environment Contamination Detected');

  // 2. Sandbox key with Live header -> rejected with 400
  const err2 = await new Promise((resolve) => {
    middleware({
      get(name) {
        if (name === 'authorization') return `Bearer ${sbxKey.apiKey}`;
        if (name === 'x-jobenpay-environment') return 'LIVE';
        return '';
      },
      headers: { 'x-jobenpay-environment': 'LIVE' },
    }, {}, resolve);
  });
  assert.equal(err2?.statusCode, 400);
  assert.equal(err2?.code, 'CROSS_ENVIRONMENT_CONTAMINATION');
  assert.equal(err2?.message, 'Cross-Environment Contamination Detected');
});
