/**
 * tests/contract/scheduled.contract.test.js
 * Contract tests for SCHEDULED dispatcher and execution adapter (K-SCHEDULED, AD-14, T-01)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeScheduledFire, reevaluateScheduledIntent } from '../../server/src/services/paypal/scheduled.js';

test('Scheduled Adapter Contract: re-evaluation and base category dispatch', async (t) => {
  function createMockPayPal() {
    const requests = [];
    return {
      requests,
      async request(method, path, options = {}) {
        requests.push({ method, path, headers: options.headers, body: options.body ? JSON.parse(options.body) : null });

        if (path === '/v1/payments/payouts') {
          return {
            batch_header: {
              payout_batch_id: 'BATCH-SCHED-12345',
              batch_status: 'PENDING',
              sender_batch_header: { sender_batch_id: 'jp_intent_sched_01' },
            },
          };
        }

        if (path === '/v2/checkout/orders') {
          return {
            id: 'ORDER-SCHED-998877',
            status: 'CREATED',
            links: [{ rel: 'approve', href: 'https://sandbox.paypal.com/checkoutnow?token=ORDER-SCHED-998877' }],
          };
        }

        if (path.includes('/capture')) {
          return {
            id: 'ORDER-SCHED-998877',
            status: 'COMPLETED',
            purchase_units: [
              {
                payments: {
                  captures: [{ id: 'CAP-SCHED-445566', status: 'COMPLETED' }],
                },
              },
            ],
          };
        }

        throw new Error(`Unhandled mock path: ${path}`);
      },
    };
  }

  await t.test('1. Executes scheduled payout dispatch via Payouts API', async () => {
    const mock = createMockPayPal();
    const result = await executeScheduledFire(mock, {
      intent: {
        intent_id: 'intent_sched_01',
        sub_type: 'payout',
        amount_minor: 12000n,
        currency: 'USD',
        metadata: { recipientEmail: 'scheduled_receiver@example.com' },
      },
    });

    assert.equal(result.outcome, 'PENDING');
    assert.equal(result.providerRefs.payoutBatchId, 'BATCH-SCHED-12345');
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0].headers['PayPal-Request-Id'], 'jp_intent_sched_01_sched_payout');
  });

  await t.test('2. Executes scheduled charge dispatch via Orders Create + Capture API', async () => {
    const mock = createMockPayPal();
    const result = await executeScheduledFire(mock, {
      intent: {
        intent_id: 'intent_sched_02',
        sub_type: 'charge',
        amount_minor: 7500n,
        currency: 'USD',
        metadata: {},
      },
    });

    assert.equal(result.outcome, 'COMPLETED');
    assert.equal(result.providerRefs.orderId, 'ORDER-SCHED-998877');
    assert.equal(result.providerRefs.captureId, 'CAP-SCHED-445566');
    assert.equal(mock.requests.length, 2);
  });

  await t.test('3. Re-evaluation at fire time rejects if mandate is expired or org is frozen', async () => {
    const now = new Date('2026-11-06T12:00:00Z');

    // Org frozen
    const frozenRes = await reevaluateScheduledIntent({
      intent: { intent_id: 'intent_sched_03' },
      org: { frozen: true },
      mandate: { status: 'ACTIVE', validTo: '2026-12-31T00:00:00Z' },
      agent: { status: 'ACTIVE' },
      now,
    });
    assert.equal(frozenRes.passed, false);
    assert.equal(frozenRes.code, 'ORG_FROZEN');

    // Mandate expired
    const expiredRes = await reevaluateScheduledIntent({
      intent: { intent_id: 'intent_sched_04' },
      org: { frozen: false },
      mandate: { status: 'ACTIVE', validTo: '2026-10-01T00:00:00Z' }, // in past
      agent: { status: 'ACTIVE' },
      now,
    });
    assert.equal(expiredRes.passed, false);
    assert.equal(expiredRes.code, 'MANDATE_EXPIRED');

    // Valid
    const validRes = await reevaluateScheduledIntent({
      intent: { intent_id: 'intent_sched_05' },
      org: { frozen: false },
      mandate: { status: 'ACTIVE', validTo: '2026-12-31T00:00:00Z' },
      agent: { status: 'ACTIVE' },
      now,
    });
    assert.equal(validRes.passed, true);
  });
});
