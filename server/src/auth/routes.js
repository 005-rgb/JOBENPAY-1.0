import crypto from 'node:crypto';
import { z } from 'zod';

import { env } from '../config.js';
import pool from '../db/pool.js';
import { withTx } from '../db/tx.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, hmacSha256, sha256Hex } from '../lib/crypto.js';
import { rateLimit } from '../repositories/rateLimit.js';
import { findUserByEmail, createUnverifiedUser, verifyUserEmail } from '../repositories/users.js';
import { resetLoginFailure } from '../repositories/users.js';
import { findFirstMembership } from '../repositories/memberships.js';
import { createSession } from '../repositories/sessions.js';
import { enforceRateLimit } from '../repositories/rateLimit.js';
import { appendAudit } from '../repositories/audit.js';
import { enqueueEmail, claimAndSendEmail } from '../email/outbox.js';
import { isCommonPassword } from './common-passwords.js';
import { verifyGoogleIdToken } from './google.js';

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000000';

function buildError(code, message, statusCode) {
  const error = new AppError(code, message || code);
  error.statusCode = statusCode;
  return error;
}

export function requireJsonBody(req, res, next) {
  const contentType = req.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return next(buildError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json.', 415));
  }
  next();
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV !== 'development',
    path: '/',
  };
}

export function registerAuthRoutes(api) {
  // Public config endpoint: returns registration status and Google client ID if configured
  api.get('/auth/config', (_req, res) => {
    return res.status(200).json({
      registrationEnabled: Number(env.REGISTRATION_ENABLED) === 1,
      googleClientId: env.GOOGLE_CLIENT_ID || null,
    });
  });

  // POST /api/v1/auth/register
  api.post('/auth/register', requireJsonBody, async (req, res, next) => {
    try {
      if (Number(env.REGISTRATION_ENABLED) !== 1) {
        throw buildError('REGISTRATION_DISABLED', 'Registration is disabled.', 403);
      }

      // Honeypot check: website filled -> 202 without doing anything
      const honeypot = req.body?.website;
      if (honeypot && String(honeypot).trim().length > 0) {
        return res.status(202).json({ status: 'verification_sent' });
      }

      // Global daily limit
      const globalExceeded = await rateLimit('signup:global', env.SIGNUP_DAILY_LIMIT, 86400);
      if (globalExceeded) {
        throw buildError('SERVICE_UNAVAILABLE', 'Signups are temporarily unavailable', 503);
      }

      // IP rate limit: 5 per hour
      const forwarded = req.get('x-forwarded-for');
      const ip = (forwarded ? forwarded.split(',')[0].trim() : '') || req.ip || req.socket?.remoteAddress || 'unknown';
      const ipExceeded = await rateLimit(`signup:ip:${ip}`, 5, 3600);
      if (ipExceeded) {
        throw buildError('RATE_LIMITED', 'Rate limit exceeded.', 429);
      }

      // Validation schema
      const registerSchema = z.object({
        email: z.string().trim().toLowerCase().max(254).email(),
        password: z.string().min(12).max(128),
        displayName: z.string().trim().min(2).max(80),
        orgName: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N}\s.,'&()/-]+$/u, 'Organization name contains invalid characters.'),
        acceptTerms: z.literal(true),
        website: z.string().optional(),
      });

      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        throw buildError('VALIDATION_FAILED', 'Invalid registration fields.', 400);
      }

      const { email, password, displayName, orgName } = parsed.data;

      // Password rules
      const localPart = email.split('@')[0];
      if (password.toLowerCase() === email || password.toLowerCase() === localPart) {
        throw buildError('VALIDATION_FAILED', 'Password cannot be the same as your email.', 400);
      }
      if (isCommonPassword(password)) {
        throw buildError('VALIDATION_FAILED', 'Password is too common. Please choose a stronger password.', 400);
      }

      // Email rate limit: 3 per hour
      const emailExceeded = await rateLimit(`signup:email:${sha256Hex(email)}`, 3, 3600);
      if (emailExceeded) {
        throw buildError('RATE_LIMITED', 'Rate limit exceeded.', 429);
      }

      // Check existing user
      const existing = await findUserByEmail(GLOBAL_ORG_ID, email);
      const passwordHash = await hashPassword(password);

      // Audit event: SIGNUP_REQUESTED (HMAC email)
      const emailHmac = hmacSha256(env.JOBENPAY_HMAC_PEPPER, email);
      await appendAudit({
        orgId: GLOBAL_ORG_ID,
        action: 'SIGNUP_REQUESTED',
        details: { emailHmac },
      });

      if (!existing) {
        // Branch 1: New user -> create unverified user and issue token
        const newUser = await createUnverifiedUser(pool, {
          email,
          passwordHash,
          displayName,
          pendingOrgName: orgName,
        });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = sha256Hex(rawToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await pool.query(
          `INSERT INTO email_tokens (kind, token_hash, expires_at, meta)
           VALUES ('VERIFY', $1, $2, $3)`,
          [tokenHash, expiresAt, JSON.stringify({ userId: newUser.id, email })],
        );

        const verifyLink = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
        const outbox = await enqueueEmail(pool, {
          orgId: null,
          to: email,
          template: 'verifyEmail',
          data: { link: verifyLink, expiresHours: 24 },
        });

        claimAndSendEmail(outbox.id).catch(() => {});
      } else if (existing.email_verified_at) {
        // Branch 2: Already verified -> accountExistsNotice (max 1/hr per email)
        const noticeExceeded = await rateLimit(`signup:notice:${sha256Hex(email)}`, 1, 3600);
        if (!noticeExceeded) {
          const loginLink = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/login`;
          const outbox = await enqueueEmail(pool, {
            orgId: null,
            to: email,
            template: 'accountExistsNotice',
            data: { loginLink },
          });
          claimAndSendEmail(outbox.id).catch(() => {});
        }
      } else {
        // Branch 3: Registered but unverified -> cooldown 60s
        const recent = await pool.query(
          `SELECT id FROM email_tokens
           WHERE meta->>'userId' = $1 AND kind = 'VERIFY' AND created_at > now() - interval '60 seconds'
           LIMIT 1`,
          [existing.id],
        );

        if (recent.rowCount === 0) {
          await pool.query(
            `UPDATE email_tokens SET used_at = now()
             WHERE meta->>'userId' = $1 AND kind = 'VERIFY' AND used_at IS NULL`,
            [existing.id],
          );

          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = sha256Hex(rawToken);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await pool.query(
            `INSERT INTO email_tokens (kind, token_hash, expires_at, meta)
             VALUES ('VERIFY', $1, $2, $3)`,
            [tokenHash, expiresAt, JSON.stringify({ userId: existing.id, email })],
          );

          const verifyLink = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
          const outbox = await enqueueEmail(pool, {
            orgId: null,
            to: email,
            template: 'verifyEmail',
            data: { link: verifyLink, expiresHours: 24 },
          });
          claimAndSendEmail(outbox.id).catch(() => {});
        }
      }

      // Always return 202 verification_sent (anti-enumeration)
      return res.status(202).json({ status: 'verification_sent' });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/auth/verify-email
  api.post('/auth/verify-email', requireJsonBody, async (req, res, next) => {
    try {
      const rawToken = String(req.body?.token || '').trim();
      if (!rawToken || rawToken.length < 32) {
        throw buildError('TOKEN_INVALID_OR_EXPIRED', 'Verification link is invalid or has expired.', 400);
      }

      const tokenHash = sha256Hex(rawToken);

      const verificationResult = await withTx(async (tx) => {
        // Lock token row with SELECT ... FOR UPDATE
        const tokenQuery = await tx.query(
          `SELECT * FROM email_tokens
           WHERE token_hash = $1 AND kind = 'VERIFY'
           FOR UPDATE`,
          [tokenHash],
        );

        if (tokenQuery.rowCount === 0) {
          throw buildError('TOKEN_INVALID_OR_EXPIRED', 'Verification link is invalid or has expired.', 400);
        }

        const tokenRow = tokenQuery.rows[0];
        if (tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
          throw buildError('TOKEN_INVALID_OR_EXPIRED', 'Verification link is invalid or has expired.', 400);
        }

        const userId = tokenRow.meta?.userId;
        if (!userId) {
          throw buildError('TOKEN_INVALID_OR_EXPIRED', 'Verification link is invalid or has expired.', 400);
        }

        // Lock user row
        const userQuery = await tx.query(
          `SELECT * FROM users WHERE id = $1 FOR UPDATE`,
          [userId],
        );

        if (userQuery.rowCount === 0) {
          throw buildError('TOKEN_INVALID_OR_EXPIRED', 'Verification link is invalid or has expired.', 400);
        }

        const userRow = userQuery.rows[0];

        // Mark token used
        await tx.query(`UPDATE email_tokens SET used_at = now() WHERE id = $1`, [tokenRow.id]);

        // If user already verified, do not recreate org
        if (userRow.email_verified_at) {
          return { user: userRow, alreadyVerified: true };
        }

        // Mark email verified
        const updatedUser = await verifyUserEmail(tx, userRow.id);

        // Create organization
        const orgName = (userRow.pending_org_name || 'My Organization').trim();
        const baseSlug = orgName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '') || 'org';

        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const existingOrg = await tx.query('SELECT id FROM organizations WHERE slug = $1', [slug]);
          if (existingOrg.rowCount === 0) break;
          slug = `${baseSlug}-${counter++}`;
        }

        const orgResult = await tx.query(
          `INSERT INTO organizations (name, slug)
           VALUES ($1, $2)
           RETURNING id, name, slug`,
          [orgName, slug],
        );
        const newOrg = orgResult.rows[0];

        // Create membership OWNER (is_judge = false)
        await tx.query(
          `INSERT INTO memberships (org_id, user_id, role, is_judge)
           VALUES ($1, $2, 'OWNER', false)`,
          [newOrg.id, userRow.id],
        );

        // Audit events: EMAIL_VERIFIED + ORG_CREATED
        await appendAudit(tx, {
          orgId: newOrg.id,
          actorId: userRow.id,
          action: 'EMAIL_VERIFIED',
          details: { email: userRow.email },
        });

        await appendAudit(tx, {
          orgId: newOrg.id,
          actorId: userRow.id,
          action: 'ORG_CREATED',
          details: { orgId: newOrg.id, name: newOrg.name, slug: newOrg.slug },
        });

        return { user: updatedUser, org: newOrg, alreadyVerified: false };
      });

      // Best effort welcome email
      if (!verificationResult.alreadyVerified && verificationResult.user?.email) {
        enqueueEmail(pool, {
          orgId: verificationResult.org?.id || null,
          to: verificationResult.user.email,
          template: 'welcome',
          data: {},
        }).then((outbox) => claimAndSendEmail(outbox.id)).catch(() => {});
      }

      return res.status(200).json({
        ok: true,
        verified: true,
        message: 'Email verified successfully. You can now log in.',
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/auth/resend-verification
  api.post('/auth/resend-verification', requireJsonBody, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        throw buildError('VALIDATION_FAILED', 'A valid email is required.', 400);
      }

      const user = await findUserByEmail(GLOBAL_ORG_ID, email);
      if (user && !user.email_verified_at) {
        const cooldownExceeded = await rateLimit(`resend:cooldown:${sha256Hex(email)}`, 1, 60);
        const dailyExceeded = await rateLimit(`resend:daily:${sha256Hex(email)}`, 5, 86400);

        if (!cooldownExceeded && !dailyExceeded) {
          await pool.query(
            `UPDATE email_tokens SET used_at = now()
             WHERE meta->>'userId' = $1 AND kind = 'VERIFY' AND used_at IS NULL`,
            [user.id],
          );

          const rawToken = crypto.randomBytes(32).toString('hex');
          const tokenHash = sha256Hex(rawToken);
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await pool.query(
            `INSERT INTO email_tokens (kind, token_hash, expires_at, meta)
             VALUES ('VERIFY', $1, $2, $3)`,
            [tokenHash, expiresAt, JSON.stringify({ userId: user.id, email })],
          );

          const verifyLink = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/verify-email?token=${rawToken}`;
          const outbox = await enqueueEmail(pool, {
            orgId: null,
            to: email,
            template: 'verifyEmail',
            data: { link: verifyLink, expiresHours: 24 },
          });
          claimAndSendEmail(outbox.id).catch(() => {});
        }
      }

      // Always return 202 generic
      return res.status(202).json({ status: 'verification_sent' });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/v1/auth/google
  api.post('/auth/google', requireJsonBody, async (req, res, next) => {
    try {
      const forwarded = req.get('x-forwarded-for');
      const ip = (forwarded ? forwarded.split(',')[0].trim() : '') || req.ip || req.socket?.remoteAddress || 'unknown';
      const ipKey = `google:${ip}`;
      await enforceRateLimit(ipKey, 10, 60);

      const googleSchema = z.object({
        credential: z.string().min(10, 'Google credential is required.'),
        orgName: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N}\s.,'&()/-]+$/u, 'Organization name contains invalid characters.').optional(),
      });

      const parsed = googleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw buildError('VALIDATION_FAILED', 'Invalid Google authentication payload.', 400);
      }

      const { credential, orgName } = parsed.data;
      const googleUser = await verifyGoogleIdToken(credential);
      const email = googleUser.email.trim().toLowerCase();

      const existing = await findUserByEmail(GLOBAL_ORG_ID, email);

      if (existing) {
        // User exists -> Check account lockout
        if (existing.locked_until && new Date(existing.locked_until) > new Date()) {
          return res.status(403).json({ ok: false, code: 'FORBIDDEN', message: 'Account locked.' });
        }

        // Ensure email is marked verified since verified by Google
        if (!existing.email_verified_at) {
          await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [existing.id]);
        }

        let membership = await findFirstMembership(GLOBAL_ORG_ID, existing.id);
        let currentOrgId = membership?.org_id;

        // If user registered earlier without verifying (hence no org created yet), create it now:
        if (!currentOrgId) {
          await withTx(async (client) => {
            const chosenOrgName = orgName || existing.pending_org_name || (googleUser.name ? `${googleUser.name}'s Team` : 'My Organization');
            const slugBase = chosenOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
            const slug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;

            const orgInsert = await client.query(
              `INSERT INTO organizations (name, slug)
               VALUES ($1, $2)
               RETURNING id, name, slug`,
              [chosenOrgName, slug],
            );
            const newOrg = orgInsert.rows[0];

            await client.query(
              `INSERT INTO memberships (org_id, user_id, role, is_judge)
               VALUES ($1, $2, 'OWNER', false)`,
              [newOrg.id, existing.id],
            );

            currentOrgId = newOrg.id;

            await appendAudit({
              orgId: currentOrgId,
              actorId: existing.id,
              action: 'ORG_CREATED',
              details: { orgId: newOrg.id, name: newOrg.name, slug: newOrg.slug },
            });
          });
        }

        // Reset login failures
        await resetLoginFailure(GLOBAL_ORG_ID, existing.id);

        const csrfSecret = crypto.randomBytes(32).toString('hex');
        const sessionInfo = await createSession(GLOBAL_ORG_ID, {
          userId: existing.id,
          currentOrgId: currentOrgId || GLOBAL_ORG_ID,
          csrfSecret,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        });

        res.cookie('jp_sid', sessionInfo.token, cookieOptions());

        await appendAudit({
          orgId: currentOrgId || GLOBAL_ORG_ID,
          actorId: existing.id,
          action: 'LOGIN_GOOGLE',
          details: { email, googleSub: googleUser.sub },
        });

        return res.status(200).json({
          ok: true,
          user: {
            id: existing.id,
            email: existing.email,
            displayName: existing.display_name || googleUser.name,
          },
          csrfToken: csrfSecret,
          isNewUser: false,
        });
      }

      // User does NOT exist -> Sign up with Google
      if (Number(env.REGISTRATION_ENABLED) !== 1) {
        throw buildError('REGISTRATION_DISABLED', 'Registration is disabled.', 403);
      }

      const globalExceeded = await rateLimit('signup:global', env.SIGNUP_DAILY_LIMIT, 86400);
      if (globalExceeded) {
        throw buildError('SERVICE_UNAVAILABLE', 'Signups are temporarily unavailable', 503);
      }

      const dummyPass = crypto.randomBytes(32).toString('hex');
      const passwordHash = await hashPassword(dummyPass);
      const displayName = googleUser.name || email.split('@')[0];

      let createdUser = null;
      let createdOrg = null;
      let sessionToken = null;
      let csrfSecret = null;

      await withTx(async (client) => {
        const userInsert = await client.query(
          `INSERT INTO users (email, password_hash, display_name, email_verified_at, terms_accepted_at, terms_version, has_password)
           VALUES ($1, $2, $3, now(), now(), '1.0', false)
           RETURNING id, email, display_name, has_password`,
          [email, passwordHash, displayName],
        );
        createdUser = userInsert.rows[0];

        const chosenOrgName = orgName || `${displayName}'s Team`;
        const slugBase = chosenOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
        const slug = `${slugBase}-${crypto.randomBytes(3).toString('hex')}`;

        const orgInsert = await client.query(
          `INSERT INTO organizations (name, slug)
           VALUES ($1, $2)
           RETURNING id, name, slug`,
          [chosenOrgName, slug],
        );
        createdOrg = orgInsert.rows[0];

        await client.query(
          `INSERT INTO memberships (org_id, user_id, role, is_judge)
           VALUES ($1, $2, 'OWNER', false)`,
          [createdOrg.id, createdUser.id],
        );

        await appendAudit({
          orgId: createdOrg.id,
          actorId: createdUser.id,
          action: 'SIGNUP_GOOGLE',
          details: { email, googleSub: googleUser.sub },
        });

        await appendAudit({
          orgId: createdOrg.id,
          actorId: createdUser.id,
          action: 'ORG_CREATED',
          details: { orgId: createdOrg.id, name: createdOrg.name, slug: createdOrg.slug },
        });

        try {
          const outbox = await enqueueEmail(client, {
            orgId: createdOrg.id,
            to: email,
            template: 'welcome',
            data: { orgName: createdOrg.name },
          });
          claimAndSendEmail(outbox.id).catch(() => {});
        } catch {
          // Non-blocking
        }

        csrfSecret = crypto.randomBytes(32).toString('hex');
        const sessionInfo = await createSession(GLOBAL_ORG_ID, {
          userId: createdUser.id,
          currentOrgId: createdOrg.id,
          csrfSecret,
          expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        });
        sessionToken = sessionInfo.token;
      });

      res.cookie('jp_sid', sessionToken, cookieOptions());

      await appendAudit({
        orgId: createdOrg.id,
        actorId: createdUser.id,
        action: 'LOGIN_SUCCESS',
        details: { email, method: 'google' },
      });

      return res.status(200).json({
        ok: true,
        user: {
          id: createdUser.id,
          email: createdUser.email,
          displayName: createdUser.display_name,
        },
        csrfToken: csrfSecret,
        isNewUser: true,
      });
    } catch (error) {
      next(error);
    }
  });
}
