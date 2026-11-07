-- Migration 032: Transfer records schema and performance indices (K-TRANSFER, AD-17, T-18)

CREATE TABLE IF NOT EXISTS transfer_records (
  id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL UNIQUE REFERENCES transaction_intents(intent_id) ON DELETE CASCADE,
  sender_counterparty_id UUID NOT NULL,
  receiver_counterparty_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  paypal_payout_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_counterparty_id != receiver_counterparty_id)
);

CREATE INDEX IF NOT EXISTS idx_transfer_records_org
  ON transfer_records (org_id, status);

CREATE INDEX IF NOT EXISTS idx_transfer_records_parties
  ON transfer_records (sender_counterparty_id, receiver_counterparty_id);

CREATE INDEX IF NOT EXISTS idx_intents_transfer_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'TRANSFER';

