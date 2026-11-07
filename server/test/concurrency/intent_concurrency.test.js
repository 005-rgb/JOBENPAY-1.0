/**
 * server/test/concurrency/intent_concurrency.test.js
 * PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP6 Concurrency Suite)
 * Tests 1000 parallel transactions with valid intent: guarantees zero false rejects and indexed lookups.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../../src/db/pool.js';
import { createIntent, validateIntentMatch } from '../../src/services/intent_service.js';
import { evaluateIntentMandateStageA } from '../../src/services/decision_engine_intent.js';

test('PRD 1.4 Fase B: 1000 Parallel Intent Validations Concurrency Suite', async (t) => {
  await t.test('1000 parallel transactions with valid intent produce 0 false rejects', async () => {
    const orgId = crypto.randomUUID();
    const slug = `concurrent-intent-org-${orgId.slice(0, 8)}`;
    await pool.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [orgId, 'Concurrent Intent Org', slug]);

    const userId = crypto.randomUUID();
    await pool.query(
      'INSERT INTO users (id, email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, $4, now())',
      [userId, `user-${slug}@jobenpay.test`, 'dummy-hash', 'User Concurrent']
    );

    const intent = await createIntent(orgId, userId, {
      natural_language_input: 'Beli cloud hosting budget maks $1000 per bulan',
      structured_intent: {
        purpose: 'cloud_hosting',
        amount_range: { min: 100, max: 100000 },
        vendor_categories: ['infrastructure', 'cloud_provider'],
        deadline: '2027-12-31T23:59:59Z',
      },
    });

    assert.ok(intent.intent_id);
    assert.equal(intent.status, 'ACTIVE');

    // Run 1000 concurrent validation checks
    const BATCH_SIZE = 1000;
    const checks = Array.from({ length: BATCH_SIZE }, (_, i) => {
      const amount = 500 + (i % 500); // 500 to 999 minor units (well within [100, 100000])
      const tx = {
        purpose: 'cloud_hosting',
        amount_minor: amount,
        currency: 'USD',
        counterparty_id: 'cloud_provider',
        intent_mandate_id: intent.intent_id,
      };

      return evaluateIntentMandateStageA({
        orgId,
        mandate: { ai: { intentCheck: true } },
        transaction: tx,
      });
    });

    const results = await Promise.all(checks);

    // Verify 0 false rejects
    const falseRejects = results.filter((r) => !r.valid);
    assert.equal(
      falseRejects.length,
      0,
      `Expected 0 false rejects out of ${BATCH_SIZE} concurrent checks, but found: ${falseRejects.length}`
    );

    // Verify index scan requirement with enable_seqscan=off for small test tables
    await pool.query('BEGIN');
    await pool.query('SET LOCAL enable_seqscan = off');
    const explainRes = await pool.query(
      'EXPLAIN ANALYZE SELECT * FROM intent_mandates WHERE org_id = $1 AND intent_id = $2',
      [orgId, intent.intent_id]
    );
    await pool.query('COMMIT');

    const plan = explainRes.rows.map((r) => r['QUERY PLAN']).join('\n');
    assert.ok(
      plan.includes('Index Scan') || plan.includes('Bitmap Index Scan') || plan.includes('intent_mandates_pkey') || plan.includes('idx_intent_mandates'),
      `Query must utilize index: ${plan}`
    );
  });
});
