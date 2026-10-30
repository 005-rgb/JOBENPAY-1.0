CREATE TABLE payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  request_id uuid NOT NULL,
  status text,
  step_up_required boolean NOT NULL DEFAULT false,
  request_hash text,
  expires_at timestamptz
);

CREATE TABLE approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
