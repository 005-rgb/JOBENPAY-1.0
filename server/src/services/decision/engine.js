import { AppError } from '../../lib/errors.js';
import { reserve } from '../budget.js';
import { FLAGS_B } from './flagsB.js';
import { explainReasonCodes } from './explain.js';
import { RULES_A } from './rulesA.js';

function safeRule(name, fn, context) {
  try {
    return fn(context);
  } catch (error) {
    if (error instanceof AppError) throw error;
    return { ok: false, code: 'VALIDATION_FAILED', detail: `${name} could not be evaluated.` };
  }
}

export async function evaluateRequest({ tx, request, context }) {
  const ruleContext = {
    ...context,
    request,
    amountMinor: request.amount_minor,
    currency: request.currency,
    action: request.action,
    payee: context.payee ? {
      ...context.payee,
      allowed: context.policy?.payees?.ids?.includes(context.payee.id),
    } : context.payee,
  };
  const failures = [];
  for (const [name, rule] of RULES_A) {
    const result = safeRule(name, rule, ruleContext);
    if (!result.ok) failures.push({ code: result.code, detail: result.detail, rule: name });
  }

  const result = {
    stageA: { ok: failures.length === 0, failures },
    stageB: { flags: [] },
    decision: 'REJECT',
    reasonCodes: failures.map((failure) => failure.code),
  };
  if (failures.length) {
    result.explanation = explainReasonCodes(result.reasonCodes);
    return result;
  }

  for (const [name, flag] of FLAGS_B) {
    const marker = safeRule(name, flag, ruleContext);
    if (marker) result.stageB.flags.push({ ...marker, rule: name });
  }
  result.reasonCodes = result.stageB.flags.map((flag) => flag.code);
  result.decision = result.reasonCodes.length ? 'REQUIRE_APPROVAL' : 'AUTO_APPROVE';
  if (tx && context.version?.id) {
    try {
      const period = await reserve(tx, context.version.id, request.amount_minor, context.now);
      result.reservation = period;
    } catch (error) {
      if (error?.code !== 'BUDGET_EXCEEDED') throw error;
      result.stageA.ok = false;
      result.stageA.failures.push({ code: 'BUDGET_EXCEEDED', detail: 'Mandate budget is exhausted.', rule: 'A13' });
      result.reasonCodes.push('BUDGET_EXCEEDED');
      result.decision = 'REJECT';
    }
  } else if (context.budget && BigInt(context.budget.remainingMinor ?? context.budget.remaining_minor ?? 0) < BigInt(request.amount_minor)) {
    result.stageA.ok = false;
    result.stageA.failures.push({ code: 'BUDGET_EXCEEDED', detail: 'Mandate budget is exhausted.', rule: 'A13' });
    result.reasonCodes.push('BUDGET_EXCEEDED');
    result.decision = 'REJECT';
  }
  result.explanation = explainReasonCodes(result.reasonCodes);
  return result;
}

export { safeRule };
