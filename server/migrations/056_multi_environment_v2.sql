-- 056_multi_environment_v2.sql
-- PRD 3.0 (REVISI 2.0) — JOBENPAY Multi-Environment Architecture
-- Perfect Isolation: Global Entities vs. Environment-Specific Entities

BEGIN;

-- 1.0 Ensure environment_type enum includes LIVE
DO $$ BEGIN
  ALTER TYPE environment_type ADD VALUE IF NOT EXISTS 'LIVE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2.1 Bersihkan Skema Lama: Drop kolom environment dari tabel Global
ALTER TABLE organizations DROP COLUMN IF EXISTS environment;
ALTER TABLE users DROP COLUMN IF EXISTS default_environment;
ALTER TABLE memberships DROP COLUMN IF EXISTS environment;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_subscriptions') THEN
    ALTER TABLE billing_subscriptions DROP COLUMN IF EXISTS environment;
  END IF;
END $$;

-- 2.2 Pastikan Tabel Operasional Memiliki Kolom environment
ALTER TABLE agents ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE mandates ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE payees ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE transaction_intents ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE transaction_legs ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE ledger_heads ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';

-- Pastikan alias agent_id pada agents terisi
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_id UUID;
UPDATE agents SET agent_id = id WHERE agent_id IS NULL;

-- 2.3 RLS (Row Level Security) untuk Tabel Operasional
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payees ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agents_env_isolation ON agents;
CREATE POLICY agents_env_isolation ON agents FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS mandates_env_isolation ON mandates;
CREATE POLICY mandates_env_isolation ON mandates FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS payees_env_isolation ON payees;
CREATE POLICY payees_env_isolation ON payees FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS transaction_intents_env_isolation ON transaction_intents;
CREATE POLICY transaction_intents_env_isolation ON transaction_intents FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS ledger_entries_env_isolation ON ledger_entries;
CREATE POLICY ledger_entries_env_isolation ON ledger_entries FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

-- 2.4 Trigger: Mencegah Agent Sandbox dipakai di Live
CREATE OR REPLACE FUNCTION check_agent_environment() RETURNS TRIGGER AS $$
DECLARE agent_env environment_type;
BEGIN
  IF NEW.agent_id IS NOT NULL THEN
    SELECT environment INTO agent_env FROM agents WHERE id = NEW.agent_id OR agent_id = NEW.agent_id LIMIT 1;
    IF agent_env IS NOT NULL AND agent_env <> NEW.environment THEN
      RAISE EXCEPTION 'Environment mismatch: agent=% transaction=%', agent_env, NEW.environment;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_agent_environment ON transaction_intents;
CREATE TRIGGER trg_check_agent_environment BEFORE INSERT OR UPDATE ON transaction_intents
FOR EACH ROW EXECUTE PROCEDURE check_agent_environment();

COMMIT;
