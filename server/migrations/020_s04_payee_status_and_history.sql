-- Migration 020: Payee status alignment and payee_change_history table (WP F2-3, FR-501..505)

-- 1. Align trust check constraint on payees table to support 'NEW', 'PENDING_REVIEW', 'TRUSTED', 'BLOCKED'
ALTER TABLE payees DROP CONSTRAINT IF EXISTS payees_trust_check;
ALTER TABLE payees ADD CONSTRAINT payees_trust_check CHECK (trust IN ('NEW', 'PENDING_REVIEW', 'TRUSTED', 'BLOCKED'));

-- 2. Audit table for payee changes (email, account, trust status)
CREATE TABLE IF NOT EXISTS payee_change_history (
  id uuid PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  payee_id uuid NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  old_hmac text,
  new_hmac text,
  changed_by uuid
);

CREATE INDEX IF NOT EXISTS idx_payee_change_history_org ON payee_change_history (org_id, payee_id, created_at);

