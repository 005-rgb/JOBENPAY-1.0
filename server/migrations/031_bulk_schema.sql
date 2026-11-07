-- Migration 031: Bulk batches schema and performance indices (K-BULK, AD-17, T-19)

CREATE TABLE IF NOT EXISTS bulk_batches (
  batch_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  parent_intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE CASCADE,
  item_count INT NOT NULL CHECK (item_count > 0 AND item_count <= 15000),
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED')),
  paypal_batch_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_batches_org
  ON bulk_batches (org_id, status);

CREATE INDEX IF NOT EXISTS idx_bulk_batches_parent
  ON bulk_batches (parent_intent_id);

CREATE INDEX IF NOT EXISTS idx_intents_bulk_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'BULK';

