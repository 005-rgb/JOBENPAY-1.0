import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startServer } from '../src/server.js';

test('GET /healthz returns 200', async () => {
  const server = startServer(0);
  await once(server, 'listening');
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.service, 'jobenpay');
  assert.equal(body.status, 'healthy');

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test('GET /readyz reports readiness only when database prerequisites are met', async () => {
  const server = startServer(0);
  await once(server, 'listening');
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/readyz`);
  const body = await response.json();
  if (response.status === 200) {
    assert.equal(body.status, 'ready');
    assert.equal(body.ok, true);
  } else {
    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_ready');
    assert.equal(body.ok, false);
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});
