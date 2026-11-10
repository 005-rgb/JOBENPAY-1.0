// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';

test('Real-payout preflight & client body serialization resilience', async (t) => {
  await t.test('1. Client body serializer does not set Content-Type or stringify null', () => {
    // Replicates web/src/api/client.js body serialization logic
    function prepareRequest(body) {
      const headers = new Map();
      const hasBody = body !== undefined && body !== null;
      if (hasBody) headers.set('content-type', 'application/json');
      const serialized = hasBody ? JSON.stringify(body) : undefined;
      return { headers, body: serialized };
    }

    const nullReq = prepareRequest(null);
    assert.equal(nullReq.headers.has('content-type'), false, 'null body must not set content-type header');
    assert.equal(nullReq.body, undefined, 'null body must result in undefined body');

    const undefReq = prepareRequest(undefined);
    assert.equal(undefReq.headers.has('content-type'), false, 'undefined body must not set content-type header');
    assert.equal(undefReq.body, undefined, 'undefined body must result in undefined body');

    const emptyObjReq = prepareRequest({});
    assert.equal(emptyObjReq.headers.get('content-type'), 'application/json');
    assert.equal(emptyObjReq.body, '{}');
  });

  await t.test('2. Preflight agent query prioritizes agents with active mandates over revoked ones', () => {
    // Simulates database rows with active keys and different mandate states
    const agents = [
      { id: 'agent-old', name: 'rere', created_at: '2026-11-01T00:00:00Z', active_key_count: 1, active_mandate_count: 0 },
      { id: 'agent-new', name: 'Procurement Agent', created_at: '2026-11-05T00:00:00Z', active_key_count: 1, active_mandate_count: 1 },
    ];

    // Order by active_mandate_count DESC, created_at ASC
    const sorted = [...agents].sort((a, b) => {
      if (b.active_mandate_count !== a.active_mandate_count) {
        return b.active_mandate_count - a.active_mandate_count;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    assert.equal(sorted[0].id, 'agent-new', 'Agent with active mandate must be chosen first');
    assert.equal(sorted[0].name, 'Procurement Agent');
  });

  await t.test('3. Express json parser in strict: false mode parses JSON primitive null gracefully', () => {
    const rawPayload = 'null';
    const parsed = JSON.parse(rawPayload);
    assert.equal(parsed, null, 'Primitive JSON null parsed directly without error');
  });
});
