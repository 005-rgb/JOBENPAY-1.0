import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import cookieParser from 'cookie-parser';
import express from 'express';
import pinoHttp from 'pino-http';
import { pino } from 'pino';

import { env } from './config.js';
import { query } from './db/pool.js';
import { withTx } from './db/tx.js';
import { errorHandler } from './lib/errors.js';
import { verifyPassword } from './lib/crypto.js';
import { appendAudit } from './repositories/audit.js';
import { getMembership } from './repositories/memberships.js';
import { getCurrentOrg } from './repositories/orgs.js';
import { rateLimit } from './repositories/rateLimit.js';
import { createGrant, useGrant } from './repositories/stepUp.js';
import { createSession, deleteSession, findSessionByCookie } from './repositories/sessions.js';
import { createUser, findUserByEmail, findUserById, resetLoginFailure, updateLoginFailure } from './repositories/users.js';
import { appendEntry, LEDGER_TYPES } from './services/ledger.js';

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000000';
const MIGRATIONS_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
const STEP_UP_PURPOSES = new Set([
  'ACTIVATE_MANDATE',
  'APPROVE_ABOVE_THRESHOLD',
  'FREEZE_TOGGLE',
  'TRUST_PAYEE',
  'ROTATE_CREDENTIALS',
]);

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
  app.use(readRequestId);
  app.use(pinoHttp({ logger }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ ok: true, service: 'jobenpay', status: 'healthy' });
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

  const api = express.Router();

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
        grantId: req.body?.grantId,
        purpose,
        sessionId: session.id,
      });
      if (!grant) {
        throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 401);
      }

      const orgId = session.current_org_id || GLOBAL_ORG_ID;
      await withTx(async (tx) => {
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
        grantId: req.body?.grantId,
        purpose,
        sessionId: session.id,
      });
      if (!grant) {
        throw buildError('STEP_UP_REQUIRED', 'Step-up authentication required.', 401);
      }

      const orgId = session.current_org_id || GLOBAL_ORG_ID;
      await withTx(async (tx) => {
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

  return app;
}

const app = createApp();

export { app };
export default app;
