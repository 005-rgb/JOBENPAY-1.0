import { AppError } from '../lib/errors.js';

export const MCP_PROTOCOL_VERSIONS = Object.freeze(['2026-07-28', '2025-11-25']);

export const AGENT_MCP_TOOLS = Object.freeze([
  {
    name: 'propose_payout',
    description: 'Submit a payout proposal for policy evaluation. This tool cannot approve or execute payouts.',
    inputSchema: {
      type: 'object',
      properties: {
        payeeId: { type: 'string', format: 'uuid' },
        amountMinor: { oneOf: [{ type: 'integer', minimum: 1 }, { type: 'string', pattern: '^[1-9][0-9]*$' }] },
        currency: { type: 'string', pattern: '^[A-Z]{3}$' },
        documentId: { type: 'string', format: 'uuid' },
        reason: { type: 'string', maxLength: 2000 },
        idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 },
      },
      required: ['payeeId', 'amountMinor', 'currency', 'idempotencyKey'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_request_status',
    description: 'Read the status of a payout request owned by the authenticated agent.',
    inputSchema: {
      type: 'object',
      properties: { requestId: { type: 'string', format: 'uuid' } },
      required: ['requestId'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_budget_status',
    description: 'Read the authenticated agent’s active mandate budget.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]);

function rpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

function requestMeta(message) {
  return message.params?._meta ?? message._meta ?? null;
}

function protocolError(res, id, code, text, data) {
  return res.status(400).json(rpcError(id ?? null, code, text, data));
}

function originAllowed(origin) {
  if (!origin) return true;
  const allowedOrigin = new URL(process.env.PUBLIC_BASE_URL || 'http://localhost:3000').origin;
  return origin === allowedOrigin;
}

export function mcpOriginGuard(req, res, next) {
  try {
    if (!originAllowed(req.get('origin'))) return res.status(403).json(rpcError(null, -32003, 'Origin is not allowed.'));
    return next();
  } catch (error) {
    return next(error);
  }
}

export function createMcpRequestHandler({ invokeTool }) {
  if (typeof invokeTool !== 'function') throw new TypeError('invokeTool is required.');

  return async function handleMcpRequest(req, res, next) {
    try {
      const origin = req.get('origin');
      if (!originAllowed(origin)) {
        return res.status(403).json(rpcError(null, -32003, 'Origin is not allowed.'));
      }

      const accept = req.get('accept') || '';
      if (!accept.toLowerCase().includes('application/json')
        || !accept.toLowerCase().includes('text/event-stream')) {
        return res.status(406).json({ error: { code: 'MCP_ACCEPT_REQUIRED', message: 'Accept must include application/json and text/event-stream.' } });
      }

      const message = req.body;
      if (!message || typeof message !== 'object' || Array.isArray(message)
        || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
        return protocolError(res, null, -32600, 'Invalid JSON-RPC request.');
      }
      const id = message.id;
      const hasId = id !== undefined && id !== null;
      const method = message.method;
      const meta = requestMeta(message);
      const headerVersion = req.get('mcp-protocol-version');
      if (method !== 'initialize' && !headerVersion) {
        return protocolError(res, id, -32600, 'MCP-Protocol-Version header is required.');
      }
      const version = meta?.['io.modelcontextprotocol/protocolVersion']
        ?? (method === 'initialize' ? message.params?.protocolVersion : headerVersion);

      if (version && !MCP_PROTOCOL_VERSIONS.includes(version)) {
        return protocolError(res, id, -32022, 'Unsupported protocol version.', {
          supported: MCP_PROTOCOL_VERSIONS,
          requested: version,
        });
      }
      if (version === '2026-07-28') {
        if (headerVersion !== version) {
          return protocolError(res, id, -32600, 'Protocol version header does not match request metadata.', {
            code: 'HeaderMismatch',
          });
        }
        if (!meta?.['io.modelcontextprotocol/clientInfo']
          || !meta?.['io.modelcontextprotocol/clientCapabilities']) {
          return protocolError(res, id, -32600, 'Modern MCP request metadata is incomplete.');
        }
      }

      if (method.startsWith('notifications/')) {
        if (!['notifications/initialized'].includes(method)) {
          return protocolError(res, id, -32601, 'Method not found.');
        }
        return res.status(202).end();
      }
      if (!hasId) {
        return protocolError(res, null, -32600, 'JSON-RPC request id is required.');
      }

      if (method === 'server/discover') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            resultType: 'complete',
            supportedVersions: MCP_PROTOCOL_VERSIONS,
            capabilities: { tools: {} },
            _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'JOBENPAY Agent API', version: '1.0.0' } },
            instructions: 'Submit payout proposals and read the authenticated agent’s request and budget status. No tool approves or executes payouts.',
            ttlMs: 3600000,
            cacheScope: 'public',
          },
        });
      }
      if (method === 'initialize') {
        const requested = message.params?.protocolVersion;
        if (requested && !MCP_PROTOCOL_VERSIONS.includes(requested)) {
          return res.status(200).json(rpcError(id, -32022, 'Unsupported protocol version.', {
            supported: MCP_PROTOCOL_VERSIONS,
            requested,
          }));
        }
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: requested || '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'JOBENPAY Agent API', version: '1.0.0' },
          },
        });
      }
      if (method === 'tools/list') {
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: { resultType: 'complete', tools: AGENT_MCP_TOOLS },
        });
      }
      if (method === 'tools/call') {
        const { name, arguments: args } = message.params || {};
        const tool = AGENT_MCP_TOOLS.find((item) => item.name === name);
        if (!tool) {
          return res.status(200).json(rpcError(id, -32602, 'Unknown tool.'));
        }
        let result;
        try {
          result = await invokeTool(name, args || {}, req.agent);
        } catch (error) {
          const code = error instanceof AppError ? error.code : 'INTERNAL';
          const text = error instanceof AppError ? error.message : 'Tool request failed.';
          result = { decision: null, reasonCodes: [code], message: text, errorCode: code };
          return res.status(200).json({
            jsonrpc: '2.0',
            id,
            result: {
              resultType: 'complete',
              content: [{ type: 'text', text }],
              structuredContent: result,
              isError: true,
            },
          });
        }
        return res.status(200).json({
          jsonrpc: '2.0',
          id,
          result: {
            resultType: 'complete',
            content: [{ type: 'text', text: result.message }],
            structuredContent: result,
            isError: false,
          },
        });
      }
      return res.status(200).json(rpcError(id, -32601, 'Method not found.'));
    } catch (error) {
      return next(error);
    }
  };
}
