import test from 'node:test';
import assert from 'node:assert/strict';

import { closeTestApp, startTestApp } from './helpers/testApp.js';

const hasDatabase = Boolean(process.env.TEST_DATABASE_URL);

test('register endpoint returns REGISTRATION_DISABLED when disabled', async () => {
  const { server, url } = await startTestApp();
  try {
    const response = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@jobenpay.test', password: 'Password123!' }),
    });

    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.error.code, 'REGISTRATION_DISABLED');
  } finally {
    await closeTestApp(server);
  }
});

test('login flow is skipped without a configured test database', { skip: !hasDatabase }, async () => {
  const { server, url } = await startTestApp();
  try {
    const response = await fetch(`${url}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'owner@jobenpay.test', password: 'Password123!' }),
    });
    assert.ok(response.ok || response.status === 200);
  } finally {
    await closeTestApp(server);
  }
});
