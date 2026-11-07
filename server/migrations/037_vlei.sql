-- 037_vlei.sql
-- PRD 1.4 Trust Infrastructure (Fase A: vLEI Integration, WP1)
-- Idempotent schema migration for organizational legal identity and SAR extension

CREATE TABLE IF NOT EXISTS org_legal_identity (
  identity_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  lei CHAR(20) NOT NULL,
  legal_name TEXT NOT NULL,
  jurisdiction CHAR(2) NOT NULL,
  vlei_credential JSONB NOT NULL,
  vlei_issuer TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id),
  CHECK (expires_at > verified_at)
);

CREATE INDEX IF NOT EXISTS idx_org_legal_identity_lei ON org_legal_identity(lei);
CREATE INDEX IF NOT EXISTS idx_org_legal_identity_status ON org_legal_identity(status);
CREATE INDEX IF NOT EXISTS idx_org_legal_identity_org ON org_legal_identity(org_id);

CREATE TABLE IF NOT EXISTS signed_receipts (
  receipt_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  intent_id UUID REFERENCES transaction_intents(intent_id),
  sar_payload JSONB NOT NULL,
  sar_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE signed_receipts ADD COLUMN IF NOT EXISTS legal_entity_lei CHAR(20);
ALTER TABLE signed_receipts ADD COLUMN IF NOT EXISTS vlei_verified BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_signed_receipts_org ON signed_receipts(org_id);
CREATE INDEX IF NOT EXISTS idx_signed_receipts_intent ON signed_receipts(intent_id);
