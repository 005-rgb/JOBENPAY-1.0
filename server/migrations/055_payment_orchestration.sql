BEGIN;

-- 2.1 Tabel Vault (Menyimpan Token, BUKAN kartu mentah / PAN)
CREATE TABLE IF NOT EXISTS payment_methods (
  pm_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  environment environment_type NOT NULL DEFAULT 'SANDBOX',
  customer_id UUID NOT NULL,
  gateway TEXT NOT NULL CHECK (gateway IN ('STRIPE', 'PAYPAL', 'ADYEN')),
  token TEXT NOT NULL,
  card_brand TEXT,
  card_last4 CHAR(4),
  card_exp_month INT,
  card_exp_year INT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, environment, token)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_org_env_cust ON payment_methods(org_id, environment, customer_id);

-- 2.2 Tabel Transaksi (State Machine)
CREATE TABLE IF NOT EXISTS payment_transactions (
  tx_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  environment environment_type NOT NULL DEFAULT 'SANDBOX',
  request_id UUID NOT NULL,
  gateway TEXT NOT NULL,
  gateway_tx_id TEXT,
  amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'INITIATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'
  )),
  error_code TEXT,
  error_message TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_tx_request ON payment_transactions(request_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_org_env ON payment_transactions(org_id, environment);

-- Trigger State Machine untuk Pencegahan Double Charge / Transisi Ilegal
CREATE OR REPLACE FUNCTION fn_payment_transaction_state_transition()
RETURNS TRIGGER AS $$
BEGIN
  -- Jika status tidak berubah, perbolehkan update field lain
  IF OLD.status = NEW.status THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  -- 1. Dari INITIATED boleh ke AUTHORIZED atau FAILED
  IF OLD.status = 'INITIATED' AND NEW.status IN ('AUTHORIZED', 'FAILED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  -- 2. Dari AUTHORIZED boleh ke CAPTURED atau FAILED
  IF OLD.status = 'AUTHORIZED' AND NEW.status IN ('CAPTURED', 'FAILED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  -- 3. Dari CAPTURED boleh ke REFUNDED atau PARTIALLY_REFUNDED
  IF OLD.status = 'CAPTURED' AND NEW.status IN ('REFUNDED', 'PARTIALLY_REFUNDED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  -- 4. Dari PARTIALLY_REFUNDED boleh ke REFUNDED atau PARTIALLY_REFUNDED lagi
  IF OLD.status = 'PARTIALLY_REFUNDED' AND NEW.status IN ('REFUNDED', 'PARTIALLY_REFUNDED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  -- Semua transisi selain di atas adalah ILLEGAL
  RAISE EXCEPTION 'ILLEGAL_TRANSITION: Cannot transition payment transaction from % to %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_transaction_state ON payment_transactions;
CREATE TRIGGER trg_payment_transaction_state
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE PROCEDURE fn_payment_transaction_state_transition();

-- 2.3 Tabel Webhook Events (Untuk Deduplikasi)
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id UUID PRIMARY KEY DEFAULT (overlay(overlay(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text) placing '4' from 13 for 1) placing CASE substr(md5(random()::text || clock_timestamp()::text || txid_current()::text || pg_backend_pid()::text), 1, 1) WHEN '0' THEN '8' WHEN '1' THEN '8' WHEN '2' THEN '8' WHEN '3' THEN '8' WHEN '4' THEN '9' WHEN '5' THEN '9' WHEN '6' THEN '9' WHEN '7' THEN '9' WHEN '8' THEN 'a' WHEN '9' THEN 'a' WHEN 'a' THEN 'a' WHEN 'b' THEN 'a' ELSE 'b' END from 17 for 1)::uuid),
  org_id UUID NOT NULL REFERENCES organizations(id),
  gateway TEXT NOT NULL,
  gateway_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gateway, gateway_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_org_gw ON payment_webhook_events(org_id, gateway);

-- 2.4 Row Level Security (RLS)
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_methods_env_isolation ON payment_methods;
CREATE POLICY payment_methods_env_isolation ON payment_methods FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

DROP POLICY IF EXISTS payment_transactions_env_isolation ON payment_transactions;
CREATE POLICY payment_transactions_env_isolation ON payment_transactions FOR ALL USING (
  environment = COALESCE(NULLIF(current_setting('app.current_environment', true), ''), 'SANDBOX')::environment_type
);

COMMIT;
