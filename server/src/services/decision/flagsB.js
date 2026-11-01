function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const pairs = (value) => {
    const output = new Map();
    for (let index = 0; index < value.length - 1; index += 1) {
      const pair = value.slice(index, index + 2);
      output.set(pair, (output.get(pair) || 0) + 1);
    }
    return output;
  };
  const left = pairs(a);
  const right = pairs(b);
  let overlap = 0;
  for (const [pair, count] of left) overlap += Math.min(count, right.get(pair) || 0);
  return (2 * overlap) / (Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0));
}

export function flagB1PayeeNew({ payee }) {
  return payee?.trust !== 'TRUSTED' || payee?.allowed === false
    ? { code: 'PAYEE_NEW', detail: 'Payee is not trusted or is outside the allowlist.' } : null;
}

export function flagB2PayeeChanged({ history = {} }) {
  return Number(history.payeeChanges30Days || 0) > 0
    ? { code: 'PAYEE_CHANGED', detail: 'Payee details changed recently.' } : null;
}

export function flagB3InvoicePayeeMismatch({ payee, extraction }) {
  if (!payee || !extraction?.payee_name) return null;
  return dice(normalize(payee.display_name), normalize(extraction.payee_name)) >= 0.8
    ? null
    : { code: 'INVOICE_PAYEE_MISMATCH', detail: 'Invoice payee does not match the registered payee.' };
}

export function flagB4AmountApproval({ amountMinor, policy }) {
  return BigInt(amountMinor) >= BigInt(policy.autoApproveBelowMinor)
    ? { code: 'AMOUNT_REQUIRES_APPROVAL', detail: 'Amount meets the approval threshold.' } : null;
}

export function flagB5DocumentInjection({ document }) {
  const flags = document?.injection_flags ?? document?.injectionFlags;
  return Array.isArray(flags) && flags.length
    ? { code: 'DOC_INJECTION_SUSPECTED', detail: 'Document contains injection indicators.' } : null;
}

export const FLAGS_B = Object.freeze([
  ['B1', flagB1PayeeNew],
  ['B2', flagB2PayeeChanged],
  ['B3', flagB3InvoicePayeeMismatch],
  ['B4', flagB4AmountApproval],
  ['B5', flagB5DocumentInjection],
]);

export { dice, normalize };
