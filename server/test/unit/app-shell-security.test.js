import assert from 'node:assert/strict';
import test from 'node:test';

import { closeTestApp, startTestApp } from '../helpers/testApp.js';

test('web responses include the specified content security policy', async () => {
  const { server, url } = await startTestApp();
  try {
    const response = await fetch(`${url}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('content-security-policy'),
      "default-src 'self';script-src 'self';style-src 'self';style-src-attr 'unsafe-inline';img-src 'self' data:;connect-src 'self';frame-ancestors 'none';base-uri 'self';form-action 'self'",
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'same-origin');
    assert.match(response.headers.get('strict-transport-security') || '', /max-age=/);
  } finally {
    await closeTestApp(server);
  }
});

test('feedback API requires an authenticated session and CSRF validation', async () => {
  const { server, url } = await startTestApp();
  try {
    const response = await fetch(`${url}/api/v1/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'A feedback message' }),
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, 'UNAUTHENTICATED');
    assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  } finally {
    await closeTestApp(server);
  }
});
