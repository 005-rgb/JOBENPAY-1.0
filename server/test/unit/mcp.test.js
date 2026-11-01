import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../../src/lib/errors.js';
import { AGENT_MCP_TOOLS, createMcpRequestHandler } from '../../src/agent/mcp.js';

function callHandler(handler, {
  body,
  headers = {},
  agent = { id: 'agent-id', orgId: 'org-id' },
} = {}) {
  const response = {
    statusCode: 200,
    payload: undefined,
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  const req = {
    body,
    agent,
    get(name) {
      return headers[name.toLowerCase()] ?? '';
    },
  };
  return new Promise((resolve, reject) => {
    handler(req, response, (error) => {
      if (error) reject(error);
      else resolve(response);
    }).then(() => resolve(response), reject);
  });
}

function modernMessage(method, params = {}, id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientInfo': { name: 'test-client', version: '1.0.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  };
}

const modernHeaders = {
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2026-07-28',
};

test('MCP exposes exactly the three agent tools', () => {
  assert.deepEqual(AGENT_MCP_TOOLS.map(({ name }) => name), [
    'propose_payout',
    'get_request_status',
    'get_budget_status',
  ]);
});

test('modern MCP tools/list and tools/call return structured content', async () => {
  const handler = createMcpRequestHandler({
    invokeTool: async () => ({
      requestId: 'request-id',
      decision: 'REQUIRE_APPROVAL',
      reasonCodes: ['AI_UNAVAILABLE'],
      message: 'Review is required.',
    }),
  });
  const discovered = await callHandler(handler, {
    headers: modernHeaders,
    body: modernMessage('server/discover'),
  });
  assert.ok(discovered.payload.result.supportedVersions.includes('2026-07-28'));
  assert.ok(discovered.payload.result.capabilities.tools);

  const listed = await callHandler(handler, {
    headers: modernHeaders,
    body: modernMessage('tools/list'),
  });
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(listed.payload.result.tools.map(({ name }) => name), [
    'propose_payout',
    'get_request_status',
    'get_budget_status',
  ]);

  const called = await callHandler(handler, {
    headers: modernHeaders,
    body: modernMessage('tools/call', { name: 'propose_payout', arguments: {} }),
  });
  assert.equal(called.payload.result.isError, false);
  assert.equal(called.payload.result.structuredContent.decision, 'REQUIRE_APPROVAL');
  assert.deepEqual(called.payload.result.structuredContent.reasonCodes, ['AI_UNAVAILABLE']);
});

test('MCP tool errors are isError results, not handler failures', async () => {
  const handler = createMcpRequestHandler({
    invokeTool: async () => {
      throw new AppError('VALIDATION_FAILED', 'Rejected input.');
    },
  });
  const response = await callHandler(handler, {
    headers: modernHeaders,
    body: modernMessage('tools/call', { name: 'propose_payout', arguments: {} }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.result.isError, true);
  assert.equal(response.payload.result.structuredContent.decision, null);
  assert.deepEqual(response.payload.result.structuredContent.reasonCodes, ['VALIDATION_FAILED']);
});

test('MCP rejects mismatched protocol metadata and disallowed browser origins', async () => {
  const handler = createMcpRequestHandler({ invokeTool: async () => ({}) });
  const mismatch = await callHandler(handler, {
    headers: { ...modernHeaders, 'mcp-protocol-version': '2025-11-25' },
    body: modernMessage('tools/list'),
  });
  assert.equal(mismatch.statusCode, 400);
  assert.equal(mismatch.payload.error.data.code, 'HeaderMismatch');

  const origin = await callHandler(handler, {
    headers: { ...modernHeaders, origin: 'https://attacker.example' },
    body: modernMessage('tools/list'),
  });
  assert.equal(origin.statusCode, 403);
  assert.equal(origin.payload.error.code, -32003);
});

test('legacy MCP initialize remains stateless and supported', async () => {
  const handler = createMcpRequestHandler({ invokeTool: async () => ({}) });
  const response = await callHandler(handler, {
    headers: { accept: 'application/json, text/event-stream' },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'legacy', version: '1' } },
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.result.protocolVersion, '2025-11-25');
  assert.equal(response.payload.result.serverInfo.name, 'JOBENPAY Agent API');
});
