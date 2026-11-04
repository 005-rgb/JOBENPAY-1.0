-- Step P5: Signup, Terms, Email Tokens Meta, and Email Outbox

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS pending_org_name text,
  ALTER COLUMN email_verified_at SET DEFAULT now();

UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

ALTER TABLE email_tokens
  ADD COLUMN IF NOT EXISTS meta jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS email_tokens_token_hash_idx ON email_tokens (token_hash);

CREATE TABLE IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  to_hash text NOT NULL,
  template text NOT NULL,
  payload text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0,
  message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE email_outbox
  ALTER COLUMN org_id DROP NOT NULL,
  ALTER COLUMN payload TYPE text USING payload::text,
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS to_hash text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_email_outbox_status_attempts ON email_outbox(status, attempts);
