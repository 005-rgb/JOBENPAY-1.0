# Baseline Audit Fakta Repositori PRD v1.2

Dokumen ini mencatat fakta teknis aktual repositori JOBENPAY (PRD v1.2) dengan rujukan `file:baris` presisi sesuai instruksi Work Packet BW-00.

---

## 1. Tabel Basis Data, Primary Key, Foreign Key & Indeks

### 1.1 `mandate_versions`
- **Berkas**: `server/migrations/003_mandates.sql:11-29`
- **PK**: `id uuid PRIMARY KEY DEFAULT ...`
- **Kolom**: `id`, `created_at`, `org_id`, `mandate_id`, `version`, `purpose_text`, `policy jsonb`, `policy_canonical text`, `policy_hash text`, `signature text`, `signing_kid text`, `activated_by uuid`, `activated_at timestamptz`, `valid_from timestamptz`, `valid_to timestamptz`, `prompt_version text`.
- **Constraint & Indeks**: `UNIQUE (mandate_id, version)` (`server/migrations/003_mandates.sql:28`), `CREATE INDEX idx_mandate_versions_org_mandate ON mandate_versions (org_id, mandate_id)` (`server/migrations/003_mandates.sql:33`).

### 1.2 `payment_requests`
- **Definisi Asli v1.2**: `server/migrations/005_requests_approvals.sql:1-22`
- **PK**: `id uuid PRIMARY KEY DEFAULT ...`
- **Kolom Asli**: `id`, `created_at`, `org_id`, `agent_id`, `mandate_version_id`, `action text CHECK (action IN ('PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'))`, `status text CHECK (status IN ('RECEIVED', 'EVALUATING', 'REJECTED', 'PENDING_APPROVAL', 'APPROVED', 'EXPIRED', 'CANCELLED', 'EXECUTING', 'EXECUTED', 'RECONCILED', 'MISMATCH', 'FAILED'))`, `amount_minor bigint CHECK (amount_minor > 0)`, `currency char(3)`, `payee_id uuid`, `target_ref text`, `document_id uuid`, `agent_reason text`, `agent_idempotency_key text`, `request_hash text`, `decision text CHECK (decision IN ('AUTO_APPROVE', 'REQUIRE_APPROVAL', 'REJECT'))`, `reason_codes text[]`, `risk_score integer`, `explanation text`.
- **Constraint**: `UNIQUE (agent_id, agent_idempotency_key)` (`server/migrations/005_requests_approvals.sql:21`).
- **Evolusi Universal (F3/AD-01)**: `server/migrations/021_f3_universal_transaction_schema.sql:318-355` mentransformasikan `payment_requests` menjadi VIEW kompatibel 100% di atas tabel `transaction_intents` dengan `INSTEAD OF TRIGGER` (`trg_payment_requests_view_io`, baris 358-471).

### 1.3 `request_evaluations`
- **Berkas**: `server/migrations/005_requests_approvals.sql:24-34`
- **PK**: `id uuid PRIMARY KEY DEFAULT ...`
- **Kolom**: `id`, `created_at`, `org_id`, `request_id uuid NOT NULL`, `stage text CHECK (stage IN ('A', 'B', 'C', 'D'))`, `result jsonb`, `ai_model text`, `prompt_version text`, `latency_ms integer`.
- **Indeks**: `CREATE INDEX idx_request_evaluations_org_request ON request_evaluations (org_id, request_id)` (`server/migrations/005_requests_approvals.sql:59`).

### 1.4 `approvals` & `approval_decisions`
- **Berkas**: `server/migrations/005_requests_approvals.sql:36-56`
- **PK `approvals`**: `id uuid PRIMARY KEY DEFAULT ...`
- **Kolom `approvals`**: `id`, `created_at`, `org_id`, `request_id uuid NOT NULL`, `status text`, `step_up_required boolean NOT NULL DEFAULT false`, `request_hash text`, `expires_at timestamptz`.
- **Indeks**: `CREATE INDEX idx_approvals_org_request ON approvals (org_id, request_id)` (`server/migrations/005_requests_approvals.sql:60`).
- **Tabel Keputusan**: `approval_decisions` (`id`, `created_at`, `org_id`, `approval_id uuid NOT NULL`, `decided_by uuid`, `decision text`, `comment text`, `step_up_grant_id uuid`).

### 1.5 `executions`
- **Berkas**: `server/migrations/006_execution_ledger.sql:1-13`
- **PK**: `id uuid PRIMARY KEY DEFAULT ...`
- **Kolom**: `id`, `created_at`, `org_id`, `request_id uuid NOT NULL`, `idempotency_id text`, `kind text`, `status text CHECK (status IN ('STARTED', 'SENT', 'SUCCEEDED', 'FAILED'))`, `paypal_ref text`, `http_status integer`, `response_redacted jsonb`, `attempts integer NOT NULL DEFAULT 0`.
- **Indeks**: `CREATE INDEX idx_executions_org_request ON executions (org_id, request_id)` (`server/migrations/006_execution_ledger.sql:51`).

### 1.6 `webhook_events`
- **Berkas**: `server/migrations/006_execution_ledger.sql:15-26`
- **PK**: `id uuid PRIMARY KEY DEFAULT ...`
- **Kolom**: `id`, `created_at`, `org_id`, `paypal_event_id text UNIQUE`, `event_type text`, `payload jsonb`, `verified boolean`, `status text`, `received_at timestamptz`, `processed_at timestamptz`.
- **Indeks**: `CREATE INDEX idx_webhook_events_org ON webhook_events (org_id, received_at)` (`server/migrations/006_execution_ledger.sql:52`).

### 1.7 `ledger_entries` & `ledger_heads`
- **Berkas**: `server/migrations/006_execution_ledger.sql:28-49`
- **PK `ledger_entries`**: `PRIMARY KEY (org_id, seq)` (`server/migrations/006_execution_ledger.sql:40`).
- **Kolom `ledger_entries`**: `org_id uuid NOT NULL`, `seq bigint NOT NULL`, `type text NOT NULL`, `subject_type text`, `subject_id uuid`, `payload jsonb`, `prev_hash text`, `entry_hash text NOT NULL`, `signature text`, `kid text`, `created_at timestamptz NOT NULL`.
- **Indeks**: `CREATE INDEX idx_ledger_entries_org_seq ON ledger_entries (org_id, seq)` (`server/migrations/006_execution_ledger.sql:53`).
- **Tabel Kepala Ledger**: `ledger_heads` (`server/migrations/006_execution_ledger.sql:43-49`, `PRIMARY KEY (org_id)` via migrasi 014).

---

## 2. Daftar Status & Reason Codes Aktual

### 2.1 Status Transaksi & Request
- **Status `payment_requests` (1.2)**: `RECEIVED`, `EVALUATING`, `REJECTED`, `PENDING_APPROVAL`, `APPROVED`, `EXPIRED`, `CANCELLED`, `EXECUTING`, `EXECUTED`, `RECONCILED`, `MISMATCH`, `FAILED`. (`server/migrations/005_requests_approvals.sql:8`).
- **Status `transaction_intents` (Universal Engine)**: `DRAFT`, `SUBMITTED`, `EVALUATING`, `NEEDS_APPROVAL`, `APPROVED`, `REJECTED`, `EXECUTING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`, `AWAITING_BUYER`, `UNDERWRITING`, `DISBURSED`, `REPAYING`, `SETTLED`, `DEFAULTED`, `ACTIVE`, `REVOKED`. (`shared/state-machines.js:10-52`).
- **Status `executions`**: `STARTED`, `SENT`, `SUCCEEDED`, `FAILED`. (`server/migrations/006_execution_ledger.sql:8`).
- **Status `mandates`**: `DRAFT`, `ACTIVE`, `SUSPENDED`, `REVOKED`, `EXPIRED`. (`server/migrations/003_mandates.sql:7`).

### 2.2 Error / Reason Codes
- **Berkas**: `shared/error-codes.js:1-43`
- **Daftar Kode Aktual**:
  - Deterministic Stage A: `ORG_FROZEN` (423), `AGENT_DISABLED` (403), `MANDATE_INACTIVE` (409), `MANDATE_EXPIRED` (410), `ACTION_NOT_ALLOWED` (403), `CURRENCY_NOT_ALLOWED` (422), `CAP_EXCEEDED` (422), `PAYEE_BLOCKED` (403), `TARGET_INVALID` (422), `PREFLIGHT_UNAVAILABLE` (503), `OUTSIDE_TIME_WINDOW` (409), `VELOCITY_EXCEEDED` (429), `DUPLICATE_SUSPECTED` (409), `INVOICE_REQUIRED` (422), `INVOICE_MISMATCH_AMOUNT` (422), `BUDGET_EXCEEDED` (422), `PAYEE_NOT_ALLOWED` (403).
  - Review / Stage B: `PAYEE_NEW` (409), `PAYEE_CHANGED` (409), `INVOICE_PAYEE_MISMATCH` (422), `AMOUNT_REQUIRES_APPROVAL` (422), `DOC_INJECTION_SUSPECTED` (422), `TIER_C_REQUIRES_APPROVAL` (422).
  - AI Stage C: `AI_HIGH_RISK` (422), `AI_INTENT_MISMATCH` (422), `AI_INJECTION_SUSPECTED` (422), `AI_ANOMALY` (422), `AI_UNAVAILABLE` (503).
  - Sistem & Autentikasi: `UNAUTHENTICATED` (401), `FORBIDDEN` (403), `VALIDATION_FAILED` (400), `NOT_FOUND` (404), `RATE_LIMITED` (429), `IDEMPOTENCY_CONFLICT` (409), `STEP_UP_REQUIRED` (401), `REGISTRATION_DISABLED` (403), `EMAIL_NOT_VERIFIED` (403), `TOKEN_INVALID_OR_EXPIRED` (400), `GOOGLE_AUTH_FAILED` (401), `UNSUPPORTED_MEDIA_TYPE` (415), `INTERNAL` (500).

---

## 3. Skema Policy Aktual (`shared/policy.schema.js:23-74`)
- `schemaVersion`: `z.literal(1)`
- `purpose`: `z.string().trim().min(1)`
- `allowedActions`: `z.array(z.enum(['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'])).min(1)`
- `currency`: `z.string().regex(/^[A-Z]{3}$/)`
- `perTransactionCapMinor`: Safe integer minor
- `budget`: `{ period: 'MONTH', limitMinor: Safe integer minor }`
- `autoApproveBelowMinor`: Safe integer minor
- `payees`: `{ mode: 'ALLOWLIST', ids: z.array(UUID) }`
- `allowNewPayees`: `z.boolean()`
- `schedule`: `{ timezone, days: array 1..7, startHour: 0..23, endHour: 1..24 }`
- `velocity`: `{ maxRequestsPerHour, maxPayoutPerPayeePerDay }`
- `duplicateWindowHours`: Safe integer minor
- `requireInvoice`: `z.boolean()`
- `invoiceAmountToleranceMinor`: Safe non-negative integer minor
- `ai`: `{ intentCheck: boolean, escalateOnRiskAtOrAbove: 0..100, blockOnRiskAtOrAbove: 0..100 }`
- `stepUpApprovalAboveMinor`: Safe integer minor
- `fourEyesAboveMinor`: Safe integer minor
- `approvalTtlHours`: Safe integer minor
- `validFrom`: UTC ISO string
- `validTo`: UTC ISO string

---

## 4. Enum Action, Request Hash & Alur Evaluasi (D5 & D18)

### 4.1 Enum Action
`['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE']` (`server/migrations/005_requests_approvals.sql:7`, `shared/policy.schema.js:26`).

### 4.2 Format `request_hash` (D5)
- **Berkas**: `server/src/services/requestHash.js:5-27`
- **Algoritme**: SHA-256 dari JSON kanonik (`canonicalJson`) atas payload:
```javascript
{
  orgId,
  agentId,
  mandateVersionId,
  action,
  amountMinor: BigInt(amountMinor).toString(),
  currency,
  payeeId,
  targetRef: null,
  documentSha256
}
```

### 4.3 Alur Evaluasi D18
- **Berkas**: `server/src/services/decision/engine.js:40-98`
- **Sifat**: **Sinkron** di dalam transaksi database request submission (`POST /api/v1/agent/v1/requests` atau `POST /api/v1/transactions`).
- **Urutan**:
  1. `RULES_A` (Stage A - Deterministic Hard Checks A1–A13). Bila ada kegagalan → keputusan `REJECT`.
  2. `FLAGS_B` (Stage B - Risk Indicators). Bila terpicu atau `amount >= autoApproveBelowMinor` → keputusan `REQUIRE_APPROVAL`.
  3. `Stage C` (AI Policy Intent Check) bila diaktifkan dalam mandat. AI hanya boleh **memperketat** (`combineDecisions`, baris 13-29); bila model AI gagal atau mendeteksi risiko tinggi → fail-closed ke `REQUIRE_APPROVAL` atau `REJECT`.

### 4.4 Penanganan REFUND & ACCEPT_DISPUTE Saat Ini
- Di v1.2, `REFUND` dan `ACCEPT_DISPUTE` dieksekusi melalui `payment_requests` dengan `action='REFUND'` / `'ACCEPT_DISPUTE'`.
- Di Universal Engine PRD 1.3, keduanya dipetakan ke kategori resmi: `REFUND` (sub-tipe `full`, `partial`) dan `DISPUTE` (sub-tipe `respond`, `accept_claim`, `provide_evidence`) dengan state machine, rules, dan journal legs terdedikasi.

---

## 5. Integrasi & Keamanan (MCP, Idempotensi, Rate Limit, RLS, Env Flags)

### 5.1 Endpoint & Tool MCP Aktual
- **Berkas**: `server/src/mcp/tools.js` & `server/src/agent/mcp.js`
- **Protokol**: MCP JSON-RPC 2.0 (Modern 2026-07-28 & Legacy 2025-11-25).
- **Alat Proposal (Agent Only)**: `propose_payout`, `propose_sale`, `propose_refund`, `propose_void`, `propose_partial`, `propose_down_payment`, `propose_invoice`, `propose_dispute`, `propose_scheduled`, `propose_bulk`, `propose_transfer`, `propose_split`, `propose_recurring`, `propose_financing`, `propose_debit`.
- **Alat Baca**: `get_request_status`, `get_budget_status`.
- **Batas Keras**: AI Agen TIDAK memiliki akses ke tool `approve`, `execute`, atau `cancel`.

### 5.2 Mekanisme Idempotensi
- **Agent API**: Header `Idempotency-Key` (atau field body `idempotencyKey`). Constraint basis data: `UNIQUE(agent_id, agent_idempotency_key)` di `payment_requests` dan `UNIQUE(org_id, idempotency_key)` di `transaction_intents`. Pengiriman ulang dengan kunci sama dan payload sama mengembalikan respons 200 identik; payload berbeda mengembalikan 422 `IDEMPOTENCY_KEY_REUSED`.
- **PayPal Provider**: Header `PayPal-Request-Id` diturunkan secara deterministik dengan format `jp_{intent_id}_{step}` per AD-05. Payout batch header memakai `jp_{intent_id}` tanpa suffix untuk kompatibilitas v1.2.

### 5.3 Penyimpanan Rate Limit
- **Berkas**: `server/src/repositories/rateLimit.js:4-21`
- **Penyimpanan**: Tabel database PostgreSQL `rate_limit_buckets` dengan kueri upsert atomik `INSERT INTO rate_limit_buckets (key, window_start, count) VALUES ($1, $2, 1) ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limit_buckets.count + 1`. Window time dihitung berbasis detik (`Math.floor(Date.now() / 1000 / windowSec) * windowSec * 1000`).

### 5.4 Keberadaan RLS (Row Level Security)
- Database saat ini tidak menggunakan deklarasi SQL `ENABLE ROW LEVEL SECURITY`.
- Isolasi multi-tenant ditegakkan secara absolut pada lapisan repository (`TenantRepository` / `orgId` wajib di seluruh kueri SQL), parameter binding, dan divalidasi oleh suite uji IDOR terotomasi `server/test/integration/idor-routes.test.js`.

### 5.5 Konstanta Flag Environment (`server/src/config.js:33-63`)
- `NODE_ENV`: `'development' | 'test' | 'production'`
- `PORT`: default 3000
- `DATABASE_URL`: URL PostgreSQL
- `TEST_DATABASE_URL`: URL PostgreSQL khusus testing
- `PUBLIC_BASE_URL`: Base URL aplikasi
- `AI_PROVIDER`: `'anthropic' | 'openai' | 'replay'`
- `AI_DAILY_BUDGET_USD`: Batas anggaran harian AI
- `REGISTRATION_ENABLED`: Flag pendaftaran mandiri (0 / 1)
- `WORKER_ENABLED`: Flag background worker job queue (0 / 1)
- `JOBENPAY_ENC_KEY`: Kunci AES-256-GCM 32-byte
- `JOBENPAY_LEDGER_SIGNING_KEY`: Kunci privat Ed25519 PKCS8 untuk penandatanganan ledger
- `JOBENPAY_HMAC_PEPPER`: Pepper HMAC 32-byte untuk hash identitas payee

---

## 6. Metrik Baseline Hasil Uji Otomatis (BW-00)

- **Total Test Lulus**: **952 / 952** (0 gagal, 0 di-skip).
  - Main Test Suite: 951 subtest lulus.
  - Final Ledger Security Test: 1 test (8 organisasi, verifikasi hash chain lengkap, 6/6 tamper classes terdeteksi).
  - Golden Characterization Tests (`test/characterization/characterization.test.js`): 30/30 skenario lulus (A1–A13, B1–B5, Stage C fail-closed monotonik, double-entry, SAR, idempotensi).
- **Pagar CI**:
  - `scripts/guard.js`: LULUS (arsitektur, lisensi MIT, 10 bagian README, isolasi tenant 45 tabel, guard karakterisasi >= 25 golden).
  - `scripts/check-tenant-isolation.js`: LULUS (45/45 tabel ber-`org_id` memiliki index/PK `org_id`).
  - `scripts/guard-characterization.js`: LULUS (30 golden tests berstatus frozen).
  - `scripts/lint-no-float-money.js`: LULUS (0 float/Number pada moneter).
  - `scripts/check-traceability.js`: LULUS (135/135 ID status done).
  - `scripts/check-insert-tests.js`: LULUS (36 CHECK + 3 UNIQUE teruji valid/invalid).
  - `scripts/check-tests-from-data.js`: LULUS.
  - `scripts/secret-scan.js`: LULUS.
  - `server/test/unit/ci-guards-negative.test.js`: 4/4 tes negatif lulus membuktikan kegagalan pada pelanggaran.
- **Fixture Database**: `server/test/fixtures/v12-snapshot.sql` terverifikasi (35.161 bytes).

