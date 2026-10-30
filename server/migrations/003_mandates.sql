CREATE TABLE mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED')),
  current_version_id uuid
);

CREATE TABLE mandate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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
