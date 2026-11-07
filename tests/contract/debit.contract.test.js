/**
 * tests/contract/debit.contract.test.js
 * Contract tests for Direct Debit Provider Adapter (Tier C, AD-17, B-F6)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeDirectDebit } from '../../server/src/services/paypal/debit.js';

test('Debit Adapter Contract Suite', async (t) => {
  const dummyClient = {};

  await t.test('1. Valid direct debit execution returns SUCCESS and simulated provider metadata', async () => {
    const res = await executeDirectDebit(dummyClient, {
      intentId: 'intent_deb_contract_01',
      authId: 'auth_deb_01',
      amountMinor: 25000n,
      currency: 'USD',
      authorization: {
        status: 'ACTIVE',
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        max_amount_minor: 50000n,
      },
    });

    assert.equal(res.provider, 'simulated');
    assert.equal(res.outcome, 'SUCCESS');
    assert.equal(res.providerRefs.debitRef, 'sim_deb_intent_deb_contract_01');
  });

  await t.test('2. Revoked authorization returns FAILED with AUTH_REVOKED', async () => {
    const res = await executeDirectDebit(dummyClient, {
      intentId: 'intent_deb_contract_02',
      authId: 'auth_deb_02',
      amountMinor: 25000n,
      currency: 'USD',
      authorization: {
        status: 'REVOKED',
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        max_amount_minor: 50000n,
      },
    });

    assert.equal(res.provider, 'simulated');
    assert.equal(res.outcome, 'FAILED');
    assert.equal(res.failureCode, 'AUTH_REVOKED');
  });

  await t.test('3. Amount exceeding authorized limit returns FAILED with CAP_EXCEEDED', async () => {
    const res = await executeDirectDebit(dummyClient, {
      intentId: 'intent_deb_contract_03',
      authId: 'auth_deb_03',
      amountMinor: 75000n, // exceeds max 50000n
      currency: 'USD',
      authorization: {
        status: 'ACTIVE',
        valid_until: new Date(Date.now() + 86400000).toISOString(),
        max_amount_minor: 50000n,
      },
    });

    assert.equal(res.provider, 'simulated');
    assert.equal(res.outcome, 'FAILED');
    assert.equal(res.failureCode, 'CAP_EXCEEDED');
  });
});

