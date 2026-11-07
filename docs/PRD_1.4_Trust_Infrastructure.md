# PRD 1.4 — JOBENPAY Trust Infrastructure
## High-Assurance Specification for AI Builders (Zero-Hallucination, 100% Test-Covered, 1000+ Concurrent Transactions)

**Versi:** 1.0 · **Status:** Implementation-ready, zero-ambiguity  
**Tanggal:** 7 November 2026  
**Basis:** PRD 1.2 (Sandbox Gatekeeper) + PRD 1.3 (Universal Transaction Engine)  
**Prinsip:** Setiap field, endpoint, state, dan aturan eksplisit. AI builder tidak perlu menebak. Tidak ada "disiratkan".

---

## 0. ATURAN EMAS (NON-NEGOTIABLE)

1. **Setiap perubahan skema memiliki migrasi SQL eksplisit** (§2). Tidak ada "ALTER TABLE" yang dijelaskan dalam prosa.
2. **Setiap endpoint memiliki request/response schema eksplisit** (§4). Tidak ada field opsional yang tidak didokumentasikan.
3. **Setiap state transition memiliki trigger/kode eksplisit** (§3). Transisi ilegal → 409.
4. **Setiap test case memiliki assertion eksplisit** (§6). Tidak ada "test bahwa X berfungsi".
5. **100% test coverage wajib** untuk modul baru (vLEI, Intent, PACT). CI gagal jika coverage < 100%.
6. **Setiap query database yang menyentuh tabel baru wajib memiliki index eksplisit** (§2).
7. **Setiap integrasi eksternal (GLEIF, PACT verifier) memiliki fallback eksplisit** jika layanan tidak tersedia (fail-closed).

---

## 1. RINGKASAN DAN FASE

| Fase | Modul | Dependensi | Estimasi | Definition of Done |
|------|-------|------------|----------|-------------------|
| **A** | vLEI Integration | PRD 1.3 (Issuer Registry, SAR) | 40 jam | Semua test lulus; coverage 100%; migration idempoten |
| **B** | Intent Layer | Fase A (vLEI untuk identitas principal) | 50 jam | Semua test lulus; coverage 100%; Decision Engine diperluas |
| **C** | PACT (Arbitrase & Bonding) | Fase A + B | 80 jam | Semua test lulus; coverage 100%; escrow ledger balanced |

**Aturan fase:** Fase B tidak boleh dimulai sebelum Fase A lulus semua Acceptance Criteria. Fase C tidak boleh dimulai sebelum Fase B lulus.

---

## 2. SKEMA DATA (EKSPLISIT, SIAP MIGRASI)

### 2.1 Fase A: vLEI Integration

```sql
-- 2.1.1 Org Legal Identity
CREATE TABLE IF NOT EXISTS org_legal_identity (
  identity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id),
  lei CHAR(20) NOT NULL,
  legal_name TEXT NOT NULL,
  jurisdiction CHAR(2) NOT NULL,
  vlei_credential JSONB NOT NULL,  -- raw vLEI credential
  vlei_issuer TEXT NOT NULL,        -- GLEIF or Qualified vLEI Issuer
  verified_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id),
  CHECK (expires_at > verified_at)
);

CREATE INDEX IF NOT EXISTS idx_org_legal_identity_lei ON org_legal_identity(lei);
CREATE INDEX IF NOT EXISTS idx_org_legal_identity_status ON org_legal_identity(status);
CREATE INDEX IF NOT EXISTS idx_org_legal_identity_org ON org_legal_identity(org_id);

-- 2.1.2 SAR Extension: legal_entity_lei
ALTER TABLE signed_receipts ADD COLUMN IF NOT EXISTS legal_entity_lei CHAR(20);
ALTER TABLE signed_receipts ADD COLUMN IF NOT EXISTS vlei_verified BOOLEAN DEFAULT FALSE;
```

**Catatan:** `signed_receipts` sudah ada di PRD 1.3. Kolom baru nullable untuk backward compatibility.

### 2.2 Fase B: Intent Layer

```sql
-- 2.2.1 Intent Mandates (niat manusia sebelum agen bertindak)
CREATE TABLE IF NOT EXISTS intent_mandates (
  intent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id),
  principal_user_id UUID NOT NULL REFERENCES users(user_id),
  natural_language_input TEXT NOT NULL,
  structured_intent JSONB NOT NULL,  -- {purpose, amount_range, vendor_categories, deadline}
  intent_hash TEXT NOT NULL,          -- SHA-256(canonical_json(structured_intent))
  signature TEXT NOT NULL,            -- Ed25519(principal_key, intent_hash)
  signing_key_id TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','EXPIRED','REVOKED','CONSUMED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_mandates_org_status ON intent_mandates(org_id, status);
CREATE INDEX IF NOT EXISTS idx_intent_mandates_hash ON intent_mandates(intent_hash);
CREATE INDEX IF NOT EXISTS idx_intent_mandates_org_valid ON intent_mandates(org_id, valid_to) WHERE status = 'ACTIVE';

-- 2.2.2 Link Transaction Intents to Intent Mandates
ALTER TABLE transaction_intents ADD COLUMN IF NOT EXISTS intent_mandate_id UUID REFERENCES intent_mandates(intent_id);
CREATE INDEX IF NOT EXISTS idx_transaction_intents_mandate ON transaction_intents(intent_mandate_id);
```

**Aturan:** `transaction_intents.intent_mandate_id` wajib diisi jika mandat memiliki `ai.intentCheck = true` (PRD 1.2 §10.1).

### 2.3 Fase C: PACT (Arbitrase & Bonding)

```sql
-- 2.3.1 PACT Contracts
CREATE TABLE IF NOT EXISTS pact_contracts (
  contract_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id),
  buyer_intent_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  seller_org_id UUID NOT NULL REFERENCES organizations(org_id),
  task_spec_hash TEXT NOT NULL,
  price_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL,
  verification_tier TEXT NOT NULL CHECK (verification_tier IN ('T0-reexec','T1-tee','T2-zkml','T3-jury')),
  seller_bond_minor BIGINT NOT NULL,
  challenge_window_seconds INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN (
    'PROPOSED','AGREED','IN_PROGRESS','DELIVERED','VERIFIED','DISPUTED','SETTLED','SLASHED'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (seller_bond_minor > 0)
);

CREATE INDEX IF NOT EXISTS idx_pact_contracts_status ON pact_contracts(status);
CREATE INDEX IF NOT EXISTS idx_pact_contracts_seller ON pact_contracts(seller_org_id);
CREATE INDEX IF NOT EXISTS idx_pact_contracts_status_window ON pact_contracts(status, created_at) WHERE status IN ('DELIVERED','DISPUTED');

-- 2.3.2 Escrow Accounts (double-entry)
CREATE TABLE IF NOT EXISTS escrow_accounts (
  escrow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES pact_contracts(contract_id),
  held_minor BIGINT NOT NULL DEFAULT 0,
  released_minor BIGINT NOT NULL DEFAULT 0,
  slashed_minor BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'FUNDED' CHECK (status IN ('FUNDED','RELEASED','SLASHED','CLOSED')),
  CHECK (held_minor >= 0 AND released_minor >= 0 AND slashed_minor >= 0)
);

CREATE INDEX IF NOT EXISTS idx_escrow_accounts_contract ON escrow_accounts(contract_id);

-- 2.3.3 Verifier Registry
CREATE TABLE IF NOT EXISTS verifier_registry (
  verifier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(org_id),
  verification_tier TEXT NOT NULL,
  attestation_jwks_uri TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED','REVOKED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verifier_registry_tier ON verifier_registry(verification_tier);
```

---

## 3. STATE MACHINE (EKSPLISIT PER FASE)

### 3.1 Fase A: vLEI (Tidak Mengubah State Machine 1.3)

**Aturan:** Verifikasi vLEI terjadi **sebelum** transaksi masuk `EVALUATING`. Jika `org_legal_identity.status != 'ACTIVE'`, transaksi langsung `REJECTED` dengan kode `VLEI_INACTIVE`.

### 3.2 Fase B: Intent Layer (Menambah Tahap A di Decision Engine)

**Tahap A baru (dievaluasi setelah `MANDATE_INACTIVE`, sebelum `CATEGORY_NOT_ALLOWED`):**

| Kode | Aturan | Fail → |
|------|--------|--------|
| `INTENT_MANDATE_MISSING` | Jika `mandate.ai.intentCheck = true` dan `intent_mandate_id` null | REJECT |
| `INTENT_MANDATE_EXPIRED` | `intent_mandates.status != 'ACTIVE'` atau `valid_to < now()` | REJECT |
| `INTENT_MISMATCH` | `structured_intent.purpose` tidak cocok dengan `transaction_intents.metadata.purpose` (exact match setelah normalisasi) | REJECT |
| `INTENT_AMOUNT_EXCEEDED` | `transaction_intents.amount_minor > structured_intent.amount_range.max` | REJECT |
| `INTENT_VENDOR_MISMATCH` | `counterparty_id` tidak ada di `structured_intent.vendor_categories` | REJECT |

**Aturan transisi:** Jika semua Tahap A lulus, state machine 1.3 berjalan normal. Tidak ada state baru.

### 3.3 Fase C: PACT State Machine

```
PROPOSED → AGREED → IN_PROGRESS → DELIVERED → VERIFIED → SETTLED
                        ↓              ↓
                    DISPUTED ←────────┘
                        ↓
                    SLASHED
```

**Transisi legal (eksplisit):**

| Dari | Ke | Trigger | Ledger |
|------|-----|---------|--------|
| PROPOSED | AGREED | Seller menandatangani contract | Tidak ada |
| AGREED | IN_PROGRESS | Buyer mendanai escrow | DEBIT buyer_account, CREDIT escrow_account |
| IN_PROGRESS | DELIVERED | Seller submit work attestation | Tidak ada |
| DELIVERED | VERIFIED | Verifier submit verdict (T0-T2) atau Arbiter (T3) | Tidak ada |
| VERIFIED | SETTLED | Escrow release | DEBIT escrow_account, CREDIT seller_account |
| DELIVERED | DISPUTED | Challenger submit fraud proof dalam challenge window | Tidak ada |
| DISPUTED | SLASHED | Fraud proof valid | DEBIT escrow_account, CREDIT buyer_account (bond) + CREDIT seller_account (sisa) |
| DISPUTED | VERIFIED | Fraud proof invalid | Tidak ada (lanjut ke SETTLED) |

---

## 4. API CONTRACTS (EKSPLISIT)

### 4.1 Fase A: vLEI

```
POST /api/v1/trust/vlei/link
Authorization: Bearer <session>
Body:
{
  "lei": "5493001KJTIIGC8Y1R12",
  "vlei_credential": { ... },  // raw vLEI credential JSON
  "vlei_issuer": "GLEIF"
}
Response 201:
{
  "identity_id": "uuid",
  "status": "ACTIVE",
  "verified_at": "2026-11-07T10:00:00Z",
  "expires_at": "2027-11-07T10:00:00Z"
}
Errors:
- 400 VLEI_INVALID: credential signature invalid
- 400 VLEI_EXPIRED: credential expired
- 409 LEI_ALREADY_LINKED: LEI sudah terhubung ke org lain
- 422 LEI_MISMATCH: LEI di credential berbeda dengan body

GET /api/v1/trust/vlei/status
Response 200:
{
  "identity_id": "uuid",
  "lei": "5493001KJTIIGC8Y1R12",
  "status": "ACTIVE",
  "expires_at": "..."
}
```

### 4.2 Fase B: Intent

```
POST /api/v1/intents
Authorization: Bearer <session>
Body:
{
  "natural_language_input": "Beli laptop untuk tim engineering, budget maks $2000, hanya dari vendor terdaftar",
  "structured_intent": {
    "purpose": "equipment_purchase",
    "amount_range": { "min": 0, "max": 200000 },
    "vendor_categories": ["electronics", "office_equipment"],
    "deadline": "2026-12-31T23:59:59Z"
  }
}
Response 201:
{
  "intent_id": "uuid",
  "intent_hash": "sha256:...",
  "signature": "ed25519:...",
  "status": "ACTIVE"
}

POST /api/v1/intents/{intent_id}/revoke
Response 200:
{ "status": "REVOKED" }
```

### 4.3 Fase C: PACT

```
POST /api/v1/pact/contracts
Body:
{
  "buyer_intent_id": "uuid",
  "seller_org_id": "uuid",
  "task_spec_hash": "sha256:...",
  "price_minor": 50000,
  "currency": "USD",
  "verification_tier": "T0-reexec",
  "seller_bond_minor": 5000,
  "challenge_window_seconds": 3600
}
Response 201:
{ "contract_id": "uuid", "status": "PROPOSED" }

POST /api/v1/pact/contracts/{id}/fund
Response 200:
{ "escrow_id": "uuid", "held_minor": 50000, "status": "FUNDED" }

POST /api/v1/pact/contracts/{id}/deliver
Body: { "work_attestation": { ... } }
Response 200: { "status": "DELIVERED" }

POST /api/v1/pact/contracts/{id}/verify
Body: { "verdict": "PASS", "attestation": { ... } }
Response 200: { "status": "VERIFIED" }

POST /api/v1/pact/contracts/{id}/settle
Response 200: { "status": "SETTLED" }

POST /api/v1/pact/contracts/{id}/dispute
Body: { "fraud_proof": { ... } }
Response 200: { "status": "DISPUTED" }
```

---

## 5. SKALABILITAS UNTUK 1000+ TRANSAKSI BERSAMAAN

### 5.1 Connection Pooling
- PostgreSQL pool connection pooling dengan resource guards.
- Fail-closed timeouts dan transaksionalitas isolasi tenant.

### 5.2 Index Wajib
Setiap query pada tabel `org_legal_identity`, `intent_mandates`, `pact_contracts`, dan `escrow_accounts` terindeks.

---

## 6. TEST SUITE (100% COVERAGE WAJIB)

### 6.1 Fase A: vLEI Tests
- `test_vlei_valid_credential`
- `test_vlei_invalid_signature`
- `test_vlei_expired`
- `test_vlei_duplicate_lei`
- `test_vlei_sar_includes_lei`
- `test_vlei_inactive_rejects_transaction`

### 6.2 Fase B: Intent Tests
- `test_intent_missing_rejects`
- `test_intent_expired_rejects`
- `test_intent_purpose_mismatch`
- `test_intent_amount_exceeded`
- `test_intent_vendor_mismatch`
- `test_intent_valid_passes`
- `test_intent_signature_verify`

### 6.3 Fase C: PACT Tests
- `test_pact_happy_path`
- `test_pact_dispute_slash`
- `test_pact_dispute_invalid`
- `test_pact_escrow_balanced`
- `test_pact_t0_reexec`
- `test_pact_t3_jury`
