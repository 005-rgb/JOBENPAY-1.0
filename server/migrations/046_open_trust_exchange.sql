BEGIN;

-- 4.1.1 Protocol Versions
CREATE TABLE IF NOT EXISTS protocol_versions (
  version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_version TEXT NOT NULL UNIQUE,
  schema_json JSONB NOT NULL,
  released_at TIMESTAMPTZ NOT NULL,
  deprecated_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DEPRECATED','RETIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_protocol_versions_status ON protocol_versions(status);

-- 4.1.2 Public Proofs
CREATE TABLE IF NOT EXISTS public_proofs (
  proof_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sar_id TEXT NOT NULL,
  org_id UUID NOT NULL REFERENCES organizations(id),
  sar_json JSONB NOT NULL,
  proof_url TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_public_proofs_sar ON public_proofs(sar_id);
CREATE INDEX IF NOT EXISTS idx_public_proofs_org ON public_proofs(org_id);
CREATE INDEX IF NOT EXISTS idx_public_proofs_url ON public_proofs(proof_url);
CREATE INDEX IF NOT EXISTS idx_public_proofs_expires ON public_proofs(expires_at) WHERE revoked_at IS NULL;

-- 4.1.3 Trust Handshakes
CREATE TABLE IF NOT EXISTS trust_handshakes (
  handshake_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_org_id UUID NOT NULL REFERENCES organizations(id),
  target_org_id UUID NOT NULL REFERENCES organizations(id),
  agent_id UUID NOT NULL,
  request_intent JSONB NOT NULL,
  handshake_nonce TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','VERIFIED','DENIED','EXPIRED','INDETERMINATE'
  )),
  response_json JSONB,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ,
  CHECK (expires_at > issued_at)
);

CREATE INDEX IF NOT EXISTS idx_trust_handshakes_requester ON trust_handshakes(requester_org_id);
CREATE INDEX IF NOT EXISTS idx_trust_handshakes_target ON trust_handshakes(target_org_id);
CREATE INDEX IF NOT EXISTS idx_trust_handshakes_nonce ON trust_handshakes(handshake_nonce);
CREATE INDEX IF NOT EXISTS idx_trust_handshakes_status ON trust_handshakes(status);

-- 4.1.4 Conformance Vectors
CREATE TABLE IF NOT EXISTS conformance_vectors (
  vector_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vector_name TEXT NOT NULL UNIQUE,
  sar_json JSONB NOT NULL,
  expected_result TEXT NOT NULL CHECK (expected_result IN ('VALID','INVALID','INDETERMINATE')),
  expected_reason TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'SCHEMA','SIGNATURE','REVOCATION','HASH','EXPIRY','COMPOSITION'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conformance_vectors_category ON conformance_vectors(category);

-- 4.1.5 Partner Systems
CREATE TABLE IF NOT EXISTS partner_systems (
  partner_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name TEXT NOT NULL,
  partner_type TEXT NOT NULL CHECK (partner_type IN ('SIMULATED','REAL')),
  base_url TEXT NOT NULL,
  public_key_jwk JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4.1.6 Revocation Subscriptions
CREATE TABLE IF NOT EXISTS revocation_subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISABLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revocation_subscriptions_org ON revocation_subscriptions(org_id);

-- 4.1.7 Extend signed_receipts
ALTER TABLE signed_receipts ADD COLUMN IF NOT EXISTS protocol_version TEXT DEFAULT '1.0';

COMMIT;
