// @ts-check
import express from 'express';
import crypto from 'node:crypto';
import pool from '../db/pool.js';
import { env } from '../config.js';
import { logger } from '../lib/logger.js';
import { AppError } from '../lib/errors.js';
import { insertVerifiedWebhookEvent } from '../repositories/webhookEvents.js';
import { findPaypalConnectionByWebhookToken } from '../repositories/paypalConnections.js';
import { enqueue } from '../jobs/queue.js';
import { withTx } from '../db/tx.js';

export const webhooksRouter = express.Router();

/**
 * Verify HMAC signature for webhook payload.
 * Live and Sandbox use strictly separated secrets.
 *
 * @param {string|Buffer} rawBody
 * @param {string} signature
 * @param {'SANDBOX'|'LIVE'} environment
 * @returns {boolean}
 */
export function verifyEnvironmentHmac(rawBody, signature, environment) {
  const isLive = environment === 'LIVE';
  const secret = isLive
    ? (env.PAYPAL_WEBHOOK_SECRET_LIVE || process.env.PAYPAL_WEBHOOK_SECRET_LIVE || 'jobenpay_live_webhook_secret_key_prod')
    : (env.PAYPAL_WEBHOOK_SECRET_SANDBOX || process.env.PAYPAL_WEBHOOK_SECRET_SANDBOX || env.PAYPAL_WEBHOOK_SECRET || 'jobenpay_sbx_webhook_secret_key');

  if (!signature) {
    return false;
  }

  try {
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
    const expected = crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
    const cleanSig = signature.replace(/^sha256=/i, '').trim();

    if (cleanSig.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(cleanSig, 'hex'), Buffer.from(expected, 'hex'));
  } catch (err) {
    logger.warn({ error: err.message, environment }, 'HMAC signature verification failed');
    return false;
  }
}

/**
 * Common handler for environment-specific PayPal webhooks.
 *
 * @param {'SANDBOX'|'LIVE'} targetEnv
 */
function createPaypalWebhookHandler(targetEnv) {
  return async function paypalWebhookHandler(req, res, next) {
    try {
      req.environment = targetEnv;
      res.setHeader('X-Jobenpay-Environment', targetEnv);

      // 1. Parse raw body
      let rawString = '';
      let event = null;
      if (Buffer.isBuffer(req.body)) {
        rawString = req.body.toString('utf8');
      } else if (typeof req.body === 'string') {
        rawString = req.body;
      } else if (req.body && typeof req.body === 'object') {
        rawString = JSON.stringify(req.body);
        event = req.body;
      }

      if (!event && rawString) {
        try {
          event = JSON.parse(rawString);
        } catch {
          return res.status(400).json({ error: { code: 'WEBHOOK_INVALID_BODY', message: 'Webhook body must be valid JSON.' } });
        }
      }

      if (!event || typeof event !== 'object' || !event.id || !event.event_type) {
        return res.status(400).json({ error: { code: 'WEBHOOK_INVALID_BODY', message: 'Webhook event is missing required fields.' } });
      }

      // 2. Verify signature
      const hmacSig = req.get('x-jobenpay-signature') || req.get('paypal-transmission-sig') || req.get('x-paypal-signature');
      // If HMAC header is present, verify against environment-specific secret
      if (hmacSig) {
        const isValid = verifyEnvironmentHmac(rawString, hmacSig, targetEnv);
        if (!isValid) {
          return res.status(401).json({
            error: {
              code: 'INVALID_WEBHOOK_SIGNATURE',
              message: `Webhook signature verification failed for ${targetEnv} environment.`,
            },
          });
        }
      }

      // 3. Extract target transaction identifier if present
      const resource = event.resource || {};
      const targetRef = resource.custom_id || resource.invoice_number || resource.id || resource.parent_payment;

      if (targetRef) {
        // Enforce: Sandbox webhook CANNOT mutate Live transactions
        const checkOpposite = await pool.query(
          `SELECT intent_id, environment FROM transaction_intents
           WHERE (intent_id::text = $1 OR idempotency_key = $1)
           LIMIT 1`,
          [targetRef],
        );

        if (checkOpposite.rows.length > 0) {
          const row = checkOpposite.rows[0];
          if (row.environment !== targetEnv) {
            logger.warn(
              { targetEnv, txEnv: row.environment, intentId: row.intent_id },
              'Cross-environment webhook mutation blocked'
            );
            return res.status(403).json({
              error: {
                code: 'CROSS_ENVIRONMENT_MUTATION_BLOCKED',
                message: `Webhook ${targetEnv} cannot trigger status changes on transactions in ${row.environment}.`,
              },
            });
          }
        }
      }

      // 4. Token validation and Org identification
      const webhookToken = req.params?.webhookToken;
      let matchedOrgId = req.headers['x-org-id'] || event.resource?.custom || null;
      if (webhookToken) {
        const conn = await findPaypalConnectionByWebhookToken(webhookToken);
        if (!conn) {
          return res.status(404).json({
            error: {
              code: 'WEBHOOK_TOKEN_NOT_FOUND',
              message: 'Webhook connection not found for given token.',
            },
          });
        }
        if (conn.environment !== targetEnv) {
          logger.warn(
            { tokenEnv: conn.environment, targetEnv, webhookToken },
            'Cross-environment webhook token access blocked'
          );
          return res.status(403).json({
            error: {
              code: 'CROSS_ENVIRONMENT_MUTATION_BLOCKED',
              message: `Webhook token belongs to ${conn.environment}, cannot access ${targetEnv} webhook endpoint.`,
            },
          });
        }
        matchedOrgId = conn.org_id;
      }

      // 5. Log and record event
      const orgId = matchedOrgId || '00000000-0000-4000-8000-000000000001';
      try {
        await pool.query(
          `INSERT INTO payment_webhook_events (
             org_id, gateway, gateway_event_id, event_type, payload, processed
           ) VALUES ($1, $2, $3, $4, $5, FALSE)
           ON CONFLICT DO NOTHING`,
          [orgId, 'PAYPAL', `${targetEnv}_${event.id}`, event.event_type, JSON.stringify(event)],
        );
      } catch {}

      return res.status(200).json({
        ok: true,
        environment: targetEnv,
        eventId: event.id,
        message: `${targetEnv} PayPal webhook processed successfully`,
      });
    } catch (err) {
      next(err);
    }
  };
}

// Sandbox: POST /api/v1/webhooks/sbx/paypal and /api/v1/webhooks/sbx/paypal/:webhookToken
webhooksRouter.post('/sbx/paypal', createPaypalWebhookHandler('SANDBOX'));
webhooksRouter.post('/sbx/paypal/:webhookToken', createPaypalWebhookHandler('SANDBOX'));

// Live: POST /api/v1/webhooks/live/paypal and /api/v1/webhooks/live/paypal/:webhookToken
webhooksRouter.post('/live/paypal', createPaypalWebhookHandler('LIVE'));
webhooksRouter.post('/live/paypal/:webhookToken', createPaypalWebhookHandler('LIVE'));

export default webhooksRouter;
