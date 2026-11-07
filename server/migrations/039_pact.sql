-- 039_pact.sql
-- PRD 1.4 Trust Infrastructure (Fase C: PACT Arbitration & Bonding, WP1)
-- Idempotent schema migration for Polymorphic Agent Contract Tokens, escrows, and verifiers

CREATE TABLE IF NOT EXISTS pact_contracts (
  contract_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  buyer_intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  seller_org_id UUID NOT NULL REFERENCES organizations(id),
  task_spec_hash TEXT NOT NULL,
  price_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  verification_tier TEXT NOT NULL CHECK (verification_tier IN ('T0-reexec','T1-tee','T2-zkml','T3-jury')),
  seller_bond_minor BIGINT NOT NULL,
  challenge_window_seconds INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN (
    'PROPOSED','AGREED','IN_PROGRESS','DELIVERED','VERIFIED','DISPUTED','SETTLED','SLASHED'
  )),
  work_attestation JSONB,
  dispute_proof JSONB,
  dispute_verdict TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (seller_bond_minor > 0),
  CHECK (price_minor > 0)
);

CREATE INDEX IF NOT EXISTS idx_pact_contracts_org ON pact_contracts(org_id);
CREATE INDEX IF NOT EXISTS idx_pact_contracts_status ON pact_contracts(status);
CREATE INDEX IF NOT EXISTS idx_pact_contracts_seller ON pact_contracts(seller_org_id);
CREATE INDEX IF NOT EXISTS idx_pact_contracts_status_window ON pact_contracts(status, created_at) WHERE status IN ('DELIVERED','DISPUTED');

CREATE TABLE IF NOT EXISTS escrow_accounts (
  escrow_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  contract_id UUID NOT NULL REFERENCES pact_contracts(contract_id),
  held_minor BIGINT NOT NULL DEFAULT 0,
  released_minor BIGINT NOT NULL DEFAULT 0,
  slashed_minor BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'FUNDED' CHECK (status IN ('FUNDED','RELEASED','SLASHED','CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (held_minor >= 0 AND released_minor >= 0 AND slashed_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_escrow_accounts_contract ON escrow_accounts(contract_id);

CREATE TABLE IF NOT EXISTS verifier_registry (
  verifier_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  verification_tier TEXT NOT NULL,
  attestation_jwks_uri TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verifier_registry_org ON verifier_registry(org_id);
CREATE INDEX IF NOT EXISTS idx_verifier_registry_tier ON verifier_registry(verification_tier);

CREATE OR REPLACE FUNCTION check_escrow_balanced()
RETURNS trigger AS $$
BEGIN
  IF NEW.held_minor <> (NEW.released_minor + NEW.slashed_minor) THEN
    RAISE EXCEPTION 'ESCROW_UNBALANCED: held_minor (%) must equal released_minor (%) + slashed_minor (%)',
      NEW.held_minor, NEW.released_minor, NEW.slashed_minor;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pact_settlement_balanced ON escrow_accounts;
CREATE CONSTRAINT TRIGGER trg_pact_settlement_balanced
AFTER UPDATE ON escrow_accounts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.status IN ('RELEASED','SLASHED','CLOSED'))
EXECUTE FUNCTION check_escrow_balanced();
