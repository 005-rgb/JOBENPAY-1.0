-- JOBENPAY PRD v1.2 Database Snapshot Fixture
-- Forward-only expand baseline (Migrations 001-018)


-- Migration: 001_identity_tenant.sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
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
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  id_hash text NOT NULL,
  user_id uuid NOT NULL,
  current_org_id uuid,
  csrf_secret text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE email_tokens (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('VERIFY', 'RESET', 'INVITE')),
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE step_up_grants (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  frozen_at timestamptz,
  frozen_by uuid
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER')),
  is_judge boolean NOT NULL DEFAULT false,
  UNIQUE (org_id, user_id)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
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


-- Migration: 002_paypal_agents.sql
CREATE TABLE paypal_connections (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL UNIQUE,
  client_id_enc text,
  client_secret_enc text,
  webhook_id text,
  webhook_token text UNIQUE,
  status text,
  last_tested_at timestamptz,
  last_error_code text
);

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE TABLE agent_api_keys (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX idx_agents_org ON agents (org_id, id);
CREATE INDEX idx_agent_api_keys_org_agent ON agent_api_keys (org_id, agent_id);


-- Migration: 003_mandates.sql
CREATE TABLE mandates (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED')),
  current_version_id uuid
);

CREATE TABLE mandate_versions (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  mandate_id uuid NOT NULL,
  version integer NOT NULL,
  purpose_text text,
  policy jsonb,
  policy_canonical text,
  policy_hash text,
  signature text,
  signing_kid text,
  activated_by uuid,
  activated_at timestamptz,
  valid_from timestamptz,
  valid_to timestamptz,
  prompt_version text,
  UNIQUE (mandate_id, version)
);

CREATE UNIQUE INDEX idx_mandates_active_org_agent ON mandates (org_id, agent_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_mandates_org_agent ON mandates (org_id, agent_id);
CREATE INDEX idx_mandate_versions_org_mandate ON mandate_versions (org_id, mandate_id);

ALTER TABLE mandates
  ADD CONSTRAINT fk_mandates_current_version
  FOREIGN KEY (current_version_id) REFERENCES mandate_versions (id);

CREATE TABLE mandate_budget_periods (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  version_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  limit_minor bigint NOT NULL,
  reserved_minor bigint NOT NULL DEFAULT 0,
  spent_minor bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL,
  CHECK (limit_minor >= 0),
  CHECK (reserved_minor >= 0 AND spent_minor >= 0),
  CHECK (reserved_minor + spent_minor <= limit_minor),
  UNIQUE (version_id, period_start)
);

ALTER TABLE mandate_budget_periods
  ADD CONSTRAINT fk_budget_periods_version
  FOREIGN KEY (version_id) REFERENCES mandate_versions (id);


-- Migration: 004_payees_documents.sql
CREATE TABLE payees (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  display_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('EMAIL', 'PAYPAL_ID', 'PHONE')),
  identifier_enc text,
  identifier_hmac text,
  identifier_masked text,
  trust text NOT NULL DEFAULT 'PENDING_REVIEW' CHECK (trust IN ('PENDING_REVIEW', 'TRUSTED', 'BLOCKED')),
  UNIQUE (org_id, identifier_hmac)
);

CREATE TABLE payee_revisions (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  payee_id uuid NOT NULL,
  field text NOT NULL,
  old_hmac text,
  new_hmac text,
  changed_by uuid
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  uploader_kind text NOT NULL CHECK (uploader_kind IN ('USER', 'AGENT')),
  uploader_id uuid NOT NULL,
  filename text NOT NULL,
  mime text,
  size bigint,
  sha256 text,
  storage_key text,
  status text,
  injection_flags jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE document_extractions (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  document_id uuid NOT NULL,
  payee_name text,
  invoice_number text,
  amount_minor bigint,
  currency char(3),
  due_date date,
  items jsonb,
  notes text,
  confidence numeric,
  prompt_version text
);

CREATE INDEX idx_payees_org ON payees (org_id, id);
CREATE INDEX idx_payee_revisions_org ON payee_revisions (org_id, payee_id);
CREATE INDEX idx_documents_org ON documents (org_id, id);
CREATE INDEX idx_document_extractions_org ON document_extractions (org_id, document_id);


-- Migration: 005_requests_approvals.sql
CREATE TABLE payment_requests (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  mandate_version_id uuid,
  action text NOT NULL CHECK (action IN ('PAYOUT', 'REFUND', 'ACCEPT_DISPUTE')),
  status text NOT NULL CHECK (status IN ('RECEIVED', 'EVALUATING', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'EXPIRED', 'CANCELLED', 'EXECUTING', 'EXECUTED', 'RECONCILED', 'MISMATCH', 'FAILED')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  payee_id uuid,
  target_ref text,
  document_id uuid,
  agent_reason text,
  agent_idempotency_key text,
  request_hash text,
  decision text CHECK (decision IN ('AUTO_APPROVE', 'REQUIRE_APPROVAL', 'REJECT')),
  reason_codes text[],
  risk_score integer,
  explanation text,
  UNIQUE (agent_id, agent_idempotency_key)
);

CREATE TABLE request_evaluations (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  request_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('A', 'B', 'C', 'D')),
  result jsonb,
  ai_model text,
  prompt_version text,
  latency_ms integer
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  request_id uuid NOT NULL,
  status text,
  step_up_required boolean NOT NULL DEFAULT false,
  request_hash text,
  expires_at timestamptz
);

CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  approval_id uuid NOT NULL,
  decided_by uuid,
  decision text,
  comment text,
  step_up_grant_id uuid
);

CREATE INDEX idx_payment_requests_org_agent ON payment_requests (org_id, agent_id);
CREATE INDEX idx_request_evaluations_org_request ON request_evaluations (org_id, request_id);
CREATE INDEX idx_approvals_org_request ON approvals (org_id, request_id);
CREATE INDEX idx_approval_decisions_org_approval ON approval_decisions (org_id, approval_id);


-- Migration: 006_execution_ledger.sql
CREATE TABLE executions (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  request_id uuid NOT NULL,
  idempotency_id text,
  kind text,
  status text CHECK (status IN ('STARTED', 'SENT', 'SUCCEEDED', 'FAILED')),
  paypal_ref text,
  http_status integer,
  response_redacted jsonb,
  attempts integer NOT NULL DEFAULT 0
);

CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  paypal_event_id text UNIQUE,
  event_type text,
  payload jsonb,
  verified boolean,
  status text,
  received_at timestamptz,
  processed_at timestamptz
);

CREATE TABLE ledger_entries (
  org_id uuid NOT NULL,
  seq bigint NOT NULL,
  type text NOT NULL,
  subject_type text,
  subject_id uuid,
  payload jsonb,
  prev_hash text,
  entry_hash text NOT NULL,
  signature text,
  kid text,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (org_id, seq)
);

CREATE TABLE ledger_heads (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL UNIQUE,
  last_seq bigint,
  last_hash text
);

CREATE INDEX idx_executions_org_request ON executions (org_id, request_id);
CREATE INDEX idx_webhook_events_org ON webhook_events (org_id, received_at);
CREATE INDEX idx_ledger_entries_org_seq ON ledger_entries (org_id, seq);


-- Migration: 007_disputes_ops.sql
CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  paypal_dispute_id text,
  status text,
  reason text,
  amount_minor bigint,
  currency char(3),
  respond_by timestamptz,
  raw jsonb
);

CREATE TABLE dispute_cases (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  dispute_id uuid NOT NULL,
  recommendation text,
  rationale text,
  evidence_package jsonb,
  status text
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  kind text,
  payload jsonb,
  sent_at timestamptz,
  status text
);

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  to_email text,
  template text,
  payload jsonb,
  status text,
  sent_at timestamptz
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  actor_id uuid,
  action text,
  details jsonb
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid,
  type text NOT NULL,
  payload jsonb,
  run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  dedupe_key text,
  status text,
  last_error text
);

CREATE TABLE rate_limit_buckets (
  key text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE UNIQUE INDEX idx_jobs_dedupe_key ON jobs (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX idx_jobs_org_runat ON jobs (org_id, run_at);
CREATE INDEX idx_disputes_org ON disputes (org_id, id);
CREATE INDEX idx_dispute_cases_org ON dispute_cases (org_id, dispute_id);
CREATE INDEX idx_notifications_org ON notifications (org_id, created_at);
CREATE INDEX idx_email_outbox_org ON email_outbox (org_id, created_at);
CREATE INDEX idx_audit_events_org ON audit_events (org_id, created_at);


-- Migration: 008_triggers.sql
CREATE OR REPLACE FUNCTION reject_ledger_entry_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE PROCEDURE reject_ledger_entry_mutation();

CREATE OR REPLACE FUNCTION reject_mandate_version_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'mandate_versions is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mandate_versions_immutable
BEFORE UPDATE OR DELETE ON mandate_versions
FOR EACH ROW EXECUTE PROCEDURE reject_mandate_version_mutation();


-- Migration: 009_jobs_queue.sql
UPDATE jobs SET status = 'PENDING' WHERE status IS NULL;

ALTER TABLE jobs
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'DEAD'));

CREATE INDEX idx_jobs_claim ON jobs (run_at, created_at)
  WHERE status IN ('PENDING', 'RUNNING');


-- Migration: 010_s06_agent_keys_payee_changed_at.sql
ALTER TABLE payees
  ADD COLUMN changed_at timestamptz;

CREATE INDEX idx_agent_api_keys_org_prefix
  ON agent_api_keys (org_id, prefix);


-- Migration: 011_s07_ai_usage.sql
CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  task text NOT NULL,
  reserved_input_tokens integer NOT NULL DEFAULT 0,
  reserved_output_tokens integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(20, 12) NOT NULL DEFAULT 0,
  reserved_cost_usd numeric(20, 12) NOT NULL DEFAULT 0
);

CREATE INDEX idx_ai_usage_org_created ON ai_usage (org_id, created_at);

CREATE UNIQUE INDEX idx_document_extractions_org_document_unique
  ON document_extractions (org_id, document_id);

ALTER TABLE document_extractions
  ADD CONSTRAINT document_extractions_confidence_range
  CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));


-- Migration: 012_s08_mandate_indexes.sql
CREATE INDEX IF NOT EXISTS idx_mandate_budget_periods_org_version
  ON mandate_budget_periods (org_id, version_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_mandate_versions_active_expiry
  ON mandate_versions (valid_to)
  WHERE activated_at IS NOT NULL;


-- Migration: 013_s09_request_reservation.sql
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS reserved_period_id uuid,
  ADD COLUMN IF NOT EXISTS reserved_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS reserved_released boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payment_requests_org_status_created
  ON payment_requests (org_id, status, created_at);


-- Migration: 014_s02_ledger_heads_org_primary_key.sql
ALTER TABLE ledger_heads
  DROP CONSTRAINT IF EXISTS ledger_heads_pkey;

ALTER TABLE ledger_heads
  DROP CONSTRAINT IF EXISTS ledger_heads_org_id_key;

ALTER TABLE ledger_heads
  ADD CONSTRAINT ledger_heads_pkey PRIMARY KEY (org_id);


-- Migration: 015_s08_activated_mandate_versions.sql
CREATE OR REPLACE FUNCTION reject_mandate_version_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD.activated_at IS NOT NULL THEN
    RAISE EXCEPTION 'activated mandate versions are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- Migration: 016_s13_execution_constraints.sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_executions_org_request_kind
  ON executions (org_id, request_id, kind);


-- Migration: 017_s16_archived_organizations.sql
ALTER TABLE organizations
  ADD COLUMN archived_at timestamptz;

CREATE INDEX idx_organizations_active_slug
  ON organizations (slug)
  WHERE archived_at IS NULL;


-- Migration: 018_p5_signup_terms_and_tokens.sql
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


