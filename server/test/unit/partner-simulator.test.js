/**
 * server/test/unit/partner-simulator.test.js
 * Unit test for PartnerSimulatorProvider (WP F6-0, Tier C, AD-17)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PartnerSimulatorProvider } from '../../src/services/partnerSimulator.js';
import { evaluateRequest } from '../../src/services/decision/engine.js';

test('PartnerSimulatorProvider Suite', async (t) => {
  t.beforeEach(() => {
    PartnerSimulatorProvider.clearInjections();
  });

  await t.test('1. Underwriting PO Financing (max 70% LTV, tenor <= 6, CP history >= 3)', () => {
    // Valid PO Financing: Collateral $100,000, Principal $70,000 (70% LTV), Tenor 3 months
    const result = PartnerSimulatorProvider.underwrite({
      facilityType: 'PO',
      principalAmountMinor: 7000000n,
      collateralValueMinor: 10000000n,
      tenorMonths: 3,
      counterpartyHistoryCount: 5,
      interestBps: 1200,
    });

    assert.equal(result.provider, 'simulated');
    assert.equal(result.outcome, 'APPROVED');
    assert.equal(result.principalAmountMinor, '7000000');
    // Admin fee: 1.5% of 70,000 = 1,050 ($1,050.00 = 105000 minor)
    assert.equal(result.adminFeeMinor, '105000');
    // Interest: (7000000 * 1200 * 3) / 120000 = 210000 ($2,100.00)
    assert.equal(result.totalInterestMinor, '210000');
    // Total obligation: 7000000 + 105000 + 210000 = 7315000 ($73,150.00)
    assert.equal(result.totalObligationMinor, '7315000');

    // Amortization schedule has 3 installments:
    // Base = 7315000 / 3 = 2438333
    // Residue = 7315000 - (2438333 * 3) = 1
    // Month 1: 2438333, Month 2: 2438333, Month 3: 2438334
    assert.equal(result.schedule.length, 3);
    assert.equal(result.schedule[0].amountMinor, '2438333');
    assert.equal(result.schedule[1].amountMinor, '2438333');
    assert.equal(result.schedule[2].amountMinor, '2438334');

    const totalSum = result.schedule.reduce((acc, row) => acc + BigInt(row.amountMinor), 0n);
    assert.equal(totalSum, 7315000n);
  });

  await t.test('2. Rejection on LTV Exceeded (PO > 70%, Invoice > 80%)', () => {
    // PO exceeding 70%
    const poOverLtv = PartnerSimulatorProvider.underwrite({
      facilityType: 'PO',
      principalAmountMinor: 7500000n, // 75% > 70%
      collateralValueMinor: 10000000n,
      tenorMonths: 3,
      counterpartyHistoryCount: 3,
    });
    assert.equal(poOverLtv.outcome, 'REJECTED');
    assert.equal(poOverLtv.reasonCode, 'UNDERWRITING_LTV_EXCEEDED');

    // Invoice exceeding 80%
    const invOverLtv = PartnerSimulatorProvider.underwrite({
      facilityType: 'INVOICE',
      principalAmountMinor: 8500000n, // 85% > 80%
      collateralValueMinor: 10000000n,
      tenorMonths: 2,
      counterpartyHistoryCount: 4,
    });
    assert.equal(invOverLtv.outcome, 'REJECTED');
    assert.equal(invOverLtv.reasonCode, 'UNDERWRITING_LTV_EXCEEDED');
  });

  await t.test('3. Rejection on Tenor > 6 Months and CP History < 3', () => {
    const tenorTooLong = PartnerSimulatorProvider.underwrite({
      facilityType: 'PO',
      principalAmountMinor: 5000000n,
      collateralValueMinor: 10000000n,
      tenorMonths: 7, // > 6
      counterpartyHistoryCount: 4,
    });
    assert.equal(tenorTooLong.outcome, 'REJECTED');
    assert.equal(tenorTooLong.reasonCode, 'TENOR_TOO_LONG');

    const insufficientCp = PartnerSimulatorProvider.underwrite({
      facilityType: 'INVOICE',
      principalAmountMinor: 5000000n,
      collateralValueMinor: 10000000n,
      tenorMonths: 3,
      counterpartyHistoryCount: 2, // < 3
    });
    assert.equal(insufficientCp.outcome, 'REJECTED');
    assert.equal(insufficientCp.reasonCode, 'COUNTERPARTY_INSUFFICIENT_HISTORY');
  });

  await t.test('4. Disbursement, Repayment, and Settlement Operations', async () => {
    const disb = await PartnerSimulatorProvider.disburse({
      intentId: 'intent_fin_01',
      principalAmountMinor: 1000000n,
      adminFeeMinor: 15000n,
      currency: 'USD',
    });
    assert.equal(disb.provider, 'simulated');
    assert.equal(disb.outcome, 'SUCCESS');
    assert.equal(disb.netDisbursedMinor, '985000');
    assert.equal(disb.providerRefs.disbursementRef, 'sim_disb_intent_fin_01');

    const repay = await PartnerSimulatorProvider.repayCycle({
      intentId: 'intent_fin_01',
      cycleNumber: 1,
      amountMinor: 345000n,
      currency: 'USD',
    });
    assert.equal(repay.provider, 'simulated');
    assert.equal(repay.outcome, 'SUCCESS');
    assert.equal(repay.providerRefs.repaymentRef, 'sim_repay_intent_fin_01_c1');

    const settle = await PartnerSimulatorProvider.settle({
      intentId: 'intent_fin_01',
      totalRepaidMinor: 1035000n,
      totalObligationMinor: 1035000n,
      currency: 'USD',
    });
    assert.equal(settle.provider, 'simulated');
    assert.equal(settle.outcome, 'SUCCESS');

    await assert.rejects(
      () => PartnerSimulatorProvider.settle({
        intentId: 'intent_fin_01',
        totalRepaidMinor: 500000n,
        totalObligationMinor: 1035000n,
      }),
      (err) => err.code === 'SETTLEMENT_AMOUNT_MISMATCH'
    );
  });

  await t.test('5. Failure Injection Capability for Testability', async () => {
    // Inject debit failure: INSUFFICIENT_FUNDS
    PartnerSimulatorProvider.inject({
      category: 'DEBIT',
      step: 'debit',
      failure: 'INSUFFICIENT_FUNDS',
    });

    const res = await PartnerSimulatorProvider.processDebit({
      intentId: 'intent_deb_01',
      authId: 'auth_01',
      amountMinor: 50000n,
      currency: 'USD',
    });
    assert.equal(res.outcome, 'FAILED');
    assert.equal(res.failureCode, 'INSUFFICIENT_FUNDS');

    // Clear injections and verify normal success
    PartnerSimulatorProvider.clearInjections();
    const res2 = await PartnerSimulatorProvider.processDebit({
      intentId: 'intent_deb_01',
      authId: 'auth_01',
      amountMinor: 50000n,
      currency: 'USD',
    });
    assert.equal(res2.outcome, 'SUCCESS');
    assert.equal(res2.providerRefs.debitRef, 'sim_deb_intent_deb_01');
  });

  await t.test('6. Direct Debit Mandate Status & Limits', async () => {
    // Revoked mandate
    const revoked = await PartnerSimulatorProvider.processDebit({
      intentId: 'deb_rev',
      authId: 'auth_rev',
      amountMinor: 10000n,
      authorization: {
        status: 'REVOKED',
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        max_amount_minor: 50000n,
      },
    });
    assert.equal(revoked.outcome, 'FAILED');
    assert.equal(revoked.failureCode, 'AUTH_REVOKED');

    // Expired mandate
    const expired = await PartnerSimulatorProvider.processDebit({
      intentId: 'deb_exp',
      authId: 'auth_exp',
      amountMinor: 10000n,
      authorization: {
        status: 'ACTIVE',
        valid_until: new Date(Date.now() - 10000).toISOString(),
        max_amount_minor: 50000n,
      },
    });
    assert.equal(expired.outcome, 'FAILED');
    assert.equal(expired.failureCode, 'AUTH_EXPIRED');

    // Cap exceeded
    const overCap = await PartnerSimulatorProvider.processDebit({
      intentId: 'deb_cap',
      authId: 'auth_cap',
      amountMinor: 60000n,
      authorization: {
        status: 'ACTIVE',
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        max_amount_minor: 50000n,
      },
    });
    assert.equal(overCap.outcome, 'FAILED');
    assert.equal(overCap.failureCode, 'CAP_EXCEEDED');
  });

  await t.test('7. Policy Default: 0 AUTO_APPROVE for FINANCING and DEBIT', async () => {
    // Context with low amount and permissive limits that would otherwise auto-approve
    const basePolicy = {
      allowedActions: ['PAYOUT'],
      currency: 'USD',
      perTransactionCapMinor: 50000000n,
      budget: { limitMinor: 100000000n },
      autoApproveBelowMinor: 100000000n, // $1,000,000
      allowNewPayees: false,
      payees: { ids: ['00000000-0000-4000-8000-000000000002'] },
      schedule: { timezone: 'Asia/Jakarta', days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 },
      velocity: { maxRequestsPerHour: 100, maxPayoutPerPayeePerDay: 50 },
      duplicateWindowHours: 72,
      requireInvoice: false,
      invoiceAmountToleranceMinor: 0,
      stepUpApprovalAboveMinor: 300000000n,
      approvalTtlHours: 24,
    };

    const baseContext = {
      org: { frozen_at: null },
      agent: { status: 'ACTIVE' },
      mandate: { status: 'ACTIVE' },
      version: {
        id: '00000000-0000-4000-8000-000000000001',
        valid_from: '2020-01-01T00:00:00Z',
        valid_to: '2099-01-01T00:00:00Z',
      },
      policy: basePolicy,
      payee: {
        id: '00000000-0000-4000-8000-000000000002',
        display_name: 'Trusted Payee',
        trust: 'TRUSTED',
      },
      history: { requestsLastHour: 0, payeePayoutsToday: 0, duplicate: false, payeeChanges30Days: 0 },
      budget: { remainingMinor: 100000000n },
      now: new Date('2026-11-01T04:00:00Z'),
    };

    // FINANCING intent
    const finDecision = await evaluateRequest({
      request: {
        category: 'FINANCING',
        sub_type: 'po',
        amount_minor: 10000n, // small amount
        currency: 'USD',
        action: 'PAYOUT',
      },
      context: baseContext,
    });
    assert.notEqual(finDecision.decision, 'AUTO_APPROVE');
    assert.equal(finDecision.decision, 'REQUIRE_APPROVAL');
    assert(finDecision.reasonCodes.includes('TIER_C_REQUIRES_APPROVAL'));

    // DEBIT intent
    const debDecision = await evaluateRequest({
      request: {
        category: 'DEBIT',
        sub_type: 'direct',
        amount_minor: 5000n, // small amount
        currency: 'USD',
        action: 'PAYOUT',
      },
      context: baseContext,
    });
    assert.notEqual(debDecision.decision, 'AUTO_APPROVE');
    assert.equal(debDecision.decision, 'REQUIRE_APPROVAL');
    assert(debDecision.reasonCodes.includes('TIER_C_REQUIRES_APPROVAL'));
  });
});
