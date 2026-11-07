-- ============================================================================
-- 021_f3_universal_transaction_schema.sql
-- B-F3 Universal Transaction Engine Foundation Schema & Payment Requests Migration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bagan Akun Internal (AD-03)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_accounts (
  account_ref TEXT NOT NULL,
  org_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'ORG',
    'BUYER',
    'SELLER',
    'PAYEE',
    'ESCROW_INTERNAL',
    'PLATFORM',
    'FEES',
    'LOAN',
    'COUNTERPARTY'
  )),
  currency CHAR(3) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, account_ref)
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_org_kind ON ledger_accounts(org_id, kind);

-- ----------------------------------------------------------------------------
-- 2. Transaction Intents (AD-01, PRD §2.1.1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_intents (
  intent_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  agent_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'SALE','DOWN_PAYMENT','INVOICE','PAYOUT','REFUND','VOID',
    'DISPUTE','PARTIAL','SCHEDULED','RECURRING','BULK','SPLIT',
    'TRANSFER','FINANCING','DEBIT'
  )),
  sub_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  counterparty_id UUID,
  parent_intent_id UUID REFERENCES transaction_intents(intent_id),
  mandate_version_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  reconciliation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (reconciliation_status IN ('PENDING','RECONCILED','MISMATCH')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, idempotency_key),
  CHECK (
    (category = 'DOWN_PAYMENT' AND sub_type IN ('initial','settlement','forfeit')) OR
    (category = 'REFUND' AND sub_type IN ('full','partial')) OR
    (category = 'VOID' AND sub_type IN ('authorization','order')) OR
    (category = 'DISPUTE' AND sub_type IN ('chargeback','inquiry')) OR
    (category = 'PARTIAL' AND sub_type IN ('payment','refund')) OR
    (category = 'SCHEDULED' AND sub_type IN ('payout','charge')) OR
    (category = 'RECURRING' AND sub_type IN ('init','charge','cancel')) OR
    (category = 'BULK' AND sub_type = 'payout') OR
    (category = 'SPLIT' AND sub_type IN ('collect','split','hold','payout')) OR
    (category = 'TRANSFER' AND sub_type = 'p2p') OR
    (category = 'FINANCING' AND sub_type IN ('po','invoice')) OR
    (category = 'DEBIT' AND sub_type = 'direct') OR
    (category IN ('SALE','INVOICE','PAYOUT') AND sub_type = 'standard')
  )
);

CREATE INDEX IF NOT EXISTS idx_intents_org_status ON transaction_intents(org_id, status);
CREATE INDEX IF NOT EXISTS idx_intents_org_category ON transaction_intents(org_id, category, sub_type);
CREATE INDEX IF NOT EXISTS idx_intents_parent_id ON transaction_intents(parent_intent_id) WHERE parent_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_intents_created_at ON transaction_intents(org_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Transaction Legs (Double-entry Ledger, PRD §2.1.2 & T-03)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_legs (
  leg_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  leg_type TEXT NOT NULL CHECK (leg_type IN ('DEBIT','CREDIT')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  account_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('PENDING','POSTED','SETTLED')),
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legs_intent_id ON transaction_legs(intent_id);
CREATE INDEX IF NOT EXISTS idx_legs_account_ref ON transaction_legs(account_ref, currency);

-- ----------------------------------------------------------------------------
-- 4. Trigger: Balanced Check PER CURRENCY & Immutability (T-03)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_balanced() RETURNS TRIGGER AS $$
DECLARE
  v_intent_id UUID;
  rec RECORD;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_intent_id := OLD.intent_id;
  ELSE
    v_intent_id := NEW.intent_id;
  END IF;

  FOR rec IN
    SELECT currency,
           COALESCE(SUM(CASE WHEN leg_type = 'DEBIT' THEN amount_minor ELSE 0 END), 0) AS debit_sum,
           COALESCE(SUM(CASE WHEN leg_type = 'CREDIT' THEN amount_minor ELSE 0 END), 0) AS credit_sum
    FROM transaction_legs
    WHERE intent_id = v_intent_id
    GROUP BY currency
  LOOP
    IF rec.debit_sum <> rec.credit_sum THEN
      RAISE EXCEPTION 'Unbalanced ledger: intent % currency % debit=% credit=%',
        v_intent_id, rec.currency, rec.debit_sum, rec.credit_sum;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_balanced ON transaction_legs;
CREATE CONSTRAINT TRIGGER trg_balanced
AFTER INSERT OR UPDATE OR DELETE ON transaction_legs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE PROCEDURE check_balanced();

CREATE OR REPLACE FUNCTION prevent_legs_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    IF (OLD.amount_minor <> NEW.amount_minor OR
        OLD.currency <> NEW.currency OR
        OLD.account_ref <> NEW.account_ref OR
        OLD.leg_type <> NEW.leg_type OR
        OLD.intent_id <> NEW.intent_id) THEN
      RAISE EXCEPTION 'Transaction legs are immutable: cannot alter financial fields on leg %', OLD.leg_id;
    END IF;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    RAISE EXCEPTION 'Transaction legs are immutable: hard delete forbidden on leg %', OLD.leg_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_legs_mutation ON transaction_legs;
CREATE TRIGGER trg_prevent_legs_mutation
BEFORE UPDATE OR DELETE ON transaction_legs
FOR EACH ROW EXECUTE PROCEDURE prevent_legs_mutation();

-- ----------------------------------------------------------------------------
-- 5. Down Payment Accounts (PRD §2.2, AD-04, T-09)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS down_payment_accounts (
  account_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  counterparty_id UUID NOT NULL,
  dp_amount_minor BIGINT NOT NULL CHECK (dp_amount_minor > 0),
  settlement_amount_minor BIGINT CHECK (settlement_amount_minor IS NULL OR settlement_amount_minor >= 0),
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','DP_PAID','AWAITING_DELIVERY','SETTLEMENT_DUE','SETTLED','FORFEITED'
  )),
  authorization_id TEXT,
  authorization_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (dp_amount_minor + COALESCE(settlement_amount_minor, 0) <= total_amount_minor),
  CHECK (status <> 'SETTLED' OR dp_amount_minor + COALESCE(settlement_amount_minor, 0) = total_amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_dp_accounts_org_intent ON down_payment_accounts(org_id, intent_id);
CREATE INDEX IF NOT EXISTS idx_dp_accounts_status ON down_payment_accounts(status);

-- ----------------------------------------------------------------------------
-- 6. Invoice Records (PRD §2.2, T-05)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_records (
  invoice_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  counterparty_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT','ISSUED','SENT','VIEWED','PARTIALLY_PAID','PAID','OVERDUE','WRITTEN_OFF','CANCELLED'
  )),
  paypal_invoice_id TEXT,
  document_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_invoice_records_org_status ON invoice_records(org_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_records_intent ON invoice_records(intent_id);

-- ----------------------------------------------------------------------------
-- 7. Recurring Schedules (PRD §2.2, T-08)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recurring_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  counterparty_id UUID NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  interval_count INT NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  next_run_at TIMESTAMPTZ NOT NULL,
  remaining_cycles INT CHECK (remaining_cycles IS NULL OR remaining_cycles >= 0),
  paypal_plan_id TEXT,
  paypal_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAST_DUE','CANCELLED','EXPIRED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_next_run ON recurring_schedules(status, next_run_at) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_org ON recurring_schedules(org_id);

-- ----------------------------------------------------------------------------
-- 8. Split Rules (PRD §2.2, T-07)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS split_rules (
  rule_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  platform_fee_bps INT NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  hold_period_hours INT NOT NULL DEFAULT 0 CHECK (hold_period_hours >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id)
);

-- ----------------------------------------------------------------------------
-- 9. Debit Authorizations (Tier C - DEBIT, AD-17)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS debit_authorizations (
  auth_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  counterparty_id UUID NOT NULL,
  max_amount_minor BIGINT NOT NULL CHECK (max_amount_minor > 0),
  currency CHAR(3) NOT NULL,
  frequency_limit TEXT NOT NULL CHECK (frequency_limit IN ('ONCE','WEEKLY','MONTHLY','UNLIMITED')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  valid_until TIMESTAMPTZ NOT NULL,
  mandate_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debit_auth_org_cp ON debit_authorizations(org_id, counterparty_id, status);

-- ----------------------------------------------------------------------------
-- 10. Financing Records (Tier C - FINANCING, AD-17)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financing_records (
  financing_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  counterparty_id UUID NOT NULL,
  facility_type TEXT NOT NULL CHECK (facility_type IN ('PO','INVOICE')),
  principal_amount_minor BIGINT NOT NULL CHECK (principal_amount_minor > 0),
  interest_bps INT NOT NULL CHECK (interest_bps >= 0),
  admin_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK (admin_fee_minor >= 0),
  tenor_months INT NOT NULL CHECK (tenor_months > 0),
  repaid_amount_minor BIGINT NOT NULL DEFAULT 0 CHECK (repaid_amount_minor >= 0),
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN (
    'REQUESTED','UNDERWRITING','APPROVED','DISBURSED','REPAYING','SETTLED','REJECTED','DEFAULTED'
  )),
  schedule JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (repaid_amount_minor <= (principal_amount_minor + admin_fee_minor + (principal_amount_minor * interest_bps / 10000)))
);

CREATE INDEX IF NOT EXISTS idx_financing_records_org_intent ON financing_records(org_id, intent_id);

-- ----------------------------------------------------------------------------
-- 11. Settlement Records (Reconciliation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settlement_records (
  id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  paypal_ref TEXT NOT NULL,
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING','SETTLED','FAILED','MISMATCH')),
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_records_org_intent_status ON settlement_records(org_id, intent_id, status);

-- ----------------------------------------------------------------------------
-- 12. Payment Requests Compatible View (AD-01)
-- ----------------------------------------------------------------------------

-- Drop tabel atau view lama jika sudah ada (AD-01)
CREATE OR REPLACE FUNCTION _drop_payment_requests_pre_view() RETURNS void AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = current_schema() AND tablename = 'payment_requests') THEN
    EXECUTE 'DROP TABLE ' || quote_ident(current_schema()) || '.payment_requests CASCADE';
  ELSIF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = current_schema() AND viewname = 'payment_requests') THEN
    EXECUTE 'DROP VIEW ' || quote_ident(current_schema()) || '.payment_requests CASCADE';
  END IF;
END;
$$ LANGUAGE plpgsql;
SELECT _drop_payment_requests_pre_view();
DROP FUNCTION _drop_payment_requests_pre_view();

-- Buat VIEW kompatibel 100% 1.2
CREATE OR REPLACE VIEW payment_requests AS
SELECT
  intent_id AS id,
  created_at,
  org_id,
  agent_id,
  CASE 
    WHEN mandate_version_id = '00000000-0000-4000-8000-000000000000'::uuid THEN NULL 
    ELSE mandate_version_id 
  END AS mandate_version_id,
  COALESCE(metadata->>'action', category) AS action,
  CASE
    WHEN status = 'SUBMITTED' THEN 'RECEIVED'
    WHEN status = 'NEEDS_APPROVAL' THEN 'PENDING_APPROVAL'
    ELSE status
  END AS status,
  amount_minor,
  currency,
  counterparty_id AS payee_id,
  metadata->>'target_ref' AS target_ref,
  CASE WHEN metadata ? 'document_id' THEN (metadata->>'document_id')::uuid ELSE NULL END AS document_id,
  metadata->>'agent_reason' AS agent_reason,
  idempotency_key AS agent_idempotency_key,
  request_hash,
  metadata->>'decision' AS decision,
  CASE
    WHEN metadata ? 'reason_codes' AND jsonb_typeof(metadata->'reason_codes') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(metadata->'reason_codes'))
    ELSE NULL
  END AS reason_codes,
  CASE WHEN metadata ? 'risk_score' THEN (metadata->>'risk_score')::integer ELSE NULL END AS risk_score,
  metadata->>'explanation' AS explanation,
  CASE WHEN metadata ? 'reserved_period_id' THEN (metadata->>'reserved_period_id')::uuid ELSE NULL END AS reserved_period_id,
  CASE WHEN metadata ? 'reserved_amount_minor' THEN (metadata->>'reserved_amount_minor')::bigint ELSE NULL END AS reserved_amount_minor,
  COALESCE((metadata->>'reserved_released')::boolean, false) AS reserved_released,
  reconciliation_status,
  updated_at
FROM transaction_intents;

-- INSTEAD OF Trigger untuk VIEW payment_requests agar mutasi 1.2 tembus ke transaction_intents
CREATE OR REPLACE FUNCTION trg_payment_requests_view_io()
RETURNS trigger AS $$
DECLARE
  v_intent_id uuid;
  v_status text;
  v_reason_codes jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_intent_id := COALESCE(NEW.id, (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid));
    v_status := CASE
      WHEN NEW.status = 'RECEIVED' THEN 'SUBMITTED'
      WHEN NEW.status = 'PENDING_APPROVAL' THEN 'NEEDS_APPROVAL'
      ELSE COALESCE(NEW.status, 'SUBMITTED')
    END;

    IF NEW.reason_codes IS NOT NULL THEN
      v_reason_codes := to_jsonb(NEW.reason_codes);
    ELSE
      v_reason_codes := NULL;
    END IF;

    INSERT INTO transaction_intents (
      intent_id, org_id, agent_id, category, sub_type, status,
      amount_minor, currency, counterparty_id, mandate_version_id,
      request_hash, idempotency_key, metadata, created_at, updated_at
    )
    VALUES (
      v_intent_id,
      NEW.org_id,
      NEW.agent_id,
      CASE
        WHEN NEW.action IN ('PAYOUT', 'REFUND', 'ACCEPT_DISPUTE') THEN
          CASE WHEN NEW.action = 'ACCEPT_DISPUTE' THEN 'DISPUTE' ELSE NEW.action END
        ELSE 'PAYOUT'
      END,
      CASE 
        WHEN NEW.action = 'ACCEPT_DISPUTE' THEN 'inquiry'
        WHEN NEW.action = 'REFUND' THEN 'full'
        ELSE 'standard' 
      END,
      v_status,
      NEW.amount_minor,
      NEW.currency,
      NEW.payee_id,
      COALESCE(NEW.mandate_version_id, '00000000-0000-4000-8000-000000000000'::uuid),
      COALESCE(NEW.request_hash, 'hash_' || v_intent_id::text),
      COALESCE(NEW.agent_idempotency_key, v_intent_id::text),
      jsonb_strip_nulls(jsonb_build_object(
        'action', NEW.action,
        'target_ref', NEW.target_ref,
        'document_id', NEW.document_id,
        'agent_reason', NEW.agent_reason,
        'decision', NEW.decision,
        'reason_codes', v_reason_codes,
        'risk_score', NEW.risk_score,
        'explanation', NEW.explanation,
        'reserved_period_id', NEW.reserved_period_id,
        'reserved_amount_minor', NEW.reserved_amount_minor,
        'reserved_released', NEW.reserved_released
      )),
      COALESCE(NEW.created_at, now()),
      now()
    );
    NEW.id := v_intent_id;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_status := CASE
      WHEN NEW.status = 'RECEIVED' THEN 'SUBMITTED'
      WHEN NEW.status = 'PENDING_APPROVAL' THEN 'NEEDS_APPROVAL'
      ELSE NEW.status
    END;

    IF NEW.reason_codes IS NOT NULL THEN
      v_reason_codes := to_jsonb(NEW.reason_codes);
    ELSE
      v_reason_codes := NULL;
    END IF;

    UPDATE transaction_intents
    SET
      status = v_status,
      amount_minor = COALESCE(NEW.amount_minor, amount_minor),
      currency = COALESCE(NEW.currency, currency),
      counterparty_id = COALESCE(NEW.payee_id, counterparty_id),
      mandate_version_id = COALESCE(NEW.mandate_version_id, mandate_version_id),
      request_hash = COALESCE(NEW.request_hash, request_hash),
      reconciliation_status = COALESCE(NEW.reconciliation_status, reconciliation_status),
      updated_at = now(),
      metadata = metadata || jsonb_strip_nulls(jsonb_build_object(
        'action', NEW.action,
        'target_ref', NEW.target_ref,
        'document_id', NEW.document_id,
        'agent_reason', NEW.agent_reason,
        'decision', NEW.decision,
        'reason_codes', v_reason_codes,
        'risk_score', NEW.risk_score,
        'explanation', NEW.explanation,
        'reserved_period_id', NEW.reserved_period_id,
        'reserved_amount_minor', NEW.reserved_amount_minor,
        'reserved_released', NEW.reserved_released
      ))
    WHERE intent_id = OLD.id AND org_id = OLD.org_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM transaction_intents WHERE intent_id = OLD.id AND org_id = OLD.org_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_requests_io ON payment_requests;
CREATE TRIGGER trg_payment_requests_io
INSTEAD OF INSERT OR UPDATE OR DELETE ON payment_requests
FOR EACH ROW EXECUTE PROCEDURE trg_payment_requests_view_io();
