/**
 * shared/financing.js
 * Shared domain logic & Zod validation schema for FINANCING (Tier C, PRD 1.3 §3, AD-17)
 */

import { z } from 'zod';
import { mulBpsFloor } from './money.js';

export const financingProposalSchema = z.object({
  facilityType: z.enum(['po', 'invoice', 'PO', 'INVOICE']),
  principalAmountMinor: z.string().regex(/^[1-9][0-9]*$/, 'Principal amount must be a positive integer minor string'),
  collateralValueMinor: z.string().regex(/^[1-9][0-9]*$/, 'Collateral value must be a positive integer minor string'),
  currency: z.string().length(3).default('USD'),
  tenorMonths: z.number().int().min(1).max(6),
  counterpartyId: z.string().uuid(),
  counterpartyHistoryCount: z.number().int().min(0).default(3),
  interestBps: z.number().int().min(0).max(10000).default(1200),
  documentRef: z.string().min(1).optional(),
});

/**
 * Calculates exact BigInt amortization schedule
 * T = P + I + A
 * Residue added to the final month.
 * Waterfall: fee -> interest -> principal.
 */
export function calculateFinancingSchedule({
  principalAmountMinor,
  tenorMonths,
  interestBps = 1200,
}) {
  const principal = BigInt(principalAmountMinor);
  const tenor = parseInt(String(tenorMonths), 10);
  const intBps = BigInt(interestBps);

  if (tenor < 1 || tenor > 6) {
    const err = new Error(`Tenor of ${tenor} months exceeds maximum allowed (6 months).`);
    err.code = 'TENOR_TOO_LONG';
    err.statusCode = 422;
    throw err;
  }

  // Admin fee: floor(principal * 150 / 10000) = 1.5%
  const adminFeeMinor = mulBpsFloor(principal, 150);
  // Total interest: (principal * interestBps * tenorMonths) / (10000 * 12)
  const totalInterestMinor = (principal * intBps * BigInt(tenor)) / 120000n;
  const totalObligationMinor = principal + adminFeeMinor + totalInterestMinor;

  const N = BigInt(tenor);
  const monthlyBase = totalObligationMinor / N;
  const residue = totalObligationMinor - (monthlyBase * N);

  const installments = [];
  let remFee = adminFeeMinor;
  let remInterest = totalInterestMinor;
  let remPrincipal = principal;

  for (let month = 1; month <= tenor; month++) {
    const isFinal = month === tenor;
    const amount = isFinal ? monthlyBase + residue : monthlyBase;

    let allocFee = 0n;
    let allocInterest = 0n;
    let allocPrincipal = 0n;
    let remainingToAllocate = amount;

    if (remFee > 0n) {
      allocFee = remainingToAllocate <= remFee ? remainingToAllocate : remFee;
      remFee -= allocFee;
      remainingToAllocate -= allocFee;
    }

    if (remainingToAllocate > 0n && remInterest > 0n) {
      allocInterest = remainingToAllocate <= remInterest ? remainingToAllocate : remInterest;
      remInterest -= allocInterest;
      remainingToAllocate -= allocInterest;
    }

    if (remainingToAllocate > 0n) {
      allocPrincipal = remainingToAllocate;
      remPrincipal -= allocPrincipal;
    }

    installments.push({
      month,
      amountMinor: amount.toString(),
      feeMinor: allocFee.toString(),
      interestMinor: allocInterest.toString(),
      principalMinor: allocPrincipal.toString(),
      status: 'PENDING',
    });
  }

  return {
    principalAmountMinor: principal.toString(),
    adminFeeMinor: adminFeeMinor.toString(),
    totalInterestMinor: totalInterestMinor.toString(),
    totalObligationMinor: totalObligationMinor.toString(),
    tenorMonths: tenor,
    schedule: installments,
  };
}

/**
 * Validates financing underwriting criteria deterministically
 */
export function validateFinancingProposal({
  facilityType,
  principalAmountMinor,
  collateralValueMinor,
  tenorMonths,
  counterpartyHistoryCount = 3,
}) {
  const type = String(facilityType).toUpperCase();
  const principal = BigInt(principalAmountMinor);
  const collateral = BigInt(collateralValueMinor);
  const tenor = parseInt(String(tenorMonths), 10);
  const cpHistory = parseInt(String(counterpartyHistoryCount), 10);

  if (tenor < 1 || tenor > 6) {
    const err = new Error(`Tenor of ${tenor} months exceeds maximum limit of 6 months.`);
    err.code = 'TENOR_TOO_LONG';
    err.statusCode = 422;
    throw err;
  }

  if (cpHistory < 3) {
    const err = new Error(`Counterparty has only ${cpHistory} prior transactions (minimum 3 required).`);
    err.code = 'COUNTERPARTY_INSUFFICIENT_HISTORY';
    err.statusCode = 422;
    throw err;
  }

  const maxLtvBps = type === 'PO' ? 7000n : 8000n;
  const maxPrincipal = (collateral * maxLtvBps) / 10000n;
  if (principal > maxPrincipal) {
    const err = new Error(`Requested principal ${principal} exceeds max LTV limit of ${maxPrincipal}.`);
    err.code = 'UNDERWRITING_LTV_EXCEEDED';
    err.statusCode = 422;
    throw err;
  }

  return true;
}

export default {
  financingProposalSchema,
  calculateFinancingSchedule,
  validateFinancingProposal,
};

