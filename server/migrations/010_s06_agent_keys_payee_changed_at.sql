ALTER TABLE payees
  ADD COLUMN changed_at timestamptz;

CREATE INDEX idx_agent_api_keys_org_prefix
  ON agent_api_keys (org_id, prefix);
