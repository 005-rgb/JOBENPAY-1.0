import { pathToFileURL } from 'node:url';

import { env } from '../src/config.js';
import pool from '../src/db/pool.js';
import { hashPassword, randomToken } from '../src/lib/crypto.js';
import { createAgentKey } from '../src/repositories/agents.js';
import { preparePayeeIdentifier } from '../src/lib/payeeIdentifiers.js';
import { createAgentApiKey, hashAgentApiKey } from '../src/lib/agentApiKeys.js';

const DEMO_USERS = [
  { key: 'OWNER', email: 'owner@jobenpay.test', role: 'OWNER', isJudge: false },
  { key: 'JUDGE', email: 'judge@jobenpay.test', role: 'OWNER', isJudge: true },
  { key: 'APPROVER', email: 'approver@jobenpay.test', role: 'APPROVER', isJudge: false },
  { key: 'VIEWER', email: 'viewer@jobenpay.test', role: 'VIEWER', isJudge: false },
];

const DEMO_PAYEES = [
  { name: 'SYNTHETIC Trusted Payee', email: 'trusted@synthetic.test', trust: 'TRUSTED' },
  { name: 'SYNTHETIC Pending Payee', email: 'pending@synthetic.test', trust: 'PENDING_REVIEW' },
  { name: 'SYNTHETIC Blocked Payee', email: 'blocked@synthetic.test', trust: 'BLOCKED' },
];

function configuredPassword(userKey) {
  const value = process.env[`SEED_${userKey}_PASSWORD`];
  if (value !== undefined && value.length < 12) {
    throw new Error(`SEED_${userKey}_PASSWORD must contain at least 12 characters.`);
  }
  return value || null;
}

async function ensureUser(tx, user, output) {
  const configured = configuredPassword(user.key);
  const existing = await tx.query(
    'SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [user.email],
  );
  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const password = configured || randomToken(24);
  const passwordHash = await hashPassword(password);
  const created = await tx.query(
    `INSERT INTO users (email, password_hash, display_name, locale)
     VALUES ($1, $2, $3, 'en')
     RETURNING id`,
    [user.email, passwordHash, `SYNTHETIC ${user.key}`],
  );
  if (!process.env[`SEED_${user.key}_PASSWORD`]) {
    output.push({ label: `${user.key} seed password`, value: password });
  }
  return created.rows[0].id;
}

export async function seedDemoData(db = pool, { write = (value) => process.stdout.write(value) } = {}) {
  if (!env.JOBENPAY_ENC_KEY) {
    throw new Error('JOBENPAY_ENC_KEY is required to seed payees.');
  }
  if (!env.JOBENPAY_HMAC_PEPPER) {
    throw new Error('JOBENPAY_HMAC_PEPPER is required to seed agent keys and payees.');
  }

  const generatedCredentials = [];
  const tx = await db.connect();
  try {
    await tx.query('BEGIN');
    await tx.query('SELECT pg_advisory_xact_lock($1)', [20261031]);
    const orgResult = await tx.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('JOBENPAY Demo', 'jobenpay-demo')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );
    const orgId = orgResult.rows[0].id;

    for (const user of DEMO_USERS) {
      const userId = await ensureUser(tx, user, generatedCredentials);
      await tx.query(
        `INSERT INTO memberships (org_id, user_id, role, is_judge)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_id, user_id)
         DO UPDATE SET role = EXCLUDED.role, is_judge = EXCLUDED.is_judge`,
        [orgId, userId, user.role, user.isJudge],
      );
    }

    let agentResult = await tx.query(
      `SELECT id
       FROM agents
       WHERE org_id = $1 AND name = 'Demo Payables Agent'
       LIMIT 1`,
      [orgId],
    );
    let agentId = agentResult.rows[0]?.id;
    if (!agentId) {
      agentResult = await tx.query(
        `INSERT INTO agents (org_id, name, description, status)
         VALUES ($1, 'Demo Payables Agent', 'SYNTHETIC demo agent', 'ACTIVE')
         RETURNING id`,
        [orgId],
      );
      agentId = agentResult.rows[0].id;
    } else {
      await tx.query(
        `UPDATE agents
         SET description = 'SYNTHETIC demo agent', status = 'ACTIVE'
         WHERE org_id = $1 AND id = $2`,
        [orgId, agentId],
      );
    }

    const existingKey = await tx.query(
      `SELECT id
       FROM agent_api_keys
      WHERE org_id = $1 AND agent_id = $2 AND revoked_at IS NULL
       LIMIT 1`,
      [orgId, agentId],
    );
    if (!existingKey.rowCount) {
      const { prefix, apiKey } = createAgentApiKey();
      await createAgentKey(orgId, agentId, {
        prefix,
        keyHash: hashAgentApiKey(env.JOBENPAY_HMAC_PEPPER, apiKey),
      }, tx);
      generatedCredentials.push({ label: 'Demo agent API key', value: apiKey });
    }

    for (const payee of DEMO_PAYEES) {
      const fields = preparePayeeIdentifier(orgId, payee.email, 'EMAIL', {
        encryptionKey: env.JOBENPAY_ENC_KEY,
        pepper: env.JOBENPAY_HMAC_PEPPER,
      });
      const existing = await tx.query(
        'SELECT id FROM payees WHERE org_id = $1 AND identifier_hmac = $2 LIMIT 1',
        [orgId, fields.identifierHmac],
      );
      if (existing.rowCount) {
        await tx.query(
          `UPDATE payees
           SET display_name = $3, trust = $4
           WHERE org_id = $1 AND id = $2`,
          [orgId, existing.rows[0].id, payee.name, payee.trust],
        );
      } else {
        await tx.query(
          `INSERT INTO payees (
             org_id, display_name, kind, identifier_enc, identifier_hmac, identifier_masked, trust
           )
           VALUES ($1, $2, 'EMAIL', $3, $4, $5, $6)`,
          [orgId, payee.name, fields.identifierEnc, fields.identifierHmac, fields.identifierMasked, payee.trust],
        );
      }
    }

    await tx.query('COMMIT');
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    tx.release();
  }

  for (const credential of generatedCredentials) {
    write(`${credential.label}: ${credential.value}\n`);
  }
  write('SYNTHETIC demo organization, agent, and payees are ready.\n');
}

async function main() {
  try {
    await seedDemoData();
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
