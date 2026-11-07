-- 038_intent_mandates.sql
-- PRD 1.4 Trust Infrastructure (Fase B: Intent Layer, WP1)
-- Idempotent schema migration for human intent mandates and linkage to transaction intents

CREATE TABLE IF NOT EXISTS intent_mandates (
  intent_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  principal_user_id UUID NOT NULL REFERENCES users(id),
  natural_language_input TEXT NOT NULL,
  structured_intent JSONB NOT NULL,
  intent_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  signing_key_id TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','REVOKED','CONSUMED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to > valid_from)
);

CREATE INDEX IF NOT EXISTS idx_intent_mandates_org_status ON intent_mandates(org_id, status);
CREATE INDEX IF NOT EXISTS idx_intent_mandates_hash ON intent_mandates(intent_hash);
CREATE INDEX IF NOT EXISTS idx_intent_mandates_org_valid ON intent_mandates(org_id, valid_to);
CREATE INDEX IF NOT EXISTS idx_intent_mandates_principal ON intent_mandates(principal_user_id);

ALTER TABLE transaction_intents ADD COLUMN IF NOT EXISTS intent_mandate_id UUID REFERENCES intent_mandates(intent_id);
CREATE INDEX IF NOT EXISTS idx_transaction_intents_mandate ON transaction_intents(intent_mandate_id);
