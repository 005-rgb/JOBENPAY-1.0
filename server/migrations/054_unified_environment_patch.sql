-- 054_unified_environment_patch.sql
-- PRD 2.1: Unified Architecture Environment Isolation Patch
-- Fixes environment isolation for entities, escrow_accounts, outcome_contracts, and cognitive_snapshots

BEGIN;

-- 1.0 Create environment_type enum if not exists
DO $$ BEGIN
  CREATE TYPE environment_type AS ENUM ('SANDBOX', 'PRODUCTION', 'SIMULATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 1.1 Patch Tabel Entities
ALTER TABLE entities ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_org_id_entity_type_key;
ALTER TABLE entities DROP CONSTRAINT IF EXISTS entities_org_id_env_type_key;

-- Deduplicate any pre-existing test duplicates before applying unique constraint
DELETE FROM entities
WHERE entity_id NOT IN (
  SELECT DISTINCT ON (org_id, environment, entity_type) entity_id
  FROM entities
  ORDER BY org_id, environment, entity_type, created_at DESC
);

ALTER TABLE entities ADD CONSTRAINT entities_org_id_env_type_key UNIQUE(org_id, environment, entity_type);

-- 1.2 Patch Tabel Escrow Accounts
ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';

-- 1.3 Patch Tabel Outcome Contracts
ALTER TABLE outcome_contracts ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';

-- 1.4 Patch Tabel Cognitive Snapshots (Dari PRD 1.7)
DO $$ BEGIN
  ALTER TABLE cognitive_snapshots ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 1.5 Aktifkan RLS (Row Level Security) pada tabel yang baru di-patch
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcome_contracts ENABLE ROW LEVEL SECURITY;

-- 1.6 Buat Policy RLS
DROP POLICY IF EXISTS entities_env_isolation ON entities;
CREATE POLICY entities_env_isolation ON entities FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS escrow_env_isolation ON escrow_accounts;
CREATE POLICY escrow_env_isolation ON escrow_accounts FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS contracts_env_isolation ON outcome_contracts;
CREATE POLICY contracts_env_isolation ON outcome_contracts FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

COMMIT;
