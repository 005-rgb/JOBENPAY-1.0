/**
 * server/src/services/partnerSimulator.js
 * Deterministic PartnerSimulatorProvider for Tier C (FINANCING & DEBIT)
 * PRD 1.3 §3–§8, AD-17, B-F6 (WP F6-0)
 *
 * Rules:
 * - Deterministic rule-based underwriting (PO LTV <= 7000 bps, Invoice LTV <= 8000 bps, tenor <= 6 months, CP history >= 3).
 * - Exact BigInt amortization schedule (residue in final month, waterfall: fee -> interest -> principal).
 * - Failure injection for testability (INSUFFICIENT_FUNDS, AUTH_REVOKED, ACCOUNT_CLOSED, etc.).
 * - Every output carries `provider: "simulated"`.
 * - Zero network calls.
 */

import { mulBpsFloor } from '../../../shared/money.js';
import { AppError } from '../lib/errors.js';

// In-memory failure injection registry
const failureInjections = new Map();

export const PartnerSimulatorProvider = {
  name: 'PartnerSimulatorProvider',
  provider: 'simulated',

  /**
   * Inject failure for tests: simulator.inject({ category, step, failure })
   */
  inject({ category, step, failure }) {
    if (!category || !step || !failure) {
      throw new Error('inject requires category, step, and failure code');
    }
    const key = `${String(category).toUpperCase()}:${String(step).toLowerCase()}`;
    failureInjections.set(key, failure);
  },

  /**
   * Clear all failure injections
   */
  clearInjections() {
    failureInjections.clear();
  },

  /**
   * Check if a failure is injected for category & step
   */
  getInjectedFailure(category, step) {
    const key = `${String(category).toUpperCase()}:${String(step).toLowerCase()}`;
    return failureInjections.get(key) || null;
  },

  /**
   * Deterministic Underwriting for FINANCING (PO & Invoice)
   */
  underwrite({
    facilityType,
    principalAmountMinor,
    collateralValueMinor,
    tenorMonths,
    counterpartyHistoryCount = 3,
    interestBps = 1200,
  }) {
    const injected = this.getInjectedFailure('FINANCING', 'underwrite');
    if (injected) {
      return {
        provider: 'simulated',
        outcome: 'REJECTED',
        reasonCode: injected,
        schedule: null,
      };
    }

    const type = String(facilityType).toUpperCase();
    const principal = BigInt(principalAmountMinor);
    const collateral = BigInt(collateralValueMinor);
    const tenor = parseInt(String(tenorMonths), 10);
    const cpHistory = parseInt(String(counterpartyHistoryCount), 10);
    const intBps = BigInt(interestBps);

    // 1. Tenor Cap (maximum 6 months / 180 days)
    if (tenor < 1 || tenor > 6) {
      return {
        provider: 'simulated',
        outcome: 'REJECTED',
        reasonCode: 'TENOR_TOO_LONG',
        detail: `Tenor of ${tenor} months exceeds maximum limit of 6 months (180 days).`,
        schedule: null,
      };
    }

    // 2. Counterparty track record (minimum 3 completed transactions)
    if (cpHistory < 3) {
      return {
        provider: 'simulated',
        outcome: 'REJECTED',
        reasonCode: 'COUNTERPARTY_INSUFFICIENT_HISTORY',
        detail: `Counterparty has only ${cpHistory} prior transactions (minimum 3 required).`,
        schedule: null,
      };
    }

    // 3. LTV Cap (PO: 70% = 7000 bps, Invoice: 80% = 8000 bps)
    const maxLtvBps = type === 'PO' ? 7000n : 8000n;
    const maxPrincipal = (collateral * maxLtvBps) / 10000n;
    if (principal > maxPrincipal) {
      return {
        provider: 'simulated',
        outcome: 'REJECTED',
        reasonCode: 'UNDERWRITING_LTV_EXCEEDED',
        detail: `Requested principal ${principal} exceeds max LTV of ${maxLtvBps / 100n}% (${maxPrincipal}).`,
        schedule: null,
      };
    }

    // 4. Calculations (BigInt minor units)
    // Admin fee: floor(principal * 150 / 10000) = 1.5%
    const adminFeeMinor = mulBpsFloor(principal, 150);
    // Interest total: floor(principal * interestBps * tenorMonths / (10000 * 12))
    const totalInterestMinor = (principal * intBps * BigInt(tenor)) / 120000n;
    const totalObligationMinor = principal + adminFeeMinor + totalInterestMinor;

    // Amortization Schedule (N months)
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

      // Waterfall allocation: Admin Fee -> Interest -> Principal
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
      provider: 'simulated',
      outcome: 'APPROVED',
      principalAmountMinor: principal.toString(),
      adminFeeMinor: adminFeeMinor.toString(),
      totalInterestMinor: totalInterestMinor.toString(),
      totalObligationMinor: totalObligationMinor.toString(),
      tenorMonths: tenor,
      schedule: installments,
    };
  },

  /**
   * Disbursement of Approved Financing
   */
  async disburse({ intentId, principalAmountMinor, adminFeeMinor, currency = 'USD' }) {
    const injected = this.getInjectedFailure('FINANCING', 'disburse');
    if (injected) {
      throw new AppError(injected, `Simulated financing disbursement failure: ${injected}`);
    }

    const principal = BigInt(principalAmountMinor);
    const adminFee = BigInt(adminFeeMinor);
    const netDisbursedMinor = principal - adminFee;

    return {
      provider: 'simulated',
      outcome: 'SUCCESS',
      intentId,
      currency,
      principalAmountMinor: principal.toString(),
      adminFeeMinor: adminFee.toString(),
      netDisbursedMinor: netDisbursedMinor.toString(),
      providerRefs: {
        disbursementRef: `sim_disb_${intentId}`,
        timestamp: new Date().toISOString(),
      },
    };
  },

  /**
   * Repayment installment for Financing
   */
  async repayCycle({ intentId, cycleNumber, amountMinor, currency = 'USD' }) {
    const injected = this.getInjectedFailure('FINANCING', 'repay');
    if (injected) {
      throw new AppError(injected, `Simulated financing repayment failure: ${injected}`);
    }

    return {
      provider: 'simulated',
      outcome: 'SUCCESS',
      intentId,
      cycleNumber,
      amountMinor: BigInt(amountMinor).toString(),
      currency,
      providerRefs: {
        repaymentRef: `sim_repay_${intentId}_c${cycleNumber}`,
        timestamp: new Date().toISOString(),
      },
    };
  },

  /**
   * Settlement / Pelunasan of Financing
   */
  async settle({ intentId, totalRepaidMinor, totalObligationMinor, currency = 'USD' }) {
    const repaid = BigInt(totalRepaidMinor);
    const obligation = BigInt(totalObligationMinor);

    if (repaid !== obligation) {
      throw new AppError(
        'SETTLEMENT_AMOUNT_MISMATCH',
        `Cannot settle financing: repaid amount ${repaid} does not equal obligation ${obligation}.`
      );
    }

    return {
      provider: 'simulated',
      outcome: 'SUCCESS',
      intentId,
      totalRepaidMinor: repaid.toString(),
      currency,
      providerRefs: {
        settlementRef: `sim_settle_${intentId}`,
        settledAt: new Date().toISOString(),
      },
    };
  },

  /**
   * Process Direct Debit Penarikan Langsung
   */
  async processDebit({
    intentId,
    authId,
    amountMinor,
    currency = 'USD',
    authorization,
  }) {
    // 1. Check failure injection
    const injected = this.getInjectedFailure('DEBIT', 'debit');
    if (injected) {
      return {
        provider: 'simulated',
        outcome: 'FAILED',
        failureCode: injected,
        detail: `Simulated debit rejection: ${injected}`,
      };
    }

    // 2. Validate authorization if provided
    if (authorization) {
      if (authorization.status !== 'ACTIVE') {
        return {
          provider: 'simulated',
          outcome: 'FAILED',
          failureCode: 'AUTH_REVOKED',
          detail: `Debit authorization is not active (status: ${authorization.status}).`,
        };
      }

      if (authorization.valid_until && new Date(authorization.valid_until).getTime() < Date.now()) {
        return {
          provider: 'simulated',
          outcome: 'FAILED',
          failureCode: 'AUTH_EXPIRED',
          detail: 'Debit authorization has expired.',
        };
      }

      const requestedAmount = BigInt(amountMinor);
      const maxAllowed = BigInt(authorization.max_amount_minor);
      if (requestedAmount > maxAllowed) {
        return {
          provider: 'simulated',
          outcome: 'FAILED',
          failureCode: 'CAP_EXCEEDED',
          detail: `Requested debit amount ${requestedAmount} exceeds authorized limit ${maxAllowed}.`,
        };
      }
    }

    return {
      provider: 'simulated',
      outcome: 'SUCCESS',
      intentId,
      authId,
      amountMinor: BigInt(amountMinor).toString(),
      currency,
      providerRefs: {
        debitRef: `sim_deb_${intentId}`,
        timestamp: new Date().toISOString(),
      },
    };
  },
};

export default PartnerSimulatorProvider;
