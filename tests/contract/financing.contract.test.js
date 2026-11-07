/**
 * tests/contract/financing.contract.test.js
 * Contract tests for Financing Provider Adapter (Tier C, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  underwriteFacility,
  executeFinancingDisbursement,
  executeFinancingRepayment,
  executeFinancingSettlement,
} from '../../server/src/services/paypal/financing.js';

test('Financing Adapter Contract Suite', async (t) => {
  const dummyClient = {};

  await t.test('1. Underwriting contract adheres to deterministic rules', async () => {
    const res = await underwriteFacility({
      facilityType: 'po',
      principalAmountMinor: 5000000n,
      collateralValueMinor: 10000000n,
      tenorMonths: 3,
      counterpartyHistoryCount: 4,
    });

    assert.equal(res.provider, 'simulated');
    assert.equal(res.outcome, 'APPROVED');
    assert(Array.isArray(res.schedule));
    assert.equal(res.schedule.length, 3);
  });

  await t.test('2. Disbursement contract returns simulated metadata and net amount', async () => {
    const res = await executeFinancingDisbursement(dummyClient, {
      intentId: 'intent_fin_contract_01',
      principalAmountMinor: 1000000n,
      adminFeeMinor: 15000n,
      currency: 'USD',
    });

    assert.equal(res.provider, 'simulated');
    assert.equal(res.outcome, 'SUCCESS');
    assert.equal(res.netDisbursedMinor, '985000');
    assert.equal(res.providerRefs.disbursementRef, 'sim_disb_intent_fin_contract_01');
  });

  await t.test('3. Repayment and settlement contracts return simulated references', async () => {
    const repay = await executeFinancingRepayment(dummyClient, {
      intentId: 'intent_fin_contract_01',
      cycleNumber: 1,
      amountMinor: 345000n,
      currency: 'USD',
    });
    assert.equal(repay.provider, 'simulated');
    assert.equal(repay.outcome, 'SUCCESS');
    assert.equal(repay.providerRefs.repaymentRef, 'sim_repay_intent_fin_contract_01_c1');

    const settle = await executeFinancingSettlement(dummyClient, {
      intentId: 'intent_fin_contract_01',
      totalRepaidMinor: 1035000n,
      totalObligationMinor: 1035000n,
      currency: 'USD',
    });
    assert.equal(settle.provider, 'simulated');
    assert.equal(settle.outcome, 'SUCCESS');
  });
});

