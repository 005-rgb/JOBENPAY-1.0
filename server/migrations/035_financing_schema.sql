-- ============================================================================
-- 035_financing_schema.sql
-- Tier C: FINANCING Domain Schema & Repayments Audit Table (AD-17, PRD 1.3 §3)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_financing_records_org_status ON financing_records(org_id, status);
CREATE INDEX IF NOT EXISTS idx_financing_records_counterparty ON financing_records(org_id, counterparty_id);

CREATE TABLE IF NOT EXISTS financing_repayments (
  repayment_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  financing_id UUID NOT NULL REFERENCES financing_records(financing_id) ON DELETE RESTRICT,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  cycle_number INT NOT NULL CHECK (cycle_number > 0),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  principal_portion_minor BIGINT NOT NULL DEFAULT 0 CHECK (principal_portion_minor >= 0),
  interest_portion_minor BIGINT NOT NULL DEFAULT 0 CHECK (interest_portion_minor >= 0),
  fee_portion_minor BIGINT NOT NULL DEFAULT 0 CHECK (fee_portion_minor >= 0),
  currency CHAR(3) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (principal_portion_minor + interest_portion_minor + fee_portion_minor = amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_financing_repayments_financing ON financing_repayments(org_id, financing_id);
CREATE INDEX IF NOT EXISTS idx_financing_repayments_org ON financing_repayments(org_id, paid_at DESC);

