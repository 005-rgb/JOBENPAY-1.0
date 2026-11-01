const TEMPLATES = Object.freeze({
  ORG_FROZEN: 'The organization is frozen.',
  AGENT_DISABLED: 'The payment agent is disabled.',
  MANDATE_INACTIVE: 'No active mandate applies to this agent.',
  MANDATE_EXPIRED: 'The mandate is outside its validity period.',
  ACTION_NOT_ALLOWED: 'This action is not allowed by the mandate.',
  CURRENCY_NOT_ALLOWED: 'The request currency does not match the mandate.',
  VALIDATION_FAILED: 'The payment amount is invalid.',
  CAP_EXCEEDED: 'The amount exceeds the mandate cap.',
  PAYEE_BLOCKED: 'The payee is blocked.',
  PAYEE_NOT_ALLOWED: 'The payee is outside the mandate allowlist.',
  OUTSIDE_TIME_WINDOW: 'The request is outside the permitted schedule.',
  VELOCITY_EXCEEDED: 'A mandate velocity limit was exceeded.',
  DUPLICATE_SUSPECTED: 'A similar request was recently submitted.',
  INVOICE_REQUIRED: 'An extracted invoice is required.',
  INVOICE_MISMATCH_AMOUNT: 'The invoice amount or currency does not match.',
  BUDGET_EXCEEDED: 'The mandate budget is exhausted.',
  PAYEE_NEW: 'The payee needs approval because it is not trusted.',
  PAYEE_CHANGED: 'The payee changed recently and needs approval.',
  INVOICE_PAYEE_MISMATCH: 'The invoice payee does not match the registered payee.',
  AMOUNT_REQUIRES_APPROVAL: 'The amount requires approval.',
  DOC_INJECTION_SUSPECTED: 'The document needs review for suspicious instructions.',
});

const PRIORITY = Object.keys(TEMPLATES);

export function explainReasonCodes(reasonCodes = []) {
  const unique = [...new Set(reasonCodes)].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const message = unique.length ? unique.map((code) => TEMPLATES[code] || `Request requires review (${code}).`).join(' ') : 'Request meets the mandate rules.';
  return { message, reasonCodes: unique };
}

export const reasonTemplate = TEMPLATES;
