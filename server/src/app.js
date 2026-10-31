import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';

import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { pino } from 'pino';

import { env } from './config.js';
import { query } from './db/pool.js';
import { withTx } from './db/tx.js';
import { errorHandler } from './lib/errors.js';
import { decrypt, encrypt, randomToken, sha256Hex, verifyPassword } from './lib/crypto.js';
import { appendAudit } from './repositories/audit.js';
import { getDashboardSummary } from './repositories/dashboard.js';
import {
  createAgent,
  createAgentKey,
  getAgent,
  listAgentKeys,
  listAgents,
  revokeActiveAgentKeys,
  revokeAgentKey,
  updateAgent,
} from './repositories/agents.js';
import { getMembership } from './repositories/memberships.js';
import { getCurrentOrg, setFrozenStatus } from './repositories/orgs.js';
import {
  createPayee,
  getPayee,
  listPayees,
  listPayeeRevisions,
  recordPayeeRevision,
  updatePayee,
  updatePayeeTrust,
} from './repositories/payees.js';
import { rateLimit } from './repositories/rateLimit.js';
import { insertVerifiedWebhookEvent } from './repositories/webhookEvents.js';
import {
  deletePaypalConnection,
  findPaypalConnectionByWebhookToken,
  getPaypalConnection,
  getPaypalCredentials,
  savePaypalConnection,
  updatePaypalConnectionStatus,
} from './repositories/paypalConnections.js';
import { listNotifications, markNotificationRead } from './repositories/notifications.js';
import {
  getDocument,
  getDocumentExtraction,
  listDocuments,
  markDocumentDeleted,
} from './repositories/documents.js';
import { consumeGrant, createGrant, useGrant } from './repositories/stepUp.js';
import { createSession, deleteSession, findSessionByCookie } from './repositories/sessions.js';
import { createUser, findUserByEmail, findUserById, resetLoginFailure, updateLoginFailure } from './repositories/users.js';
import { enqueue } from './jobs/queue.js';
import { agentAuth } from './auth/agentAuth.js';
import { clearPaypalTokenCache, paypalFor } from './paypal/client.js';
import { appendEntry, LEDGER_TYPES } from './services/ledger.js';
import { createAgentApiKey, hashAgentApiKey } from './lib/agentApiKeys.js';
import { preparePayeeIdentifier } from './lib/payeeIdentifiers.js';
import { uploadMultipartDocument } from './documents/multipart.js';
import { removeStoredDocument, safeFilename, storedDocumentPath } from './documents/storage.js';
import { generateStructured } from './ai/index.js';
import { policySchema as mandatePolicySchema } from './ai/prompts/mandateDraft.js';
import { PROMPT_VERSION as MANDATE_PROMPT_VERSION } from './ai/prompts/mandateDraft.js';
import { listPayees as listMandatePayees } from './repositories/payees.js';
import {
  addMandateVersion,
  activateMandate,
  changeMandateStatus,
  createMandate,
  getMandate,
  listMandates,
} from './services/mandates.js';
import { getBudget } from './services/budget.js';

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000000';
const MIGRATIONS_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const WEB_BUILD_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const WEB_INDEX_FILE = path.join(WEB_BUILD_DIRECTORY, 'index.html');
const STEP_UP_PURPOSES = new Set([
  'ACTIVATE_MANDATE',
  'APPROVE_ABOVE_THRESHOLD',
  'FREEZE_TOGGLE',
  'TRUST_PAYEE',
  'ROTATE_CREDENTIALS',
]);
const AGENT_STATUSES = new Set(['ACTIVE', 'DISABLED']);
const PAYEE_KINDS = new Set(['EMAIL', 'PAYPAL_ID', 'PHONE']);
const PAYEE_TRUST_STATES = new Set(['TRUSTED', 'BLOCKED', 'PENDING_REVIEW']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validUuid(value) {
  return UUID_PATTERN.test(String(value || ''));
}

function publicPayee(payee, { identifier } = {}) {
  const result = {
    id: payee.id,
    displayName: payee.display_name,
    kind: payee.kind,
    identifierMasked: payee.identifier_masked,
    trust: payee.trust,
    changedAt: payee.changed_at,
    createdAt: payee.created_at,
  };
  if (identifier !== undefined) {
    result.identifier = identifier;
  }
  return result;
}

function mapPayeeWriteError(error, next) {
  if (error?.code === '23505') {
    return next(buildError('VALIDATION_FAILED', 'Payee identifier already exists.', 409));
  }
  return next(error);
}

async function insertAgentApiKey(orgId, agentId, db) {
  const generated = createAgentApiKey();
  const key = await createAgentKey(orgId, agentId, {
    prefix: generated.prefix,
    keyHash: hashAgentApiKey(env.JOBENPAY_HMAC_PEPPER, generated.apiKey),
  }, db);
  if (!key) {
    throw buildError('NOT_FOUND', 'Agent not found.', 404);
  }
  return { key, apiKey: generated.apiKey };
}

function readRequestId(req, res, next) {
  req.id = req.get('x-request-id') || crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV !== 'development',
    path: '/',
  };
}

function buildError(code, message, statusCode) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function requireSession(req, _res, next) {
  const rawToken = req.cookies?.jp_sid;
  if (!rawToken) {
    next(buildError('UNAUTHENTICATED', 'Authentication required.', 401));
    return;
  }

  const sessionId = String(rawToken).trim();
  findSessionByCookie(GLOBAL_ORG_ID, sessionId)
    .then((session) => {
      if (!session) {
        next(buildError('UNAUTHENTICATED', 'Authentication required.', 401));
        return;
      }

      req.session = session;
      next();
    })
    .catch((err) => next(err));
}

function requireCsrf(req, _res, next) {
  const token = req.get('x-csrf-token');
  const session = req.session;
  if (!session || !token) {
    next(buildError('FORBIDDEN', 'CSRF token required.', 403));
    return;
  }

  const actual = Buffer.from(session.csrf_secret || '');
  const provided = Buffer.from(String(token));
  if (actual.length !== provided.length || !crypto.timingSafeEqual(actual, provided)) {
    next(buildError('FORBIDDEN', 'CSRF token mismatch.', 403));
    return;
  }

  next();
}

function requireRole(...roles) {
  return async function requireRoleMiddleware(req, res, next) {
    try {
      const session = req.session;
      const user = await findUserById(GLOBAL_ORG_ID, session.user_id);
      const membership = await getMembership(GLOBAL_ORG_ID, user.id, session.current_org_id || GLOBAL_ORG_ID);
      if (!membership || !roles.includes(membership.role)) {
        next(buildError('FORBIDDEN', 'Insufficient role privileges.', 403));
        return;
      }
      req.user = user;
      req.membership = membership;
      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireStepUp(purpose) {
  return async function requireStepUpMiddleware(req, _res, next) {
    try {
      const grant = await useGrant(GLOBAL_ORG_ID, {
        grantId: req.get('x-step-up-grant') || req.body?.grantId,
        purpose,
        sessionId: req.session.id,
      });
      if (!grant) {
        next(buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 403));
        return;
      }
      req.stepUpGrant = grant;
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function loadSessionUser(req) {
  const session = req.session || null;
  if (!session) {
    return null;
  }

  const user = await findUserById(GLOBAL_ORG_ID, session.user_id);
  const org = await getCurrentOrg(GLOBAL_ORG_ID, user.id);
  const membership = await getMembership(GLOBAL_ORG_ID, user.id, org?.id || session.current_org_id || GLOBAL_ORG_ID);

  return { user, org, membership, session };
}

export function createApp() {
  const app = express();
  const logger = pino();

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        styleSrcAttr: ["'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
  }));
  app.use(readRequestId);
  app.use(pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          remoteAddress: req.remoteAddress,
        };
      },
    },
  }));
  app.use(cookieParser());
  app.use('/webhooks/paypal', express.raw({ type: 'application/json', limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, service: 'jobenpay', status: 'healthy' });
  });

  app.get('/agent/v1/ping', agentAuth, (req, res) => {
    res.status(200).json({ agentId: req.agent.id });
  });

  app.get('/readyz', async (req, res) => {
    try {
      const migrations = (await readdir(MIGRATIONS_DIRECTORY))
        .filter((name) => /^\d+_.*\.sql$/i.test(name))
        .sort();
      const latestMigration = migrations.at(-1);
      const applied = await query(`
        SELECT filename
        FROM schema_migrations
        ORDER BY filename DESC
        LIMIT 1
      `);
      let ready = Boolean(latestMigration && applied.rows[0]?.filename === latestMigration);

      if (ready && env.WORKER_ENABLED === 1) {
        const heartbeat = await query(`
          SELECT 1
          FROM jobs
          WHERE type = '_worker_heartbeat'
            AND dedupe_key = '_worker_heartbeat'
            AND status = 'COMPLETED'
            AND run_at >= now() - interval '30 seconds'
          LIMIT 1
        `);
        ready = heartbeat.rowCount === 1;
      }

      res.status(ready ? 200 : 503).json({
        ok: ready,
        service: 'jobenpay',
        status: ready ? 'ready' : 'not_ready',
      });
    } catch (error) {
      logger.error({ err: error }, 'Readiness check failed');
      res.status(503).json({ ok: false, service: 'jobenpay', status: 'not_ready' });
    }
  });

  app.post('/webhooks/paypal/:webhookToken', async (req, res, next) => {
    try {
      const { webhookToken } = req.params;
      const connection = await findPaypalConnectionByWebhookToken(webhookToken);
      if (!connection) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Webhook endpoint not found.' } });
      }

      const exceeded = await rateLimit(`webhook:${sha256Hex(webhookToken)}`, 120, 60);
      if (exceeded) {
        return res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded.' } });
      }

      if (!Buffer.isBuffer(req.body)) {
        return res.status(400).json({ error: { code: 'WEBHOOK_INVALID_BODY', message: 'Webhook body must be valid JSON.' } });
      }
      let event;
      try {
        event = JSON.parse(req.body.toString('utf8'));
      } catch {
        return res.status(400).json({ error: { code: 'WEBHOOK_INVALID_BODY', message: 'Webhook body must be valid JSON.' } });
      }
      if (!event || typeof event !== 'object' || Array.isArray(event)
        || typeof event.id !== 'string' || !event.id
        || typeof event.event_type !== 'string' || !event.event_type) {
        return res.status(400).json({ error: { code: 'WEBHOOK_INVALID_BODY', message: 'Webhook event is missing required fields.' } });
      }
      if (!connection.webhook_id) {
        return res.status(400).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook verification is not configured.' } });
      }

      const paypal = await paypalFor(connection.org_id);
      const verification = await paypal.request(
        'POST',
        '/v1/notifications/verify-webhook-signature',
        {
          body: {
            auth_algo: req.get('paypal-auth-algo'),
            cert_url: req.get('paypal-cert-url'),
            transmission_id: req.get('paypal-transmission-id'),
            transmission_sig: req.get('paypal-transmission-sig'),
            transmission_time: req.get('paypal-transmission-time'),
            webhook_id: connection.webhook_id,
            webhook_event: event,
          },
        },
      );
      if (verification?.verification_status !== 'SUCCESS') {
        return res.status(400).json({
          error: {
            code: 'WEBHOOK_SIGNATURE_INVALID',
            message: 'Webhook signature verification failed.',
          },
        });
      }

      await withTx(async (tx) => {
        const inserted = await insertVerifiedWebhookEvent(tx, {
          orgId: connection.org_id,
          event,
        });
        if (inserted) {
          await enqueue(tx, {
            type: 'process_webhook',
            payload: { orgId: connection.org_id, eventId: event.id },
            dedupeKey: `wh:${event.id}`,
          });
        }
      });

      return res.status(200).json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  const api = express.Router();

  api.get('/dashboard/summary', requireSession, async (req, res, next) => {
    try {
      const summary = await getDashboardSummary(req.session.current_org_id || GLOBAL_ORG_ID);
      return res.status(200).json(summary);
    } catch (error) {
      return next(error);
    }
  });

  api.get('/notifications', requireSession, async (req, res, next) => {
    try {
      const notifications = await listNotifications(req.session.current_org_id || GLOBAL_ORG_ID);
      return res.status(200).json({ notifications });
    } catch (error) {
      return next(error);
    }
  });

  api.get('/mandates', requireSession, async (req, res, next) => {
    try {
      const mandates = await listMandates(req.session.current_org_id || GLOBAL_ORG_ID);
      return res.status(200).json({ mandates });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/mandates', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const agent = await getAgent(orgId, req.body?.agentId);
      if (!agent) throw buildError('NOT_FOUND', 'Agent not found.', 404);
      const result = await withTx((tx) => createMandate(tx, {
        orgId,
        agentId: agent.id,
        name: String(req.body?.name || '').trim() || 'Untitled mandate',
        policy: req.body?.policy,
        purposeText: req.body?.purposeText,
      }));
      return res.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  });

  api.post('/mandates/draft-from-text', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const agent = await getAgent(orgId, req.body?.agentId);
      if (!agent || typeof req.body?.purposeText !== 'string' || !req.body.purposeText.trim()) {
        throw buildError('VALIDATION_FAILED', 'agentId and purposeText are required.', 400);
      }
      const payees = await listMandatePayees(orgId);
      let policy;
      try {
        policy = await generateStructured({
          task: 'mandateDraft',
          schema: mandatePolicySchema,
          input: {
            purposeText: req.body.purposeText,
            existingPayees: payees.map((payee) => ({ id: payee.id, displayName: payee.display_name })),
          },
          orgId,
        });
      } catch (error) {
        error.code = 'AI_UNAVAILABLE';
        error.statusCode = 503;
        error.message = 'AI is unavailable. Use the manual policy editor.';
        return next(error);
      }
      const previous = await query(
        `SELECT v.policy FROM mandates m JOIN mandate_versions v ON v.id = m.current_version_id
         WHERE m.org_id = $1 AND m.agent_id = $2 ORDER BY v.created_at DESC LIMIT 1`,
        [orgId, agent.id],
      );
      const knownPayeeIds = new Set(payees.map((payee) => payee.id));
      const unknownPayees = policy.payees.ids.filter((id) => !knownPayeeIds.has(id));
      const mappedPolicy = {
        ...policy,
        payees: { ...policy.payees, ids: policy.payees.ids.filter((id) => knownPayeeIds.has(id)) },
      };
      return res.status(200).json({
        draft: {
          agentId: agent.id,
          purposeText: req.body.purposeText,
          policy: mappedPolicy,
          promptVersion: MANDATE_PROMPT_VERSION,
        },
        diff: { previous: previous.rows[0]?.policy || null, next: mappedPolicy },
        warnings: unknownPayees.length
          ? ['AI returned a payee that is not in this organization; it was removed from the draft.']
          : [],
      });
    } catch (error) {
      return next(error);
    }
  });

  api.get('/mandates/:id', requireSession, async (req, res, next) => {
    try {
      const mandate = await getMandate(req.session.current_org_id || GLOBAL_ORG_ID, req.params.id);
      if (!mandate) throw buildError('NOT_FOUND', 'Mandate not found.', 404);
      return res.status(200).json({ mandate });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/mandates/:id/versions', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const version = await withTx((tx) => addMandateVersion(tx, {
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        mandateId: req.params.id,
        policy: req.body?.policy,
        purposeText: req.body?.purposeText,
      }));
      return res.status(201).json({ version });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/mandates/:id/activate', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
    try {
      const versionId = req.body?.versionId;
      if (!validUuid(req.params.id) || !validUuid(versionId)) throw buildError('VALIDATION_FAILED', 'A valid mandate and version are required.', 400);
      const version = await withTx((tx) => activateMandate(tx, {
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        mandateId: req.params.id,
        versionId,
        actorId: req.user.id,
        grantId: req.get('x-step-up-grant') || req.body?.grantId,
        sessionId: req.session.id,
      }));
      return res.status(200).json({ version });
    } catch (error) {
      return next(error);
    }
  });

  for (const [action, status] of [['suspend', 'SUSPENDED'], ['revoke', 'REVOKED']]) {
    api.post(`/mandates/:id/${action}`, requireSession, requireCsrf, requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
      try {
        const mandate = await withTx((tx) => changeMandateStatus(tx, {
          orgId: req.session.current_org_id || GLOBAL_ORG_ID,
          mandateId: req.params.id,
          actorId: req.user.id,
          status,
        }));
        return res.status(200).json({ mandate });
      } catch (error) {
        return next(error);
      }
    });
  }

  api.get('/mandates/:id/budget', requireSession, async (req, res, next) => {
    try {
      const budget = await getBudget(req.session.current_org_id || GLOBAL_ORG_ID, req.params.id);
      if (!budget) throw buildError('NOT_FOUND', 'Budget period not found.', 404);
      const limitMinor = BigInt(budget.limit_minor);
      const reservedMinor = BigInt(budget.reserved_minor);
      const spentMinor = BigInt(budget.spent_minor);
      return res.status(200).json({
        limitMinor: limitMinor.toString(),
        reservedMinor: reservedMinor.toString(),
        spentMinor: spentMinor.toString(),
        remainingMinor: (limitMinor - reservedMinor - spentMinor).toString(),
        currency: budget.currency,
        periodStart: budget.period_start,
        periodEnd: budget.period_end,
      });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/notifications/:id/read', requireSession, requireCsrf, async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) {
        return next(buildError('NOT_FOUND', 'Notification not found.', 404));
      }
      const notification = await markNotificationRead(
        req.session.current_org_id || GLOBAL_ORG_ID,
        req.params.id,
      );
      if (!notification) {
        return next(buildError('NOT_FOUND', 'Notification not found.', 404));
      }
      return res.status(200).json({ notification });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/documents', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const document = await uploadMultipartDocument(req, {
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        uploaderId: req.user.id,
      });
      return res.status(201).json({
        document: {
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          size: document.size,
          sha256: document.sha256,
          status: document.status,
          createdAt: document.created_at,
          injectionFlags: document.injection_flags,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  api.get('/documents', requireSession, async (req, res, next) => {
    try {
      const documents = await listDocuments(req.session.current_org_id || GLOBAL_ORG_ID);
      return res.status(200).json({
        documents: documents.map((document) => ({
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          size: document.size,
          sha256: document.sha256,
          status: document.status,
          injectionFlags: document.injection_flags,
          createdAt: document.created_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  api.get('/documents/:id/file', requireSession, async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) return next(buildError('NOT_FOUND', 'Document not found.', 404));
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const document = await getDocument(orgId, req.params.id);
      if (!document || document.status === 'DELETED' || !document.storage_key) {
        return next(buildError('NOT_FOUND', 'Document not found.', 404));
      }
      const filePath = await storedDocumentPath(document.storage_key);
      await access(filePath);
      const downloadName = safeFilename(document.filename).replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) || 'document';
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('x-content-type-options', 'nosniff');
      const stream = createReadStream(filePath);
      stream.once('error', next);
      stream.pipe(res);
      return undefined;
    } catch (error) {
      return next(error);
    }
  });

  api.get('/documents/:id', requireSession, async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) return next(buildError('NOT_FOUND', 'Document not found.', 404));
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const document = await getDocument(orgId, req.params.id);
      if (!document) return next(buildError('NOT_FOUND', 'Document not found.', 404));
      const extraction = await getDocumentExtraction(orgId, document.id);
      return res.status(200).json({
        document: {
          id: document.id,
          filename: document.filename,
          mime: document.mime,
          size: document.size,
          sha256: document.sha256,
          status: document.status,
          injectionFlags: document.injection_flags,
          createdAt: document.created_at,
        },
        extraction: extraction ? {
          payeeName: extraction.payee_name,
          invoiceNumber: extraction.invoice_number,
          amountMinor: extraction.amount_minor,
          currency: extraction.currency?.trim() || null,
          dueDate: extraction.due_date,
          items: extraction.items,
          notes: extraction.notes,
          confidence: extraction.confidence,
          promptVersion: extraction.prompt_version,
        } : null,
      });
    } catch (error) {
      return next(error);
    }
  });

  api.delete('/documents/:id', requireSession, requireCsrf, requireRole('OWNER'), async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) return next(buildError('NOT_FOUND', 'Document not found.', 404));
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const document = await withTx(async (tx) => {
        const deleted = await markDocumentDeleted(orgId, req.params.id, tx);
        if (!deleted) throw buildError('NOT_FOUND', 'Document not found.', 404);
        await appendEntry(tx, {
          orgId,
          type: LEDGER_TYPES.DOCUMENT_DELETED,
          subjectType: 'DOCUMENT',
          subjectId: deleted.id,
          payload: { sha256: deleted.sha256 },
        });
        return deleted;
      });
      const existing = await getDocument(orgId, req.params.id);
      if (existing?.storage_key) await removeStoredDocument(existing.storage_key);
      if (!document) return next(buildError('NOT_FOUND', 'Document not found.', 404));
      return res.status(200).json({ ok: true, documentId: document.id, sha256: document.sha256 });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/feedback', requireSession, requireCsrf, async (req, res, next) => {
    try {
      const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
      if (!message || message.length > 2000) {
        return next(buildError('VALIDATION_FAILED', 'Feedback must contain between 1 and 2000 characters.', 400));
      }

      await withTx(async (tx) => {
        await appendAudit(tx, {
          orgId: req.session.current_org_id || GLOBAL_ORG_ID,
          actorId: req.session.user_id,
          action: 'FEEDBACK_SUBMITTED',
          details: { message },
        });
      });
      return res.status(201).json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });

  api.get('/agents', requireSession, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const agents = await listAgents(orgId);
      return res.status(200).json({ agents });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/agents', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
      const description = req.body?.description;
      const status = req.body?.status ?? 'ACTIVE';
      if (!name
        || (description != null && typeof description !== 'string')
        || !AGENT_STATUSES.has(status)) {
        return next(buildError('VALIDATION_FAILED', 'Invalid agent fields.', 400));
      }
      const agent = await createAgent(req.session.current_org_id || GLOBAL_ORG_ID, {
        name,
        description: description == null ? null : description.trim(),
        status,
      });
      return res.status(201).json({ agent });
    } catch (error) {
      return next(error);
    }
  });

  api.get('/agents/:id', requireSession, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      if (!validUuid(req.params.id)) {
        return next(buildError('NOT_FOUND', 'Agent not found.', 404));
      }
      const agent = await getAgent(orgId, req.params.id);
      if (!agent) {
        return next(buildError('NOT_FOUND', 'Agent not found.', 404));
      }
      const keys = await listAgentKeys(orgId, agent.id);
      return res.status(200).json({ agent, keys });
    } catch (error) {
      return next(error);
    }
  });

  api.patch('/agents/:id', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const { name, description, status } = req.body || {};
      if (!validUuid(req.params.id)
        || (name !== undefined && (typeof name !== 'string' || !name.trim()))
        || (description !== undefined && description !== null
          && typeof description !== 'string')
        || (status !== undefined && !AGENT_STATUSES.has(status))
        || (name === undefined && description === undefined && status === undefined)) {
        return next(buildError('VALIDATION_FAILED', 'Invalid agent fields.', 400));
      }
      const agent = await updateAgent(req.session.current_org_id || GLOBAL_ORG_ID, req.params.id, {
        name: name === undefined ? undefined : name.trim(),
        description: description === undefined || description === null ? description : description.trim(),
        status,
      });
      if (!agent) {
        return next(buildError('NOT_FOUND', 'Agent not found.', 404));
      }
      return res.status(200).json({ agent });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/agents/:id/keys', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) {
        return next(buildError('NOT_FOUND', 'Agent not found.', 404));
      }
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const { key, apiKey } = await insertAgentApiKey(orgId, req.params.id);
      return res.status(201).json({
        key: {
          id: key.id,
          prefix: key.prefix,
          createdAt: key.created_at,
        },
        apiKey,
      });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/agents/:id/keys/:keyId/revoke', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), requireStepUp('ROTATE_CREDENTIALS'), async (req, res, next) => {
    try {
      if (!validUuid(req.params.id) || !validUuid(req.params.keyId)) {
        return next(buildError('NOT_FOUND', 'API key not found.', 404));
      }
      const revoked = await revokeAgentKey(
        req.session.current_org_id || GLOBAL_ORG_ID,
        req.params.id,
        req.params.keyId,
      );
      if (!revoked) {
        return next(buildError('NOT_FOUND', 'API key not found.', 404));
      }
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  api.post('/agents/:id/keys/rotate', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) {
        return next(buildError('NOT_FOUND', 'Agent not found.', 404));
      }
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const rotated = await withTx(async (tx) => {
        const agent = await getAgent(orgId, req.params.id, tx);
        if (!agent) {
          throw buildError('NOT_FOUND', 'Agent not found.', 404);
        }
        const granted = await consumeGrant(tx, GLOBAL_ORG_ID, {
          grantId: req.get('x-step-up-grant') || req.body?.grantId,
          userId: req.user.id,
          sessionId: req.session.id,
          purpose: 'ROTATE_CREDENTIALS',
        });
        if (!granted) {
          throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 403);
        }
        const revoked = await revokeActiveAgentKeys(orgId, agent.id, tx);
        const created = await insertAgentApiKey(orgId, agent.id, tx);
        await appendEntry(tx, {
          orgId,
          type: LEDGER_TYPES.AGENT_KEY_ROTATED,
          subjectType: 'AGENT',
          subjectId: agent.id,
          payload: {
            newKeyId: created.key.id,
            revokedKeyIds: revoked.map(({ id }) => id),
            actorId: req.user.id,
          },
        });
        return { agent, key: created.key, apiKey: created.apiKey };
      });
      return res.status(201).json({
        key: {
          id: rotated.key.id,
          prefix: rotated.key.prefix,
          createdAt: rotated.key.created_at,
        },
        apiKey: rotated.apiKey,
      });
    } catch (error) {
      return next(error);
    }
  });

  api.get('/payees', requireSession, async (req, res, next) => {
    try {
      const payees = await listPayees(req.session.current_org_id || GLOBAL_ORG_ID);
      return res.status(200).json({ payees: payees.map((payee) => publicPayee(payee)) });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/payees', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
      const { kind, identifier } = req.body || {};
      if (!displayName || !PAYEE_KINDS.has(kind)
        || typeof identifier !== 'string' || !identifier.trim()) {
        return next(buildError('VALIDATION_FAILED', 'Invalid payee fields.', 400));
      }
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const identifiers = preparePayeeIdentifier(orgId, identifier, kind, {
        encryptionKey: env.JOBENPAY_ENC_KEY,
        pepper: env.JOBENPAY_HMAC_PEPPER,
      });
      const payee = await createPayee(orgId, {
        displayName,
        kind,
        ...identifiers,
        trust: 'PENDING_REVIEW',
      });
      return res.status(201).json({ payee: publicPayee(payee) });
    } catch (error) {
      return mapPayeeWriteError(error, next);
    }
  });

  api.patch('/payees/:id', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN', 'OPERATOR'), async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) {
        return next(buildError('NOT_FOUND', 'Payee not found.', 404));
      }
      const { displayName, kind, identifier } = req.body || {};
      if ((displayName !== undefined && (typeof displayName !== 'string' || !displayName.trim()))
        || (kind !== undefined && !PAYEE_KINDS.has(kind))
        || (identifier !== undefined && (typeof identifier !== 'string' || !identifier.trim()))
        || (kind !== undefined && identifier === undefined)
        || (displayName === undefined && kind === undefined && identifier === undefined)) {
        return next(buildError('VALIDATION_FAILED', 'Invalid payee fields.', 400));
      }
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const payee = await withTx(async (tx) => {
        const current = await getPayee(orgId, req.params.id, tx);
        if (!current) {
          throw buildError('NOT_FOUND', 'Payee not found.', 404);
        }
        const nextKind = kind ?? current.kind;
        const prepared = identifier === undefined
          ? null
          : preparePayeeIdentifier(orgId, identifier, nextKind, {
            encryptionKey: env.JOBENPAY_ENC_KEY,
            pepper: env.JOBENPAY_HMAC_PEPPER,
          });
        const identifierChanged = Boolean(prepared
          && (prepared.identifierHmac !== current.identifier_hmac || nextKind !== current.kind));
        const updated = await updatePayee(orgId, current.id, {
          displayName: displayName === undefined ? undefined : displayName.trim(),
          kind,
          ...(identifierChanged ? prepared : {}),
          identifierChanged,
        }, tx);
        if (identifierChanged) {
          await recordPayeeRevision(orgId, current.id, {
            oldHmac: current.identifier_hmac,
            newHmac: prepared.identifierHmac,
            changedBy: req.user.id,
          }, tx);
        }
        return updated;
      });
      return res.status(200).json({ payee: publicPayee(payee) });
    } catch (error) {
      return mapPayeeWriteError(error, next);
    }
  });

  api.get('/payees/:id', requireSession, async (req, res, next) => {
    try {
      if (!validUuid(req.params.id)) {
        return next(buildError('NOT_FOUND', 'Payee not found.', 404));
      }
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const payee = await getPayee(orgId, req.params.id);
      if (!payee) {
        return next(buildError('NOT_FOUND', 'Payee not found.', 404));
      }
      const revisions = await listPayeeRevisions(orgId, payee.id);
      return res.status(200).json({
        payee: publicPayee(payee),
        revisions: revisions.map((revision) => ({
          id: revision.id,
          changedBy: revision.changed_by,
          changedAt: revision.created_at,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/payees/:id/trust', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
    try {
      if (!validUuid(req.params.id) || !PAYEE_TRUST_STATES.has(req.body?.trust)) {
        return next(buildError('VALIDATION_FAILED', 'Invalid payee trust update.', 400));
      }
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const payee = await withTx(async (tx) => {
        const current = await getPayee(orgId, req.params.id, tx);
        if (!current) {
          throw buildError('NOT_FOUND', 'Payee not found.', 404);
        }
        const granted = await consumeGrant(tx, GLOBAL_ORG_ID, {
          grantId: req.get('x-step-up-grant') || req.body?.grantId,
          userId: req.user.id,
          sessionId: req.session.id,
          purpose: 'TRUST_PAYEE',
        });
        if (!granted) {
          throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 403);
        }
        const updated = await updatePayeeTrust(orgId, current.id, req.body.trust, tx);
        await appendEntry(tx, {
          orgId,
          type: LEDGER_TYPES.PAYEE_TRUST_CHANGED,
          subjectType: 'PAYEE',
          subjectId: current.id,
          payload: {
            previousTrust: current.trust,
            trust: updated.trust,
            actorId: req.user.id,
          },
        });
        return updated;
      });
      return res.status(200).json({ payee: publicPayee(payee) });
    } catch (error) {
      return next(error);
    }
  });

  api.post('/auth/login', async (req, res, next) => {
    try {
      const ipKey = `login:${req.ip}`;
      await rateLimit(ipKey, 10, 60);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const user = await findUserByEmail(GLOBAL_ORG_ID, email);

      const passwordMatches = user ? await verifyPassword(password, user.password_hash) : false;
      if (!user || !passwordMatches) {
        if (user) {
          const failedCount = Number(user.failed_login_count || 0) + 1;
          const lockoutExpiry = failedCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
          await updateLoginFailure(GLOBAL_ORG_ID, user.id, {
            failedLoginCount: failedCount,
            lockedUntil: lockoutExpiry,
          });
          await appendAudit({
            orgId: GLOBAL_ORG_ID,
            actorId: user.id,
            action: failedCount >= 5 ? 'LOCKOUT' : 'LOGIN_FAILED',
            details: { email, failedLoginCount: failedCount },
          });
        }
        return res.status(200).json({ ok: false, message: 'Authentication failed.' });
      }

      const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
      if (lockedUntil && lockedUntil > new Date()) {
        return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Account locked.' });
      }

      await resetLoginFailure(GLOBAL_ORG_ID, user.id);
      const activeMembership = await getMembership(GLOBAL_ORG_ID, user.id, GLOBAL_ORG_ID);
      const currentOrgId = activeMembership?.org_id || GLOBAL_ORG_ID;
      const csrfSecret = crypto.randomBytes(32).toString('hex');
      const sessionInfo = await createSession(GLOBAL_ORG_ID, {
        userId: user.id,
        currentOrgId,
        csrfSecret,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

      res.cookie('jp_sid', sessionInfo.token, cookieOptions());
      await appendAudit({
        orgId: currentOrgId,
        actorId: user.id,
        action: 'LOGIN_SUCCESS',
        details: { email },
      });

      return res.status(200).json({ ok: true, user: { id: user.id, email: user.email, displayName: user.display_name }, csrfToken: csrfSecret });
    } catch (error) {
      next(error);
    }
  });

  api.post('/auth/logout', requireSession, requireCsrf, async (req, res, next) => {
    try {
      await deleteSession(req.session.current_org_id || GLOBAL_ORG_ID, req.session.id);
      res.clearCookie('jp_sid', cookieOptions());
      return res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  api.get('/auth/me', requireSession, async (req, res, next) => {
    try {
      const { user, org, membership } = await loadSessionUser(req);
      if (!user) {
        throw buildError('UNAUTHENTICATED', 'Authentication required.', 401);
      }
      return res.status(200).json({
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
        },
        org: org ? { id: org.id, name: org.name, frozen: Boolean(org.frozen_at) } : null,
        role: membership?.role || 'VIEWER',
        isJudge: Boolean(membership?.is_judge),
        csrfToken: req.session.csrf_secret,
        frozen: Boolean(org?.frozen_at),
        aiMode: env.AI_PROVIDER === 'replay' ? 'replay' : 'live',
      });
    } catch (error) {
      next(error);
    }
  });

  api.post('/auth/step-up', requireSession, requireCsrf, async (req, res, next) => {
    try {
      const purpose = String(req.body?.purpose || '').toUpperCase();
      const password = String(req.body?.password || '');
      if (!STEP_UP_PURPOSES.has(purpose)) {
        throw buildError('FORBIDDEN', 'Unsupported step-up purpose.', 403);
      }

      const user = await findUserById(GLOBAL_ORG_ID, req.session.user_id);
      const passwordValid = await verifyPassword(password, user.password_hash);
      if (!passwordValid) {
        throw buildError('FORBIDDEN', 'Step-up authentication failed.', 403);
      }

      const grant = await createGrant(GLOBAL_ORG_ID, {
        userId: user.id,
        sessionId: req.session.id,
        purpose,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });

      await appendAudit({
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        actorId: user.id,
        action: 'STEP_UP_GRANTED',
        details: { purpose, grantId: grant.id },
      });

      return res.status(200).json({ ok: true, grantId: grant.id, expiresAt: grant.expires_at });
    } catch (error) {
      next(error);
    }
  });

  api.get('/paypal/connection', requireSession, async (req, res, next) => {
    try {
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const connection = await getPaypalConnection(orgId);
      if (!connection) {
        return res.status(200).json({
          client_id_masked: null,
          status: 'UNTESTED',
          webhookUrl: null,
          webhookId: null,
          lastTestedAt: null,
          lastErrorCode: null,
        });
      }

      const clientId = connection.client_id_enc
        ? decrypt({
          key: env.JOBENPAY_ENC_KEY,
          payload: connection.client_id_enc,
          aad: `paypal_connections:client_id_enc:${orgId}`,
        })
        : '';
      return res.status(200).json({
        client_id_masked: clientId.length > 4 ? `****${clientId.slice(-4)}` : '****',
        status: connection.status || 'UNTESTED',
        webhookUrl: connection.webhook_token
          ? `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/paypal/${connection.webhook_token}`
          : null,
        webhookId: connection.webhook_id,
        lastTestedAt: connection.last_tested_at,
        lastErrorCode: connection.last_error_code,
      });
    } catch (error) {
      return next(error);
    }
  });

  api.put('/paypal/connection', requireSession, requireCsrf, requireRole('OWNER'), async (req, res, next) => {
    try {
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      const current = await getPaypalCredentials(orgId);
      const clientIdProvided = typeof req.body?.clientId === 'string' && req.body.clientId.trim().length > 0;
      const clientSecretProvided = typeof req.body?.clientSecret === 'string' && req.body.clientSecret.trim().length > 0;
      const credentialsProvided = clientIdProvided || clientSecretProvided;
      if (credentialsProvided && (!clientIdProvided || !clientSecretProvided)) {
        throw buildError('VALIDATION_FAILED', 'Both clientId and clientSecret are required.', 400);
      }
      if ((!current?.client_id_enc || !current?.client_secret_enc) && !credentialsProvided) {
        throw buildError('VALIDATION_FAILED', 'PayPal client credentials are required.', 400);
      }
      if (current?.client_id_enc && current?.client_secret_enc && credentialsProvided) {
        const grant = await useGrant(GLOBAL_ORG_ID, {
          grantId: req.get('x-step-up-grant') || req.body?.grantId,
          purpose: 'ROTATE_CREDENTIALS',
          sessionId: req.session.id,
        });
        if (!grant) {
          throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 403);
        }
      }

      const clientId = credentialsProvided
        ? req.body.clientId.trim()
        : decrypt({
          key: env.JOBENPAY_ENC_KEY,
          payload: current.client_id_enc,
          aad: `paypal_connections:client_id_enc:${orgId}`,
        });
      const clientIdEnc = credentialsProvided
        ? encrypt({
          key: env.JOBENPAY_ENC_KEY,
          plaintext: clientId,
          aad: `paypal_connections:client_id_enc:${orgId}`,
        })
        : current.client_id_enc;
      const clientSecretEnc = credentialsProvided
        ? encrypt({
          key: env.JOBENPAY_ENC_KEY,
          plaintext: req.body.clientSecret.trim(),
          aad: `paypal_connections:client_secret_enc:${orgId}`,
        })
        : current.client_secret_enc;
      if (Object.hasOwn(req.body || {}, 'webhookId')
        && req.body.webhookId != null
        && typeof req.body.webhookId !== 'string') {
        throw buildError('VALIDATION_FAILED', 'webhookId must be a string.', 400);
      }
      const webhookId = Object.hasOwn(req.body || {}, 'webhookId')
        ? (req.body.webhookId?.trim() || null)
        : current?.webhook_id ?? null;

      const connection = await savePaypalConnection(orgId, {
        clientIdEnc,
        clientSecretEnc,
        webhookId,
        webhookToken: current?.webhook_token || randomToken(32),
      });
      if (credentialsProvided) {
        clearPaypalTokenCache(orgId);
      }
      await appendAudit({
        orgId,
        actorId: req.user.id,
        action: 'PAYPAL_CONNECTION_UPDATED',
        details: { credentialsChanged: credentialsProvided, webhookIdSet: Boolean(connection.webhook_id) },
      });
      return res.status(200).json({
        client_id_masked: clientId.length > 4 ? `****${clientId.slice(-4)}` : '****',
        status: connection.status,
        webhookUrl: `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/paypal/${connection.webhook_token}`,
        webhookId: connection.webhook_id,
        lastTestedAt: connection.last_tested_at,
        lastErrorCode: connection.last_error_code,
      });
    } catch (error) {
      return next(error);
    }
  });

  api.delete('/paypal/connection', requireSession, requireCsrf, requireRole('OWNER'), async (req, res, next) => {
    try {
      const grant = await useGrant(GLOBAL_ORG_ID, {
        grantId: req.get('x-step-up-grant') || req.body?.grantId,
        purpose: 'ROTATE_CREDENTIALS',
        sessionId: req.session.id,
      });
      if (!grant) {
        throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 403);
      }
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      await deletePaypalConnection(orgId);
      clearPaypalTokenCache(orgId);
      await appendAudit({
        orgId,
        actorId: req.user.id,
        action: 'PAYPAL_CONNECTION_DELETED',
        details: {},
      });
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  api.post('/paypal/connection/test', requireSession, requireCsrf, requireRole('OWNER'), async (req, res, next) => {
    try {
      const orgId = req.session.current_org_id || GLOBAL_ORG_ID;
      if (!(await getPaypalConnection(orgId))) {
        throw buildError('PAYPAL_NOT_CONFIGURED', 'PayPal sandbox credentials are not configured.', 400);
      }

      try {
        const paypal = await paypalFor(orgId);
        await paypal.testConnection();
        const connection = await updatePaypalConnectionStatus(orgId, { status: 'CONNECTED' });
        return res.status(200).json({
          status: connection.status,
          lastTestedAt: connection.last_tested_at,
          lastErrorCode: connection.last_error_code,
        });
      } catch (error) {
        const connection = await updatePaypalConnectionStatus(orgId, {
          status: 'ERROR',
          lastErrorCode: error?.code || 'PAYPAL_CONNECTION_FAILED',
        });
        return res.status(400).json({
          status: connection.status,
          lastTestedAt: connection.last_tested_at,
          lastErrorCode: connection.last_error_code,
        });
      }
    } catch (error) {
      return next(error);
    }
  });

  api.post('/auth/register', async (req, res, next) => {
    try {
      if (Number(env.REGISTRATION_ENABLED) !== 1) {
        throw buildError('REGISTRATION_DISABLED', 'Registration is disabled.', 403);
      }

      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = String(req.body?.password || '');
      const displayName = String(req.body?.displayName || '').trim() || email;
      const passwordHash = await import('./lib/crypto.js').then((m) => m.hashPassword(password));
      const existing = await findUserByEmail(GLOBAL_ORG_ID, email);
      if (existing) {
        return res.status(409).json({ ok: false, code: 'DUPLICATE_SUSPECTED', message: 'User already exists.' });
      }

      const created = await createUser(GLOBAL_ORG_ID, {
        email,
        passwordHash,
        displayName,
        role: 'VIEWER',
      });

      return res.status(201).json({ ok: true, user: { id: created.id, email: created.email } });
    } catch (error) {
      next(error);
    }
  });

  api.get('/org', requireSession, async (req, res, next) => {
    try {
      const sessionUser = await loadSessionUser(req);
      const org = sessionUser?.org;
      if (!org) {
        throw buildError('NOT_FOUND', 'Organization not found.', 404);
      }
      return res.status(200).json({ org: { id: org.id, name: org.name, frozen: Boolean(org.frozen_at) } });
    } catch (error) {
      next(error);
    }
  });

  api.post('/org/freeze', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
    try {
      const session = req.session;
      const purpose = req.body?.purpose || 'FREEZE_TOGGLE';
      const grant = await useGrant(GLOBAL_ORG_ID, {
        grantId: req.get('x-step-up-grant') || req.body?.grantId,
        purpose,
        sessionId: session.id,
      });
      if (!grant) {
        throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 401);
      }

      const orgId = session.current_org_id || GLOBAL_ORG_ID;
      await withTx(async (tx) => {
        await setFrozenStatus(tx, orgId, { frozenBy: req.user.id, frozen: true });
        await appendEntry(tx, {
          orgId,
          type: LEDGER_TYPES.ORG_FROZEN,
          subjectType: 'ORG',
          subjectId: orgId,
          payload: { frozenBy: session.user_id || req.user.id, reason: 'manual_frozen' },
        });
        await appendAudit(tx, {
          orgId,
          actorId: req.user.id,
          action: 'ORG_FROZEN',
          details: { reason: 'manual_frozen' },
        });
      });

      return res.status(200).json({ ok: true, frozen: true });
    } catch (error) {
      next(error);
    }
  });

  api.post('/org/unfreeze', requireSession, requireCsrf, requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
    try {
      const session = req.session;
      const purpose = req.body?.purpose || 'FREEZE_TOGGLE';
      const grant = await useGrant(GLOBAL_ORG_ID, {
        grantId: req.get('x-step-up-grant') || req.body?.grantId,
        purpose,
        sessionId: session.id,
      });
      if (!grant) {
        throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 401);
      }

      const orgId = session.current_org_id || GLOBAL_ORG_ID;
      await withTx(async (tx) => {
        await setFrozenStatus(tx, orgId, { frozenBy: req.user.id, frozen: false });
        await appendEntry(tx, {
          orgId,
          type: LEDGER_TYPES.ORG_UNFROZEN,
          subjectType: 'ORG',
          subjectId: orgId,
          payload: { frozenBy: session.user_id || req.user.id, reason: 'manual_unfrozen' },
        });
        await appendAudit(tx, {
          orgId,
          actorId: req.user.id,
          action: 'ORG_UNFROZEN',
          details: { reason: 'manual_unfrozen' },
        });
      });

      return res.status(200).json({ ok: true, frozen: false });
    } catch (error) {
      next(error);
    }
  });

  api.use((err, _req, res, next) => {
    errorHandler(err, _req, res, next);
  });

  app.use('/api/v1', api);
  if (existsSync(WEB_INDEX_FILE)) {
    app.use(express.static(WEB_BUILD_DIRECTORY, {
      index: false,
      setHeaders(res, filePath) {
        if (/\.[\da-f]{8,}\./i.test(path.basename(filePath))) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }));
    app.get('/{*path}', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) {
        return next();
      }
      return res.sendFile(WEB_INDEX_FILE, (error) => {
        if (error) next(error);
      });
    });
  } else {
    app.get('/{*path}', (req, res, next) => {
      if (req.path === '/api' || req.path.startsWith('/api/')) {
        return next();
      }
      return res
        .status(503)
        .type('text/plain')
        .send('Web assets are not built. Run npm --prefix web run build.');
    });
  }
  app.use((err, req, res, next) => {
    errorHandler(err, req, res, next);
  });

  return app;
}

const app = createApp();

export { app };
export default app;
