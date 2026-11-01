# Agent Integration

The agent API is available at `{JOBENPAY_URL}/api/v1/agent/v1`. Authenticate with
`Authorization: Bearer <agent API key>`. Agent keys are rate-limited to 60
requests per minute across REST and MCP; demo organizations are also limited
to 30 payout proposals per hour.

## REST proposal

```bash
curl -X POST "$JOBENPAY_URL/api/v1/agent/v1/payout-requests" \
  -H "Authorization: Bearer $JOBENPAY_AGENT_KEY" \
  -H "Idempotency-Key: replace-with-a-unique-key" \
  -H "Content-Type: application/json" \
  -d '{
    "payeeId": "00000000-0000-4000-8000-000000000001",
    "amountMinor": "1500",
    "currency": "USD",
    "reason": "Invoice payment"
  }'
```

The response contains the request ID, status, deterministic decision, reason
codes, human-readable message, and budget counters. A `REJECT` decision is
returned as HTTP 200; it is an evaluated proposal, not a transport failure.
Use the same `Idempotency-Key` to safely retry the same payload.

## MCP client configuration

Configure an MCP client with the server URL `{JOBENPAY_URL}/mcp` and an
`Authorization: Bearer <agent API key>` header. The server is stateless and
supports MCP `2026-07-28` plus legacy `2025-11-25` initialization. Modern
requests include `MCP-Protocol-Version: 2026-07-28` and per-request
`_meta` metadata. The only tools are:

| Tool | Purpose |
| --- | --- |
| `propose_payout` | Submit a payout request for policy evaluation; no execution or approval |
| `get_request_status` | Read a request belonging to the authenticated agent |
| `get_budget_status` | Read the agent's active mandate budget |

Example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "propose_payout",
    "arguments": {
      "payeeId": "00000000-0000-4000-8000-000000000001",
      "amountMinor": "1500",
      "currency": "USD",
      "idempotencyKey": "a-unique-client-generated-key"
    },
    "_meta": {
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientInfo": { "name": "example", "version": "1.0.0" },
      "io.modelcontextprotocol/clientCapabilities": {}
    }
  }
}
```

Send it by POST with `Accept: application/json, text/event-stream`,
`Content-Type: application/json`, and the matching `MCP-Protocol-Version`
header. Tool results include `structuredContent`, `decision`, `reasonCodes`,
and `message`; tool failures are returned with `isError: true`.

## Reason codes

Reason codes explain why deterministic policy or the fail-closed AI stage
reached a decision. Correct the underlying request or mandate issue and submit
a new request with a new idempotency key where appropriate.

| Code | Meaning / next step |
| --- | --- |
| `AI_UNAVAILABLE` | AI could not safely evaluate the proposal; review it in the approval inbox |
| `AI_HIGH_RISK` | AI risk exceeded the configured rejection threshold; correct invoice/request facts |
| `AI_INTENT_MISMATCH` | Proposal does not match the mandate intent; align the request with its purpose |
| `AI_INJECTION_SUSPECTED` | Document or supplied data may contain instructions; manually verify the source |
| `AI_ANOMALY` | AI reported an anomaly; review the request and supporting invoice |
| `DUPLICATE_SUSPECTED` | Matching invoice/payee request detected; verify whether it was already submitted |
| `RATE_LIMITED` | Agent or demo quota exceeded; wait for the applicable rate window |
| `BUDGET_EXCEEDED` | Active mandate budget is insufficient; request a permitted amount or budget change |
| `MANDATE_INACTIVE` | No active mandate applies to this agent; ask an administrator to activate one |
| `MANDATE_EXPIRED` | Mandate validity dates have passed; ask an administrator to renew it |
| `ACTION_NOT_ALLOWED` | Requested action is not enabled by the mandate; use an allowed action |
| `CURRENCY_NOT_ALLOWED` | Currency differs from the mandate; submit in its configured currency |
| `CAP_EXCEEDED` | Amount exceeds the per-transaction cap; lower the amount or request a policy change |
| `PAYEE_BLOCKED` | Payee is blocked; ask an administrator to review its status |
| `PAYEE_NOT_ALLOWED` | Payee is outside the allowlist; ask an administrator to update the mandate |
| `PAYEE_NEW` | Payee needs human approval; ask an administrator to review the payee |
| `PAYEE_CHANGED` | Payee details changed recently; verify the recipient and wait for review |
| `OUTSIDE_TIME_WINDOW` | Request is outside the mandate schedule; retry during allowed hours |
| `VELOCITY_EXCEEDED` | A request or payee velocity limit was exceeded; wait for its rate window |
| `INVOICE_REQUIRED` | The mandate requires an invoice; upload a supported document and retry |
| `INVOICE_MISMATCH_AMOUNT` | Invoice amount or currency differs from the request; correct the proposal |
| `INVOICE_PAYEE_MISMATCH` | Extracted invoice payee differs from the registered payee; verify both |
| `DOC_INJECTION_SUSPECTED` | Document needs review for suspicious instructions; verify its source manually |
| `AMOUNT_REQUIRES_APPROVAL` | Amount needs approval under policy; submit and wait for an authorized approver |
| `ORG_FROZEN` | Organization is frozen; contact an administrator before retrying |
| `AGENT_DISABLED` | Agent is disabled; ask an administrator to re-enable it |

Run the dependency-free example with Node 22:

```bash
set JOBENPAY_URL=http://localhost:3000
set JOBENPAY_AGENT_KEY=jp_sbx_...
node examples/agent-client.js --payee-id <uuid> --amount-minor 1500 --currency USD
node examples/agent-client.js --mcp --payee-id <uuid> --amount-minor 1500 --currency USD
```
