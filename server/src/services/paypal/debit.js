/**
 * server/src/services/paypal/debit.js
 * Provider Adapter for DEBIT (Tier C, AD-17, B-F6)
 *
 * Implements ProviderAdapter delegating to PartnerSimulatorProvider
 * Output metadata always includes `provider: "simulated"`.
 */

import { PartnerSimulatorProvider } from '../partnerSimulator.js';

export async function executeDirectDebit(client, {
  intentId,
  authId,
  amountMinor,
  currency = 'USD',
  authorization,
}) {
  const result = await PartnerSimulatorProvider.processDebit({
    intentId,
    authId,
    amountMinor,
    currency,
    authorization,
  });

  return {
    outcome: result.outcome,
    provider: result.provider,
    providerRefs: result.providerRefs,
    failureCode: result.failureCode,
    detail: result.detail,
    amountMinor: result.amountMinor,
  };
}

export default {
  executeDirectDebit,
};

