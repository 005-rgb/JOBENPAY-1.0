-- 061_personal_settings.sql
-- Personal settings: Profile, Local Password, 2FA, Sessions, and Notification Preferences

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS has_password boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT '{"email_approvals": true, "email_security": true, "inapp_approvals": true, "inapp_security": true}'::jsonb;

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS ip_address text;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);

COMMIT;
