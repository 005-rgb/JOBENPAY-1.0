-- 062_google_oauth_has_password_fix.sql
-- Support Google OAuth linked accounts: google_linked, google_sub, and correct has_password flag

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS google_linked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_sub text;

-- Backfill google_linked based on audit_events
UPDATE users
SET google_linked = true
WHERE id IN (
  SELECT DISTINCT actor_id FROM audit_events WHERE action IN ('LOGIN_GOOGLE', 'SIGNUP_GOOGLE') AND actor_id IS NOT NULL
) OR email IN (
  SELECT DISTINCT LOWER(details->>'email') FROM audit_events WHERE action IN ('LOGIN_GOOGLE', 'SIGNUP_GOOGLE') AND details->>'email' IS NOT NULL
);

-- Backfill google_sub from audit_events if available
UPDATE users u
SET google_sub = a.details->>'googleSub'
FROM audit_events a
WHERE (u.id = a.actor_id OR LOWER(u.email) = LOWER(a.details->>'email'))
  AND a.action IN ('LOGIN_GOOGLE', 'SIGNUP_GOOGLE') 
  AND a.details->>'googleSub' IS NOT NULL
  AND u.google_sub IS NULL;

-- Correct has_password for users that signed in via Google and have not set a custom password
UPDATE users
SET has_password = false
WHERE google_linked = true
  AND id NOT IN (
    SELECT DISTINCT actor_id FROM audit_events WHERE action IN ('PASSWORD_CHANGED', 'PASSWORD_SET') AND actor_id IS NOT NULL
  );

COMMIT;
