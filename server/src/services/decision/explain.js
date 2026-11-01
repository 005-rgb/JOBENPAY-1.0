const TEMPLATES = Object.freeze({
  ORG_FROZEN: 'The organization is frozen.',
  AGENT_DISABLED: 'The payment agent is disabled.',
  MANDATE_INACTIVE: 'No active mandate applies to this agent.',
  MANDATE_EXPIRED: 'The mandate is outside its validity period.',
  ACTION_NOT_ALLOWED: 'This action is not allowed by the mandate.',
  CURRENCY_NOT_ALLOWED: 'The request currency does not match the mandate.',
  VALIDATION_FAILED: 'The payment amount is invalid.',
  CAP_EXCEEDED: 'The amount exceeds the mandate cap.',
  NOT_FOUND: 'The payee was not found in this organization.',
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
  AI_HIGH_RISK: 'AI identified a high-risk request.',
  AI_INTENT_MISMATCH: 'AI found that the request does not clearly match the mandate intent.',
  AI_INJECTION_SUSPECTED: 'AI detected possible instruction injection.',
  AI_ANOMALY: 'AI identified an unusual request pattern.',
  AI_UNAVAILABLE: 'AI review was unavailable; human approval is required.',
});

const PRIORITY = [
  'ORG_FROZEN', 'AGENT_DISABLED', 'MANDATE_INACTIVE', 'MANDATE_EXPIRED', 'ACTION_NOT_ALLOWED',
  'CURRENCY_NOT_ALLOWED', 'VALIDATION_FAILED', 'CAP_EXCEEDED', 'NOT_FOUND', 'PAYEE_BLOCKED',
  'PAYEE_NOT_ALLOWED', 'TARGET_INVALID', 'OUTSIDE_TIME_WINDOW', 'VELOCITY_EXCEEDED',
  'DUPLICATE_SUSPECTED', 'INVOICE_REQUIRED', 'INVOICE_MISMATCH_AMOUNT', 'BUDGET_EXCEEDED',
  'PAYEE_NEW', 'PAYEE_CHANGED', 'INVOICE_PAYEE_MISMATCH', 'AMOUNT_REQUIRES_APPROVAL',
  'DOC_INJECTION_SUSPECTED', 'AI_HIGH_RISK', 'AI_INTENT_MISMATCH', 'AI_INJECTION_SUSPECTED',
  'AI_ANOMALY', 'AI_UNAVAILABLE',
];

export function explainReasonCodes(reasonCodes = [], aiNote = null) {
  const unique = [...new Set(reasonCodes)].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const safeNote = typeof aiNote === 'string' ? aiNote.trim().slice(0, 400) : '';
  const deterministicMessage = unique.length
    ? unique.map((code) => TEMPLATES[code] || `Request requires review (${code}).`).join(' ')
    : 'Request meets the mandate rules.';
  return {
    message: safeNote ? `${deterministicMessage}\nAI note: ${safeNote}` : deterministicMessage,
    reasonCodes: unique,
  };
}

export const reasonTemplate = TEMPLATES;
