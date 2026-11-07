-- Migration 024: Refund domain schema & cumulative tracker (K-REFUND, WP R-0, T-10)

CREATE TABLE IF NOT EXISTS capture_refund_trackers (
  capture_id VARCHAR(100) NOT NULL,
  org_id UUID NOT NULL,
  capture_amount_minor NUMERIC(20, 0) NOT NULL,
  refunded_amount_minor NUMERIC(20, 0) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, capture_id),
  CONSTRAINT chk_refund_not_exceed_capture CHECK (refunded_amount_minor <= capture_amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_refund_trackers_org_cap
  ON capture_refund_trackers (org_id, capture_id);

CREATE INDEX IF NOT EXISTS idx_intents_refund_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'REFUND';

CREATE INDEX IF NOT EXISTS idx_intents_refund_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'REFUND';

