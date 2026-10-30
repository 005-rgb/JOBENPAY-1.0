CREATE TABLE executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL UNIQUE,
  last_seq bigint,
  last_hash text
);

CREATE INDEX idx_executions_org_request ON executions (org_id, request_id);
CREATE INDEX idx_webhook_events_org ON webhook_events (org_id, received_at);
CREATE INDEX idx_ledger_entries_org_seq ON ledger_entries (org_id, seq);
