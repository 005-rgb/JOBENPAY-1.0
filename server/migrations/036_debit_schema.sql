-- ============================================================================
-- 036_debit_schema.sql
-- Tier C: DEBIT Domain Schema & Execution Tracking Table (AD-17, PRD 1.3 §3)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_debit_authorizations_mandate ON debit_authorizations(org_id, mandate_ref);

CREATE TABLE IF NOT EXISTS debit_execution_records (
  execution_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  auth_id UUID NOT NULL REFERENCES debit_authorizations(auth_id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('EXECUTING','COMPLETED','FAILED','REJECTED')),
  failure_code TEXT,
  provider TEXT NOT NULL DEFAULT 'simulated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debit_execution_intent ON debit_execution_records(org_id, intent_id);
CREATE INDEX IF NOT EXISTS idx_debit_execution_auth ON debit_execution_records(org_id, auth_id);

