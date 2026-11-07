-- Migration 034: Recurring transaction performance schema and execution tracking (K-RECURRING, AD-17, T-08)

CREATE TABLE IF NOT EXISTS recurring_execution_history (
  id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  schedule_id UUID NOT NULL REFERENCES recurring_schedules(schedule_id) ON DELETE CASCADE,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE CASCADE,
  cycle_number INT NOT NULL CHECK (cycle_number > 0),
  charged_amount_minor BIGINT NOT NULL CHECK (charged_amount_minor > 0),
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  paypal_capture_id TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_exec_schedule
  ON recurring_execution_history (schedule_id, cycle_number);

CREATE INDEX IF NOT EXISTS idx_recurring_exec_org
  ON recurring_execution_history (org_id, schedule_id);

CREATE INDEX IF NOT EXISTS idx_intents_recurring_org_status
  ON transaction_intents (org_id, status)
  WHERE category = 'RECURRING';

