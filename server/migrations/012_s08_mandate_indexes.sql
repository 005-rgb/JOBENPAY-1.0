CREATE INDEX IF NOT EXISTS idx_mandate_budget_periods_org_version
  ON mandate_budget_periods (org_id, version_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_mandate_versions_active_expiry
  ON mandate_versions (valid_to)
  WHERE activated_at IS NOT NULL;
