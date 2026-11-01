import crypto from 'node:crypto';
import http from 'node:http';

export async function createFakePaypalServer() {
  let verificationStatus = 'SUCCESS';
  let oauthStatus = 200;
  const payoutsByRequestId = new Map();
  const payoutsById = new Map();
  const payoutsBySenderBatchId = new Map();
  const transientFailures = new Map();
  const requestCounts = new Map();
  let lostPayoutResponses = 0;
  let lostPayoutRequests = 0;
  let payoutResponseFailures = [];
  let holdNextPayout = false;
  let payoutResponseHeld = false;
  let nextPayoutStatus = 'PENDING';
  let nextItemOverrides = {};
  let oauthCalls = 0;
  let verificationCalls = 0;

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');

    if (req.method === 'POST' && req.url === '/v1/oauth2/token') {
      oauthCalls += 1;
      if (req.headers.authorization !== `Basic ${Buffer.from('test-client:test-secret').toString('base64')}`
        || new URLSearchParams(rawBody).get('grant_type') !== 'client_credentials') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_client', client_secret: 'test-secret' }));
        return;
      }
      if (oauthStatus !== 200) {
        res.writeHead(oauthStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_client', client_secret: 'test-secret' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'fake-access-token', expires_in: 3600, token_type: 'Bearer' }));
      return;
    }

    if (req.headers.authorization !== 'Bearer fake-access-token') {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_token' }));
      return;
    }

    requestCounts.set(req.url, (requestCounts.get(req.url) || 0) + 1);
    const transient = transientFailures.get(req.url);
    if (transient && transient.remaining > 0) {
      transient.remaining -= 1;
      res.writeHead(transient.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name: 'TEMPORARY_FAILURE' }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/notifications/verify-webhook-signature') {
      verificationCalls += 1;
      const body = JSON.parse(rawBody);
      if (!body.auth_algo || !body.cert_url || !body.transmission_id
        || !body.transmission_sig || !body.transmission_time
        || !body.webhook_id || !body.webhook_event?.id) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'VALIDATION_ERROR' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ verification_status: verificationStatus }));
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/payments/payouts') {
      const requestId = req.headers['paypal-request-id'];
      const requestBody = JSON.parse(rawBody);
      const senderBatchId = requestBody.sender_batch_header?.sender_batch_id;
      if (!requestId) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'VALIDATION_ERROR' }));
        return;
      }
      if (!senderBatchId || !Array.isArray(requestBody.items) || requestBody.items.length !== 1) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'VALIDATION_ERROR' }));
        return;
      }
      if (lostPayoutRequests > 0) {
        lostPayoutRequests -= 1;
        req.socket.destroy();
        return;
      }
      if (!payoutsByRequestId.has(requestId) && !payoutsBySenderBatchId.has(senderBatchId)) {
        const payoutId = `PAYOUT-${payoutsById.size + 1}`;
        const item = { ...requestBody.items[0], ...nextItemOverrides };
        const result = {
          batch_header: {
            payout_batch_id: payoutId,
            batch_status: nextPayoutStatus,
            sender_batch_header: { sender_batch_id: senderBatchId },
          },
          items: [{
            payout_item_id: `ITEM-${payoutsById.size + 1}`,
            payout_item_status: 'PENDING',
            transaction_status: nextPayoutStatus === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
            payout_batch_id: payoutId,
            ...item,
          }],
        };
        payoutsByRequestId.set(requestId, result);
        payoutsById.set(payoutId, result);
        payoutsBySenderBatchId.set(senderBatchId, result);
      }
      const responseFailure = payoutResponseFailures.find((failure) => failure.remaining > 0);
      if (responseFailure) {
        responseFailure.remaining -= 1;
        res.writeHead(responseFailure.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'TEMPORARY_FAILURE' }));
        return;
      }
      if (holdNextPayout) {
        holdNextPayout = false;
        payoutResponseHeld = true;
        await new Promise((resolve) => {
          req.socket.once('close', resolve);
        });
        payoutResponseHeld = false;
        return;
      }
      if (lostPayoutResponses > 0) {
        lostPayoutResponses -= 1;
        req.socket.destroy();
        return;
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payoutsByRequestId.get(requestId) ?? payoutsBySenderBatchId.get(senderBatchId)));
      return;
    }

    const payoutMatch = new URL(req.url, 'http://fake-paypal.test')
      .pathname.match(/^\/v1\/payments\/payouts\/([^/]+)$/);
    if (req.method === 'GET' && payoutMatch) {
      const payout = payoutsById.get(payoutMatch[1]);
      if (!payout) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'RESOURCE_NOT_FOUND' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payout));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ name: 'RESOURCE_NOT_FOUND' }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    get oauthCalls() {
      return oauthCalls;
    },
    get verificationCalls() {
      return verificationCalls;
    },
    getRequestCount(path) {
      return requestCounts.get(path) || 0;
    },
    get uniquePayoutCount() {
      return payoutsByRequestId.size;
    },
    get payoutResponseHeld() {
      return payoutResponseHeld;
    },
    get payoutRequests() {
      return [...payoutsByRequestId.entries()].map(([idempotencyId, result]) => ({
        idempotencyId,
        result: JSON.parse(JSON.stringify(result)),
      }));
    },
    setVerificationStatus(status) {
      verificationStatus = status;
    },
    setOauthStatus(status) {
      oauthStatus = status;
    },
    setTransientFailures(path, status, count) {
      transientFailures.set(path, { status, remaining: count });
    },
    setPayoutResponseFailures(status, count = 1) {
      payoutResponseFailures.push({ status, remaining: count });
    },
    loseNextPayoutResponses(count = 1, { afterCreation = true } = {}) {
      if (afterCreation) {
        lostPayoutResponses = count;
      } else {
        lostPayoutRequests = count;
      }
    },
    holdNextPayoutResponse() {
      holdNextPayout = true;
    },
    setNextPayoutStatus(status) {
      nextPayoutStatus = status;
    },
    setNextItemOverrides(overrides) {
      nextItemOverrides = { ...overrides };
    },
    setPayoutStatus(payoutId, status) {
      const payout = payoutsById.get(payoutId);
      if (!payout) return false;
      payout.batch_header.batch_status = status;
      for (const item of payout.items) {
        item.transaction_status = status;
        item.payout_item_status = status;
      }
      return true;
    },
    buildWebhook(payoutId, eventType = 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED', overrides = {}) {
      const payout = payoutsById.get(payoutId);
      if (!payout) throw new Error(`Unknown fake payout: ${payoutId}`);
      const item = payout.items[0];
      return {
        event: {
          id: `EVENT-${crypto.randomUUID()}`,
          event_type: eventType,
          resource: {
            ...item,
            payout_item: {
              sender_item_id: item.sender_item_id,
              sender_batch_id: payout.batch_header.sender_batch_header.sender_batch_id,
              receiver: item.receiver,
              amount: item.amount,
              transaction_status: eventType.endsWith('FAILED') ? 'FAILED' : 'SUCCESS',
            },
            payout_batch_id: payoutId,
            ...overrides,
          },
        },
        headers: {
          'content-type': 'application/json',
          'paypal-auth-algo': 'SHA256withRSA',
          'paypal-cert-url': 'http://fake-paypal.test/cert',
          'paypal-transmission-id': crypto.randomUUID(),
          'paypal-transmission-sig': crypto.randomUUID(),
          'paypal-transmission-time': new Date().toISOString(),
        },
      };
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
