import { policySchema } from '../../../../shared/policy.schema.js';
import { sanitizeAiInput } from './shared.js';

export const PROMPT_VERSION = 'mandate-policy-v1';

export function buildMandateDraftPrompt(input) {
  const text = sanitizeAiInput(input?.purposeText || '');
  return {
    system: `You extract a mandate policy from user text. Return JSON only matching the policy schema. Never invent payee IDs; use only the supplied existing payees. Prompt version: ${PROMPT_VERSION}.`,
    user: JSON.stringify({ purposeText: text, existingPayees: input?.existingPayees || [] }),
  };
}

export { policySchema };
