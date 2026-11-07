/**
 * shared/policy-rules.js
 * Rule Registry & Multi-Category Policy Evaluation Engine (PRD-R §5 / BW-05).
 */

const ruleRegistry = new Map();

export function registerRule({ code, categories = ['*'], subTypes = ['*'], stage = 'A', evaluate }) {
  if (!code || typeof evaluate !== 'function') {
    throw new Error('registerRule requires code and evaluate function.');
  }
  ruleRegistry.set(code, {
    code,
    categories,
    subTypes,
    stage,
    evaluate,
  });
}

export function getRegisteredRules(stage = 'A', category = '*', subType = '*') {
  const matches = [];
  for (const rule of ruleRegistry.values()) {
    if (stage && rule.stage !== stage) continue;
    const catMatch = rule.categories.includes('*') || rule.categories.includes(category);
    const subMatch = rule.subTypes.includes('*') || rule.subTypes.includes(subType);
    if (catMatch && subMatch) {
      matches.push(rule);
    }
  }
  return matches;
}

export function evaluateRegisteredRules(ctx, category = 'PAYOUT', subType = 'standard', stage = 'A') {
  const rules = getRegisteredRules(stage, category, subType);
  const failures = [];

  for (const rule of rules) {
    try {
      const outcome = rule.evaluate(ctx);
      if (outcome && !outcome.ok) {
        failures.push({
          code: outcome.code || rule.code,
          detail: outcome.detail || outcome.message || 'Rule check failed.',
          rule: rule.code,
        });
      }
    } catch (err) {
      failures.push({
        code: rule.code,
        detail: err.message,
        rule: rule.code,
      });
    }
  }

  return {
    ok: failures.length === 0,
    failures,
  };
}

// -----------------------------------------------------------------------------
// Register Universal Stage A Rules
// -----------------------------------------------------------------------------

registerRule({
  code: 'A1_ORG_FROZEN',
  stage: 'A',
  evaluate: (ctx) => {
    return ctx.org?.frozen_at || ctx.org?.frozenAt
      ? { ok: false, code: 'ORG_FROZEN', detail: 'Organization is frozen.' }
      : { ok: true };
  },
});

registerRule({
  code: 'A2_AGENT_ACTIVE',
  stage: 'A',
  evaluate: (ctx) => {
    return ctx.agent?.status === 'ACTIVE'
      ? { ok: true }
      : { ok: false, code: 'AGENT_DISABLED', detail: 'Agent is disabled.' };
  },
});

registerRule({
  code: 'A3_MANDATE_ACTIVE',
  stage: 'A',
  evaluate: (ctx) => {
    if (!ctx.mandate || ctx.mandate.status !== 'ACTIVE') {
      return { ok: false, code: 'MANDATE_INACTIVE', detail: 'Mandate is inactive.' };
    }
    const from = new Date(ctx.version?.valid_from ?? ctx.version?.validFrom);
    const to = new Date(ctx.version?.valid_to ?? ctx.version?.validTo);
    const now = ctx.now ?? new Date();
    if (!ctx.version || now < from || now > to) {
      return { ok: false, code: 'MANDATE_EXPIRED', detail: 'Mandate has expired.' };
    }
    return { ok: true };
  },
});

registerRule({
  code: 'A4b_CATEGORY_ALLOWED',
  stage: 'A',
  evaluate: (ctx) => {
    const policy = ctx.policy;
    const category = ctx.category ?? ctx.request?.category ?? ctx.action ?? 'PAYOUT';
    if (!policy) return { ok: true };

    const allowedCats = policy.allowedCategories || (policy.allowedActions?.map((a) => a === 'ACCEPT_DISPUTE' ? 'DISPUTE' : a) ?? ['PAYOUT']);
    if (!allowedCats.includes(category)) {
      return { ok: false, code: 'CATEGORY_NOT_ALLOWED', detail: `Category ${category} is not allowed by this mandate.` };
    }
    return { ok: true };
  },
});

export { ruleRegistry };
