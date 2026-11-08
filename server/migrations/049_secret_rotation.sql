-- 049_secret_rotation.sql
-- Secret Rotation schema per PRD 1.9 §9.2

-- 1. Tambah kolom grace_until di agent_api_keys untuk zero-downtime rotation
ALTER TABLE agent_api_keys ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_grace ON agent_api_keys(grace_until) WHERE grace_until IS NOT NULL;

-- 2. Tabel untuk ledger signing keys
CREATE TABLE IF NOT EXISTS ledger_signing_keys (
  kid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  private_key_enc TEXT NOT NULL,
  public_key_jwk JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ROTATED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ledger_signing_keys_org ON ledger_signing_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_ledger_signing_keys_status ON ledger_signing_keys(status);
