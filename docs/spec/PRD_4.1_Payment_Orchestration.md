# PRD 4.1 — JOBENPAY Payment Orchestration Layer (POL)
## Multi-Gateway Adapter, Self-Owned Vault, Smart Failover, & State Machine

**Versi:** 1.0 · **Status:** Implementation-ready, Zero-Hallucination  
**Basis:** PRD 1.2–3.0 (Core System) + Standar Industri PCI DSS v4.0  
**Prinsip Kunci:** Logika inti JOBENPAY **tidak boleh** bergantung pada satu penyedia pembayaran. Gunakan pola Adapter, simpan token di Vault sendiri, dan gunakan state machine untuk mencegah *double charge*.

---

## 0. ATURAN EMAS (NON-NEGOTIABLE)

1. **Zero Vendor Lock-in.** Core Engine (Decision Engine, Ledger) hanya berkomunikasi dengan `PaymentConnector` interface. Tidak ada kode `stripe.*` atau `paypal.*` di luar folder adaptor.
2. **Self-Owned Vault.** JOBENPAY **DILARANG** menyimpan nomor kartu (PAN) mentah. JOBENPAY menyimpan *Network Token* di tabel `payment_methods` yang aman. Token ini bisa dirutekan ke gateway mana pun.
3. **Idempotency Everywhere.** Setiap request pembayaran wajib memiliki `Idempotency-Key`. Jika request di-retry, gateway tidak akan menagih dua kali.
4. **Smart Failover.** Jika Gateway A mengalami *soft decline* atau *timeout*, Router otomatis mencoba Gateway B dengan **Idempotency-Key baru**.
5. **Hard Decline = Stop.** Jika Gateway A mengembalikan *hard decline* (misal: kartu dicuri), sistem **DILARANG** melakukan failover ke Gateway B. Transaksi harus langsung gagal.
6. **Webhook Idempotent.** Webhook dari gateway wajib diverifikasi tanda tangannya dan diproses secara idempoten (mencegah duplikasi event).
7. **Multi-Environment.** Tabel `payment_methods` dan `payment_transactions` wajib memiliki kolom `environment` (SANDBOX/LIVE).
8. **Coverage:** 100% untuk `vault_service.js` dan `payment_router.js`. 90% untuk adaptor.

---

## 1. ARSITEKTUR & KOMPONEN

```text
[ Core Engine: Decision Engine / Request API ]
                      │
                      ▼
         [ PaymentOrchestrator ]
                      │
      ┌───────────────┼───────────────┐
      ▼               ▼               ▼
[ VaultService ] [ PaymentRouter ] [ WebhookService ]
      │               │               │
      │       ┌───────┴───────┐       │
      │       ▼               ▼       │
      │ [StripeAdapter] [PayPalAdapter]
      │       │               │       │
      └───────┴───────────────┴───────┘
                      │
              [ External Gateways ]
```

### 1.1 Komponen Utama
1. **PaymentOrchestrator**: Titik masuk tunggal. Menerima request dari Core Engine, memanggil Vault, menentukan rute via Router, dan mengeksekusi adaptor.
2. **VaultService**: Mengelola `payment_methods` (kartu tokenized). Menyediakan fungsi `tokenize()`, `getToken()`, dan `detokenize()`.
3. **PaymentRouter**: Berisi logika *failover*. Menentukan adaptor mana yang dipanggil berdasarkan aturan (misal: prioritas Stripe, fallback ke PayPal).
4. **PaymentConnector (Interface)**: Kontrak seragam (`authorize`, `capture`, `refund`, `verifyWebhook`).
5. **Provider Adapters**: Implementasi spesifik untuk Stripe, PayPal, dll.

---

## 2. SKEMA DATA (EKSPLISIT)

**File:** `server/migrations/055_payment_orchestration.sql` (deviasi dari penomoran 050 karena urutan migrasi forward-only repo)

```sql
BEGIN;

-- 2.1 Tabel Vault (Menyimpan Token, BUKAN kartu mentah)
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
  IF OLD.status = NEW.status THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'INITIATED' AND NEW.status IN ('AUTHORIZED', 'FAILED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'AUTHORIZED' AND NEW.status IN ('CAPTURED', 'FAILED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'CAPTURED' AND NEW.status IN ('REFUNDED', 'PARTIALLY_REFUNDED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  IF OLD.status = 'PARTIALLY_REFUNDED' AND NEW.status IN ('REFUNDED', 'PARTIALLY_REFUNDED') THEN
    NEW.updated_at = now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'ILLEGAL_TRANSITION: Cannot transition payment transaction from % to %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_transaction_state ON payment_transactions;
CREATE TRIGGER trg_payment_transaction_state
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_payment_transaction_state_transition();

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

COMMIT;
```

---

## 3. SERVICE LAYER (LOGIKA INTI)

### 3.1 PaymentConnector Interface
- `server/src/services/payment/connectors/base_connector.js`: `authorize()`, `capture()`, `refund()`, `verifyWebhook()`.
- `server/src/services/payment/connectors/stripe_adapter.js`: Stripe Connector.
- `server/src/services/payment/connectors/paypal_adapter.js`: PayPal Connector.

### 3.2 PaymentRouter (Smart Failover)
- `server/src/services/payment/payment_router.js`: Logika failover otomatis pada soft decline/timeout dengan per-gateway derived idempotency key `${idempotencyKey}_${gateway}`. Hard decline langsung berhenti seketika.

### 3.3 VaultService (PCI DSS v4.0)
- `server/src/services/payment/vault_service.js`: Penyimpanan token network, proteksi ketat anti-PAN mentah (13-19 digit) dan data CVV sensitif.

### 3.4 PaymentWebhookService
- `server/src/services/payment/webhook_service.js`: Verifikasi signature kriptografis dan deduplikasi event idempoten.

### 3.5 PaymentOrchestrator & ExecutionService
- `server/src/services/payment/orchestrator.js` & `server/src/services/execution_service.js`: Integrasi penuh State Machine dan Decision Engine.

---

## 4. TEST SUITE & COVERAGE

1. Unit Tests (100% Target):
   - `server/test/unit/payment_router.test.js`: **100% Statements, 100% Branch, 100% Functions, 100% Lines**.
   - `server/test/unit/vault_service.test.js`: **100% Statements, 100% Branch, 100% Functions, 100% Lines**.
   - `server/test/unit/connectors.test.js`: **100% Statements, >96% Branch, 100% Functions, 100% Lines**.
   - `server/test/unit/webhook_service.test.js`: **100% Statements, 100% Functions, 100% Lines**.
   - `server/test/unit/orchestrator.test.js`: **>96% Statements, >84% Branch, 100% Functions, >96% Lines**.
2. Integration Tests:
   - `server/test/integration/webhook.test.js`: Verifikasi 3 skenario integrasi PRD 4.1 §5.2.
   - `server/test/integration/pol_state_machine.test.js`: Verifikasi lifecycle penuh dan trigger DB.
3. Adversarial Security Audit:
   - `server/test/adversarial/pol_adversarial.test.js`: 6 invariant audit (§6.5).
   - Laporan Audit: `docs/audit/PRD-4.1.md`.
