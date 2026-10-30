CREATE TABLE paypal_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL UNIQUE,
  client_id_enc text,
  client_secret_enc text,
  webhook_id text,
  webhook_token text UNIQUE,
  status text,
  last_tested_at timestamptz,
  last_error_code text
);

CREATE TABLE agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE TABLE agent_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  org_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  prefix text NOT NULL,
  key_hash text NOT NULL,
  last_used_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX idx_agents_org ON agents (org_id, id);
CREATE INDEX idx_agent_api_keys_org_agent ON agent_api_keys (org_id, agent_id);
