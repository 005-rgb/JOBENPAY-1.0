-- Migration 022: Payout domain schema support (K-PAYOUT, Tier A)

CREATE INDEX IF NOT EXISTS idx_intents_payout_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'PAYOUT';

CREATE INDEX IF NOT EXISTS idx_intents_payout_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'PAYOUT';

