import { maskIdentifiers } from '../ai/prompts/shared.js';

const INSTRUCTION_PATTERNS = [
  // 1. Prompt Overrides
  ['PROMPT_OVERRIDE', /\bignore\s+(?:all\s+)?previous(?:\s+instructions?|\s+prompts?|\s+rules?|\s+directions?|\s+guidelines?)?\b/gi],
  ['PROMPT_OVERRIDE', /\bdisregard\b/gi],
  ['PROMPT_OVERRIDE', /\boverride\b/gi],
  ['PROMPT_OVERRIDE', /\bbypass\s+(?:all\s+)?(?:safety|security|approval|policy|verification|checks?)\b/gi],
  ['PROMPT_OVERRIDE', /\bforget\s+(?:all\s+)?(?:everything|prior\s+instructions?|system\s+rules?)\b/gi],

  // 2. Prompt References & System Mentions
  ['PROMPT_REFERENCE', /\bsystem\s+prompt\b/gi],
  ['PROMPT_REFERENCE', /\bdeveloper\s+mode\b/gi],

  // 3. Role Manipulation & Jailbreaks
  ['ROLE_MANIPULATION', /\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(?:in\s+)?(?:developer|dan|jailbreak|unrestricted|god|root|admin)\s*(?:mode)?\b/gi],
  ['ROLE_MANIPULATION', /\bnew\s+role\s*:\s*/gi],
  ['ROLE_MANIPULATION', /\bjailbreak\b/gi],
  ['ROLE_MANIPULATION', /\bdo\s+anything\s+now\b/gi],
  ['ROLE_MANIPULATION', /\bunrestricted\s+assistant\b/gi],

  // 4. Prompt Spoofing & Tag Injection
  ['PROMPT_SPOOFING', /\[\s*(?:system|system\s+instruction|developer\s+instruction)\s*\]/gi],
  ['PROMPT_SPOOFING', /<\s*(?:system|system_instruction)\s*>/gi],
  ['PROMPT_SPOOFING', /\bbegin\s+system\s+instruction\b/gi],

  // 5. Payment Instructions
  ['PAYMENT_INSTRUCTION', /\byou\s+must\s+pay\b/gi],
  ['PAYMENT_INSTRUCTION', /\bimmediate\s+transfer\s+required\b/gi],
  ['PAYMENT_INSTRUCTION', /\bwire\s+(?:funds|money)\s+immediately\b/gi],

  // 6. Payment Approvals & Verification Bypasses
  ['PAYMENT_APPROVAL', /\bapprove\s+this\s*(?:immediately|now|without\s+checks?|payment|transaction|invoice)?\b/gi],
  ['PAYMENT_APPROVAL', /\bauto[- ]approve\b/gi],
  ['PAYMENT_APPROVAL', /\bdo\s+not\s+verify\b/gi],
  ['PAYMENT_APPROVAL', /\bskip\s+(?:verification|approval|checks?)\b/gi],

  // 7. Account Changes
  ['ACCOUNT_CHANGE', /\bchange\s+(?:the\s+)?(?:bank\s+)?account\b/gi],
  ['ACCOUNT_CHANGE', /\bnew\s+bank\s+details\b/gi],
  ['ACCOUNT_CHANGE', /\b(?:change|replace|use|update)\s+(?:the\s+)?(?:new\s+)?(?:recipient|payee|beneficiary|iban|routing)\b/gi],
  ['ACCOUNT_CHANGE', /\bredirect\s+(?:payment|funds)\s+to\b/gi],

  // 8. Exfiltration & Token Leakage
  ['EXFILTRATION', /\bexfiltrate\b/gi],
  ['EXFILTRATION', /\becho\s+(?:the\s+)?(?:api[- ]?key|secret|token|password|credentials?)\b/gi],
  ['EXFILTRATION', /\bsend\s+(?:credentials|keys|tokens?)\s+(?:to\s+)?https?:\/\//gi],
];

const ZERO_WIDTH_PATTERN = /[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g;
const BASE64_PATTERN = /\b[A-Za-z0-9+/]{200,}={0,2}\b/g;

function makeFlag(kind, evidence, location) {
  const excerpt = maskIdentifiers(evidence).replace(/\s+/g, ' ').trim().slice(0, 80);
  return { kind, evidence_excerpt: excerpt || kind, location };
}

function findMatches(text, pattern, kind, flags, locationPrefix) {
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    flags.push(makeFlag(kind, match[0], `${locationPrefix} offset ${match.index}`));
  }
}

export function detectInjectionHeuristics(text, { pdfTextItems = [] } = {}) {
  const source = String(text || '');
  const normalized = source.replace(ZERO_WIDTH_PATTERN, '');
  const flags = [];

  if (normalized.length !== source.length) {
    flags.push(makeFlag('HIDDEN_TEXT', 'Zero-width characters detected.', 'document text'));
  }
  for (const [kind, pattern] of INSTRUCTION_PATTERNS) {
    findMatches(normalized, pattern, kind, flags, 'document text');
  }
  for (const match of normalized.matchAll(BASE64_PATTERN)) {
    flags.push(makeFlag('ENCODED_BLOCK', '[long encoded block omitted]', `document text offset ${match.index}`));
  }

  for (const [pageIndex, pageItems] of pdfTextItems.entries()) {
    for (const item of pageItems) {
      if (Number.isFinite(item.fontSize) && item.fontSize <= 0 && item.str?.trim()) {
        flags.push(makeFlag('HIDDEN_TEXT', item.str, `PDF page ${pageIndex + 1}, zero-size text`));
      }
    }
  }

  const unique = new Map();
  for (const flag of flags) {
    const key = `${flag.kind}\n${flag.evidence_excerpt}\n${flag.location}`;
    if (!unique.has(key)) unique.set(key, flag);
  }
  return [...unique.values()].slice(0, 50);
}

export function mergeInjectionFlags(heuristicFlags, aiResult) {
  const combined = [...heuristicFlags];
  if (aiResult?.injectionSuspected) {
    for (const reason of aiResult.reasons || []) {
      combined.push(makeFlag('AI_SUSPECTED', reason, 'AI document review'));
    }
    if (!aiResult.reasons?.length) {
      combined.push(makeFlag('AI_SUSPECTED', 'AI identified possible document injection.', 'AI document review'));
    }
  }
  return combined.slice(0, 50);
}

export default {
  detectInjectionHeuristics,
  mergeInjectionFlags,
};
