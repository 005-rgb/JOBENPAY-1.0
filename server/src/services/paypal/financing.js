/**
 * server/src/services/paypal/financing.js
 * Provider Adapter for FINANCING (Tier C, AD-17, B-F6)
 *
 * Implements ProviderAdapter delegating to PartnerSimulatorProvider
 * Output metadata always includes `provider: "simulated"`.
 */

import { PartnerSimulatorProvider } from '../partnerSimulator.js';

export async function underwriteFacility({
  facilityType,
  principalAmountMinor,
  collateralValueMinor,
  tenorMonths,
  counterpartyHistoryCount = 3,
  interestBps = 1200,
}) {
  return PartnerSimulatorProvider.underwrite({
    facilityType,
    principalAmountMinor,
    collateralValueMinor,
    tenorMonths,
    counterpartyHistoryCount,
    interestBps,
  });
}

export async function executeFinancingDisbursement(client, {
  intentId,
  principalAmountMinor,
  adminFeeMinor,
  currency = 'USD',
  recipientRef,
}) {
  const result = await PartnerSimulatorProvider.disburse({
    intentId,
    principalAmountMinor,
    adminFeeMinor,
    currency,
    recipientRef,
  });

  return {
    outcome: result.outcome,
    provider: result.provider,
    providerRefs: result.providerRefs,
    netDisbursedMinor: result.netDisbursedMinor,
    principalAmountMinor: result.principalAmountMinor,
    adminFeeMinor: result.adminFeeMinor,
  };
}

export async function executeFinancingRepayment(client, {
  intentId,
  cycleNumber,
  amountMinor,
  currency = 'USD',
}) {
  const result = await PartnerSimulatorProvider.repayCycle({
    intentId,
    cycleNumber,
    amountMinor,
    currency,
  });

  return {
    outcome: result.outcome,
    provider: result.provider,
    providerRefs: result.providerRefs,
    cycleNumber: result.cycleNumber,
    amountMinor: result.amountMinor,
  };
}

export async function executeFinancingSettlement(client, {
  intentId,
  totalRepaidMinor,
  totalObligationMinor,
  currency = 'USD',
}) {
  const result = await PartnerSimulatorProvider.settle({
    intentId,
    totalRepaidMinor,
    totalObligationMinor,
    currency,
  });

  return {
    outcome: result.outcome,
    provider: result.provider,
    providerRefs: result.providerRefs,
    totalRepaidMinor: result.totalRepaidMinor,
  };
}

export default {
  underwriteFacility,
  executeFinancingDisbursement,
  executeFinancingRepayment,
  executeFinancingSettlement,
};

