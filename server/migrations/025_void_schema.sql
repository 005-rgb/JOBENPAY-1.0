-- Migration 025: Void domain schema & authorization primitive (K-VOID, WP V-0, AD-10, AD-11)

CREATE TABLE IF NOT EXISTS payment_authorizations (
  authorization_id VARCHAR(100) NOT NULL PRIMARY KEY,
  org_id UUID NOT NULL,
  intent_id UUID REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  authorized_amount_minor NUMERIC(20, 0) NOT NULL,
  captured_amount_minor NUMERIC(20, 0) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_auth_captured_limit CHECK (captured_amount_minor <= authorized_amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_payment_auth_org_status
  ON payment_authorizations (org_id, status);

CREATE INDEX IF NOT EXISTS idx_intents_void_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'VOID';

CREATE INDEX IF NOT EXISTS idx_intents_void_counterparty
  ON transaction_intents (org_id, counterparty_id)
  WHERE category = 'VOID';

