-- Migration 023: Sale domain schema support (K-SALE, Tier A)

CREATE INDEX IF NOT EXISTS idx_intents_sale_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'SALE';

CREATE INDEX IF NOT EXISTS idx_intents_sale_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'SALE';

