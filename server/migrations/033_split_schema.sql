-- Migration 033: Split records schema and performance indices (K-SPLIT, AD-13, AD-17, T-13, T-14)

CREATE TABLE IF NOT EXISTS split_records (
  id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL UNIQUE REFERENCES transaction_intents(intent_id) ON DELETE CASCADE,
  sub_type TEXT NOT NULL CHECK (sub_type IN ('collect', 'split', 'hold', 'payout')),
  parent_intent_id UUID REFERENCES transaction_intents(intent_id) ON DELETE SET NULL,
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
  currency CHAR(3) NOT NULL,
  platform_fee_bps INT NOT NULL DEFAULT 0 CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  platform_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (platform_fee_minor >= 0),
  recipient_counterparty_id UUID,
  recipient_share_minor BIGINT CHECK (recipient_share_minor IS NULL OR recipient_share_minor >= 0),
  hold_until TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COLLECTED', 'SPLIT', 'HELD', 'SETTLED', 'FAILED')),
  paypal_reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_split_records_org_status
  ON split_records (org_id, status);

CREATE INDEX IF NOT EXISTS idx_split_records_parent
  ON split_records (parent_intent_id);

CREATE INDEX IF NOT EXISTS idx_intents_split_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'SPLIT';

