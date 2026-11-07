-- Migration 026: Partial capture and refund schema & indices (K-PARTIAL)

CREATE INDEX IF NOT EXISTS idx_intents_partial_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'PARTIAL';

CREATE INDEX IF NOT EXISTS idx_intents_partial_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'PARTIAL';

