// @ts-check
import express from 'express';
import crypto from 'node:crypto';
import pool from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { withTx } from '../db/tx.js';

/**
 * Resolve organization ID from request.
 */
function resolveOrgId(req) {
  return (
    req.session?.current_org_id ||
    req.headers?.['x-org-id'] ||
    req.get?.('x-org-id') ||
    '00000000-0000-4000-8000-000000000001'
  );
}

/**
 * Creates the DX router for Developer Experience endpoints.
 * @param {object} [opts]
 * @param {import('express').RequestHandler} [opts.requireSession]
 * @param {import('express').RequestHandler} [opts.requireCsrf]
 */
export function createDxRouter({ requireSession, requireCsrf } = {}) {
  const router = express.Router();
  const sessionGuard = requireSession || ((_req, _res, next) => next());
  const csrfGuard = requireCsrf || ((_req, _res, next) => next());

  /**
   * Langkah 2.1: One-Click Sandbox Seeding (Cloning with PII Scrubber)
   * POST /api/v1/sandbox/seed
   */
  router.post('/sandbox/seed', sessionGuard, csrfGuard, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);

      // 1. Fetch up to 10 latest transactions from LIVE
      const liveTxs = await pool.query(
        `SELECT * FROM transaction_intents
         WHERE org_id = $1 AND environment = 'LIVE'
         ORDER BY created_at DESC
         LIMIT 10`,
        [orgId],
      );

      let seededCount = 0;
      const insertedIds = [];

      // Fallback default templates adhering to transaction_intents_check constraint
      const fallbackTemplates = [
        { category: 'PAYOUT', sub_type: 'standard', amount: 1000n, currency: 'USD' },
        { category: 'INVOICE', sub_type: 'standard', amount: 2500n, currency: 'USD' },
        { category: 'SALE', sub_type: 'standard', amount: 1500n, currency: 'USD' },
        { category: 'DOWN_PAYMENT', sub_type: 'initial', amount: 5000n, currency: 'USD' },
        { category: 'SPLIT', sub_type: 'split', amount: 3000n, currency: 'USD' },
        { category: 'RECURRING', sub_type: 'init', amount: 1200n, currency: 'USD' },
      ];

      const itemsToClone = liveTxs.rows.length > 0 ? liveTxs.rows : fallbackTemplates;

      await withTx(async (tx) => {
        // Find or create a sandbox agent
        let agentRes = await tx.query(
          `SELECT id FROM agents WHERE org_id = $1 AND environment = 'SANDBOX' LIMIT 1`,
          [orgId],
        );
        let agentId = agentRes.rows[0]?.id;
        if (!agentId) {
          const newAgent = await tx.query(
            `INSERT INTO agents (org_id, name, description, status, environment)
             VALUES ($1, 'Sandbox Test Bot', 'Automated testing agent', 'ACTIVE', 'SANDBOX')
             RETURNING id`,
            [orgId],
          );
          agentId = newAgent.rows[0].id;
        }

        // Find or create a sandbox mandate
        let mandateRes = await tx.query(
          `SELECT current_version_id FROM mandates WHERE org_id = $1 AND environment = 'SANDBOX' AND current_version_id IS NOT NULL LIMIT 1`,
          [orgId],
        );
        let mandateVersionId = mandateRes.rows[0]?.current_version_id || '00000000-0000-4000-8000-000000000000';

        for (let i = 0; i < itemsToClone.length; i++) {
          const item = itemsToClone[i];
          const newIntentId = crypto.randomUUID();
          const idempotencyKey = `seed_sbx_${newIntentId.slice(0, 8)}_${Date.now()}_${i}`;
          const scrubbedVendorName = `Vendor Test ${i + 1}`;
          const scrubbedEmail = `vendor-test-${i + 1}@sandbox.jobenpay.cloud`;

          // PII Scrubbing
          const scrubbedAmount = 1000n + BigInt((i + 1) * 500); // Small nominal amounts ($10.00, $15.00, ...)
          const category = item.category || 'PAYOUT';
          const subType = item.sub_type || 'standard';
          const currency = item.currency || 'USD';

          // Create or find a scrubbed sandbox payee
          let payeeRes = await tx.query(
            `SELECT id FROM payees WHERE org_id = $1 AND display_name = $2 AND environment = 'SANDBOX' LIMIT 1`,
            [orgId, scrubbedVendorName],
          );
          let payeeId = payeeRes.rows[0]?.id;
          if (!payeeId) {
            const newPayee = await tx.query(
              `INSERT INTO payees (
                 org_id, display_name, kind, identifier_enc, identifier_hmac, identifier_masked, trust, environment
               ) VALUES ($1, $2, 'EMAIL', 'enc_dummy', $3, $4, 'TRUSTED', 'SANDBOX')
               RETURNING id`,
              [orgId, scrubbedVendorName, `hmac_${i}`, `${scrubbedVendorName} <${scrubbedEmail}>`],
            );
            payeeId = newPayee.rows[0].id;
          }

          const scrubbedMetadata = {
            seeded: true,
            scrubbed_from_live: Boolean(item.intent_id),
            original_live_intent: item.intent_id || null,
            vendor: scrubbedVendorName,
            notes: 'PII scrubbed sandbox seed record for testing and developer verification',
            decision: 'AUTO_APPROVE',
          };

          const hashPayload = `${orgId}:${category}:${subType}:${scrubbedAmount.toString()}:${currency}:${payeeId}:${idempotencyKey}`;
          const requestHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');

          await tx.query(
            `INSERT INTO transaction_intents (
               intent_id, org_id, agent_id, category, sub_type, status,
               amount_minor, currency, counterparty_id, mandate_version_id,
               request_hash, idempotency_key, metadata, environment
             ) VALUES ($1, $2, $3, $4, $5, 'APPROVED', $6, $7, $8, $9, $10, $11, $12, 'SANDBOX')`,
            [
              newIntentId,
              orgId,
              agentId,
              category,
              subType,
              scrubbedAmount.toString(),
              currency,
              payeeId,
              mandateVersionId,
              requestHash,
              idempotencyKey,
              JSON.stringify(scrubbedMetadata),
            ],
          );

          insertedIds.push(newIntentId);
          seededCount++;
        }
      });

      logger.info({ orgId, seededCount }, 'Sandbox environment seeded successfully');
      return res.status(200).json({
        success: true,
        seededCount,
        insertedIds,
        message: `Sandbox seeded successfully with ${seededCount} scrubbed test transactions.`,
      });
    } catch (err) {
      next(err);
    }
  });

  /**
   * Langkah 2.2: Time-Travel Debugger (Debug Live Failures in Sandbox)
   * POST /api/v1/debug/time-travel/:live_tx_id
   */
  router.post('/debug/time-travel/:live_tx_id', sessionGuard, csrfGuard, async (req, res, next) => {
    try {
      const orgId = resolveOrgId(req);
      const { live_tx_id } = req.params;

      if (!live_tx_id) {
        throw new AppError('VALIDATION_FAILED', 400, 'live_tx_id is required');
      }

      // 1. Fetch the failed LIVE transaction
      const liveRes = await pool.query(
        `SELECT * FROM transaction_intents
         WHERE org_id = $1 AND intent_id = $2
         LIMIT 1`,
        [orgId, live_tx_id],
      );

      if (liveRes.rows.length === 0) {
        throw new AppError('NOT_FOUND', 404, `Live transaction ${live_tx_id} not found.`);
      }

      const liveTx = liveRes.rows[0];

      // 2. Resolve or create a Sandbox agent for the cloned transaction
      let agentRes = await pool.query(
        `SELECT id FROM agents WHERE org_id = $1 AND environment = 'SANDBOX' LIMIT 1`,
        [orgId],
      );
      let sandboxAgentId = agentRes.rows[0]?.id;
      if (!sandboxAgentId) {
        const newAgent = await pool.query(
          `INSERT INTO agents (org_id, name, description, status, environment)
           VALUES ($1, 'Sandbox Debug Agent', 'Automated debug agent for time travel replay', 'ACTIVE', 'SANDBOX')
           RETURNING id`,
          [orgId],
        );
        sandboxAgentId = newAgent.rows[0].id;
      }

      // 3. Clone state and snapshot into Sandbox
      const sandboxIntentId = crypto.randomUUID();
      const sandboxIdempotencyKey = `debug_tt_${sandboxIntentId.slice(0, 8)}_${Date.now()}`;

      const snapshotMetadata = {
        ...liveTx.metadata,
        time_travel_debug: true,
        cloned_from_live: live_tx_id,
        original_agent_id: liveTx.agent_id,
        original_environment: liveTx.environment,
        cloned_at: new Date().toISOString(),
        debug_notes: 'Snapshot cloned from LIVE for safe replay debugging in Sandbox.',
      };

      const hashPayload = `${orgId}:${liveTx.category}:${liveTx.sub_type}:${liveTx.amount_minor}:${liveTx.currency}:${liveTx.counterparty_id || ''}:${sandboxIdempotencyKey}`;
      const requestHash = crypto.createHash('sha256').update(hashPayload, 'utf8').digest('hex');

      await pool.query(
        `INSERT INTO transaction_intents (
           intent_id, org_id, agent_id, category, sub_type, status,
           amount_minor, currency, counterparty_id, mandate_version_id,
           request_hash, idempotency_key, metadata, environment
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SANDBOX')`,
        [
          sandboxIntentId,
          orgId,
          sandboxAgentId,
          liveTx.category,
          liveTx.sub_type,
          liveTx.status === 'FAILED' ? 'FAILED' : 'NEEDS_APPROVAL',
          liveTx.amount_minor,
          liveTx.currency,
          liveTx.counterparty_id,
          liveTx.mandate_version_id,
          requestHash,
          sandboxIdempotencyKey,
          JSON.stringify(snapshotMetadata),
        ],
      );

      logger.info(
        { orgId, liveIntentId: live_tx_id, sandboxIntentId },
        'Live transaction cloned to Sandbox via Time-Travel debugger',
      );

      return res.status(200).json({
        success: true,
        live_tx_id,
        sandbox_intent_id: sandboxIntentId,
        replay_url: `/transactions/${sandboxIntentId}`,
        message: 'Failed LIVE transaction state cloned into Sandbox for safe debugging.',
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const dxRouter = createDxRouter();
export default dxRouter;
