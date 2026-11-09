// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  environmentMiddleware,
  VALID_ENVIRONMENTS,
  GLOBAL_ROUTES,
  OPERATIONAL_ROUTES,
} from '../../src/middleware/environment.js';

test('environmentMiddleware unit tests', async (t) => {
  await t.test('constants are correctly configured', () => {
    assert.ok(VALID_ENVIRONMENTS.has('SANDBOX'));
    assert.ok(VALID_ENVIRONMENTS.has('LIVE'));
    assert.ok(VALID_ENVIRONMENTS.has('PRODUCTION'));
    assert.ok(VALID_ENVIRONMENTS.has('SIMULATED'));
    assert.ok(GLOBAL_ROUTES.includes('/api/v1/org'));
    assert.ok(GLOBAL_ROUTES.includes('/api/v1/members'));
    assert.ok(GLOBAL_ROUTES.includes('/api/v1/billing'));
    assert.ok(GLOBAL_ROUTES.includes('/api/v1/auth'));
    assert.ok(OPERATIONAL_ROUTES.includes('/api/v1/agents'));
  });

  await t.test('global route without header defaults to SANDBOX', () => {
    const req = {
      path: '/api/v1/org/profile',
      headers: {},
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let nextCalled = false;
    let nextErr = null;

    environmentMiddleware(req, res, (err) => {
      nextCalled = true;
      nextErr = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextErr, undefined);
    assert.equal(req.environment, 'SANDBOX');
    assert.equal(resHeaders['X-Jobenpay-Environment'], 'SANDBOX');
    assert.equal(resHeaders['X-Environment'], 'SANDBOX');
  });

  await t.test('global route with LIVE header sets environment to LIVE', () => {
    const req = {
      path: '/api/v1/billing/invoices',
      headers: { 'x-jobenpay-environment': 'LIVE' },
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let nextCalled = false;

    environmentMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.environment, 'LIVE');
    assert.equal(resHeaders['X-Jobenpay-Environment'], 'LIVE');
  });

  await t.test('global route with lowercase header normalizes to uppercase', () => {
    const req = {
      path: '/api/v1/members',
      headers: { 'x-jobenpay-environment': 'live' },
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };

    environmentMiddleware(req, res, () => {});

    assert.equal(req.environment, 'LIVE');
    assert.equal(resHeaders['X-Jobenpay-Environment'], 'LIVE');
  });

  await t.test('global route with invalid header falls back to default SANDBOX', () => {
    const req = {
      path: '/api/v1/auth/me',
      headers: { 'x-jobenpay-environment': 'INVALID_ENV' },
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };

    environmentMiddleware(req, res, () => {});

    assert.equal(req.environment, 'SANDBOX');
    assert.equal(resHeaders['X-Jobenpay-Environment'], 'SANDBOX');
  });

  await t.test('operational route (/api/v1/agents) without header fails with ENVIRONMENT_HEADER_MISSING (400)', () => {
    const req = {
      path: '/api/v1/agents',
      headers: {},
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let errResult = null;

    environmentMiddleware(req, res, (err) => {
      errResult = err;
    });

    assert.ok(errResult);
    assert.equal(errResult.code, 'ENVIRONMENT_HEADER_MISSING');
    assert.equal(errResult.httpStatus || errResult.statusCode, 400);
  });

  await t.test('operational route (/api/v1/agents) with invalid env fails with ENVIRONMENT_HEADER_MISSING (400)', () => {
    const req = {
      path: '/api/v1/agents',
      headers: { 'x-jobenpay-environment': 'UNKNOWN' },
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let errResult = null;

    environmentMiddleware(req, res, (err) => {
      errResult = err;
    });

    assert.ok(errResult);
    assert.equal(errResult.code, 'ENVIRONMENT_HEADER_MISSING');
    assert.equal(errResult.httpStatus || errResult.statusCode, 400);
  });

  await t.test('operational route (/api/v1/agents) with valid SANDBOX header passes', () => {
    const req = {
      path: '/api/v1/agents',
      headers: { 'x-jobenpay-environment': 'SANDBOX' },
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let nextCalled = false;
    let nextErr = null;

    environmentMiddleware(req, res, (err) => {
      nextCalled = true;
      nextErr = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextErr, undefined);
    assert.equal(req.environment, 'SANDBOX');
    assert.equal(resHeaders['X-Jobenpay-Environment'], 'SANDBOX');
    assert.equal(resHeaders['X-Environment'], 'SANDBOX');
  });

  await t.test('operational route (/api/v1/agents/:id) with valid LIVE header passes', () => {
    const req = {
      path: '/api/v1/agents/b083c267-96a6-42b7-a3cf-7393433a0110',
      headers: { 'x-jobenpay-environment': 'LIVE' },
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let nextCalled = false;
    let nextErr = null;

    environmentMiddleware(req, res, (err) => {
      nextCalled = true;
      nextErr = err;
    });

    assert.equal(nextCalled, true);
    assert.equal(nextErr, undefined);
    assert.equal(req.environment, 'LIVE');
    assert.equal(resHeaders['X-Jobenpay-Environment'], 'LIVE');
    assert.equal(resHeaders['X-Environment'], 'LIVE');
  });

  await t.test('operational route falls back to x-environment header', () => {
    const req = {
      path: '/api/v1/agents',
      headers: { 'x-environment': 'PRODUCTION' },
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let nextCalled = false;

    environmentMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.environment, 'PRODUCTION');
  });

  await t.test('operational route falls back to query param environment', () => {
    const req = {
      path: '/api/v1/agents',
      headers: {},
      query: { environment: 'SIMULATED' },
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let nextCalled = false;

    environmentMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.environment, 'SIMULATED');
  });

  await t.test('non-API route bypasses requirement and defaults to SANDBOX', () => {
    const req = {
      path: '/health',
      headers: {},
      query: {},
    };
    const resHeaders = {};
    const res = {
      setHeader(k, v) { resHeaders[k] = v; },
    };
    let nextCalled = false;

    environmentMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.environment, 'SANDBOX');
  });
});
