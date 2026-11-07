-- ============================================================================
-- JOBENPAY UNIVERSAL TRANSACTION ENGINE
-- PRD 1.3 / PRD 2.0 FIXED SCHEMA (PostgreSQL 13+)
-- File: docs/spec/sql/prd-2-fixed.sql
-- Status: DRAFT-UNTUK-PERSETUJUAN
-- 
-- Perbaikan dari PRD §2 asli:
-- 1. [AD-04] down_payment_accounts: status DEFAULT diubah menjadi 'PENDING'
--    (bukan 'DP_PAID' karena akun baru belum diotorisasi/dibayar).
-- 2. [AD-04] down_payment_accounts: CHECK diperbaiki menjadi:
--    CHECK (dp_amount_minor + COALESCE(settlement_amount_minor,0) <= total_amount_minor)
--    dan penegakan ketat saat SETTLED:
--    CHECK (status <> 'SETTLED' OR dp_amount_minor + COALESCE(settlement_amount_minor,0) = total_amount_minor)
-- 3. [T-03] transaction_legs & check_balanced: balanced check ditegakkan PER CURRENCY
--    dan trigger memeriksa bahwa SUM(DEBIT) = SUM(CREDIT) untuk setiap mata uang.
-- 4. [T-03] transaction_legs: trigger mencegah mutasi UPDATE/DELETE (append-only ledger).
-- 5. [T-08] recurring_schedules: ditambahkan kolom org_id, counterparty_id, amount_minor,
--    currency, paypal_subscription_id yang hilang pada PRD §2 asli.
-- 6. [AD-03] ledger_accounts: tabel bagan akun kanonik untuk validasi referensi akun buku internal.
-- 7. [AD-01] transaction_intents: ditambahkan kolom reconciliation_status ('PENDING','RECONCILED','MISMATCH').
-- 8. [AD-17] debit_authorizations & financing_records: tabel skema untuk Tier C (DEBIT & FINANCING).
-- 9. Indeks lengkap pada org_id, intent_id, counterparty_id, created_at untuk performa dan isolasi tenant.
-- ============================================================================

-- Ekstensi UUID (bila belum aktif)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Bagan Akun Internal (AD-03)
-- PENTING: Akun 'escrow' (dp_escrow, platform_escrow, payee_escrow) adalah akun buku internal,
-- BUKAN rekening escrow perbankan atau PayPal escrow.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger_accounts (
  account_ref TEXT NOT NULL,
  org_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'ORG',             -- Rekening kas utama organisasi (org:main)
    'BUYER',           -- Akun piutang/pembeli (buyer:{cp})
    'SELLER',          -- Akun pendapatan penjual (seller:org)
    'PAYEE',           -- Akun penerima payout (payee:{cp})
    'ESCROW_INTERNAL', -- Akun penampung internal sementara (dp_escrow:{intent}, platform_escrow)
    'PLATFORM',        -- Akun pendapatan biaya platform (platform_fee)
    'FEES',            -- Akun beban biaya pemrosesan PayPal (paypal:fees)
    'LOAN',            -- Akun fasilitas pinjaman (loan:principal:{intent}, loan:interest:{intent})
    'COUNTERPARTY'     -- Akun pihak lawan lainnya
  )),
  currency CHAR(3) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, account_ref)
);

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_org_kind ON ledger_accounts(org_id, kind);

-- ----------------------------------------------------------------------------
-- 2. Transaction Intents (AD-01, PRD §2.1.1)
-- Induk universal untuk seluruh 15 kategori dan 28 sub-tipe transaksi.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transaction_intents (
  intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  -- Penegakan ketat 15 kategori dan 28 pasangan sub-tipe (Aturan Emas #2)
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
  leg_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

  -- Periksa keseimbangan DEBIT = CREDIT untuk setiap mata uang yang ada di intent ini
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

-- Trigger constraint ditunda hingga akhir transaksi (DEFERRABLE INITIALLY DEFERRED)
-- agar sepasang DEBIT dan CREDIT dapat dimasukkan dalam satu transaksi DB.
DROP TRIGGER IF EXISTS trg_balanced ON transaction_legs;
CREATE CONSTRAINT TRIGGER trg_balanced
AFTER INSERT OR UPDATE OR DELETE ON transaction_legs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_balanced();

-- Trigger pencegahan mutasi UPDATE / DELETE pada transaction_legs (Immutability)
CREATE OR REPLACE FUNCTION prevent_legs_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') THEN
    -- Hanya izinkan pembaruan status PENDING -> POSTED / SETTLED, tolak perubahan amount/account/currency/intent
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
FOR EACH ROW EXECUTE FUNCTION prevent_legs_mutation();

-- ----------------------------------------------------------------------------
-- 5. Down Payment Accounts (PRD §2.2, AD-04, T-09)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS down_payment_accounts (
  account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id) ON DELETE RESTRICT,
  counterparty_id UUID NOT NULL,
  dp_amount_minor BIGINT NOT NULL CHECK (dp_amount_minor > 0),
  settlement_amount_minor BIGINT CHECK (settlement_amount_minor IS NULL OR settlement_amount_minor >= 0),
  total_amount_minor BIGINT NOT NULL CHECK (total_amount_minor > 0),
  -- FIX: Default status adalah 'PENDING', bukan 'DP_PAID'
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','DP_PAID','AWAITING_DELIVERY','SETTLEMENT_DUE','SETTLED','FORFEITED'
  )),
  authorization_id TEXT,
  authorization_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- FIX: Akumulasi DP + settlement tidak boleh melebihi total
  CHECK (dp_amount_minor + COALESCE(settlement_amount_minor, 0) <= total_amount_minor),
  -- FIX: Saat status SETTLED, jumlah DP + settlement wajib tepat sama dengan total
  CHECK (status <> 'SETTLED' OR dp_amount_minor + COALESCE(settlement_amount_minor, 0) = total_amount_minor)
);

CREATE INDEX IF NOT EXISTS idx_dp_accounts_org_intent ON down_payment_accounts(org_id, intent_id);
CREATE INDEX IF NOT EXISTS idx_dp_accounts_status ON down_payment_accounts(status);

-- ----------------------------------------------------------------------------
-- 6. Invoice Records (PRD §2.2, T-05)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_records (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  auth_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  financing_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

