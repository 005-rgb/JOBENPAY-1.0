-- 052_unified_outcome_contracts.sql
-- PRD 2.0 Unified Architecture §2.5: Unified Outcome Contract
-- Unified outcome-based contract framework covering INVOICE, MILESTONE, and MULTI_CRITERIA.

CREATE TABLE IF NOT EXISTS outcome_contracts (
  contract_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  contract_type TEXT NOT NULL CHECK (contract_type IN ('INVOICE', 'MILESTONE', 'MULTI_CRITERIA')),
  counterparty_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  due_date DATE NOT NULL,
  criteria JSONB,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'ISSUED', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'WRITTEN_OFF'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcome_contracts_org ON outcome_contracts(org_id);
CREATE INDEX IF NOT EXISTS idx_outcome_contracts_type ON outcome_contracts(contract_type);
CREATE INDEX IF NOT EXISTS idx_outcome_contracts_status ON outcome_contracts(status);

-- Data migration from existing invoice_records
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'invoice_records') THEN
    INSERT INTO outcome_contracts (contract_id, org_id, contract_type, counterparty_id, amount_minor, currency, due_date, status, created_at)
    SELECT
      invoice_id,
      org_id,
      'INVOICE',
      counterparty_id,
      amount_minor,
      currency,
      due_date,
      CASE WHEN status = 'CANCELLED' THEN 'WRITTEN_OFF' ELSE status END,
      created_at
    FROM invoice_records
    ON CONFLICT (contract_id) DO NOTHING;
  END IF;
END $$;
