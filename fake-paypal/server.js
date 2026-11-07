/**
 * fake-paypal/server.js
 * Fake PayPal Server untuk pengujian kontrak (Contract Test) dan simulasi sandbox lokal.
 *
 * Mengimplementasikan:
 * - OAuth 2.0 Token
 * - Orders API v2 (Capture & Authorize)
 * - Payments API v2 (Authorizations, Captures, Refunds)
 * - Payouts API v1 (Single & Batch)
 * - Invoicing API v2
 * - Subscriptions API v1
 * - Disputes API v1
 * - Webhook registration & verification
 * - Idempotensi ketat berbasis PayPal-Request-Id / sender_batch_id
 * - Mode kegagalan terprogram (failure-modes.js)
 */

import http from 'node:http';
import { parse as parseUrl } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { failureInjector } from './failure-modes.js';
import { OrderCaptureScenario } from './scenarios/order-capture.scenario.js';
import { OrderAuthorizeScenario } from './scenarios/order-authorize.scenario.js';
import { PayoutScenario } from './scenarios/payout.scenario.js';
import { InvoicingScenario } from './scenarios/invoicing.scenario.js';
import { SubscriptionsScenario } from './scenarios/subscriptions.scenario.js';
import { DisputesScenario } from './scenarios/disputes.scenario.js';

export class FakePayPalState {
  constructor() {
    this.reset();
  }

  reset() {
    this.orders = new Map();
    this.authorizations = new Map();
    this.captures = new Map();
    this.refunds = new Map();
    this.payouts = new Map();
    this.payoutsBySenderBatchId = new Map();
    this.payoutItems = new Map();
    this.invoices = new Map();
    this.products = new Map();
    this.plans = new Map();
    this.subscriptions = new Map();
    this.disputes = new Map();
    this.webhooks = new Map();
    this.idempotencyRecords = new Map(); // requestId -> { bodyHash, response }
  }
}

export function createFakePayPalServer() {
  const state = new FakePayPalState();
  const orderCapture = new OrderCaptureScenario(state);
  const orderAuth = new OrderAuthorizeScenario(state);
  const payout = new PayoutScenario(state);
  const invoicing = new InvoicingScenario(state);
  const subscriptions = new SubscriptionsScenario(state);
  const disputes = new DisputesScenario(state);

  const server = http.createServer(async (req, res) => {
    const parsed = parseUrl(req.url, true);
    const pathname = parsed.pathname;
    const method = req.method.toUpperCase();

    // 1. Baca Request Body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body = {};
    if (rawBody && req.headers['content-type']?.includes('application/json')) {
      try {
        body = JSON.parse(rawBody);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ name: 'INVALID_REQUEST', message: 'Malformed JSON payload' }));
        return;
      }
    } else if (rawBody && req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(rawBody);
      body = Object.fromEntries(params.entries());
    }

    // 2. Evaluasi Mode Kegagalan Terprogram
    const failure = await failureInjector.evaluate(method, pathname);
    if (failure) {
      res.writeHead(failure.statusCode, failure.headers);
      res.end(typeof failure.body === 'string' ? failure.body : JSON.stringify(failure.body));
      return;
    }

    // 3. Penegakan Idempotensi (PayPal-Request-Id)
    const requestId = req.headers['paypal-request-id'];
    if (requestId && method === 'POST') {
      const bodyHash = createHash('sha256').update(rawBody).digest('hex');
      const existing = state.idempotencyRecords.get(requestId);
      if (existing) {
        if (existing.bodyHash !== bodyHash) {
          // Kunci sama tapi payload berbeda -> Tolak tegas 422 / 400
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            name: 'IDEMPOTENCY_KEY_REUSED',
            message: `PayPal-Request-Id '${requestId}' was previously used with a different request payload.`
          }));
          return;
        }
        // Replay cached response
        res.writeHead(existing.response.status, existing.response.headers);
        res.end(JSON.stringify(existing.response.body));
        return;
      }
    }

    // Helper untuk mengirim respon dan mencatat idempotensi
    const sendJson = (status, data, extraHeaders = {}) => {
      const responsePayload = {
        status,
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: data
      };

      if (requestId && method === 'POST') {
        const bodyHash = createHash('sha256').update(rawBody).digest('hex');
        state.idempotencyRecords.set(requestId, { bodyHash, response: responsePayload });
      }

      res.writeHead(status, responsePayload.headers);
      res.end(data ? JSON.stringify(data) : '');
    };

    // -------------------------------------------------------------
    // RUTE-RUTE SIMULASI PAYPAL
    // -------------------------------------------------------------

    // Admin & Control Endpoints
    if (pathname === '/_fake/reset' && method === 'POST') {
      state.reset();
      failureInjector.reset();
      disputes.seedDefaultDisputes();
      sendJson(200, { success: true, message: 'Fake PayPal state and failures reset' });
      return;
    }

    if (pathname === '/_fake/failure' && method === 'POST') {
      failureInjector.addRule(body);
      sendJson(200, { success: true, message: 'Failure rule added' });
      return;
    }

    if (pathname === '/_fake/state' && method === 'GET') {
      sendJson(200, {
        ordersCount: state.orders.size,
        authorizationsCount: state.authorizations.size,
        capturesCount: state.captures.size,
        payoutsCount: state.payouts.size,
        invoicesCount: state.invoices.size,
        subscriptionsCount: state.subscriptions.size,
        disputesCount: state.disputes.size
      });
      return;
    }

    // OAuth 2.0 Token
    if (pathname === '/v1/oauth2/token' && method === 'POST') {
      sendJson(200, {
        scope: 'https://api.paypal.com/v1/payments/.* https://api.paypal.com/v1/vault/credit-card',
        access_token: `FAKE-SANDBOX-ACCESS-TOKEN-${Date.now()}`,
        token_type: 'Bearer',
        app_id: 'APP-JOBENPAY-SANDBOX-01',
        expires_in: 32400
      });
      return;
    }

    // Orders API v2
    if (pathname === '/v2/checkout/orders' && method === 'POST') {
      if (body.intent === 'AUTHORIZE') {
        const result = orderAuth.createOrder(body);
        sendJson(result.status, result.body);
      } else {
        const result = orderCapture.createOrder(body);
        sendJson(result.status, result.body);
      }
      return;
    }

    const orderCaptureMatch = pathname.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/);
    if (orderCaptureMatch && method === 'POST') {
      const orderId = decodeURIComponent(orderCaptureMatch[1]);
      const result = orderCapture.captureOrder(orderId, body);
      sendJson(result.status, result.body);
      return;
    }

    const orderAuthMatch = pathname.match(/^\/v2\/checkout\/orders\/([^/]+)\/authorize$/);
    if (orderAuthMatch && method === 'POST') {
      const orderId = decodeURIComponent(orderAuthMatch[1]);
      const result = orderAuth.authorizeOrder(orderId, body);
      sendJson(result.status, result.body);
      return;
    }

    const orderShowMatch = pathname.match(/^\/v2\/checkout\/orders\/([^/]+)$/);
    if (orderShowMatch && method === 'GET') {
      const orderId = decodeURIComponent(orderShowMatch[1]);
      const order = state.orders.get(orderId);
      if (!order) {
        sendJson(404, { name: 'RESOURCE_NOT_FOUND', message: 'Order not found' });
      } else {
        sendJson(200, order);
      }
      return;
    }

    const orderApproveMatch = pathname.match(/^\/(?:_fake\/orders|v2\/checkout\/orders)\/([^/]+)\/approve$/);
    if (orderApproveMatch && method === 'POST') {
      const orderId = decodeURIComponent(orderApproveMatch[1]);
      const result = orderCapture.approveOrder(orderId);
      sendJson(result.status, result.body);
      return;
    }

    // Payments API v2 - Authorizations
    const authCaptureMatch = pathname.match(/^\/v2\/payments\/authorizations\/([^/]+)\/capture$/);
    if (authCaptureMatch && method === 'POST') {
      const authId = decodeURIComponent(authCaptureMatch[1]);
      const result = orderAuth.captureAuthorization(authId, body);
      sendJson(result.status, result.body);
      return;
    }

    const authVoidMatch = pathname.match(/^\/v2\/payments\/authorizations\/([^/]+)\/void$/);
    if (authVoidMatch && method === 'POST') {
      const authId = decodeURIComponent(authVoidMatch[1]);
      const result = orderAuth.voidAuthorization(authId);
      sendJson(result.status, result.body);
      return;
    }

    const authShowMatch = pathname.match(/^\/v2\/payments\/authorizations\/([^/]+)$/);
    if (authShowMatch && method === 'GET') {
      const authId = decodeURIComponent(authShowMatch[1]);
      const auth = state.authorizations.get(authId);
      if (!auth) {
        sendJson(404, { name: 'RESOURCE_NOT_FOUND', message: 'Authorization not found' });
      } else {
        sendJson(200, auth);
      }
      return;
    }

    // Payments API v2 - Captures & Refunds
    const captureShowMatch = pathname.match(/^\/v2\/payments\/captures\/([^/]+)$/);
    if (captureShowMatch && method === 'GET') {
      const capId = decodeURIComponent(captureShowMatch[1]);
      const capture = state.captures.get(capId);
      if (!capture) {
        sendJson(404, { name: 'RESOURCE_NOT_FOUND', message: 'Capture not found' });
      } else {
        sendJson(200, capture);
      }
      return;
    }

    const captureRefundMatch = pathname.match(/^\/v2\/payments\/captures\/([^/]+)\/refund$/);
    if (captureRefundMatch && method === 'POST') {
      const capId = decodeURIComponent(captureRefundMatch[1]);
      const capture = state.captures.get(capId);
      if (!capture) {
        sendJson(404, { name: 'RESOURCE_NOT_FOUND', message: 'Capture not found' });
        return;
      }
      const refundId = `REF-${randomUUID().substring(0, 8).toUpperCase()}`;
      const refund = {
        id: refundId,
        status: 'COMPLETED',
        amount: body?.amount || capture.amount,
        create_time: new Date().toISOString()
      };
      state.refunds.set(refundId, refund);
      sendJson(201, refund);
      return;
    }

    const refundShowMatch = pathname.match(/^\/v2\/payments\/refunds\/([^/]+)$/);
    if (refundShowMatch && method === 'GET') {
      const refId = decodeURIComponent(refundShowMatch[1]);
      const refund = state.refunds.get(refId);
      if (!refund) {
        sendJson(404, { name: 'RESOURCE_NOT_FOUND', message: 'Refund not found' });
      } else {
        sendJson(200, refund);
      }
      return;
    }

    // Payouts API v1
    if (pathname === '/v1/payments/payouts' && method === 'POST') {
      const result = payout.createBatch(body, req.headers);
      sendJson(result.status, result.body);
      return;
    }

    const payoutBatchMatch = pathname.match(/^\/v1\/payments\/payouts\/([^/]+)$/);
    if (payoutBatchMatch && method === 'GET') {
      const batchId = decodeURIComponent(payoutBatchMatch[1]);
      const result = payout.getBatch(batchId);
      sendJson(result.status, result.body);
      return;
    }

    const payoutItemMatch = pathname.match(/^\/v1\/payments\/payouts-item\/([^/]+)$/);
    if (payoutItemMatch && method === 'GET') {
      const itemId = decodeURIComponent(payoutItemMatch[1]);
      const result = payout.getItem(itemId);
      sendJson(result.status, result.body);
      return;
    }

    // Invoicing API v2
    if (pathname === '/v2/invoicing/invoices' && method === 'POST') {
      const result = invoicing.createInvoice(body);
      sendJson(result.status, result.body);
      return;
    }

    const invoiceSendMatch = pathname.match(/^\/v2\/invoicing\/invoices\/([^/]+)\/send$/);
    if (invoiceSendMatch && method === 'POST') {
      const invId = decodeURIComponent(invoiceSendMatch[1]);
      const result = invoicing.sendInvoice(invId);
      sendJson(result.status, result.body);
      return;
    }

    const invoicePayMatch = pathname.match(/^\/v2\/invoicing\/invoices\/([^/]+)\/payments$/);
    if (invoicePayMatch && method === 'POST') {
      const invId = decodeURIComponent(invoicePayMatch[1]);
      const result = invoicing.recordPayment(invId, body);
      sendJson(result.status, result.body);
      return;
    }

    const invoiceCancelMatch = pathname.match(/^\/v2\/invoicing\/invoices\/([^/]+)\/cancel$/);
    if (invoiceCancelMatch && method === 'POST') {
      const invId = decodeURIComponent(invoiceCancelMatch[1]);
      const result = invoicing.cancelInvoice(invId);
      sendJson(result.status, result.body);
      return;
    }

    const invoiceShowMatch = pathname.match(/^\/v2\/invoicing\/invoices\/([^/]+)$/);
    if (invoiceShowMatch && method === 'GET') {
      const invId = decodeURIComponent(invoiceShowMatch[1]);
      const result = invoicing.getInvoice(invId);
      sendJson(result.status, result.body);
      return;
    }

    // Subscriptions API v1
    if (pathname === '/v1/catalogs/products' && method === 'POST') {
      const result = subscriptions.createProduct(body);
      sendJson(result.status, result.body);
      return;
    }

    if (pathname === '/v1/billing/plans' && method === 'POST') {
      const result = subscriptions.createPlan(body);
      sendJson(result.status, result.body);
      return;
    }

    if (pathname === '/v1/billing/subscriptions' && method === 'POST') {
      const result = subscriptions.createSubscription(body);
      sendJson(result.status, result.body);
      return;
    }

    const subShowMatch = pathname.match(/^\/v1\/billing\/subscriptions\/([^/]+)$/);
    if (subShowMatch && method === 'GET') {
      const subId = decodeURIComponent(subShowMatch[1]);
      const result = subscriptions.getSubscription(subId);
      sendJson(result.status, result.body);
      return;
    }

    const subCancelMatch = pathname.match(/^\/v1\/billing\/subscriptions\/([^/]+)\/cancel$/);
    if (subCancelMatch && method === 'POST') {
      const subId = decodeURIComponent(subCancelMatch[1]);
      const result = subscriptions.cancelSubscription(subId, body?.reason);
      sendJson(result.status, result.body);
      return;
    }

    // Disputes API v1 (resolusi kedua path AD-12)
    if ((pathname === '/v1/customer/disputes' || pathname === '/v1/customer-disputes') && method === 'GET') {
      const result = disputes.listDisputes();
      sendJson(result.status, result.body);
      return;
    }

    const disputeShowMatch = pathname.match(/^\/v1\/customer(?:-|\/)disputes\/([^/]+)$/);
    if (disputeShowMatch && method === 'GET') {
      const disputeId = decodeURIComponent(disputeShowMatch[1]);
      const result = disputes.getDispute(disputeId);
      sendJson(result.status, result.body);
      return;
    }

    const disputeEvidenceMatch = pathname.match(/^\/v1\/customer(?:-|\/)disputes\/([^/]+)\/provide-evidence$/);
    if (disputeEvidenceMatch && method === 'POST') {
      const disputeId = decodeURIComponent(disputeEvidenceMatch[1]);
      const result = disputes.provideEvidence(disputeId, body);
      sendJson(result.status, result.body);
      return;
    }

    const disputeAcceptMatch = pathname.match(/^\/v1\/customer(?:-|\/)disputes\/([^/]+)\/accept-claim$/);
    if (disputeAcceptMatch && method === 'POST') {
      const disputeId = decodeURIComponent(disputeAcceptMatch[1]);
      const result = disputes.acceptClaim(disputeId, body);
      sendJson(result.status, result.body);
      return;
    }

    // Webhooks API
    if (pathname === '/v1/notifications/webhooks' && method === 'POST') {
      const webhookId = `WH-${randomUUID().substring(0, 8).toUpperCase()}`;
      state.webhooks.set(webhookId, {
        id: webhookId,
        url: body?.url,
        event_types: body?.event_types || []
      });
      sendJson(201, {
        id: webhookId,
        url: body?.url,
        event_types: body?.event_types || [],
        links: [
          {
            href: `https://api-m.sandbox.paypal.com/v1/notifications/webhooks/${webhookId}`,
            rel: 'self',
            method: 'GET'
          }
        ]
      });
      return;
    }

    if (pathname === '/v1/notifications/verify-webhook-signature' && method === 'POST') {
      const mode = failureInjector.getWebhookMode();
      if (mode === 'invalid-signature') {
        sendJson(200, { verification_status: 'FAILURE' });
      } else {
        sendJson(200, { verification_status: 'SUCCESS' });
      }
      return;
    }

    // Fallback: 404 Not Found
    sendJson(404, {
      name: 'RESOURCE_NOT_FOUND',
      message: `The specified endpoint '${method} ${pathname}' does not exist on Fake PayPal Server.`
    });
  });

  return server;
}

// Standalone execution support
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const port = process.env.FAKE_PAYPAL_PORT || 8089;
  const server = createFakePayPalServer();
  server.listen(port, () => {
    console.log(`Fake PayPal Server listening on http://127.0.0.1:${port}`);
  });
}

