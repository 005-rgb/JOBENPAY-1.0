-- 051_unified_escrow.sql
-- PRD 2.0 Unified Architecture §2.4: Unified Escrow Schema
-- Consolidates escrow accounts across SPLIT, PACT, and DOWN_PAYMENT.

DO $$
BEGIN
  -- Create table if it does not already exist
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'escrow_accounts') THEN
    CREATE TABLE escrow_accounts (
      escrow_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
      escrow_type TEXT NOT NULL CHECK (escrow_type IN ('SPLIT', 'PACT', 'DOWN_PAYMENT')),
      org_id UUID NOT NULL REFERENCES organizations(id),
      contract_id UUID,
      split_id UUID,
      dp_id UUID,
      held_minor BIGINT NOT NULL DEFAULT 0,
      released_minor BIGINT NOT NULL DEFAULT 0,
      slashed_minor BIGINT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'FUNDED' CHECK (status IN ('FUNDED', 'RELEASED', 'SLASHED', 'CLOSED')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (held_minor >= 0 AND released_minor >= 0 AND slashed_minor >= 0)
    );
  ELSE
    -- Table exists from 039_pact.sql, expand columns forward-only
    -- Drop constraint trigger first to prevent 'cannot ALTER TABLE because it has pending trigger events' during backfill
    DROP TRIGGER IF EXISTS trg_pact_settlement_balanced ON escrow_accounts;

    ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);
    ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS escrow_type TEXT DEFAULT 'PACT';
    ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS split_id UUID;
    ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS dp_id UUID;
    ALTER TABLE escrow_accounts ALTER COLUMN contract_id DROP NOT NULL;

    -- Backfill org_id from pact_contracts if available
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'pact_contracts') THEN
      UPDATE escrow_accounts e
      SET org_id = p.org_id, escrow_type = 'PACT'
      FROM pact_contracts p
      WHERE e.contract_id = p.contract_id AND e.org_id IS NULL;
    END IF;

    -- Fallback for any leftover unassociated rows
    UPDATE escrow_accounts
    SET org_id = (SELECT id FROM organizations LIMIT 1)
    WHERE org_id IS NULL;

    -- Enforce NOT NULL on org_id
    ALTER TABLE escrow_accounts ALTER COLUMN org_id SET NOT NULL;

    -- Re-create the pact settlement balanced trigger
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_escrow_balanced') THEN
      CREATE CONSTRAINT TRIGGER trg_pact_settlement_balanced
      AFTER UPDATE ON escrow_accounts
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW
      WHEN (NEW.status IN ('RELEASED','SLASHED','CLOSED'))
      EXECUTE PROCEDURE check_escrow_balanced();
    END IF;
  END IF;
END $$;

-- Check constraint for escrow_type and reference alignment
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_escrow_type_ref' AND conrelid = 'escrow_accounts'::regclass
  ) THEN
    ALTER TABLE escrow_accounts ADD CONSTRAINT chk_escrow_type_ref CHECK (
      (escrow_type = 'PACT' AND contract_id IS NOT NULL AND split_id IS NULL AND dp_id IS NULL) OR
      (escrow_type = 'SPLIT' AND split_id IS NOT NULL AND contract_id IS NULL AND dp_id IS NULL) OR
      (escrow_type = 'DOWN_PAYMENT' AND dp_id IS NOT NULL AND contract_id IS NULL AND split_id IS NULL)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_escrow_accounts_org ON escrow_accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_type ON escrow_accounts(escrow_type);
CREATE INDEX IF NOT EXISTS idx_escrow_accounts_status ON escrow_accounts(status);
