-- Migration 030: Scheduled runs schema and performance indices (K-SCHEDULED, AD-14, T-01)

CREATE TABLE IF NOT EXISTS scheduled_runs (
  id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL UNIQUE REFERENCES transaction_intents(intent_id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'FIRED', 'CANCELLED', 'FAILED')),
  fired_at TIMESTAMPTZ,
  re_eval_outcome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_runs_pending
  ON scheduled_runs (status, scheduled_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_scheduled_runs_org
  ON scheduled_runs (org_id, status);

CREATE INDEX IF NOT EXISTS idx_intents_scheduled_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'SCHEDULED';

