import http from 'node:http';

export async function createFakePaypalServer() {
  let verificationStatus = 'SUCCESS';
  let oauthStatus = 200;
  const payoutsByRequestId = new Map();
  const payoutsById = new Map();
  const transientFailures = new Map();
  const requestCounts = new Map();
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
      if (!requestId) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ name: 'VALIDATION_ERROR' }));
        return;
      }
      if (!payoutsByRequestId.has(requestId)) {
        const payoutId = `PAYOUT-${payoutsByRequestId.size + 1}`;
        const result = { batch_header: { payout_batch_id: payoutId, batch_status: 'PENDING' } };
        payoutsByRequestId.set(requestId, result);
        payoutsById.set(payoutId, result);
      }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payoutsByRequestId.get(requestId)));
      return;
    }

    const payoutMatch = req.url.match(/^\/v1\/payments\/payouts\/([^/]+)$/);
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
    setVerificationStatus(status) {
      verificationStatus = status;
    },
    setOauthStatus(status) {
      oauthStatus = status;
    },
    setTransientFailures(path, status, count) {
      transientFailures.set(path, { status, remaining: count });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
