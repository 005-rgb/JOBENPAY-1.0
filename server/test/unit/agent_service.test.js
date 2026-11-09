// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listAgents,
  createAgent,
  getAgent,
  VALID_ENVIRONMENTS,
} from '../../src/services/agent_service.js';

test('agent_service unit tests', async (t) => {
  const dummyOrgId = '00000000-0000-4000-8000-000000000001';
  const dummyAgentId = '00000000-0000-4000-8000-000000000002';

  await t.test('VALID_ENVIRONMENTS contains expected values', () => {
    assert.ok(VALID_ENVIRONMENTS.has('SANDBOX'));
    assert.ok(VALID_ENVIRONMENTS.has('LIVE'));
    assert.ok(VALID_ENVIRONMENTS.has('PRODUCTION'));
    assert.ok(VALID_ENVIRONMENTS.has('SIMULATED'));
  });

  await t.test('listAgents validates required parameters', async () => {
    // Missing orgId
    await assert.rejects(
      async () => listAgents('', 'SANDBOX'),
      (err) => err.code === 'VALIDATION_FAILED' && err.httpStatus === 400,
    );

    // Missing environment
    await assert.rejects(
      async () => listAgents(dummyOrgId, ''),
      (err) => err.code === 'INVALID_ENVIRONMENT' && err.httpStatus === 400,
    );

    // Invalid environment
    await assert.rejects(
      async () => listAgents(dummyOrgId, 'INVALID'),
      (err) => err.code === 'INVALID_ENVIRONMENT' && err.httpStatus === 400,
    );
  });

  await t.test('listAgents queries database with orgId and environment', async () => {
    let capturedSql = '';
    let capturedParams = [];
    const mockDb = {
      async query(sql, params) {
        capturedSql = sql;
        capturedParams = params;
        return {
          rows: [
            { agent_id: dummyAgentId, name: 'Agent 1', status: 'ACTIVE', environment: 'LIVE' },
          ],
        };
      },
    };

    const agents = await listAgents(dummyOrgId, 'live', mockDb);
    assert.equal(agents.length, 1);
    assert.equal(agents[0].name, 'Agent 1');
    assert.ok(capturedSql.includes('WHERE org_id = $1 AND environment = $2'));
    assert.deepEqual(capturedParams, [dummyOrgId, 'LIVE']);
  });

  await t.test('createAgent validates required parameters', async () => {
    // Missing orgId
    await assert.rejects(
      async () => createAgent('', { name: 'Test' }),
      (err) => err.code === 'VALIDATION_FAILED' && err.httpStatus === 400,
    );

    // Missing name
    await assert.rejects(
      async () => createAgent(dummyOrgId, { name: '' }),
      (err) => err.code === 'VALIDATION_FAILED' && err.httpStatus === 400,
    );

    // Non-string name
    await assert.rejects(
      async () => createAgent(dummyOrgId, { name: 123 }),
      (err) => err.code === 'VALIDATION_FAILED' && err.httpStatus === 400,
    );

    // Invalid environment
    await assert.rejects(
      async () => createAgent(dummyOrgId, { name: 'Test', environment: 'BAD_ENV' }),
      (err) => err.code === 'INVALID_ENVIRONMENT' && err.httpStatus === 400,
    );
  });

  await t.test('createAgent persists agent with default and explicit fields', async () => {
    let capturedSql = '';
    let capturedParams = [];
    const mockDb = {
      async query(sql, params) {
        capturedSql = sql;
        capturedParams = params;
        return {
          rows: [
            {
              agent_id: dummyAgentId,
              id: dummyAgentId,
              org_id: params[0],
              name: params[1],
              description: params[2],
              status: params[3],
              environment: params[4],
            },
          ],
        };
      },
    };

    // Defaults without status or environment
    const agentDefault = await createAgent(dummyOrgId, { name: 'Default Agent' }, mockDb);
    assert.equal(agentDefault.name, 'Default Agent');
    assert.equal(agentDefault.description, null);
    assert.equal(agentDefault.status, 'ACTIVE');
    assert.equal(agentDefault.environment, 'SANDBOX');
    assert.deepEqual(capturedParams, [dummyOrgId, 'Default Agent', null, 'ACTIVE', 'SANDBOX']);

    // createAgent with null/empty status and empty environment to test defaults branch
    await createAgent(dummyOrgId, { name: 'Branch Agent', status: '', environment: '' }, mockDb);
    assert.deepEqual(capturedParams, [dummyOrgId, 'Branch Agent', null, 'ACTIVE', 'SANDBOX']);

    // Explicit values
    const agentCustom = await createAgent(
      dummyOrgId,
      {
        name: 'Custom Agent',
        description: 'A description',
        status: 'PAUSED',
        environment: 'LIVE',
      },
      mockDb,
    );
    assert.equal(agentCustom.name, 'Custom Agent');
    assert.equal(agentCustom.description, 'A description');
    assert.equal(agentCustom.status, 'PAUSED');
    assert.equal(agentCustom.environment, 'LIVE');
    assert.deepEqual(capturedParams, [dummyOrgId, 'Custom Agent', 'A description', 'PAUSED', 'LIVE']);
  });

  await t.test('getAgent validates required parameters', async () => {
    // Missing orgId
    await assert.rejects(
      async () => getAgent('', dummyAgentId),
      (err) => err.code === 'VALIDATION_FAILED' && err.httpStatus === 400,
    );

    // Missing agentId
    await assert.rejects(
      async () => getAgent(dummyOrgId, ''),
      (err) => err.code === 'VALIDATION_FAILED' && err.httpStatus === 400,
    );
  });

  await t.test('getAgent retrieves agent with or without environment filter', async () => {
    let capturedSql = '';
    let capturedParams = [];
    const mockDb = {
      async query(sql, params) {
        capturedSql = sql;
        capturedParams = params;
        if (params.includes('nonexistent')) {
          return { rows: [] };
        }
        return {
          rows: [
            {
              agent_id: dummyAgentId,
              id: dummyAgentId,
              org_id: dummyOrgId,
              name: 'Agent Found',
              environment: params.length === 3 ? params[2] : 'SANDBOX',
            },
          ],
        };
      },
    };

    // Without environment filter
    const foundNoEnv = await getAgent(dummyOrgId, dummyAgentId, null, mockDb);
    assert.ok(foundNoEnv);
    assert.equal(foundNoEnv.agent_id, dummyAgentId);
    assert.ok(!capturedSql.includes('AND environment = $3'));
    assert.deepEqual(capturedParams, [dummyOrgId, dummyAgentId]);

    // With environment filter
    const foundEnv = await getAgent(dummyOrgId, dummyAgentId, 'live', mockDb);
    assert.ok(foundEnv);
    assert.equal(foundEnv.environment, 'LIVE');
    assert.ok(capturedSql.includes('AND environment = $3'));
    assert.deepEqual(capturedParams, [dummyOrgId, dummyAgentId, 'LIVE']);

    // Not found
    const notFound = await getAgent(dummyOrgId, 'nonexistent', null, mockDb);
    assert.equal(notFound, null);
  });
});
