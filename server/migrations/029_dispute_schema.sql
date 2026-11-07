-- Migration 029: Dispute category schema indices (K-DISPUTE, AD-12, AD-23, T-06)

CREATE INDEX IF NOT EXISTS idx_intents_dispute_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'DISPUTE';

CREATE INDEX IF NOT EXISTS idx_intents_dispute_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'DISPUTE';

CREATE INDEX IF NOT EXISTS idx_disputes_org_paypal_id
  ON disputes (org_id, paypal_dispute_id);

