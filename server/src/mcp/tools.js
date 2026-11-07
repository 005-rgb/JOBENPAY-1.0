/**
 * server/src/mcp/tools.js
 * MCP tool registry and exports (PRD 1.3 §5.3, Blueprint M11)
 *
 * Supported Tools:
 * - propose_payout (PAYOUT category proposal tool)
 * - propose_sale (SALE category proposal tool)
 * - propose_refund (REFUND category proposal tool)
 * - propose_void (VOID category proposal tool)
 * - propose_partial (PARTIAL category proposal tool)
 * - propose_down_payment (DOWN_PAYMENT category proposal tool)
 * - propose_invoice (INVOICE category proposal tool)
 * - propose_dispute (DISPUTE category proposal tool)
 * - propose_scheduled (SCHEDULED category proposal tool)
 * - propose_bulk (BULK category proposal tool)
 * - propose_transfer (TRANSFER category proposal tool)
 * - propose_split (SPLIT category proposal tool)
 * - propose_recurring (RECURRING category proposal tool)
 * - propose_financing (FINANCING category proposal tool - Tier C)
 * - propose_debit (DEBIT category proposal tool - Tier C)
 * - get_request_status
 * - get_budget_status
 */

export * from '../agent/mcp.js';
export { AGENT_MCP_TOOLS as MCP_TOOLS } from '../agent/mcp.js';
