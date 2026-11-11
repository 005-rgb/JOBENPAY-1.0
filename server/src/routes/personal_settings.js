import express from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { hashPassword, verifyPassword, encrypt, decrypt } from '../lib/crypto.js';
import { generateTotpSetup, verifyTotpCode } from '../lib/totp.js';
import { parseUserAgent } from '../lib/user_agent.js';
import { findUserSessions, deleteUserOtherSessions } from '../repositories/sessions.js';
import { appendAudit } from '../repositories/audit.js';
import { verifyGoogleIdToken } from '../auth/google.js';
import { env } from '../config.js';

const GLOBAL_ORG_ID = '00000000-0000-4000-8000-000000000001';

function getEncryptionKey() {
  return env.JOBENPAY_ENC_KEY || process.env.JOBENPAY_ENC_KEY || 'k'.repeat(32);
}

export function createPersonalSettingsRouter({ requireSession, requireCsrf }) {
  const router = express.Router();

  // Helper to get authenticated user record
  async function getFullUser(userId, currentOrgId) {
    const { rows } = await query(
      `SELECT u.id, u.email, u.display_name, u.job_title, u.avatar_url,
              u.has_password, u.google_linked, u.google_sub, u.totp_enabled, u.totp_secret_enc, u.password_hash,
              u.notification_preferences, u.created_at,
              m.role, o.name as organization_name
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id AND m.org_id = $2
       LEFT JOIN organizations o ON o.id = $2
       WHERE u.id = $1
       LIMIT 1`,
      [userId, currentOrgId || GLOBAL_ORG_ID],
    );
    return rows[0] || null;
  }

  // 1. GET /api/v1/me/profile
  router.get(['/me/profile', '/users/profile'], requireSession, async (req, res, next) => {
    try {
      const user = await getFullUser(req.session.user_id, req.session.current_org_id);
      if (!user) {
        return res.status(404).json({ ok: false, code: 'USER_NOT_FOUND', message: 'User not found.' });
      }

      res.status(200).json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          display_name: user.display_name,
          job_title: user.job_title || '',
          avatar_url: user.avatar_url || '',
          has_password: Boolean(user.has_password),
          google_linked: Boolean(user.google_linked),
          totp_enabled: Boolean(user.totp_enabled),
          role: user.role || 'VIEWER',
          organization_name: user.organization_name || 'JOBENPAY',
          notification_preferences: user.notification_preferences || {
            email_approvals: true,
            email_security: true,
            inapp_approvals: true,
            inapp_security: true,
          },
          created_at: user.created_at,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. PATCH /api/v1/me/profile
  const updateProfileSchema = z.object({
    display_name: z.string().trim().min(1, 'Display name cannot be empty').max(100).optional(),
    job_title: z.string().trim().max(100).nullable().optional(),
    avatar_url: z.string().trim().max(500).nullable().optional(),
  });

  router.patch(['/me/profile', '/users/profile'], requireSession, requireCsrf, async (req, res, next) => {
    try {
      const parsed = updateProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message || 'Validation failed',
          errors: parsed.error.issues,
        });
      }

      const { display_name, job_title, avatar_url } = parsed.data;

      const sets = [];
      const values = [];
      let idx = 1;

      if (display_name !== undefined) {
        sets.push(`display_name = $${idx++}`);
        values.push(display_name);
      }
      if (job_title !== undefined) {
        sets.push(`job_title = $${idx++}`);
        values.push(job_title);
      }
      if (avatar_url !== undefined) {
        sets.push(`avatar_url = $${idx++}`);
        values.push(avatar_url);
      }

      if (sets.length === 0) {
        const user = await getFullUser(req.session.user_id, req.session.current_org_id);
        return res.status(200).json({ ok: true, user, message: 'Nothing to update.' });
      }

      values.push(req.session.user_id);
      const { rows } = await query(
        `UPDATE users
         SET ${sets.join(', ')}
         WHERE id = $${idx}
         RETURNING id, email, display_name, job_title, avatar_url, has_password, totp_enabled, notification_preferences`,
        values,
      );

      const updated = rows[0];
      if (!updated) {
        return res.status(404).json({ ok: false, code: 'USER_NOT_FOUND', message: 'User not found.' });
      }

      await appendAudit({
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        actorId: req.session.user_id,
        action: 'PROFILE_UPDATED',
        details: { displayName: updated.display_name, jobTitle: updated.job_title },
      }).catch(() => {});

      res.status(200).json({
        ok: true,
        user: {
          id: updated.id,
          email: updated.email,
          display_name: updated.display_name,
          job_title: updated.job_title || '',
          avatar_url: updated.avatar_url || '',
          has_password: Boolean(updated.has_password),
          totp_enabled: Boolean(updated.totp_enabled),
          notification_preferences: updated.notification_preferences,
        },
        message: 'Profile updated successfully.',
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. POST /api/v1/me/password
  const setPasswordSchema = z
    .object({
      current_password: z.string().optional(),
      currentPassword: z.string().optional(),
      new_password: z.string().optional(),
      newPassword: z.string().optional(),
      google_credential: z.string().optional(),
      googleCredential: z.string().optional(),
    })
    .refine((data) => Boolean(data.new_password || data.newPassword), {
      message: 'New password is required',
      path: ['new_password'],
    });

  router.post(['/me/password', '/users/password', '/auth/set-password', '/auth/password'], requireSession, requireCsrf, async (req, res, next) => {
    try {
      const parsed = setPasswordSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: parsed.error.issues[0]?.message || 'Validation failed',
          errors: parsed.error.issues,
        });
      }

      const current_password = parsed.data.current_password || parsed.data.currentPassword;
      const new_password = parsed.data.new_password || parsed.data.newPassword;
      const google_credential = parsed.data.google_credential || parsed.data.googleCredential;

      if (!new_password || new_password.length < 8) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: 'Password must be at least 8 characters',
        });
      }
      if (!/[A-Z]/.test(new_password)) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: 'Password must contain at least one uppercase letter',
        });
      }
      if (!/[a-z]/.test(new_password)) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: 'Password must contain at least one lowercase letter',
        });
      }
      if (!/[0-9]/.test(new_password)) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: 'Password must contain at least one number',
        });
      }
      const user = await getFullUser(req.session.user_id, req.session.current_org_id);
      if (!user) {
        return res.status(404).json({ ok: false, code: 'USER_NOT_FOUND', message: 'User not found.' });
      }

      // If user already has a custom password, either current_password OR google_credential must be verified
      if (user.has_password && user.password_hash) {
        let identityVerified = false;

        if (current_password) {
          const matches = await verifyPassword(current_password, user.password_hash);
          if (!matches) {
            return res.status(400).json({
              ok: false,
              code: 'INVALID_CURRENT_PASSWORD',
              message: 'The current password you provided is incorrect.',
            });
          }
          identityVerified = true;
        } else if (google_credential) {
          try {
            const googleUser = await verifyGoogleIdToken(google_credential);
            if (!googleUser || googleUser.email.toLowerCase() !== user.email.toLowerCase()) {
              return res.status(400).json({
                ok: false,
                code: 'GOOGLE_EMAIL_MISMATCH',
                message: 'The Google account email does not match your JobenPay account email.',
              });
            }
            identityVerified = true;
          } catch (gErr) {
            return res.status(400).json({
              ok: false,
              code: 'GOOGLE_AUTH_FAILED',
              message: gErr.message || 'Google account verification failed.',
            });
          }
        }

        if (!identityVerified) {
          return res.status(400).json({
            ok: false,
            code: 'CURRENT_PASSWORD_REQUIRED',
            message: 'Current password or Google account verification is required to update your password.',
          });
        }
      }

      const newHash = await hashPassword(new_password);
      await query(
        `UPDATE users
         SET password_hash = $1, has_password = true, google_linked = CASE WHEN $3 = true THEN true ELSE google_linked END, failed_login_count = 0, locked_until = NULL
         WHERE id = $2`,
        [newHash, req.session.user_id, Boolean(google_credential)],
      );

      const action = !user.has_password
        ? 'PASSWORD_SET'
        : (google_credential ? 'PASSWORD_RESET_VIA_GOOGLE' : 'PASSWORD_CHANGED');

      await appendAudit({
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        actorId: req.session.user_id,
        action,
        details: { method: !user.has_password ? 'initial_setup' : (google_credential ? 'google_reauth' : 'change') },
      }).catch(() => {});

      res.status(200).json({
        ok: true,
        has_password: true,
        message: 'Password saved successfully. You can now use it to sign in.',
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. POST /api/v1/me/2fa/setup
  router.post('/me/2fa/setup', requireSession, requireCsrf, async (req, res, next) => {
    try {
      const user = await getFullUser(req.session.user_id, req.session.current_org_id);
      if (!user) {
        return res.status(404).json({ ok: false, code: 'USER_NOT_FOUND', message: 'User not found.' });
      }

      const setup = generateTotpSetup({ email: user.email, issuer: 'JOBENPAY' });
      const encryptedSecret = encrypt({
        key: getEncryptionKey(),
        plaintext: setup.secret,
        aad: String(user.id),
      });

      await query(
        `UPDATE users SET totp_secret_enc = $1, totp_enabled = false WHERE id = $2`,
        [encryptedSecret, user.id],
      );

      res.status(200).json({
        ok: true,
        secret: setup.secret,
        formatted_secret: setup.formattedSecret,
        otpauth_url: setup.otpauthUrl,
        qr_svg: setup.qrSvg,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. POST /api/v1/me/2fa/verify
  const verify2faSchema = z.object({
    code: z.string().trim().length(6, 'Authentication code must be exactly 6 digits'),
  });

  router.post('/me/2fa/verify', requireSession, requireCsrf, async (req, res, next) => {
    try {
      const parsed = verify2faSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: 'Authentication code must be a 6-digit number.',
        });
      }

      const user = await getFullUser(req.session.user_id, req.session.current_org_id);
      if (!user) {
        return res.status(404).json({ ok: false, code: 'USER_NOT_FOUND', message: 'User not found.' });
      }

      if (!user.totp_secret_enc) {
        return res.status(400).json({
          ok: false,
          code: '2FA_NOT_INITIALIZED',
          message: 'Please initiate 2FA setup before verifying.',
        });
      }

      let secret;
      try {
        secret = decrypt({
          key: getEncryptionKey(),
          payload: user.totp_secret_enc,
          aad: String(user.id),
        });
      } catch {
        return res.status(500).json({
          ok: false,
          code: 'CRYPTO_ERROR',
          message: 'Failed to decrypt TOTP secret.',
        });
      }

      const isValid = verifyTotpCode(secret, parsed.data.code);
      if (!isValid) {
        return res.status(400).json({
          ok: false,
          code: 'INVALID_2FA_CODE',
          message: 'Invalid 6-digit authentication code. Please check your authenticator app and try again.',
        });
      }

      await query(`UPDATE users SET totp_enabled = true WHERE id = $1`, [user.id]);

      await appendAudit({
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        actorId: req.session.user_id,
        action: '2FA_ENABLED',
        details: { method: 'totp' },
      }).catch(() => {});

      res.status(200).json({
        ok: true,
        totp_enabled: true,
        message: 'Two-factor authentication has been enabled successfully.',
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. POST /api/v1/me/2fa/disable
  router.post('/me/2fa/disable', requireSession, requireCsrf, async (req, res, next) => {
    try {
      await query(
        `UPDATE users SET totp_enabled = false, totp_secret_enc = NULL WHERE id = $1`,
        [req.session.user_id],
      );

      await appendAudit({
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        actorId: req.session.user_id,
        action: '2FA_DISABLED',
        details: {},
      }).catch(() => {});

      res.status(200).json({
        ok: true,
        totp_enabled: false,
        message: 'Two-factor authentication has been disabled.',
      });
    } catch (err) {
      next(err);
    }
  });

  // 7. GET /api/v1/me/sessions
  router.get(['/me/sessions', '/users/sessions'], requireSession, async (req, res, next) => {
    try {
      const rows = await findUserSessions(GLOBAL_ORG_ID, req.session.user_id);
      const sessions = rows.map((s) => {
        const { browser, os, label } = parseUserAgent(s.user_agent);
        return {
          id: s.id,
          browser,
          os,
          device_label: label,
          ip_address: s.ip_address || '127.0.0.1',
          created_at: s.created_at,
          last_seen_at: s.last_seen_at,
          is_current: s.id === req.session.id,
        };
      });

      res.status(200).json({ ok: true, sessions });
    } catch (err) {
      next(err);
    }
  });

  // 8. DELETE /api/v1/me/sessions
  router.delete(['/me/sessions', '/users/sessions'], requireSession, requireCsrf, async (req, res, next) => {
    try {
      const count = await deleteUserOtherSessions(GLOBAL_ORG_ID, req.session.user_id, req.session.id);

      await appendAudit({
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        actorId: req.session.user_id,
        action: 'SESSIONS_REVOKED',
        details: { count },
      }).catch(() => {});

      res.status(200).json({
        ok: true,
        count,
        message: 'All other active sessions have been logged out successfully.',
      });
    } catch (err) {
      next(err);
    }
  });

  // 9. PATCH /api/v1/me/notifications
  const notificationSchema = z.object({
    email_approvals: z.boolean().optional(),
    email_security: z.boolean().optional(),
    inapp_approvals: z.boolean().optional(),
    inapp_security: z.boolean().optional(),
  });

  router.patch(['/me/notifications', '/users/notifications'], requireSession, requireCsrf, async (req, res, next) => {
    try {
      const parsed = notificationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          ok: false,
          code: 'VALIDATION_FAILED',
          message: 'Invalid notification preferences payload.',
        });
      }

      const user = await getFullUser(req.session.user_id, req.session.current_org_id);
      const currentPrefs = user?.notification_preferences || {
        email_approvals: true,
        email_security: true,
        inapp_approvals: true,
        inapp_security: true,
      };

      const updatedPrefs = {
        ...currentPrefs,
        ...parsed.data,
      };

      await query(
        `UPDATE users SET notification_preferences = $1 WHERE id = $2`,
        [JSON.stringify(updatedPrefs), req.session.user_id],
      );

      await appendAudit({
        orgId: req.session.current_org_id || GLOBAL_ORG_ID,
        actorId: req.session.user_id,
        action: 'NOTIFICATIONS_UPDATED',
        details: updatedPrefs,
      }).catch(() => {});

      res.status(200).json({
        ok: true,
        notification_preferences: updatedPrefs,
        message: 'Notification preferences updated.',
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createPersonalSettingsRouter;

