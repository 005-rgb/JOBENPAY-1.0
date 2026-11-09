-- 057_paypal_connections_environment.sql
-- PRD 3.0 Patch: Isolate PayPal credentials and connections per environment (SANDBOX vs LIVE)

-- 1. Add environment column to paypal_connections
ALTER TABLE paypal_connections ADD COLUMN IF NOT EXISTS environment environment_type NOT NULL DEFAULT 'SANDBOX';

-- 2. Update unique constraint so that one org can have one SANDBOX connection and one LIVE connection
ALTER TABLE paypal_connections DROP CONSTRAINT IF EXISTS paypal_connections_org_id_key;
ALTER TABLE paypal_connections DROP CONSTRAINT IF EXISTS paypal_connections_org_id_environment_key;
ALTER TABLE paypal_connections ADD CONSTRAINT paypal_connections_org_id_environment_key UNIQUE (org_id, environment);

-- 3. Create index for fast lookups by org and environment
CREATE INDEX IF NOT EXISTS idx_paypal_connections_org_env ON paypal_connections(org_id, environment);

-- 4. Enable RLS for environment isolation
ALTER TABLE paypal_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paypal_connections_env_isolation ON paypal_connections;
CREATE POLICY paypal_connections_env_isolation ON paypal_connections FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);
