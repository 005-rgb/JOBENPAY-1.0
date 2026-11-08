-- 050_unified_entities.sql
-- PRD 2.0 Unified Architecture §2.3: Unified Entity Registry
-- Single unified registry table for issuers, verifiers, and dual-role entities.

CREATE TABLE IF NOT EXISTS entities (
  entity_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ISSUER', 'VERIFIER', 'BOTH')),
  org_id UUID NOT NULL REFERENCES organizations(id),
  display_name TEXT NOT NULL,
  legal_entity_lei CHAR(20),
  public_key_jwk JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_tier TEXT,
  attestation_jwks_uri TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  reputation_score INT DEFAULT 50 CHECK (reputation_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entities_org ON entities(org_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_lei ON entities(legal_entity_lei);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);

-- Data migration from existing tables if present
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'org_legal_identity') THEN
    INSERT INTO entities (entity_id, entity_type, org_id, display_name, legal_entity_lei, public_key_jwk, status)
    SELECT identity_id, 'ISSUER', org_id, legal_name, lei, vlei_credential, status
    FROM org_legal_identity
    ON CONFLICT (entity_id) DO NOTHING;
  END IF;

  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'verifier_registry') THEN
    INSERT INTO entities (entity_id, entity_type, org_id, display_name, verification_tier, attestation_jwks_uri, status, public_key_jwk)
    SELECT verifier_id, 'VERIFIER', org_id, org_id::text, verification_tier, attestation_jwks_uri, status, '{}'::jsonb
    FROM verifier_registry
    ON CONFLICT (entity_id) DO NOTHING;
  END IF;
END $$;
