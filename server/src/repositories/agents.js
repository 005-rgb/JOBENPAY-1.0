import pool from '../db/pool.js';

function assertOrgId(orgId) {
  if (!orgId) {
    throw new Error('orgId is required for agent repository methods.');
  }
}

export async function listAgents(orgId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT id, org_id, name, description, status, created_at
     FROM agents
     WHERE org_id = $1
     ORDER BY created_at DESC, id`,
    [orgId],
  );
  return result.rows;
}

export async function getAgent(orgId, agentId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT id, org_id, name, description, status, created_at
     FROM agents
     WHERE org_id = $1 AND id = $2
     LIMIT 1`,
    [orgId, agentId],
  );
  return result.rows[0] ?? null;
}

export async function createAgent(orgId, { name, description, status = 'ACTIVE' }, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `INSERT INTO agents (org_id, name, description, status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, org_id, name, description, status, created_at`,
    [orgId, name, description ?? null, status],
  );
  return result.rows[0];
}

export async function updateAgent(orgId, agentId, { name, description, status }, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `UPDATE agents
     SET name = COALESCE($3, name),
         description = CASE WHEN $4::boolean THEN $5 ELSE description END,
         status = COALESCE($6, status)
     WHERE org_id = $1 AND id = $2
     RETURNING id, org_id, name, description, status, created_at`,
    [
      orgId,
      agentId,
      name ?? null,
      description !== undefined,
      description ?? null,
      status ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function listAgentKeys(orgId, agentId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `SELECT id, prefix, last_used_at, revoked_at, created_at
     FROM agent_api_keys
     WHERE org_id = $1 AND agent_id = $2
     ORDER BY created_at DESC, id`,
    [orgId, agentId],
  );
  return result.rows;
}

export async function getAgentKeysByPrefix(prefix, db = pool) {
  if (!prefix) {
    throw new Error('prefix is required for API key authentication.');
  }
  const result = await db.query(
    `SELECT keys.id, keys.org_id, keys.agent_id, keys.key_hash, keys.revoked_at,
            agents.status AS agent_status
     FROM agent_api_keys AS keys
     JOIN agents ON agents.org_id = keys.org_id AND agents.id = keys.agent_id
     WHERE keys.prefix = $1
     ORDER BY keys.created_at DESC, keys.id`,
    [prefix],
  );
  return result.rows;
}

export async function createAgentKey(orgId, agentId, { prefix, keyHash }, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `INSERT INTO agent_api_keys (org_id, agent_id, prefix, key_hash)
     SELECT $1, agents.id, $3, $4
     FROM agents
     WHERE agents.org_id = $1 AND agents.id = $2
     RETURNING id, org_id, agent_id, prefix, last_used_at, revoked_at, created_at`,
    [orgId, agentId, prefix, keyHash],
  );
  return result.rows[0] ?? null;
}

export async function revokeAgentKey(orgId, agentId, keyId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `UPDATE agent_api_keys
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE org_id = $1 AND agent_id = $2 AND id = $3
     RETURNING id, revoked_at`,
    [orgId, agentId, keyId],
  );
  return result.rows[0] ?? null;
}

export async function revokeActiveAgentKeys(orgId, agentId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `UPDATE agent_api_keys
     SET revoked_at = now()
     WHERE org_id = $1 AND agent_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [orgId, agentId],
  );
  return result.rows;
}

export async function touchAgentKey(orgId, keyId, db = pool) {
  assertOrgId(orgId);
  const result = await db.query(
    `UPDATE agent_api_keys
     SET last_used_at = CASE
       WHEN last_used_at IS NULL OR last_used_at < now() - interval '1 minute' THEN now()
       ELSE last_used_at
     END
     WHERE org_id = $1 AND id = $2 AND revoked_at IS NULL
       AND EXISTS (
         SELECT 1
         FROM agents
         WHERE agents.org_id = agent_api_keys.org_id
           AND agents.id = agent_api_keys.agent_id
           AND agents.status = 'ACTIVE'
       )
     RETURNING id`,
    [orgId, keyId],
  );
  return result.rowCount === 1;
}
