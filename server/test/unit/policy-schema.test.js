import test from 'node:test';
import assert from 'node:assert/strict';

import { policySchema } from '../../../shared/policy.schema.js';

const base = {
  schemaVersion: 1,
  purpose: 'Pay suppliers',
  allowedActions: ['PAYOUT'],
  currency: 'USD',
  perTransactionCapMinor: 1500,
  budget: { period: 'MONTH', limitMinor: 5000 },
  autoApproveBelowMinor: 1000,
  payees: { mode: 'ALLOWLIST', ids: [] },
  allowNewPayees: false,
  schedule: { timezone: 'Asia/Jakarta', days: [1, 2, 3], startHour: 8, endHour: 18 },
  velocity: { maxRequestsPerHour: 10, maxPayoutPerPayeePerDay: 2 },
  duplicateWindowHours: 72,
  requireInvoice: true,
  invoiceAmountToleranceMinor: 0,
  ai: { intentCheck: true, escalateOnRiskAtOrAbove: 40, blockOnRiskAtOrAbove: 80 },
  stepUpApprovalAboveMinor: 1000,
  fourEyesAboveMinor: 1500,
  approvalTtlHours: 24,
  validFrom: '2026-11-01T00:00:00Z',
  validTo: '2026-12-01T00:00:00Z',
};

const cases = [
  ['schema version', { schemaVersion: 2 }],
  ['empty purpose', { purpose: '' }],
  ['empty actions', { allowedActions: [] }],
  ['unknown action', { allowedActions: ['TRANSFER'] }],
  ['duplicate action', { allowedActions: ['PAYOUT', 'PAYOUT'] }],
  ['lowercase currency', { currency: 'usd' }],
  ['fractional cap', { perTransactionCapMinor: 1.5 }],
  ['unsafe cap', { perTransactionCapMinor: Number.MAX_SAFE_INTEGER + 1 }],
  ['zero budget', { budget: { period: 'MONTH', limitMinor: 0 } }],
  ['wrong budget period', { budget: { period: 'WEEK', limitMinor: 5000 } }],
  ['auto approval over cap', { autoApproveBelowMinor: 1600 }],
  ['cap over budget', { perTransactionCapMinor: 6000 }],
  ['invalid payee mode', { payees: { mode: 'ANY', ids: [] } }],
  ['invalid payee uuid', { payees: { mode: 'ALLOWLIST', ids: ['not-uuid'] } }],
  ['invalid timezone', { schedule: { ...base.schedule, timezone: 'Not/AZone' } }],
  ['invalid day', { schedule: { ...base.schedule, days: [8] } }],
  ['duplicate day', { schedule: { ...base.schedule, days: [1, 1] } }],
  ['invalid hours', { schedule: { ...base.schedule, startHour: 18, endHour: 18 } }],
  ['negative tolerance', { invoiceAmountToleranceMinor: -1 }],
  ['risk order', { ai: { ...base.ai, escalateOnRiskAtOrAbove: 80 } }],
  ['step-up below auto', { stepUpApprovalAboveMinor: 999 }],
  ['invalid valid from', { validFrom: '2026-11-01T00:00:00+07:00' }],
  ['impossible UTC date', { validFrom: '2026-02-30T00:00:00Z' }],
  ['valid to before from', { validTo: '2026-10-01T00:00:00Z' }],
  ['extra field', { unexpected: true }],
];

test('policy schema accepts a valid policy', () => {
  assert.equal(policySchema.safeParse(base).success, true);
  assert.equal(policySchema.safeParse({
    ...base,
    allowedActions: ['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'],
  }).success, true);
});

for (const [label, change] of cases) {
  test(`policy schema rejects ${label}`, () => {
    assert.equal(policySchema.safeParse({ ...base, ...change }).success, false);
  });
}
