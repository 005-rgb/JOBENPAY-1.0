-- Migration 027: Down payment schema & performance indices (K-DOWN_PAYMENT, AD-04, AD-26, T-09)

CREATE INDEX IF NOT EXISTS idx_intents_down_payment_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'DOWN_PAYMENT';

CREATE INDEX IF NOT EXISTS idx_intents_down_payment_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'DOWN_PAYMENT';

CREATE INDEX IF NOT EXISTS idx_dp_accounts_auth_expires
  ON down_payment_accounts (org_id, authorization_expires_at)
  WHERE status IN ('DP_PAID', 'AWAITING_DELIVERY', 'SETTLEMENT_DUE');

