-- Migration 019: Ledger entries columns and anti-tamper reinforcement (WP F2-1, AD-02, Blueprint M3)

-- 1. Add entry_id (UUID) and signing_key_id (TEXT) columns to ledger_entries
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS entry_id uuid DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid);
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS signing_key_id text;

-- 2. Backfill entry_id and signing_key_id for existing rows
ALTER TABLE ledger_entries DISABLE TRIGGER ledger_entries_immutable;

UPDATE ledger_entries
SET signing_key_id = kid
WHERE signing_key_id IS NULL AND kid IS NOT NULL;

UPDATE ledger_entries
SET entry_id = (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid)
WHERE entry_id IS NULL;

ALTER TABLE ledger_entries ENABLE TRIGGER ledger_entries_immutable;

-- 3. Create index on entry_id
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entry_id ON ledger_entries (entry_id);

