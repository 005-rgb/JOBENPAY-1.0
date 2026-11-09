-- 058_multi_environment_resilience.sql
-- PRD 3.0 Resilience Patch: Disable PostgreSQL Row-Level Security on operational tables.
-- Strict tenant (org_id) and environment isolation is enforced in all application queries and repositories.
-- Disabling RLS prevents non-superuser connections (e.g. cPanel / Passenger database users)
-- from being blocked by missing session-level app.current_environment settings when executing in LIVE mode.

-- 1. Operational tables
ALTER TABLE IF EXISTS paypal_connections DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paypal_connections_env_isolation ON paypal_connections;

ALTER TABLE IF EXISTS agents DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agents_env_isolation ON agents;

ALTER TABLE IF EXISTS mandates DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mandates_env_isolation ON mandates;

ALTER TABLE IF EXISTS payees DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payees_env_isolation ON payees;

ALTER TABLE IF EXISTS transaction_intents DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS transaction_intents_env_isolation ON transaction_intents;

ALTER TABLE IF EXISTS ledger_entries DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ledger_entries_env_isolation ON ledger_entries;

ALTER TABLE IF EXISTS entities DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entities_env_isolation ON entities;

ALTER TABLE IF EXISTS escrow_accounts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS escrow_env_isolation ON escrow_accounts;

ALTER TABLE IF EXISTS outcome_contracts DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contracts_env_isolation ON outcome_contracts;

ALTER TABLE IF EXISTS payment_methods DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_methods_env_isolation ON payment_methods;

ALTER TABLE IF EXISTS payment_transactions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_transactions_env_isolation ON payment_transactions;

-- 2. Ensure paypal_connections schema is consistent across all environments
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'paypal_connections' AND column_name = 'environment'
  ) THEN
    ALTER TABLE paypal_connections ADD COLUMN environment environment_type NOT NULL DEFAULT 'SANDBOX';
  END IF;
END $$;

ALTER TABLE paypal_connections DROP CONSTRAINT IF EXISTS paypal_connections_org_id_key;
ALTER TABLE paypal_connections DROP CONSTRAINT IF EXISTS paypal_connections_org_id_environment_key;
ALTER TABLE paypal_connections ADD CONSTRAINT paypal_connections_org_id_environment_key UNIQUE (org_id, environment);

CREATE INDEX IF NOT EXISTS idx_paypal_connections_org_env ON paypal_connections(org_id, environment);
