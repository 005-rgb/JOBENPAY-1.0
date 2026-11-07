BEGIN;

-- 1.1 Extend Organizations Table
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS support_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_email TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tax_id_enc TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address JSONB DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS org_id UUID;
UPDATE organizations SET org_id = id WHERE org_id IS NULL;

-- 1.2 Extend Memberships Table
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_memberships_status'
  ) THEN
    ALTER TABLE memberships ADD CONSTRAINT chk_memberships_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'INVITED'));
  END IF;
END $$;

-- 1.3 Invitations Table
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS invitation_id UUID;
UPDATE invitations SET invitation_id = id WHERE invitation_id IS NULL;
ALTER TABLE invitations ALTER COLUMN invitation_id SET DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PENDING';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invitations_status'
  ) THEN
    ALTER TABLE invitations ADD CONSTRAINT chk_invitations_status CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_invitations_role'
  ) THEN
    ALTER TABLE invitations ADD CONSTRAINT chk_invitations_role CHECK (role IN ('ADMIN', 'APPROVER', 'OPERATOR', 'VIEWER'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_invitations_org_email'
  ) THEN
    ALTER TABLE invitations ADD CONSTRAINT uq_invitations_org_email UNIQUE(org_id, email);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token_hash);

COMMIT;
