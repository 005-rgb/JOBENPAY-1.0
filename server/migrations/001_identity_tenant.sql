CREATE OR REPLACE FUNCTION public.jobenpay_uuid_v4()
RETURNS uuid
LANGUAGE sql
VOLATILE
AS $$
  SELECT (
    substr(value, 1, 8) || '-' || substr(value, 9, 4) || '-4'
    || substr(value, 14, 3) || '-'
    || CASE substr(value, 17, 1)
      WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8'
      WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9'
      WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a'
      ELSE 'b'
    END
    || substr(value, 18, 3) || '-' || substr(value, 21, 12)
  )::uuid
  FROM (
    SELECT md5(random()::text || clock_timestamp()::text
      || txid_current()::text || pg_backend_pid()::text) AS value
  ) AS source
$$;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT public.jobenpay_uuid_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  password_hash text NOT NULL,
  email_verified_at timestamptz,
  display_name text,
  locale text,
  totp_secret_enc text,
  totp_enabled boolean NOT NULL DEFAULT false,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT public.jobenpay_uuid_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  id_hash text NOT NULL,
  user_id uuid NOT NULL,
  current_org_id uuid,
  csrf_secret text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT public.jobenpay_uuid_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('VERIFY', 'RESET', 'INVITE')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE step_up_grants (
  id uuid PRIMARY KEY DEFAULT public.jobenpay_uuid_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT public.jobenpay_uuid_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  frozen_at timestamptz,
  frozen_by uuid
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT public.jobenpay_uuid_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER')),
  is_judge boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, user_id)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT public.jobenpay_uuid_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));
CREATE INDEX idx_sessions_user_org ON sessions (user_id, current_org_id);
CREATE INDEX idx_step_up_grants_session ON step_up_grants (session_id, expires_at);
CREATE INDEX idx_memberships_org_user ON memberships (org_id, user_id);
