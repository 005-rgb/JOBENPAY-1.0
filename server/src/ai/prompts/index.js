import {
  buildExtractInvoicePrompt,
  extractInvoiceSchema,
  PROMPT_VERSION as EXTRACT_INVOICE_VERSION,
} from './extractInvoice.js';
import {
  buildInjectionCheckPrompt,
  injectionCheckSchema,
  PROMPT_VERSION as INJECTION_CHECK_VERSION,
} from './injectionCheck.js';
import {
  buildMandateDraftPrompt,
  policySchema as mandatePolicySchema,
  PROMPT_VERSION as MANDATE_DRAFT_VERSION,
} from './mandateDraft.js';

export const PROMPTS = Object.freeze({
  extractInvoice: {
    buildPrompt: buildExtractInvoicePrompt,
    schema: extractInvoiceSchema,
    version: EXTRACT_INVOICE_VERSION,
  },
  injectionCheck: {
    buildPrompt: buildInjectionCheckPrompt,
    schema: injectionCheckSchema,
    version: INJECTION_CHECK_VERSION,
  },
  mandateDraft: {
    buildPrompt: buildMandateDraftPrompt,
    schema: mandatePolicySchema,
    version: MANDATE_DRAFT_VERSION,
  },
});
