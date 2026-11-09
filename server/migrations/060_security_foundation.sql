-- 060_security_foundation.sql
-- PRD 5.0: Quantum-Safe, Agentic-Aware, Zero-Trust Production Security Specification

BEGIN;

-- 3.1 Cryptographic Key Registry (crypto agility)
CREATE TABLE IF NOT EXISTS crypto_keys (
  key_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('SIGNING', 'ENCRYPTION', 'TLS', 'KEM', 'JWT')),
  algorithm TEXT NOT NULL CHECK (algorithm IN (
    'ED25519', 'ML-DSA-65', 'SLH-DSA-SHA2-128S',
    'X25519', 'ML-KEM-768', 'X25519MLKEM768',
    'AES-256-GCM', 'HMAC-SHA256'
  )),
  key_material_ref TEXT NOT NULL,  -- KMS/HSM reference or encrypted key container
  public_key_jwk JSONB,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ROTATED', 'REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crypto_keys_active ON crypto_keys (org_id, purpose, algorithm) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_crypto_keys_org_purpose ON crypto_keys (org_id, purpose);

-- 3.2 PQC Migration Status
CREATE TABLE IF NOT EXISTS pqc_migration_status (
  status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component TEXT NOT NULL UNIQUE,  -- 'TLS', 'JWT', 'LEDGER_SIGNING', 'SAR_SIGNING', 'API_KEY'
  current_algorithm TEXT NOT NULL,
  target_algorithm TEXT NOT NULL,
  hybrid_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  migration_started_at TIMESTAMPTZ,
  migration_completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'HYBRID', 'COMPLETED')),
  notes TEXT
);

INSERT INTO pqc_migration_status (component, current_algorithm, target_algorithm, hybrid_enabled, migration_started_at, status, notes)
VALUES
  ('TLS', 'X25519', 'X25519MLKEM768', TRUE, now(), 'HYBRID', 'Hybrid TLS 1.3 with X25519MLKEM768 draft specification'),
  ('JWT', 'ED25519', 'ML-DSA-65', TRUE, now(), 'IN_PROGRESS', 'Hybrid dual-signature transition path'),
  ('LEDGER_SIGNING', 'ED25519', 'ML-DSA-65', TRUE, now(), 'IN_PROGRESS', 'Cryptographically agile ledger hashing & signing'),
  ('SAR_SIGNING', 'ED25519', 'SLH-DSA-SHA2-128S', FALSE, NULL, 'NOT_STARTED', 'Scheduled for Q4 2027 stateless hash-based migration'),
  ('API_KEY', 'HMAC-SHA256', 'HMAC-SHA256', FALSE, now(), 'COMPLETED', 'Quantum-resistant symmetric hash MAC protected against Grover')
ON CONFLICT (component) DO NOTHING;

-- 3.3 Agent Behavior Baseline (untuk deteksi rogue agent)
CREATE TABLE IF NOT EXISTS agent_behavior_baselines (
  baseline_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id),
  org_id UUID NOT NULL REFERENCES organizations(id),
  environment environment_type NOT NULL,
  avg_requests_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  avg_amount_per_tx_minor BIGINT NOT NULL DEFAULT 0,
  stddev_amount_minor BIGINT NOT NULL DEFAULT 1,
  typical_hours INT[] DEFAULT '{}',  -- jam 0-23
  typical_payees UUID[] DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_agent_baselines_agent_env ON agent_behavior_baselines (agent_id, environment);
CREATE INDEX IF NOT EXISTS idx_agent_baselines_org_agent ON agent_behavior_baselines (org_id, agent_id);

-- 3.4 Security Events (threat detection)
CREATE TABLE IF NOT EXISTS security_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  environment environment_type,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('USER', 'AGENT', 'SYSTEM', 'EXTERNAL')),
  actor_id UUID,
  source_ip INET,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_org ON security_events (org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events (severity) WHERE severity IN ('HIGH', 'CRITICAL');
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events (event_type);

-- 3.5 Supply Chain Attestations
CREATE TABLE IF NOT EXISTS supply_chain_attestations (
  attestation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_name TEXT NOT NULL,
  artifact_version TEXT NOT NULL,
  artifact_hash TEXT NOT NULL,
  sbom_format TEXT NOT NULL CHECK (sbom_format IN ('CYCLONEDX', 'SPDX')),
  sbom_hash TEXT NOT NULL,
  provenance_hash TEXT NOT NULL,
  slsa_level INT NOT NULL CHECK (slsa_level IN (1, 2, 3, 4)),
  cosign_signature TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'FAILED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(artifact_name, artifact_version)
);

CREATE INDEX IF NOT EXISTS idx_supply_chain_artifact ON supply_chain_attestations (artifact_name, artifact_version);

COMMIT;
