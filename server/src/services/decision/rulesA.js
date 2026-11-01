const fail = (code, detail) => ({ ok: false, code, detail });
const pass = (detail = 'ok') => ({ ok: true, detail });

export function ruleA1OrgFrozen({ org }) {
  return org?.frozen_at || org?.frozenAt ? fail('ORG_FROZEN', 'Organization is frozen.') : pass();
}

export function ruleA2AgentActive({ agent }) {
  return agent?.status === 'ACTIVE' ? pass() : fail('AGENT_DISABLED', 'Agent is not active.');
}

export function ruleA3MandateActive({ mandate, version, now = new Date() }) {
  if (!mandate || mandate.status !== 'ACTIVE') return fail('MANDATE_INACTIVE', 'No active mandate exists for this agent.');
  const from = new Date(version?.valid_from ?? version?.validFrom);
  const to = new Date(version?.valid_to ?? version?.validTo);
  if (!version || now < from || now > to) return fail('MANDATE_EXPIRED', 'Mandate is outside its validity window.');
  return pass();
}

export function ruleA4ActionAllowed({ action, policy }) {
  if (action !== 'PAYOUT') return fail('ACTION_NOT_ALLOWED', 'Only PAYOUT is enabled in Tier A.');
  if (!policy) return pass('Mandate policy is unavailable because A3 already failed.');
  return policy.allowedActions?.includes(action)
    ? pass()
    : fail('ACTION_NOT_ALLOWED', 'PAYOUT is not allowed by the mandate.');
}

export function ruleA5CurrencyAllowed({ currency, policy }) {
  if (!policy) return pass('Mandate policy is unavailable because A3 already failed.');
  return currency === policy?.currency
    ? pass()
    : fail('CURRENCY_NOT_ALLOWED', 'Request currency does not match the mandate budget.');
}

export function ruleA6Cap({ amountMinor, policy }) {
  let amount;
  try { amount = BigInt(amountMinor); } catch { return fail('VALIDATION_FAILED', 'Amount must be an integer minor value.'); }
  if (amount <= 0n) return fail('VALIDATION_FAILED', 'Amount must be positive.');
  if (!policy) return pass('Mandate policy is unavailable because A3 already failed.');
  if (!policy.perTransactionCapMinor) return fail('VALIDATION_FAILED', 'A mandate transaction cap is required.');
  return amount <= BigInt(policy.perTransactionCapMinor)
    ? pass()
    : fail('CAP_EXCEEDED', 'Amount exceeds the per-transaction cap.');
}

export function ruleA7Payee({ payee, policy }) {
  if (!payee) return fail('NOT_FOUND', 'Payee was not found in this organization.');
  if (payee.trust === 'BLOCKED') return fail('PAYEE_BLOCKED', 'Payee is blocked.');
  if (!policy) return pass('Mandate policy is unavailable because A3 already failed.');
  const allowed = policy?.payees?.ids?.includes(payee.id);
  if (!allowed && policy?.allowNewPayees === false) return fail('PAYEE_NOT_ALLOWED', 'Payee is outside the mandate allowlist.');
  return pass();
}

export function ruleA8Target({ action }) {
  return pass(action === 'PAYOUT'
    ? 'Target validation is not applicable to PAYOUT.'
    : 'Tier B target validation is not enabled.');
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'short', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const weekdays = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: weekdays[parts.find((part) => part.type === 'weekday').value],
    hour: Number(parts.find((part) => part.type === 'hour').value),
  };
}

export function ruleA9Schedule({ policy, now = new Date() }) {
  if (!policy) return pass('Mandate policy is unavailable because A3 already failed.');
  if (!policy.schedule?.timezone || !Array.isArray(policy.schedule.days)) return fail('VALIDATION_FAILED', 'Mandate schedule is invalid.');
  const local = localParts(now, policy.schedule.timezone);
  return policy.schedule.days.includes(local.day)
    && local.hour >= policy.schedule.startHour
    && local.hour < policy.schedule.endHour
    ? pass()
    : fail('OUTSIDE_TIME_WINDOW', 'Request is outside the mandate schedule.');
}

export function ruleA10Velocity({ history = {}, policy }) {
  if (!policy) return pass('Mandate policy is unavailable because A3 already failed.');
  if (!policy.velocity) return fail('VALIDATION_FAILED', 'Mandate velocity limits are missing.');
  return Number(history.requestsLastHour || 0) < policy.velocity.maxRequestsPerHour
    && Number(history.payeePayoutsToday || 0) < policy.velocity.maxPayoutPerPayeePerDay
    ? pass()
    : fail('VELOCITY_EXCEEDED', 'Mandate velocity limit was exceeded.');
}

export function ruleA11Duplicate({ history = {} }) {
  return history.duplicate ? fail('DUPLICATE_SUSPECTED', 'A matching invoice request already exists.') : pass();
}

export function ruleA12Invoice({ policy, document, extraction, amountMinor, currency }) {
  if (!policy) return pass('Mandate policy is unavailable because A3 already failed.');
  if (policy?.requireInvoice && (!document || document.status !== 'EXTRACTED')) {
    return fail('INVOICE_REQUIRED', 'An extracted invoice is required.');
  }
  if (!extraction) return pass();
  const amountMismatch = BigInt(amountMinor) - BigInt(extraction.amount_minor);
  if (extraction.currency !== currency
    || (amountMismatch < 0n ? -amountMismatch : amountMismatch) > BigInt(policy.invoiceAmountToleranceMinor)) {
    return fail('INVOICE_MISMATCH_AMOUNT', 'Invoice amount or currency does not match.');
  }
  return pass();
}

export const RULES_A = Object.freeze([
  ['A1', ruleA1OrgFrozen],
  ['A2', ruleA2AgentActive],
  ['A3', ruleA3MandateActive],
  ['A4', ruleA4ActionAllowed],
  ['A5', ruleA5CurrencyAllowed],
  ['A6', ruleA6Cap],
  ['A7', ruleA7Payee],
  ['A8', ruleA8Target],
  ['A9', ruleA9Schedule],
  ['A10', ruleA10Velocity],
  ['A11', ruleA11Duplicate],
  ['A12', ruleA12Invoice],
]);
