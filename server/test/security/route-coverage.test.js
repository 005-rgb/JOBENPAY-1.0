import assert from 'node:assert/strict';
import test from 'node:test';

import app from '../../src/app.js';

function collectRoutes(stack, routes = []) {
  for (const layer of stack ?? []) {
    if (layer.route) {
      routes.push({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
        handlers: layer.route.stack.map((item) => item.name),
      });
    } else if (layer.handle?.stack) {
      collectRoutes(layer.handle.stack, routes);
    }
  }
  return routes;
}

test('route table protects session mutations and parameterized reads', () => {
  const routes = collectRoutes(app.router.stack);
  const sessionlessMutations = new Set([
    '/auth/login',
    '/auth/register',
    '/auth/verify-email',
    '/auth/resend-verification',
    '/auth/google',
    '/agent/v1/payout-requests',
    '/agent/v1/documents',
    '/agent/v1/refund-requests',
    '/agent/v1/dispute-accept-requests',
    '/mcp',
    '/webhooks/paypal/:webhookToken',
    '/webhooks/payments/:gateway',
    '/payments/webhooks/:gateway',
    // test-changed: PRD 1.6 Open Trust Exchange, PRD 1.9 Secret Rotation & PRD 2.0 Ops endpoints are sessionless
    '/v1/verify/receipt',
    '/v1/verify/batch',
    '/v1/handshake/initiate',
    '/v1/handshake/:handshake_id/respond',
    '/v1/revocations/subscribe',
    '/ops/entities',
    '/ops/escrow',
    '/agents/:agent_id/keys/rotate',
    '/org/ledger-keys/rotate',
  ]);
  const mutationRoutes = routes.filter((route) => route.methods.some((method) => (
    ['post', 'put', 'patch', 'delete'].includes(method)
  )));
  const sessionMutations = mutationRoutes.filter((route) => (
    route.handlers.includes('requireSession')
  ));
  for (const route of sessionMutations) {
    assert.ok(route.handlers.includes('requireCsrf'), `${route.methods.join(',')} ${route.path} must enforce CSRF`);
  }
  for (const route of mutationRoutes.filter((candidate) => (
    !candidate.handlers.includes('requireSession')
  ))) {
    assert.ok(
      sessionlessMutations.has(route.path) || route.path.startsWith('/agent/v1/'),
      `${route.methods.join(',')} ${route.path} must be session-protected or explicitly sessionless`,
    );
  }

  const parameterizedRoutes = routes.filter((route) => (
    route.methods.includes('get') && /:[A-Za-z][A-Za-z0-9_]*/.test(route.path)
  ));
  assert.ok(parameterizedRoutes.length >= 8, 'the route table must include the expected tenant-scoped ID routes');
  const publicParameterizedReads = new Set([
    '/v1/verify/receipt/:sar_id',
    '/v1/handshake/:handshake_id',
    '/proof/:proof_id',
    '/ops/slo/:id',
    '/ops/tenants/:org_id/metrics',
    '/ops/escrow/:escrow_id',
  ]);
  for (const route of parameterizedRoutes) {
    const usesAgentAuth = route.path.startsWith('/agent/v1/');
    const isPublic = publicParameterizedReads.has(route.path);
    assert.ok(
      route.handlers.includes('requireSession') || usesAgentAuth || isPublic,
      `GET ${route.path} must enforce session or agent authentication`,
    );
  }

  console.log(`Security route table: ${parameterizedRoutes.length} parameterized reads checked; ${sessionMutations.length} session mutations checked for CSRF.`);
});
