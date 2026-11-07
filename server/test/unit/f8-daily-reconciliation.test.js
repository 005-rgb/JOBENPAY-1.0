/**
 * server/test/unit/f8-daily-reconciliation.test.js
 * Test Suite for WP F8-6: Daily Reconciliation Service across all categories
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { runDailyReconciliation } from '../../src/services/reconciliation/daily.js';
import { reconcileDailyJob } from '../../src/jobs/handlers/reconcileDaily.js';

test('F8-6: Daily Reconciliation Service & Job Suite', async (t) => {
  await t.test('1. Normal matching transactions reconcile cleanly with zero mismatches', async () => {
    const mockIntents = [
      {
        intent_id: '00000000-0000-4000-8000-000000000101',
        org_id: 'org-001',
        category: 'PAYOUT',
        sub_type: 'standard',
        amount_minor: '10000',
        currency: 'USD',
        status: 'COMPLETED',
        reconciliation_status: 'PENDING',
      },
      {
        intent_id: '00000000-0000-4000-8000-000000000102',
        org_id: 'org-001',
        category: 'SALE',
        sub_type: 'standard',
        amount_minor: '25000',
        currency: 'USD',
        status: 'COMPLETED',
        reconciliation_status: 'PENDING',
      },
    ];

    const mockLegs = {
      '00000000-0000-4000-8000-000000000101': [
        { direction: 'DEBIT', amount_minor: '10000', currency: 'USD', account: 'org:main' },
        { direction: 'CREDIT', amount_minor: '10000', currency: 'USD', account: 'payee:cp1' },
      ],
      '00000000-0000-4000-8000-000000000102': [
        { direction: 'DEBIT', amount_minor: '25000', currency: 'USD', account: 'buyer:main' },
        { direction: 'CREDIT', amount_minor: '25000', currency: 'USD', account: 'org:main' },
      ],
    };

    const mockSettlement = {
      '00000000-0000-4000-8000-000000000101': [
        { paypal_ref: 'PAY-101', amount_minor: '10000', currency: 'USD', status: 'SETTLED' },
      ],
      '00000000-0000-4000-8000-000000000102': [
        { paypal_ref: 'PAY-102', amount_minor: '25000', currency: 'USD', status: 'SETTLED' },
      ],
    };

    const updates = [];
    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM transaction_intents')) {
          return { rows: mockIntents };
        }
        if (sql.includes('FROM transaction_legs')) {
          return { rows: mockLegs[params[0]] || [] };
        }
        if (sql.includes('FROM settlement_records')) {
          return { rows: mockSettlement[params[0]] || [] };
        }
        if (sql.includes('UPDATE transaction_intents')) {
          updates.push({ sql, params });
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
    };

    const report = await runDailyReconciliation({ orgId: 'org-001', db: mockDb });
    assert.equal(report.scanned, 2);
    assert.equal(report.reconciled, 2);
    assert.equal(report.mismatchCount, 0);
    assert.equal(report.suggestFreezeAny, false);
    assert.equal(updates.length, 2);
    assert.equal(updates[0].params[0], '00000000-0000-4000-8000-000000000101');
  });

  await t.test('2. Injected unbalanced transaction legs produces MISMATCH report and freeze suggestion', async () => {
    const mockIntents = [
      {
        intent_id: '00000000-0000-4000-8000-000000000201',
        org_id: 'org-002',
        category: 'TRANSFER',
        sub_type: 'standard',
        amount_minor: '50000',
        currency: 'USD',
        status: 'COMPLETED',
        reconciliation_status: 'PENDING',
      },
    ];

    // Artificial discrepancy: DEBIT 50,000 vs CREDIT 45,000 (diff 5,000)
    const mockLegs = {
      '00000000-0000-4000-8000-000000000201': [
        { direction: 'DEBIT', amount_minor: '50000', currency: 'USD', account: 'org:main' },
        { direction: 'CREDIT', amount_minor: '45000', currency: 'USD', account: 'org:secondary' },
      ],
    };

    const updates = [];
    const notifications = [];
    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM transaction_intents')) {
          return { rows: mockIntents };
        }
        if (sql.includes('FROM transaction_legs')) {
          return { rows: mockLegs[params[0]] || [] };
        }
        if (sql.includes('FROM settlement_records')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE transaction_intents')) {
          updates.push({ sql, params });
          return { rowCount: 1 };
        }
        if (sql.includes('INSERT INTO notifications')) {
          notifications.push({ sql, params });
          return { rowCount: 1 };
        }
        return { rows: [] };
      },
    };

    const report = await runDailyReconciliation({ orgId: 'org-002', db: mockDb });
    assert.equal(report.scanned, 1);
    assert.equal(report.reconciled, 0);
    assert.equal(report.mismatchCount, 1);
    assert.equal(report.suggestFreezeAny, true);

    const mismatch = report.mismatches[0];
    assert.equal(mismatch.intentId, '00000000-0000-4000-8000-000000000201');
    assert.equal(mismatch.reason, 'UNBALANCED_TRANSACTION_LEGS');
    assert.equal(mismatch.source, 'LEGS');
    assert.equal(mismatch.diffMinor, '5000');
    assert.equal(mismatch.suggestFreeze, true);
  });

  await t.test('3. Injected settlement amount mismatch is detected with diff report', async () => {
    const mockIntents = [
      {
        intent_id: '00000000-0000-4000-8000-000000000301',
        org_id: 'org-003',
        category: 'INVOICE',
        sub_type: 'standard',
        amount_minor: '15000',
        currency: 'USD',
        status: 'COMPLETED',
        reconciliation_status: 'PENDING',
      },
    ];

    // Balanced legs
    const mockLegs = {
      '00000000-0000-4000-8000-000000000301': [
        { direction: 'DEBIT', amount_minor: '15000', currency: 'USD', account: 'buyer:ext' },
        { direction: 'CREDIT', amount_minor: '15000', currency: 'USD', account: 'org:main' },
      ],
    };

    // Artificial discrepancy: Provider settled 14,000 instead of 15,000
    const mockSettlement = {
      '00000000-0000-4000-8000-000000000301': [
        { paypal_ref: 'INV-301', amount_minor: '14000', currency: 'USD', status: 'SETTLED' },
      ],
    };

    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM transaction_intents')) return { rows: mockIntents };
        if (sql.includes('FROM transaction_legs')) return { rows: mockLegs[params[0]] || [] };
        if (sql.includes('FROM settlement_records')) return { rows: mockSettlement[params[0]] || [] };
        if (sql.includes('UPDATE transaction_intents')) return { rowCount: 1 };
        return { rows: [] };
      },
    };

    const report = await runDailyReconciliation({ orgId: 'org-003', db: mockDb });
    assert.equal(report.mismatchCount, 1);
    assert.equal(report.mismatches[0].reason, 'AMOUNT_MISMATCH');
    assert.equal(report.mismatches[0].source, 'SETTLEMENT');
    assert.equal(report.mismatches[0].diffMinor, '1000');
  });

  await t.test('4. Injected provider settlement failure is caught as PAYPAL mismatch', async () => {
    const mockIntents = [
      {
        intent_id: '00000000-0000-4000-8000-000000000401',
        org_id: 'org-004',
        category: 'REFUND',
        sub_type: 'standard',
        amount_minor: '8000',
        currency: 'USD',
        status: 'COMPLETED',
        reconciliation_status: 'PENDING',
      },
    ];

    const mockLegs = {
      '00000000-0000-4000-8000-000000000401': [
        { direction: 'DEBIT', amount_minor: '8000', currency: 'USD', account: 'org:main' },
        { direction: 'CREDIT', amount_minor: '8000', currency: 'USD', account: 'buyer:ext' },
      ],
    };

    const mockSettlement = {
      '00000000-0000-4000-8000-000000000401': [
        { paypal_ref: 'REF-401', amount_minor: '8000', currency: 'USD', status: 'FAILED' },
      ],
    };

    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM transaction_intents')) return { rows: mockIntents };
        if (sql.includes('FROM transaction_legs')) return { rows: mockLegs[params[0]] || [] };
        if (sql.includes('FROM settlement_records')) return { rows: mockSettlement[params[0]] || [] };
        if (sql.includes('UPDATE transaction_intents')) return { rowCount: 1 };
        return { rows: [] };
      },
    };

    const report = await runDailyReconciliation({ orgId: 'org-004', db: mockDb });
    assert.equal(report.mismatchCount, 1);
    assert.equal(report.mismatches[0].reason, 'PROVIDER_SETTLEMENT_FAILED');
    assert.equal(report.mismatches[0].source, 'PAYPAL');
  });

  await t.test('5. Exempt categories (VOID and DISPUTE inquiry) with 0 legs reconcile without error', async () => {
    const mockIntents = [
      {
        intent_id: '00000000-0000-4000-8000-000000000501',
        org_id: 'org-005',
        category: 'VOID',
        sub_type: 'authorization',
        amount_minor: '12000',
        currency: 'USD',
        status: 'COMPLETED',
        reconciliation_status: 'PENDING',
      },
      {
        intent_id: '00000000-0000-4000-8000-000000000502',
        org_id: 'org-005',
        category: 'DISPUTE',
        sub_type: 'inquiry',
        amount_minor: '5000',
        currency: 'USD',
        status: 'COMPLETED',
        reconciliation_status: 'PENDING',
      },
    ];

    const mockDb = {
      query: async (sql, params = []) => {
        if (sql.includes('FROM transaction_intents')) return { rows: mockIntents };
        if (sql.includes('FROM transaction_legs')) return { rows: [] };
        if (sql.includes('FROM settlement_records')) return { rows: [] };
        if (sql.includes('UPDATE transaction_intents')) return { rowCount: 1 };
        return { rows: [] };
      },
    };

    const report = await runDailyReconciliation({ orgId: 'org-005', db: mockDb });
    assert.equal(report.scanned, 2);
    assert.equal(report.reconciled, 2);
    assert.equal(report.mismatchCount, 0);
  });

  await t.test('6. Background job reconcileDailyJob executes runDailyReconciliation correctly', async () => {
    const job = {
      type: 'reconcile_daily',
      payload: { orgId: 'org-006' },
    };

    const mockDb = {
      query: async (sql) => {
        if (sql.includes('FROM transaction_intents')) return { rows: [] };
        return { rows: [] };
      },
    };

    const res = await reconcileDailyJob(job, { db: mockDb });
    assert.equal(res.scanned, 0);
    assert.equal(res.mismatchCount, 0);
    assert.equal(typeof res.generatedAt, 'string');
  });
});

