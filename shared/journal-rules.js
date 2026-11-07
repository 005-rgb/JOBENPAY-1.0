/**
 * shared/journal-rules.js
 * PRD-R §7 as data: ruleId, primitive/event, debit[], credit[], legs.
 * Re-exports LEDGER_RULES and provides structured journal rules mapping.
 */

import { LEDGER_RULES } from './ledger-rules.js';

export const JOURNAL_RULES = Object.freeze({
  ...LEDGER_RULES,
});

export { LEDGER_RULES };
export default JOURNAL_RULES;
