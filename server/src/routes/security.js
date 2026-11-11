// @ts-check
import { Router } from 'express';
import { z } from 'zod';
import pool from '../db/pool.js';
import { AppError } from '../lib/errors.js';
import { getAgent } from '../repositories/agents.js';
import {
  listKeys,
  rotateKey,
  getPqcMigrationStatus,
  getSupportedAlgorithms,
} from '../services/pqc_service.js';
import {
  detectRogueAgent,
  getSecurityEvents,
} from '../services/threat_detection.js';
import {
  verifyArtifact,
  recordAttestation,
  getAttestation,
  listAttestations,
} from '../services/supply_chain.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidUuid(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

const RotateKeySchema = z.object({
  purpose: z.enum(['SIGNING', 'ENCRYPTION', 'TLS', 'KEM', 'JWT']),
  algorithm: z.enum([
    'ED25519', 'ML-DSA-65', 'SLH-DSA-SHA2-128S',
    'X25519', 'ML-KEM-768', 'X25519MLKEM768',
    'AES-256-GCM', 'HMAC-SHA256'
  ]),
});

const AttestationSchema = z.object({
  artifactName: z.string().min(1),
  artifactVersion: z.string().min(1),
  artifactHash: z.string().min(8),
  sbomFormat: z.enum(['CYCLONEDX', 'SPDX']).default('CYCLONEDX'),
  sbomHash: z.string().optional(),
  provenanceHash: z.string().optional(),
  slsaLevel: z.number().int().min(1).max(4).default(3),
  cosignSignature: z.string().min(10),
});

/**
 * Factory for PRD 5.0 Security Router
 */
export function createSecurityRouter({
  requireSession,
  requireRole,
  requireCsrf,
}) {
  const router = Router();

  // 1. GET /keys - List cryptographic keys for tenant
  router.get(
    '/security/keys',
    requireSession,
    requireRole('OWNER', 'ADMIN', 'JUDGE'),
    async (req, res, next) => {
      try {
        const orgId = req.session?.current_org_id || req.membership?.org_id;
        if (!orgId) throw new AppError('ORG_ID_REQUIRED', 400, 'Organization ID is required.');
        const keys = await listKeys(orgId, req.query);
        return res.status(200).json({ ok: true, keys });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 2. POST /keys/rotate - Rotate key with cryptographic agility
  router.post(
    '/security/keys/rotate',
    requireSession,
    requireCsrf,
    requireRole('OWNER', 'ADMIN'),
    async (req, res, next) => {
      try {
        const orgId = req.session?.current_org_id || req.membership?.org_id;
        if (!orgId) throw new AppError('ORG_ID_REQUIRED', 400, 'Organization ID is required.');

        const parseResult = RotateKeySchema.safeParse(req.body);
        if (!parseResult.success) {
          throw new AppError('VALIDATION_ERROR', 400, parseResult.error.message);
        }

        const { purpose, algorithm } = parseResult.data;
        const result = await rotateKey(orgId, purpose, algorithm);
        return res.status(200).json({ ok: true, ...result });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 3. GET /pqc/status - PQC Migration Status
  router.get(
    '/security/pqc/status',
    requireSession,
    requireRole('OWNER', 'ADMIN', 'JUDGE'),
    async (_req, res, next) => {
      try {
        const status = await getPqcMigrationStatus();
        return res.status(200).json({ ok: true, ...status });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 4. GET /events - Security Audit Events
  router.get(
    '/security/events',
    requireSession,
    requireRole('OWNER', 'ADMIN', 'JUDGE'),
    async (req, res, next) => {
      try {
        const orgId = req.session?.current_org_id || req.membership?.org_id;
        if (!orgId) throw new AppError('ORG_ID_REQUIRED', 400, 'Organization ID is required.');
        const events = await getSecurityEvents(orgId, req.query);
        return res.status(200).json({ ok: true, events });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 5. POST /agents/:id/behavior-check - Trigger Behavioral Anomaly Check (ASI10)
  router.post(
    '/security/agents/:id/behavior-check',
    requireSession,
    requireCsrf,
    requireRole('OWNER', 'ADMIN', 'JUDGE'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        if (!isValidUuid(id)) {
          throw new AppError('INVALID_AGENT_ID', 400, 'Agent ID must be a valid UUID.');
        }

        const orgId = req.session?.current_org_id || req.membership?.org_id;
        if (!orgId) throw new AppError('ORG_ID_REQUIRED', 400, 'Organization ID is required.');
        const environment = req.environment || req.query.environment || 'SANDBOX';

        // Check if agent exists in the system under another organization
        const agentRecord = await pool.query('SELECT org_id FROM agents WHERE id = $1', [id]);
        if (agentRecord.rows.length > 0 && agentRecord.rows[0].org_id !== orgId) {
          throw new AppError('AGENT_NOT_FOUND', 404, 'Agent not found.');
        }

        const agent = await getAgent(orgId, id, undefined, environment);
        if (!agent) {
          return res.status(200).json({
            ok: true,
            agentId: id,
            environment,
            anomalous: false,
            reason: 'NO_BASELINE_RECORDED',
            anomalies: [],
          });
        }

        const result = await detectRogueAgent(id, environment);
        return res.status(200).json({ ok: true, agentId: id, environment, ...result });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 6. POST /supply-chain/attest - Record supply chain attestation
  router.post(
    '/security/supply-chain/attest',
    requireSession,
    requireCsrf,
    requireRole('OWNER', 'ADMIN'),
    async (req, res, next) => {
      try {
        const parseResult = AttestationSchema.safeParse(req.body);
        if (!parseResult.success) {
          throw new AppError('VALIDATION_ERROR', 400, parseResult.error.message);
        }

        const result = await recordAttestation(parseResult.data);
        return res.status(201).json({ ok: true, ...result });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 6.5 GET /supply-chain/attestations - List all supply chain attestations
  router.get(
    '/security/supply-chain/attestations',
    requireSession,
    requireRole('OWNER', 'ADMIN', 'JUDGE', 'VIEWER', 'OPERATOR'),
    async (req, res, next) => {
      try {
        const attestations = await listAttestations(req.query);
        return res.status(200).json({ ok: true, attestations });
      } catch (err) {
        return next(err);
      }
    }
  );

  // 7. GET /supply-chain/:artifact - Verify or query artifact attestation
  router.get(
    '/security/supply-chain/:artifact',
    requireSession,
    requireRole('OWNER', 'ADMIN', 'JUDGE'),
    async (req, res, next) => {
      try {
        const artifactName = req.params.artifact;
        const version = typeof req.query.version === 'string' ? req.query.version.trim() : null;
        const hash = typeof req.query.hash === 'string' ? req.query.hash.trim() : null;

        if (!artifactName || !version) {
          throw new AppError('PARAMS_REQUIRED', 400, 'artifact name and ?version= are required.');
        }

        if (hash) {
          const verification = await verifyArtifact(artifactName, version, hash);
          return res.status(200).json({ ok: true, ...verification });
        }

        const attestation = await getAttestation(artifactName, version);
        if (!attestation) {
          throw new AppError('ARTIFACT_NOT_FOUND', 404, `Attestation for ${artifactName}@${version} not found.`);
        }

        return res.status(200).json({ ok: true, attestation });
      } catch (err) {
        return next(err);
      }
    }
  );

  return router;
}
