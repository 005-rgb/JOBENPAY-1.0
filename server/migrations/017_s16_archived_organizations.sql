ALTER TABLE organizations
  ADD COLUMN archived_at timestamptz;

CREATE INDEX idx_organizations_active_slug
  ON organizations (slug)
  WHERE archived_at IS NULL;
