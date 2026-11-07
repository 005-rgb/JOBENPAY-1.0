# PRD 1.3 --- JOBENPAY Universal Transaction Engine

## Full Financial Transaction Coverage for AI Agent Economy (Presisi Tinggi)

**Versi:** 1.4 (revisi total dari 1.3) · **Status:**
Implementation-ready specification\
**Tanggal:** 6 November 2026\
**Basis:** PRD 1.2 (Sandbox Gatekeeper) + 15 Kategori Transaksi\
**Prinsip:** Setiap kategori memiliki logika bisnis, state machine,
ledger rules, dan API contract yang eksplisit. Tidak ada ambiguitas.
Tidak ada bug karena "AI menebak".

------------------------------------------------------------------------

## 0. Aturan Emas (Non-Negotiable)

1.  **Setiap transaksi menghasilkan double-entry ledger yang balanced**
    (`SUM(DEBIT) = SUM(CREDIT)`). Trigger DB menolak insert jika tidak
    balanced.
2.  **Setiap kategori memiliki state machine eksplisit** yang
    didefinisikan di §3. Transisi ilegal ditolak oleh `transition()`
    function.
3.  **Setiap kategori memiliki aturan Tahap A/B/C/D** yang didefinisikan
    di §4. AI hanya boleh memperketat (P1 PRD 1.2).
4.  **Setiap transaksi menghasilkan SAR** (PRD 1.3 §3.1) dengan field
    `category`, `sub_type`, dan `legs_summary`.
5.  **Idempotency key wajib** untuk semua mutasi. Format:
    `{category}_{intent_id}_{sub_type}`.
6.  **Tidak ada bypass gerbang**. Semua kategori melewati Decision
    Engine yang sama.

------------------------------------------------------------------------

## 1. Daftar Kategori dan Sub-Tipe

### 1.1 Tabel Master

  ------------------------------------------------------------------------------------------------
  \#          Kategori         Sub-Tipe           Arah             Tier        Provider PayPal
  ----------- ---------------- ------------------ ---------------- ----------- -------------------
  1           `SALE`           `standard`         Masuk            A           Orders API
                                                                               (CAPTURE)

  2           `DOWN_PAYMENT`   `initial`,         Keluar           A           Orders API
                               `settlement`,      (sebagian)                   (AUTHORIZE) +
                               `forfeit`                                       Capture

  3           `INVOICE`        `standard`         Masuk (piutang)  A           Invoicing API

  4           `PAYOUT`         `standard`         Keluar           A           Payouts API

  5           `REFUND`         `full`, `partial`  Keluar           A           Payments API
                                                  (pengembalian)               (refund)

  6           `VOID`           `authorization`,   Pembatalan       A           Orders API (void)
                               `order`                                         

  7           `DISPUTE`        `chargeback`,      Pembalikan paksa A           Disputes API
                               `inquiry`                                       

  8           `PARTIAL`        `payment`,         Sebagian         A           Payments API
                               `refund`                                        (partial)

  9           `SCHEDULED`      `payout`, `charge` Terjadwal        B           Payouts API
                                                                               (delayed)

  10          `RECURRING`      `init`, `charge`,  Berulang         B           Subscriptions API
                               `cancel`                                        

  11          `BULK`           `payout`           Massal           B           Payouts API (batch)

  12          `SPLIT`          `collect`,         Bagi hasil       B           Payouts API
                               `split`, `hold`,                                (multi-recipient)
                               `payout`                                        

  13          `TRANSFER`       `p2p`              Antar pihak      B           Payouts API

  14          `FINANCING`      `po`, `invoice`    Pembiayaan       C           (Partner)

  15          `DEBIT`          `direct`           Penarikan        C           (Partner)
                                                  langsung                     
  ------------------------------------------------------------------------------------------------

**Tier A wajib MVP. Tier B bonus. Tier C stub.**

------------------------------------------------------------------------

## 2. Model Data Lengkap

### 2.1 Entitas Inti

``` sql
-- 2.1.1 Transaction Intents (abstraksi dari payment_requests 1.2)
CREATE TABLE transaction_intents (
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
  metadata JSONB DEFAULT '{}',
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

-- 2.1.2 Transaction Legs (double-entry)
CREATE TABLE transaction_legs (
  leg_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  leg_type TEXT NOT NULL CHECK (leg_type IN ('DEBIT','CREDIT')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
  currency CHAR(3) NOT NULL,
  account_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  external_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: balanced check per intent
CREATE OR REPLACE FUNCTION check_balanced() RETURNS TRIGGER AS $$
DECLARE
  debit_sum BIGINT;
  credit_sum BIGINT;
BEGIN
  SELECT COALESCE(SUM(amount_minor),0) INTO debit_sum
  FROM transaction_legs WHERE intent_id = NEW.intent_id AND leg_type = 'DEBIT';
  SELECT COALESCE(SUM(amount_minor),0) INTO credit_sum
  FROM transaction_legs WHERE intent_id = NEW.intent_id AND leg_type = 'CREDIT';
  IF debit_sum <> credit_sum THEN
    RAISE EXCEPTION 'Unbalanced ledger: intent % debit=% credit=%',
      NEW.intent_id, debit_sum, credit_sum;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_balanced
AFTER INSERT OR UPDATE ON transaction_legs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_balanced();
```

### 2.2 Tabel Spesifik per Kategori

**DOWN_PAYMENT:**

``` sql
CREATE TABLE down_payment_accounts (
  account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  counterparty_id UUID NOT NULL,
  dp_amount_minor BIGINT NOT NULL,
  settlement_amount_minor BIGINT,
  total_amount_minor BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DP_PAID',
  authorization_id TEXT,  -- PayPal authorization ID 
  authorization_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (dp_amount_minor + COALESCE(settlement_amount_minor,0) = total_amount_minor)
);
```

**INVOICE:**

``` sql
CREATE TABLE invoice_records (
  invoice_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  counterparty_id UUID NOT NULL,
  invoice_number TEXT NOT NULL,
  amount_minor BIGINT NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  paypal_invoice_id TEXT,  -- dari Invoicing API 
  document_id UUID,
  UNIQUE(org_id, invoice_number)
);
```

**RECURRING:**

``` sql
CREATE TABLE recurring_schedules (
  schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  frequency TEXT NOT NULL CHECK (frequency IN ('DAILY','WEEKLY','MONTHLY','YEARLY')),
  interval_count INT NOT NULL DEFAULT 1,
  next_run_at TIMESTAMPTZ NOT NULL,
  remaining_cycles INT,
  paypal_plan_id TEXT,  -- dari Subscriptions API 
  status TEXT NOT NULL DEFAULT 'ACTIVE'
);
```

**SPLIT:**

``` sql
CREATE TABLE split_rules (
  rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  platform_fee_bps INT NOT NULL CHECK (platform_fee_bps BETWEEN 0 AND 10000),
  hold_period_hours INT DEFAULT 0,
  UNIQUE(org_id)
);
```

------------------------------------------------------------------------

## 3. State Machine per Kategori (Eksplisit)

### 3.1 SALE (Tier A)

    DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED
                                        ↓
                                     REJECTED

**Transisi legal:** - `DRAFT → SUBMITTED`: agent submit -
`SUBMITTED → EVALUATING`: worker picks up - `EVALUATING → APPROVED`:
auto-approve atau approval granted - `EVALUATING → NEEDS_APPROVAL`:
butuh approval - `NEEDS_APPROVAL → APPROVED`: approver approve -
`NEEDS_APPROVAL → REJECTED`: approver reject - `APPROVED → EXECUTING`:
worker starts - `EXECUTING → COMPLETED`: PayPal capture success -
`EXECUTING → FAILED`: PayPal error

**Ledger:** - `EXECUTING → COMPLETED`: DEBIT buyer_account, CREDIT
seller_account (balanced)

### 3.2 DOWN_PAYMENT (Tier A)

    DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → DP_PAID
                                                              ↓
                                                        AWAITING_DELIVERY
                                                              ↓
                                                  ┌───────────┴───────────┐
                                                  ↓                       ↓
                                            SETTLEMENT_DUE           FORFEITED
                                                  ↓
                                            SETTLED

**Transisi legal:** - `EXECUTING → DP_PAID`: PayPal authorize + capture
partial - `DP_PAID → AWAITING_DELIVERY`: buyer confirms receipt -
`AWAITING_DELIVERY → SETTLEMENT_DUE`: deadline reached -
`SETTLEMENT_DUE → SETTLED`: settlement captured -
`AWAITING_DELIVERY → FORFEITED`: cancellation after deadline -
`SETTLEMENT_DUE → FORFEITED`: cancellation

**Ledger (initial):** - DEBIT buyer_account, CREDIT dp_escrow_account
(dp_amount)

**Ledger (settlement):** - DEBIT buyer_account, CREDIT seller_account
(settlement_amount)

**Ledger (forfeit):** - DEBIT dp_escrow_account, CREDIT seller_account
(dp_amount)

**Aturan khusus:** - `authorization_expires_at` = created_at + 29 days -
Jika settlement tidak dilakukan dalam 29 hari, authorization expired →
`FORFEITED` atau `REFUNDED` - Partial capture: capture amount ≤
authorized amount

### 3.3 INVOICE (Tier A)

    DRAFT → ISSUED → SENT → VIEWED → PARTIALLY_PAID → PAID
                                      ↓
                                    OVERDUE → WRITTEN_OFF

**Transisi legal:** - `DRAFT → ISSUED`: invoice created via Invoicing
API - `ISSUED → SENT`: `POST /v2/invoicing/invoices/{id}/send` -
`SENT → VIEWED`: webhook `INVOICING.INVOICE.UPDATED` -
`VIEWED → PARTIALLY_PAID`: partial payment received -
`PARTIALLY_PAID → PAID`: remaining paid - `VIEWED → PAID`: full
payment - `VIEWED → OVERDUE`: due_date passed - `OVERDUE → WRITTEN_OFF`:
manual write-off

**Ledger (PAID):** - DEBIT buyer_account, CREDIT seller_account

### 3.4 PAYOUT (Tier A --- existing 1.2)

    DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED

**Idempotency:** `sender_batch_id` = `jp_<intent_id>` **Ledger:** DEBIT
org_account, CREDIT payee_account

### 3.5 REFUND (Tier A)

    DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED

**Aturan khusus:** - Refund amount ≤ original capture amount - Window:
180 days from capture date - Currency must match original - Partial
refund: cumulative refunded amount ≤ original

**Ledger:** DEBIT seller_account, CREDIT buyer_account

**PayPal endpoint:** `POST /v2/payments/captures/{capture_id}/refund`

### 3.6 VOID (Tier A)

    DRAFT → SUBMITTED → EXECUTING → VOIDED

**Aturan khusus:** - Hanya untuk authorization yang belum di-capture -
Void uncaptured authorizations promptly

**Ledger:** Tidak ada (reversal of reserved funds)

### 3.7 DISPUTE (Tier A)

    OPEN → EVIDENCE_REQUIRED → UNDER_REVIEW → WON | LOST | PARTIALLY_WON → CLOSED

**Aturan khusus:** - `provide-evidence`:
`POST /v1/customer-disputes/{id}/provide-evidence` - `accept-claim`:
`POST /v1/customer-disputes/{id}/accept-claim` - Response deadline: 7
days (PayPal default)

**Ledger (LOST):** DEBIT seller_account, CREDIT buyer_account (amount
disputed)

### 3.8 PARTIAL (Tier A)

    DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED

**Aturan khusus:** - `sub_type = payment`: partial capture ≤ authorized
amount - `sub_type = refund`: partial refund ≤ remaining refundable

**Ledger:** Same as full, amount = partial amount

### 3.9 SCHEDULED (Tier B)

    DRAFT → SUBMITTED → SCHEDULED → EXECUTING → COMPLETED

**Aturan khusus:** `scheduled_at` disimpan di metadata; worker
menjalankan pada waktu yang ditentukan.

### 3.10 RECURRING (Tier B)

    DRAFT → INITIATED → ACTIVE → (CHARGE) → PAST_DUE → CANCELLED | EXPIRED

**Aturan khusus:** - `init`: `POST /v1/billing/subscriptions` -
`charge`: webhook `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED` - `cancel`:
`POST /v1/billing/subscriptions/{id}/cancel`

**Ledger (charge):** DEBIT subscriber_account, CREDIT seller_account

### 3.11 BULK (Tier B)

    DRAFT → SUBMITTED → EXECUTING → COMPLETED | PARTIALLY_COMPLETED

**Aturan khusus:** Batch max 15.000 item per call

### 3.12 SPLIT (Tier B)

    COLLECTED → SPLIT_CALCULATED → HELD → RELEASED → PAID_OUT

**Aturan khusus:** - `platform_fee_bps` dari `split_rules` -
`payee_share` = `total - (total * platform_fee_bps / 10000)`

**Ledger:** - COLLECTED: DEBIT buyer, CREDIT platform_escrow (total) -
SPLIT: DEBIT platform_escrow, CREDIT platform_fee + CREDIT
payee_escrow - PAYOUT: DEBIT payee_escrow, CREDIT payee

### 3.13 TRANSFER (Tier B)

    DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED

**Ledger:** DEBIT sender_account, CREDIT receiver_account

### 3.14 FINANCING (Tier C --- stub)

    REQUESTED → UNDERWRITING → APPROVED → DISBURSED → REPAYING → SETTLED

### 3.15 DEBIT (Tier C --- stub)

    DRAFT → SUBMITTED → EXECUTING → COMPLETED

------------------------------------------------------------------------

## 4. Aturan Policy Engine per Kategori (Tahap A)

### 4.1 Aturan Universal (berlaku semua kategori)

  Kode                     Aturan                            Fail →
  ------------------------ --------------------------------- --------
  `ORG_FROZEN`             Organisasi tidak frozen           REJECT
  `AGENT_DISABLED`         Agent ACTIVE                      REJECT
  `MANDATE_INACTIVE`       Mandat ACTIVE                     REJECT
  `CATEGORY_NOT_ALLOWED`   Kategori di `allowedCategories`   REJECT
  `CURRENCY_MISMATCH`      Currency = budget currency        REJECT
  `CAP_EXCEEDED`           Amount ≤ perTransactionCap        REJECT
  `BUDGET_EXCEEDED`        Reservasi anggaran atomik         REJECT

### 4.2 Aturan Spesifik

**SALE:** - `COUNTERPARTY_NOT_FOUND` → REJECT jika counterparty tidak
ada - `INVOICE_REQUIRED` → REQUIRE_APPROVAL jika `requireInvoice=true`
dan tidak ada invoice

**DOWN_PAYMENT:** - `DP_ACCOUNT_INACTIVE` → REJECT jika DP account tidak
aktif - `DP_TOTAL_EXCEEDED` → REJECT jika
`dp + settlement > perTransactionCap` - `AUTHORIZATION_EXPIRED` → REJECT
jika `authorization_expires_at < now()`

**INVOICE:** - `INVOICE_NUMBER_DUPLICATE` → REJECT jika invoice_number
sudah ada - `DUE_DATE_OUT_OF_RANGE` → REJECT jika due_date \>
mandate.validTo

**PAYOUT:** - (sama dengan 1.2)

**REFUND:** - `REFUND_EXCEEDS_ORIGINAL` → REJECT jika amount \>
original - `REFUND_WINDOW_EXPIRED` → REJECT jika \> 180 days -
`CURRENCY_MISMATCH` → REJECT jika currency ≠ original

**VOID:** - `VOID_NOT_ALLOWED` → REJECT jika intent sudah COMPLETED

**DISPUTE:** - `DISPUTE_WINDOW_EXPIRED` → REJECT jika response deadline
passed

**PARTIAL:** - `PARTIAL_EXCEEDS_ORIGINAL` → REJECT jika amount \>
original - `CUMULATIVE_EXCEEDED` → REJECT jika total partial \> original

**SCHEDULED:** - `SCHEDULE_OUT_OF_RANGE` → REJECT jika scheduled_at \>
mandate.validTo

**RECURRING:** - `RECURRING_LIMIT_EXCEEDED` → REJECT jika total
recurring \> `categoryLimits.RECURRING.maxMonthlyMinor`

**BULK:** - `BULK_TOO_LARGE` → REJECT jika item \> 15.000

**SPLIT:** - `SPLIT_RULE_NOT_FOUND` → REJECT jika tidak ada
split_rules - `PLATFORM_FEE_EXCEEDED` → REJECT jika platform_fee_bps \>
max

### 4.3 Tahap B (Penanda → REQUIRE_APPROVAL)

  ----------------------------------------------------------------------------
  Kode                         Kategori                Kondisi
  ---------------------------- ----------------------- -----------------------
  `PAYEE_NEW`                  Semua                   Payee belum TRUSTED

  `PAYEE_CHANGED`              Semua                   Detail payee berubah \<
                                                       30 hari

  `AMOUNT_REQUIRES_APPROVAL`   Semua                   Amount ≥
                                                       autoApproveBelow

  `DOC_INJECTION_SUSPECTED`    INVOICE, DOWN_PAYMENT   injection_flags terisi
  ----------------------------------------------------------------------------

### 4.4 Tahap C (AI --- hanya memperketat)

AI tidak pernah mengubah REJECT → APPROVE. AI hanya bisa: - Menaikkan
REQUIRE_APPROVAL → REJECT (jika riskScore ≥ blockOnRiskAtOrAbove) -
AUTO_APPROVE → REQUIRE_APPROVAL (jika riskScore ≥
escalateOnRiskAtOrAbove atau intentMatch ≠ MATCH) - Fail (timeout/JSON
invalid) → REQUIRE_APPROVAL (`AI_UNAVAILABLE`)

------------------------------------------------------------------------

## 5. API Contracts (Eksplisit)

### 5.1 Unified Endpoint

    POST /api/v1/transactions
    Authorization: Bearer <session_or_agent_key>
    Idempotency-Key: <required>

    Body:
    {
      "category": "DOWN_PAYMENT",
      "sub_type": "initial",
      "amount_minor": 20000,
      "currency": "USD",
      "counterparty_id": "uuid",
      "metadata": {
        "total_amount_minor": 100000,
        "authorization_intent": "AUTHORIZE"
      }
    }

    Response 201:
    {
      "intent_id": "uuid",
      "status": "EVALUATING",
      "decision": null,
      "reason_codes": [],
      "sar_id": null
    }

    Response 200 (idempotent replay):
    {
      "intent_id": "uuid",
      "status": "DP_PAID",
      "decision": "APPROVED",
      "reason_codes": [],
      "sar_id": "sar_..."
    }

### 5.2 Category-Specific Endpoints

  ------------------------------------------------------------------------------------------------------------------------------
  Endpoint                                   Body                                             Response
  ------------------------------------------ ------------------------------------------------ ----------------------------------
  `POST /api/v1/down-payments/{id}/settle`   `{amount_minor}`                                 `{intent_id, status: "SETTLED"}`

  `POST /api/v1/invoices/{id}/pay`           `{amount_minor}`                                 `{intent_id, status: "PAID"}`

  `POST /api/v1/refunds`                     `{original_intent_id, amount_minor, sub_type}`   `{intent_id}`

  `POST /api/v1/voids`                       `{original_intent_id, sub_type}`                 `{intent_id}`

  `POST /api/v1/scheduled`                   `{scheduled_at, ...}`                            `{intent_id}`

  `POST /api/v1/recurring`                   `{frequency, interval_count, ...}`               `{intent_id, schedule_id}`

  `POST /api/v1/bulk`                        `{items: [...]}`                                 `{batch_id, intent_ids}`

  `POST /api/v1/splits`                      `{total_amount, counterparty_id}`                `{intent_id, split_breakdown}`
  ------------------------------------------------------------------------------------------------------------------------------

### 5.3 Agent API (MCP Tools)

Tool MCP baru (selain yang sudah ada di 1.2): - `propose_sale` -
`propose_down_payment` - `pay_invoice` - `request_refund` -
`void_transaction` - `get_transaction_status` - `get_budget_status`

**Tidak ada tool** untuk approve/execute/cancel (hanya manusia).

------------------------------------------------------------------------

## 6. Eksekusi PayPal (Mapping Eksplisit)

### 6.1 SALE

    1. POST /v2/checkout/orders { intent: "CAPTURE", purchase_units: [...] }
    2. POST /v2/checkout/orders/{id}/capture
       → capture_id = response.purchase_units[0].payments.captures[0].id

### 6.2 DOWN_PAYMENT (initial)

    1. POST /v2/checkout/orders { intent: "AUTHORIZE", ... }
    2. POST /v2/payments/authorizations/{auth_id}/capture { amount: dp_amount }
       → authorization_id = response.purchase_units[0].payments.authorizations[0].id 

### 6.2b DOWN_PAYMENT (settlement)

    1. POST /v2/payments/authorizations/{auth_id}/capture { amount: settlement_amount }
       → capture_id

**Penting:** Authorization expires after 29 days. Settlement harus
dilakukan sebelum expiry .

### 6.3 INVOICE

    1. POST /v2/invoicing/invoices { detail, invoicer, primary_recipients, items }
       → invoice_id 
    2. POST /v2/invoicing/invoices/{id}/send 
    3. (Webhook) INVOICING.INVOICE.PAID → mark PAID

### 6.4 PAYOUT

    1. POST /v1/payments/payouts {
         sender_batch_header: { sender_batch_id: "jp_<intent_id>" },
         items: [{ recipient_type: "EMAIL", amount: {...}, receiver: "..." }]
       }
       → payout_batch_id 

### 6.5 REFUND

    1. POST /v2/payments/captures/{capture_id}/refund {
         amount: { value: "...", currency_code: "..." },
         note_to_payer: "..."
       }
       → refund_id 

### 6.6 VOID

    1. POST /v2/payments/authorizations/{auth_id}/void 

### 6.7 DISPUTE

    1. GET /v1/customer-disputes/{id} → status
    2. POST /v1/customer-disputes/{id}/provide-evidence { evidence } 
       ATAU
       POST /v1/customer-disputes/{id}/accept-claim 

### 6.8 RECURRING

    1. POST /v1/catalog/products { name, type: "SERVICE" } 
    2. POST /v1/billing/plans { product_id, billing_cycles } 
    3. POST /v1/billing/subscriptions { plan_id, subscriber } 

### 6.9 SPLIT

    1. Collect: POST /v2/checkout/orders + capture (total amount)
    2. Split: hitung platform_fee = total * platform_fee_bps / 10000
    3. Payout: POST /v1/payments/payouts ke payee (payee_share)

------------------------------------------------------------------------

## 7. Webhook Events (Mapping)

  ------------------------------------------------------------------------------------------
  Event                                      Kategori                Handler
  ------------------------------------------ ----------------------- -----------------------
  `PAYMENT.CAPTURE.COMPLETED`                SALE, DOWN_PAYMENT      Update status →
                                                                     COMPLETED

  `PAYMENT.CAPTURE.REFUNDED`                 REFUND                  Update status →
                                                                     COMPLETED

  `PAYMENT.PAYOUTS-ITEM.SUCCEEDED`           PAYOUT, BULK            Update status →
                                                                     COMPLETED

  `PAYMENT.PAYOUTS-ITEM.FAILED`              PAYOUT                  Update status → FAILED

  `INVOICING.INVOICE.PAID`                   INVOICE                 Update status → PAID

  `INVOICING.INVOICE.UPDATED`                INVOICE                 Update status → VIEWED

  `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED`   RECURRING               Update status → CHARGE

  `CUSTOMER.DISPUTE.CREATED`                 DISPUTE                 Create dispute record

  `CUSTOMER.DISPUTE.UPDATED`                 DISPUTE                 Update status
  ------------------------------------------------------------------------------------------

**Verifikasi tanda tangan webhook:** Wajib menggunakan
`verify-webhook-signature` atau implementasi mandiri dengan
`node:crypto` .

------------------------------------------------------------------------

## 8. Ledger Rules (Eksplisit per Kategori)

  Kategori       Sub-Type        DEBIT                          CREDIT
  -------------- --------------- ------------------------------ -----------------------------
  SALE           standard        buyer_account                  seller_account
  DOWN_PAYMENT   initial         buyer_account                  dp_escrow
  DOWN_PAYMENT   settlement      buyer_account                  seller_account
  DOWN_PAYMENT   forfeit         dp_escrow                      seller_account
  INVOICE        standard        buyer_account                  seller_account
  PAYOUT         standard        org_account                    payee_account
  REFUND         full/partial    seller_account                 buyer_account
  VOID           authorization   (no ledger --- release hold)   ---
  DISPUTE        chargeback      seller_account                 buyer_account
  PARTIAL        payment         buyer_account                  seller_account
  PARTIAL        refund          seller_account                 buyer_account
  SCHEDULED      payout/charge   (same as base category)        ---
  RECURRING      charge          subscriber_account             seller_account
  BULK           payout          org_account                    payee_account
  SPLIT          collect         buyer_account                  platform_escrow
  SPLIT          split           platform_escrow                platform_fee + payee_escrow
  SPLIT          payout          payee_escrow                   payee_account
  TRANSFER       p2p             sender_account                 receiver_account

**Trigger balanced wajib aktif. Tidak ada pengecualian.**

------------------------------------------------------------------------

## 9. SAR Extension (PRD 1.3 §3.1)

SAR untuk semua kategori menyertakan:

``` json
{
  "sar_version": "1.1",
  "category": "DOWN_PAYMENT",
  "sub_type": "initial",
  "legs_summary": {
    "total_debit": "20000",
    "total_credit": "20000",
    "accounts": ["buyer", "dp_escrow"]
  },
  "paypal_refs": {
    "authorization_id": "auth_...",
    "capture_id": null
  },
  ...
}
```

**Verifikasi SAR:** `SUM(DEBIT) = SUM(CREDIT)` dan cocok dengan
`intent.amount_minor`.

------------------------------------------------------------------------

## 10. UI Screens (Eksplisit)

  -----------------------------------------------------------------------------
  Rute                    Kategori                Komponen Kunci
  ----------------------- ----------------------- -----------------------------
  `/transactions`         Semua                   Tabel dengan filter category,
                                                  status; kolom: Date,
                                                  Category, Amount,
                                                  Counterparty, Status

  `/transactions/:id`     Semua                   Detail + timeline (state
                                                  transitions) + legs table
                                                  (double-entry) + SAR link

  `/transactions/new`     Semua                   Form dinamis: category
                                                  selector → sub_type selector
                                                  → fields sesuai kategori

  `/invoices`             INVOICE                 Daftar faktur, status pill
                                                  (ISSUED/SENT/PAID/OVERDUE),
                                                  tombol "Send"

  `/invoices/:id`         INVOICE                 Detail + tombol "Pay" (jika
                                                  buyer) atau "Send" (jika
                                                  seller)

  `/down-payments`        DOWN_PAYMENT            Progress bar (initial →
                                                  settlement → settled), tombol
                                                  "Settle"

  `/recurring`            RECURRING               Daftar langganan,
                                                  next_run_at, tombol "Cancel"

  `/splits`               SPLIT                   Breakdown: total, platform
                                                  fee, payee share
  -----------------------------------------------------------------------------

**Design tokens:** Mengikuti PRD 1.2 §12.2. Tidak ada nilai literal.

------------------------------------------------------------------------

## 11. Test Suite (Wajib Lulus)

### 11.1 Unit Tests

  --------------------------------------------------------------------------------
  Test                             Kategori                Assertion
  -------------------------------- ----------------------- -----------------------
  `test_sale_balanced`             SALE                    DEBIT = CREDIT

  `test_dp_initial_partial`        DOWN_PAYMENT            capture amount =
                                                           dp_amount

  `test_dp_settlement`             DOWN_PAYMENT            settlement ≤
                                                           authorized - dp

  `test_dp_forfeit`                DOWN_PAYMENT            dp_escrow → seller

  `test_refund_exceeds_original`   REFUND                  REJECT

  `test_refund_window_expired`     REFUND                  REJECT

  `test_partial_cumulative`        PARTIAL                 cumulative ≤ original

  `test_void_uncaptured`           VOID                    success

  `test_void_captured`             VOID                    REJECT

  `test_split_fee_calculation`     SPLIT                   fee = total \* bps /
                                                           10000

  `test_recurring_limit`           RECURRING               total ≤ maxMonthly
  --------------------------------------------------------------------------------

### 11.2 Integration Tests

  -----------------------------------------------------------------------
  Test                                Assertion
  ----------------------------------- -----------------------------------
  `test_sale_e2e`                     POST → EVALUATING → APPROVED →
                                      EXECUTING → COMPLETED

  `test_dp_e2e`                       DP initial → DP_PAID → settle →
                                      SETTLED

  `test_refund_e2e`                   Original SALE → REFUND → COMPLETED

  `test_invoice_e2e`                  Create → Send → Pay → PAID

  `test_payout_idempotent`            Same `sender_batch_id` → same
                                      result
  -----------------------------------------------------------------------

### 11.3 Concurrency Tests

  Test                         Assertion
  ---------------------------- ---------------------------
  `test_50_parallel_payouts`   No overshoot budget
  `test_duplicate_refund`      Only one refund processed
  `test_dp_settlement_race`    Only one settlement

------------------------------------------------------------------------

## 12. Rencana Kerja (Tier A: 80 jam)

  WP          Isi                                                Jam
  ----------- -------------------------------------------------- --------
  WP1         Skema data (semua tabel §2) + trigger balanced     8
  WP2         State machine per kategori (§3) + `transition()`   10
  WP3         Policy engine per kategori (§4)                    8
  WP4         Unified API + category endpoints (§5)              10
  WP5         Eksekusi PayPal mapping (§6)                       12
  WP6         Webhook handler (§7)                               6
  WP7         Ledger rules (§8) + SAR extension (§9)             6
  WP8         UI (§10)                                           10
  WP9         Test suite (§11)                                   10
  **Total**                                                      **80**

**Tier B (+40 jam):** SCHEDULED, RECURRING, BULK, SPLIT, TRANSFER.\
**Tier C (+30 jam):** FINANCING, DEBIT.

------------------------------------------------------------------------

## 13. Acceptance Criteria (Definition of Done)

1.  **8 kategori Tier A** dapat dibuat, dievaluasi, disetujui, dan
    dieksekusi end-to-end di PayPal Sandbox.
2.  **Double-entry balanced** untuk setiap intent (trigger DB aktif,
    test lulus).
3.  **State machine** per kategori ditegakkan (transisi ilegal → 409
    Conflict).
4.  **Policy engine** menolak kategori yang tidak di `allowedCategories`
    (`CATEGORY_NOT_ALLOWED`).
5.  **SAR** mencakup `category`, `sub_type`, `legs_summary`; verifikasi
    memeriksa balance.
6.  **Idempotency** per kategori: request duplikat → response sama,
    tanpa side effect ganda.
7.  **Rekonsiliasi** per kategori: `settlement_records` cocok dengan
    legs.
8.  **Backward compatible**: PAYOUT 1.2 tetap berfungsi tanpa perubahan.
9.  **UI** menampilkan semua kategori dengan form yang sesuai.
10. **Test suite** lulus 100% (unit + integration + concurrency).

------------------------------------------------------------------------

**Dokumen ini siap dieksekusi. Tidak ada field, state, atau aturan yang
"disiratkan" --- semua eksplisit. AI builder dapat mengimplementasikan
tanpa menebak.**
