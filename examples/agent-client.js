import { randomUUID } from 'node:crypto';

const baseUrl = process.env.JOBENPAY_URL?.replace(/\/$/, '');
const agentKey = process.env.JOBENPAY_AGENT_KEY;
const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
};
const payeeId = valueAfter('--payee-id') || process.env.JOBENPAY_PAYEE_ID;
const amountMinor = valueAfter('--amount-minor') || process.env.JOBENPAY_AMOUNT_MINOR;
const currency = valueAfter('--currency') || process.env.JOBENPAY_CURRENCY || 'USD';
const documentId = valueAfter('--document-id') || process.env.JOBENPAY_DOCUMENT_ID;
const reason = valueAfter('--reason') || process.env.JOBENPAY_REASON;
const useMcp = args.includes('--mcp');

if (!baseUrl || !agentKey) {
  throw new Error('Set JOBENPAY_URL and JOBENPAY_AGENT_KEY.');
}
if (!payeeId || !amountMinor || !/^[1-9]\d*$/.test(amountMinor) || !/^[A-Z]{3}$/.test(currency)) {
  throw new Error('Provide --payee-id and positive --amount-minor; --currency defaults to USD.');
}

const idempotencyKey = randomUUID();
const proposal = {
  payeeId,
  amountMinor,
  currency,
  ...(documentId ? { documentId } : {}),
  ...(reason ? { reason } : {}),
};

async function postJson(path, body, extraHeaders = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${agentKey}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${payload.error?.code || response.status}: ${payload.error?.message || 'Request failed.'}`);
  }
  return payload;
}

if (!useMcp) {
  const result = await postJson('/api/v1/agent/v1/payout-requests', proposal, {
    'idempotency-key': idempotencyKey,
  });
  console.log(JSON.stringify(result, null, 2));
} else {
  const protocolVersion = '2026-07-28';
  const meta = {
    'io.modelcontextprotocol/protocolVersion': protocolVersion,
    'io.modelcontextprotocol/clientInfo': { name: 'jobenpay-example-client', version: '1.0.0' },
    'io.modelcontextprotocol/clientCapabilities': {},
  };
  const metadataHeaders = { 'MCP-Protocol-Version': protocolVersion };
  await postJson('/mcp', {
    jsonrpc: '2.0',
    id: 'discover',
    method: 'server/discover',
    params: { _meta: meta },
  }, metadataHeaders);
  const result = await postJson('/mcp', {
    jsonrpc: '2.0',
    id: 'proposal',
    method: 'tools/call',
    params: {
      name: 'propose_payout',
      arguments: { ...proposal, idempotencyKey },
      _meta: meta,
    },
  }, metadataHeaders);
  if (result.result?.isError) {
    throw new Error(`${result.result.structuredContent?.reasonCodes?.join(', ') || 'MCP_TOOL_ERROR'}: ${result.result.structuredContent?.message || 'Tool call failed.'}`);
  }
  console.log(JSON.stringify(result.result?.structuredContent, null, 2));
}
