import crypto from 'node:crypto';

import { canonicalJson } from '../../../shared/canonical.js';
import { parsePolicy } from '../../../shared/policy.schema.js';
import { env } from '../config.js';
import { query } from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { appendEntry, LEDGER_TYPES } from './ledger.js';
import { kidFromPublicKey, signEd25519 } from '../lib/crypto.js';

function mandateError(code, message, statusCode = 400) {
  const error = new AppError(code, message);
  error.statusCode = statusCode;
  return error;
}

function publicPolicyRow(row) {
  return {
    id: row.id,
    mandateId: row.mandate_id,
    version: row.version,
    purposeText: row.purpose_text,
    policy: row.policy,
    policyCanonical: row.policy_canonical,
    policyHash: row.policy_hash,
    signature: row.signature,
    signingKid: row.signing_kid,
    activatedBy: row.activated_by,
    activatedAt: row.activated_at,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
  };
}

export function validatePolicy(policy) {
  try {
    return parsePolicy(policy);
  } catch (error) {
    error.code = 'VALIDATION_FAILED';
    error.statusCode = 400;
    throw error;
  }
}

export async function createMandate(tx, { orgId, agentId, name, policy, purposeText, promptVersion }) {
  const parsed = validatePolicy(policy);
  const mandate = await tx.query(
    `INSERT INTO mandates (org_id, agent_id, name, status) VALUES ($1, $2, $3, 'DRAFT') RETURNING *`,
    [orgId, agentId, name],
  );
  const version = await tx.query(
    `INSERT INTO mandate_versions (org_id, mandate_id, version, purpose_text, policy, prompt_version, valid_from, valid_to)
     VALUES ($1, $2, 1, $3, $4, $5, $6, $7) RETURNING *`,
    [orgId, mandate.rows[0].id, purposeText ?? parsed.purpose, parsed, promptVersion ?? null, parsed.validFrom, parsed.validTo],
  );
  await tx.query(
    'UPDATE mandates SET current_version_id = $1 WHERE org_id = $2 AND id = $3',
    [version.rows[0].id, orgId, mandate.rows[0].id],
  );
  return {
    mandate: { ...mandate.rows[0], current_version_id: version.rows[0].id },
    version: publicPolicyRow(version.rows[0]),
  };
}

export async function addMandateVersion(tx, { orgId, mandateId, policy, purposeText, promptVersion }) {
  const parsed = validatePolicy(policy);
  const locked = await tx.query(
    'SELECT id FROM mandates WHERE org_id = $1 AND id = $2 FOR UPDATE',
    [orgId, mandateId],
  );
  if (!locked.rowCount) throw mandateError('NOT_FOUND', 'Mandate not found.', 404);
  const latest = await tx.query(
    'SELECT COALESCE(MAX(version), 0) AS version FROM mandate_versions WHERE org_id = $1 AND mandate_id = $2',
    [orgId, mandateId],
  );
  const version = await tx.query(
    `INSERT INTO mandate_versions (org_id, mandate_id, version, purpose_text, policy, prompt_version, valid_from, valid_to)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [orgId, mandateId, Number(latest.rows[0].version) + 1, purposeText ?? parsed.purpose, parsed, promptVersion ?? null, parsed.validFrom, parsed.validTo],
  );
  return publicPolicyRow(version.rows[0]);
}

export async function getMandate(orgId, mandateId, db = query) {
  const result = await db(
    `SELECT m.*, v.id AS version_id, v.version, v.purpose_text, v.policy, v.policy_canonical,
            v.policy_hash, v.signature, v.signing_kid, v.activated_by, v.activated_at,
            v.valid_from, v.valid_to, v.prompt_version, v.created_at AS version_created_at
     FROM mandates m LEFT JOIN mandate_versions v ON v.id = m.current_version_id
     WHERE m.org_id = $1 AND m.id = $2 LIMIT 1`,
    [orgId, mandateId],
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  const versions = await db(
    `SELECT * FROM mandate_versions
     WHERE org_id = $1 AND mandate_id = $2
     ORDER BY version DESC`,
    [orgId, mandateId],
  );
  return {
    ...row,
    currentVersion: row.version_id ? publicPolicyRow({ ...row, id: row.version_id, mandate_id: row.id, created_at: row.version_created_at }) : null,
    versions: versions.rows.map(publicPolicyRow),
  };
}

export async function listMandates(orgId, db = { query }) {
  const result = await db.query(
    `SELECT m.*, v.version, v.policy, v.activated_at
     FROM mandates m LEFT JOIN mandate_versions v ON v.id = m.current_version_id
     WHERE m.org_id = $1 ORDER BY m.created_at DESC, m.id`,
    [orgId],
  );
  return result.rows;
}

export async function activateMandate(tx, {
  orgId, mandateId, versionId, actorId, grantId, sessionId, systemActor = null,
}) {
  const locked = await tx.query(
    `SELECT * FROM mandates WHERE org_id = $1 AND id = $2 FOR UPDATE`,
    [orgId, mandateId],
  );
  if (!locked.rowCount) throw mandateError('NOT_FOUND', 'Mandate not found.', 404);
  const mandate = locked.rows[0];
  const latest = await tx.query(
    `SELECT * FROM mandate_versions WHERE org_id = $1 AND mandate_id = $2 ORDER BY version DESC LIMIT 1`,
    [orgId, mandateId],
  );
  const version = latest.rows[0];
  if (!version || version.id !== versionId) throw mandateError('VALIDATION_FAILED', 'Only the latest mandate version can be activated.', 409);
  if (version.activated_at) throw mandateError('VALIDATION_FAILED', 'An activated mandate version is immutable; create a new version.', 409);
  const other = await tx.query(
    `SELECT id FROM mandates WHERE org_id = $1 AND agent_id = $2 AND status = 'ACTIVE' AND id <> $3 FOR UPDATE`,
    [orgId, mandate.agent_id, mandateId],
  );
  if (other.rowCount) throw mandateError('MANDATE_ALREADY_ACTIVE', 'The agent already has an active mandate.', 409);
  if (!systemActor) {
    const grant = await tx.query(
      `UPDATE step_up_grants SET consumed_at = now()
       WHERE id = $1 AND user_id = $2 AND session_id = $3 AND purpose = 'ACTIVATE_MANDATE'
         AND consumed_at IS NULL AND expires_at > now() RETURNING id`,
      [grantId, actorId, sessionId],
    );
    if (!grant.rowCount) throw mandateError('STEP_UP_REQUIRED', 'Step-up authentication required.', 403);
  }
  const policy = validatePolicy(version.policy);
  const canonical = canonicalJson(policy);
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  const privateKey = env.JOBENPAY_LEDGER_SIGNING_KEY;
  if (!privateKey) throw new Error('JOBENPAY_LEDGER_SIGNING_KEY is required for mandate activation.');
  const publicKey = crypto.createPublicKey(crypto.createPrivateKey({
    key: Buffer.from(privateKey, 'base64'), format: 'der', type: 'pkcs8',
  })).export({ format: 'der', type: 'spki' }).toString('base64');
  const signature = signEd25519(privateKey, hash);
  const updated = await tx.query(
    `UPDATE mandate_versions
     SET policy_canonical = $1, policy_hash = $2, signature = $3, signing_kid = $4,
         activated_by = $5, activated_at = now(), valid_from = $6, valid_to = $7
     WHERE id = $8 RETURNING *`,
    [canonical, hash, signature, kidFromPublicKey(publicKey), systemActor ? null : actorId, policy.validFrom, policy.validTo, version.id],
  );
  await tx.query(
    `UPDATE mandates SET status = 'ACTIVE', current_version_id = $1 WHERE id = $2 AND org_id = $3`,
    [version.id, mandateId, orgId],
  );
  await appendEntry(tx, {
    orgId,
    type: LEDGER_TYPES.MANDATE_ACTIVATED,
    subjectType: 'MANDATE',
    subjectId: mandateId,
    payload: {
      mandateId,
      versionId: version.id,
      policyHash: hash,
      signingKid: kidFromPublicKey(publicKey),
      activatedBy: systemActor || actorId,
    },
  });
  return publicPolicyRow(updated.rows[0]);
}

export async function changeMandateStatus(tx, { orgId, mandateId, actorId, status }) {
  const result = await tx.query(
    `UPDATE mandates SET status = $3 WHERE org_id = $1 AND id = $2 AND status NOT IN ('REVOKED', 'EXPIRED') RETURNING *`,
    [orgId, mandateId, status],
  );
  if (!result.rowCount) throw mandateError('NOT_FOUND', 'Mandate not found or already final.', 404);
  const type = status === 'SUSPENDED' ? LEDGER_TYPES.MANDATE_SUSPENDED : LEDGER_TYPES.MANDATE_REVOKED;
  await appendEntry(tx, {
    orgId, type, subjectType: 'MANDATE', subjectId: mandateId, payload: { mandateId, changedBy: actorId },
  });
  return result.rows[0];
}

export async function expireMandates(tx) {
  const result = await tx.query(
    `UPDATE mandates m SET status = 'EXPIRED'
     WHERE m.status = 'ACTIVE' AND EXISTS (
       SELECT 1 FROM mandate_versions v
       WHERE v.id = m.current_version_id AND v.valid_to < now()
     )
     AND EXISTS (
       SELECT 1 FROM organizations o
       WHERE o.id = m.org_id AND o.archived_at IS NULL
     )
     RETURNING m.id, m.org_id`,
  );
  for (const mandate of result.rows) {
    await appendEntry(tx, {
      orgId: mandate.org_id,
      type: LEDGER_TYPES.MANDATE_EXPIRED,
      subjectType: 'MANDATE',
      subjectId: mandate.id,
      payload: { mandateId: mandate.id, reason: 'expired' },
    });
  }
  return result;
}
