CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  dispute_id uuid NOT NULL,
  recommendation text,
  rationale text,
  evidence_package jsonb,
  status text
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  kind text,
  payload jsonb,
  sent_at timestamptz,
  status text
);

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  to_email text,
  template text,
  payload jsonb,
  status text,
  sent_at timestamptz
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  actor_id uuid,
  action text,
  details jsonb
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
