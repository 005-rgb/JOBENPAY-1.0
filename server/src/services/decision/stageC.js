import { performance } from 'node:perf_hooks';

import { env } from '../../config.js';
import { generateStructured } from '../../ai/index.js';
import { AiError } from '../../ai/errors.js';
import {
  intentCheckSchema,
  PROMPT_VERSION,
} from '../../ai/prompts/intentCheck.js';
import { maskIdentifiers } from '../../ai/prompts/shared.js';

function getAiReasonCodes(result, policy) {
  const reasonCodes = [];
  if (result.riskScore >= policy.ai.blockOnRiskAtOrAbove) reasonCodes.push('AI_HIGH_RISK');
  if (result.intentMatch !== 'MATCH') reasonCodes.push('AI_INTENT_MISMATCH');
  if (result.injectionSuspected) reasonCodes.push('AI_INJECTION_SUSPECTED');
  if (result.riskScore >= policy.ai.escalateOnRiskAtOrAbove || result.anomalies.length) {
    reasonCodes.push('AI_ANOMALY');
  }
  return [...new Set(reasonCodes)];
}

export async function evaluateStageC({
  request,
  context,
  orgId,
  generate = generateStructured,
  now = () => performance.now(),
}) {
  if (!context.policy?.ai?.intentCheck) return null;

  const input = {
    mandatePurpose: context.version?.purpose_text ?? context.policy.purpose,
    invoiceFacts: context.document?.status === 'EXTRACTED' ? {
      payeeName: context.extraction?.payee_name ? '[MASKED INVOICE PAYEE]' : null,
      invoiceNumber: context.extraction?.invoice_number ? '[MASKED INVOICE NUMBER]' : null,
      amountMinor: context.extraction?.amount_minor ?? null,
      currency: context.extraction?.currency ?? null,
    } : null,
    requestFacts: {
      action: request.action,
      amountMinor: String(request.amount_minor),
      currency: request.currency,
      payeeName: context.payee ? '[MASKED PAYEE]' : '[UNKNOWN PAYEE]',
    },
    history: {
      requestsLastHour: context.history?.requestsLastHour ?? 0,
      payeePayoutsToday: context.history?.payeePayoutsToday ?? 0,
      duplicate: Boolean(context.history?.duplicate),
      payeeChanges30Days: context.history?.payeeChanges30Days ?? 0,
    },
    agentReason: request.agent_reason ?? '',
  };
  const startedAt = now();

  try {
    const result = await generate({
      task: 'intentCheck',
      schema: intentCheckSchema,
      input,
      orgId,
    });
    const reasonCodes = getAiReasonCodes(result, context.policy);
    return {
      decision: result.riskScore >= context.policy.ai.blockOnRiskAtOrAbove
        ? 'REJECT'
        : reasonCodes.length ? 'REQUIRE_APPROVAL' : 'AUTO_APPROVE',
      reasonCodes,
      riskScore: result.riskScore,
      anomalies: result.anomalies.map((anomaly) => maskIdentifiers(anomaly)),
      intentMatch: result.intentMatch,
      injectionSuspected: result.injectionSuspected,
      explanation: maskIdentifiers(result.explanation),
      aiModel: env.AI_MODEL || env.AI_PROVIDER,
      promptVersion: PROMPT_VERSION,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
    };
  } catch (error) {
    if (!(error instanceof AiError)) throw error;
    return {
      decision: 'REQUIRE_APPROVAL',
      reasonCodes: ['AI_UNAVAILABLE'],
      riskScore: null,
      anomalies: [],
      intentMatch: null,
      injectionSuspected: false,
      explanation: null,
      aiError: error.kind,
      aiModel: env.AI_MODEL || env.AI_PROVIDER,
      promptVersion: PROMPT_VERSION,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
    };
  }
}
