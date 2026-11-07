# PERFECT PROMPT — PRD 1.4 Trust Infrastructure
## Zero-Hallucination Build Prompt untuk AI Builder

**Versi:** 1.0  
**Target:** AI Builder (Replit / Cursor / Claude Code)  
**Filosofi:** Setiap langkah eksplisit, setiap file eksplisit, setiap test eksplisit. Tidak ada ruang untuk menebak.  
**Cara pakai:** Simpan sebagai `docs/prompts/BUILD_PRD_1_4.md`. Tempel ke AI builder per fase.

---

## 0. ATURAN GLOBAL (WAJIB DIBACA SEBELUM MULAI)

```markdown
# ATURAN MUTLAK — PELANGGARAN = BUILD GAGAL

1. Baca HANYA file yang dirujuk prompt. Jangan membaca seluruh repo.
2. Jangan menebak nama file, tabel, kolom, endpoint, atau fungsi. Verifikasi dengan `ls` dan `grep` sebelum menulis kode.
3. Jika ada yang tidak jelas: TULIS pertanyaan di `docs/PROGRESS.md` bagian "Blockers" dan BERHENTI. Jangan mengasumsikan.
4. Satu langkah = satu commit. Commit message: `feat(prd-1.4-fase-X): <deskripsi>`.
5. Test adalah hakim. Selesai bila semua test di fase tersebut hijau.
6. Coverage 100% untuk modul baru. CI gagal jika < 100%.
7. Jangan mengerjakan fase berikutnya sebelum fase saat ini DONE.
8. Jangan mengubah test lama kecuali spesifikasi berubah. Jika diubah, beri label `test-changed` + alasan.
9. Jangan commit rahasia (API key, password, token).
10. Gunakan `node:crypto` untuk kriptografi. Jangan bikin algoritma sendiri.
11. Semua error menggunakan `AppError` dengan kode eksplisit.
12. Tidak ada `console.log` di kode produksi. Gunakan `logger`.
13. Fail-closed: jika integrasi eksternal (GLEIF, verifier) tidak tersedia → tolak, bukan izinkan.
14. Migrasi wajib `IF NOT EXISTS` dan idempoten.
15. Setiap query baru wajib memiliki index. Test dengan `EXPLAIN ANALYZE` — jika `Seq Scan` muncul, test gagal.
```

---

## 1. STRUKTUR FILE YANG HARUS DIBACA

AI builder **hanya boleh membaca** file berikut, sesuai fase:

### Fase A (vLEI)
- `docs/PRD_1.4_Trust_Infrastructure.md` — **hanya §2.1, §3.1, §4.1, §6.1, §7 (Fase A), §8**
- `docs/PRD_1.3_Universal_Transaction_Engine.md` — **hanya §2.1 (transaction_intents), §9 (SAR extension)**
- `docs/PRD_1.2_Sandbox_Gatekeeper.md` — **hanya §10 (model data), §13.2 (enkripsi)**
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

### Fase B (Intent)
- `docs/PRD_1.4_Trust_Infrastructure.md` — **hanya §2.2, §3.2, §4.2, §6.2, §7 (Fase B)**
- `docs/PRD_1.2_Sandbox_Gatekeeper.md` — **hanya §10.1 (policy schema)**
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`

### Fase C (PACT)
- `docs/PRD_1.4_Trust_Infrastructure.md` — **hanya §2.3, §3.3, §4.3, §6.3, §6.4, §7 (Fase C)**
- `docs/PRD_1.3_Universal_Transaction_Engine.md` — **hanya §2.1 (transaction_legs), §8 (ledger rules)**
- `docs/DECISIONS.md`
- `docs/PROGRESS.md`


---

## 2. PROMPT PEMBUKA — FASE A (vLEI)

```markdown
# PROMPT PEMBUKA — FASE A: vLEI Integration

Baca file berikut (HANYA ini):
1. docs/PRD_1.4_Trust_Infrastructure.md — hanya §2.1, §3.1, §4.1, §6.1, §7 (Fase A), §8
2. docs/PRD_1.3_Universal_Transaction_Engine.md — hanya §2.1, §9
3. docs/PRD_1.2_Sandbox_Gatekeeper.md — hanya §10, §13.2
4. docs/DECISIONS.md
5. docs/PROGRESS.md

## Tugas: Kerjakan FASE A (vLEI Integration) — WP1 sampai WP6

### WP1 — Migrasi Database
Buat file: `server/migrations/020_vlei.sql`
Isi persis seperti PRD 1.4 §2.1:
- CREATE TABLE IF NOT EXISTS org_legal_identity (...)
- ALTER TABLE signed_receipts ADD COLUMN IF NOT EXISTS legal_entity_lei CHAR(20)
- ALTER TABLE signed_receipts ADD COLUMN IF NOT EXISTS vlei_verified BOOLEAN DEFAULT FALSE
- CREATE INDEX IF NOT EXISTS idx_org_legal_identity_lei
- CREATE INDEX IF NOT EXISTS idx_org_legal_identity_status
- CREATE INDEX IF NOT EXISTS idx_org_legal_identity_org

Verifikasi: jalankan `npm run migrate` 2x → exit 0 (idempoten).

### WP2 — Service Layer
Buat file: `server/src/services/vlei_service.js`
Fungsi wajib:
- `linkVlei(orgId, body)` → validasi schema, verifikasi signature Ed25519, cek expiry, cek LEI unik, INSERT, return
- `getVleiStatus(orgId)` → SELECT
- `hasActiveVlei(orgId)` → SELECT 1 WHERE status='ACTIVE' AND expires_at > now()

Setiap error gunakan `AppError` dengan kode: `VLEI_INVALID`, `VLEI_EXPIRED`, `LEI_ALREADY_LINKED`, `LEI_MISMATCH`.

### WP3 — Controller Layer
Buat file: `server/src/controllers/vlei_controller.js`
Fungsi:
- `postVleiLink(req, res, next)` → panggil `linkVlei`, return 201
- `getVleiStatusHandler(req, res, next)` → panggil `getVleiStatus`, return 200

### WP4 — Route Registration
Buat file: `server/src/routes/trust.js`
- `router.post('/vlei/link', requireSession, requireRole('OWNER','ADMIN'), postVleiLink)`
- `router.get('/vlei/status', requireSession, getVleiStatusHandler)`
Daftarkan di `server/src/server.js`: `app.use('/api/v1/trust', trustRouter)`

### WP5 — Decision Engine Integration
Modifikasi `server/src/services/decision_engine.js`:
Tambahkan Tahap A baru SETELAH `MANDATE_INACTIVE`, SEBELUM `CATEGORY_NOT_ALLOWED`:
```javascript
if (!(await hasActiveVlei(orgId))) {
  return { decision: 'REJECT', reason_codes: ['VLEI_INACTIVE'] };
}
```

### WP6 — SAR Extension
Modifikasi `server/src/services/sar_builder.js`:
```javascript
const vlei = await getVleiStatus(orgId);
if (vlei && vlei.status === 'ACTIVE') {
  sar.legal_entity_lei = vlei.lei;
  sar.vlei_verified = true;
}
```

### WP7 — Test Suite
Buat file test:
- `server/test/unit/vlei_service.test.js` — 6 test (test_vlei_valid_credential, test_vlei_invalid_signature, test_vlei_expired, test_vlei_duplicate_lei, test_vlei_sar_includes_lei, test_vlei_inactive_rejects_transaction)
- `server/test/integration/vlei_api.test.js` — 3 test (POST 201, POST 400, GET 200)
- `server/test/concurrency/vlei_concurrency.test.js` — 1 test (100 parallel link)

### WP8 — Coverage Configuration
Modifikasi `package.json`:
```json
"test:coverage": "c8 --check-coverage --lines 100 --functions 100 --branches 100 --statements 100 --include 'server/src/services/vlei_service.js' --include 'server/src/controllers/vlei_controller.js' node --test server/test/"
```

## URUTAN EKSEKUSI (WAJIB BERURUTAN)
1. WP1 → commit `feat(prd-1.4-fase-A): add vlei migration`
2. WP2 → commit `feat(prd-1.4-fase-A): add vlei service`
3. WP3 → commit `feat(prd-1.4-fase-A): add vlei controller`
4. WP4 → commit `feat(prd-1.4-fase-A): register vlei routes`
5. WP5 → commit `feat(prd-1.4-fase-A): integrate vlei in decision engine`
6. WP6 → commit `feat(prd-1.4-fase-A): extend SAR with vlei`
7. WP7 → commit `test(prd-1.4-fase-A): add vlei tests`
8. WP8 → commit `chore(prd-1.4-fase-A): coverage config`
9. Update `docs/PROGRESS.md` → commit `docs(prd-1.4-fase-A): mark fase A done`

## DEFINITION OF DONE (FASE A)
Fase A selesai HANYA jika:
- [ ] `npm run migrate` 2x → exit 0
- [ ] `npm run test:coverage` → 100% lines, functions, branches, statements
- [ ] 6 unit test lulus
- [ ] 3 integration test lulus
- [ ] 1 concurrency test lulus (100 parallel, 0 duplicate)
- [ ] Decision Engine menolak transaksi jika vLEI tidak ACTIVE
- [ ] SAR untuk org dengan vLEI ACTIVE memiliki `legal_entity_lei` dan `vlei_verified=true`
- [ ] Tidak ada `console.log` di kode baru
- [ ] Semua error menggunakan `AppError`
- [ ] `docs/PROGRESS.md` diupdate: Fase A → DONE
```


---

## 3. PROMPT PEMBUKA — FASE B (Intent Layer)

```markdown
# PROMPT PEMBUKA — FASE B: Intent Layer

Baca file berikut (HANYA ini):
1. docs/PRD_1.4_Trust_Infrastructure.md — hanya §2.2, §3.2, §4.2, §6.2, §7 (Fase B)
2. docs/PRD_1.2_Sandbox_Gatekeeper.md — hanya §10.1 (policy schema)
3. docs/DECISIONS.md
4. docs/PROGRESS.md

## PRASYARAT
Fase A harus DONE. Jika belum, BERHENTI dan baca prompt Fase A.

## Tugas: Kerjakan FASE B (Intent Layer) — WP1 sampai WP7

### WP1 — Migrasi Database
Buat file: `server/migrations/021_intent.sql`
Isi persis seperti PRD 1.4 §2.2:
- CREATE TABLE IF NOT EXISTS intent_mandates (...)
- CREATE INDEX IF NOT EXISTS idx_intent_mandates_org_status
- CREATE INDEX IF NOT EXISTS idx_intent_mandates_hash
- CREATE INDEX IF NOT EXISTS idx_intent_mandates_org_valid
- ALTER TABLE transaction_intents ADD COLUMN IF NOT EXISTS intent_mandate_id UUID REFERENCES intent_mandates(intent_id)
- CREATE INDEX IF NOT EXISTS idx_transaction_intents_mandate

### WP2 — Service Layer
Buat file: `server/src/services/intent_service.js`
Fungsi wajib:
- `createIntent(orgId, userId, body)` → validasi schema (Zod), hitung intent_hash = SHA-256(canonicalJson(structured_intent)), sign Ed25519, INSERT, return
- `revokeIntent(orgId, intentId)` → UPDATE status='REVOKED', return
- `validateIntentMatch(orgId, intentMandateId, transaction)` → cek status ACTIVE, valid_to > now(), amount ≤ max, purpose cocok, vendor cocok. Return `{valid: true}` atau `{valid: false, reason: 'INTENT_AMOUNT_EXCEEDED' | ...}`

Setiap error gunakan `AppError` dengan kode: `INTENT_NOT_FOUND`, `INTENT_MANDATE_EXPIRED`, `INTENT_MISMATCH`, `INTENT_AMOUNT_EXCEEDED`, `INTENT_VENDOR_MISMATCH`.

### WP3 — Controller Layer
Buat file: `server/src/controllers/intent_controller.js`
Fungsi:
- `postIntent(req, res, next)` → panggil `createIntent`, return 201
- `postRevokeIntent(req, res, next)` → panggil `revokeIntent`, return 200

### WP4 — Route Registration
Buat file: `server/src/routes/intents.js`
- `router.post('/', requireSession, postIntent)`
- `router.post('/:intent_id/revoke', requireSession, postRevokeIntent)`
Daftarkan di `server/src/server.js`: `app.use('/api/v1/intents', intentsRouter)`

### WP5 — Decision Engine Integration
Modifikasi `server/src/services/decision_engine.js`:
Tambahkan Tahap A baru SETELAH `MANDATE_INACTIVE`, SEBELUM `CATEGORY_NOT_ALLOWED`:
```javascript
if (mandate.ai.intentCheck === true) {
  if (!transaction.intent_mandate_id) {
    return { decision: 'REJECT', reason_codes: ['INTENT_MANDATE_MISSING'] };
  }
  const intentCheck = await validateIntentMatch(orgId, transaction.intent_mandate_id, transaction);
  if (!intentCheck.valid) {
    return { decision: 'REJECT', reason_codes: [intentCheck.reason] };
  }
}
```

### WP6 — Test Suite
Buat file test:
- `server/test/unit/intent_service.test.js` — 8 test
- `server/test/integration/intent_api.test.js` — 2 test
- `server/test/concurrency/intent_concurrency.test.js` — 1 test (1000 parallel transactions with valid intent)

### WP7 — Coverage Configuration
Modifikasi `package.json`:
```json
"test:coverage": "c8 --check-coverage --lines 100 --functions 100 --branches 100 --statements 100 --include 'server/src/services/intent_service.js' --include 'server/src/controllers/intent_controller.js' --include 'server/src/services/decision_engine_intent.js' node --test server/test/"
```

## URUTAN EKSEKUSI (WAJIB BERURUTAN)
1. WP1 → commit `feat(prd-1.4-fase-B): add intent migration`
2. WP2 → commit `feat(prd-1.4-fase-B): add intent service`
3. WP3 → commit `feat(prd-1.4-fase-B): add intent controller`
4. WP4 → commit `feat(prd-1.4-fase-B): register intent routes`
5. WP5 → commit `feat(prd-1.4-fase-B): integrate intent in decision engine`
6. WP6 → commit `test(prd-1.4-fase-B): add intent tests`
7. WP7 → commit `chore(prd-1.4-fase-B): coverage config`
8. Update `docs/PROGRESS.md` → commit `docs(prd-1.4-fase-B): mark fase B done`

## DEFINITION OF DONE (FASE B)
Fase B selesai HANYA jika:
- [ ] `npm run migrate` 2x → exit 0
- [ ] `npm run test:coverage` → 100%
- [ ] 8 unit test lulus
- [ ] 2 integration test lulus
- [ ] 1 concurrency test lulus (1000 parallel, 0 false reject)
- [ ] Decision Engine menolak transaksi tanpa intent jika `ai.intentCheck=true`
- [ ] `docs/PROGRESS.md` diupdate: Fase B → DONE
```

---

## 4. PROMPT PEMBUKA — FASE C (PACT)

```markdown
# PROMPT PEMBUKA — FASE C: PACT (Arbitrase & Bonding)

Baca file berikut (HANYA ini):
1. docs/PRD_1.4_Trust_Infrastructure.md — hanya §2.3, §3.3, §4.3, §6.3, §6.4, §7 (Fase C)
2. docs/PRD_1.3_Universal_Transaction_Engine.md — hanya §2.1, §8
3. docs/DECISIONS.md
4. docs/PROGRESS.md

## PRASYARAT
Fase A dan B harus DONE. Jika belum, BERHENTI.

## Tugas: Kerjakan FASE C (PACT) — WP1 sampai WP9

### WP1 — Migrasi Database
Buat file: `server/migrations/022_pact.sql`
Isi persis seperti PRD 1.4 §2.3:
- CREATE TABLE IF NOT EXISTS pact_contracts (...)
- CREATE INDEX IF NOT EXISTS idx_pact_contracts_status
- CREATE INDEX IF NOT EXISTS idx_pact_contracts_seller
- CREATE INDEX IF NOT EXISTS idx_pact_contracts_status_window
- CREATE TABLE IF NOT EXISTS escrow_accounts (...)
- CREATE INDEX IF NOT EXISTS idx_escrow_accounts_contract
- CREATE TABLE IF NOT EXISTS verifier_registry (...)
- CREATE INDEX IF NOT EXISTS idx_verifier_registry_tier
- CREATE FUNCTION check_escrow_balanced() + CREATE CONSTRAINT TRIGGER trg_pact_settlement_balanced

### WP2 — Escrow Service
Buat file: `server/src/services/escrow_service.js`
Fungsi wajib:
- `checkEscrowBalance(contractId)` → SELECT, return `{held, released, slashed, balanced}`

### WP3 — PACT Service
Buat file: `server/src/services/pact_service.js`
Fungsi wajib:
- `createContract(orgId, body)` → validasi schema, INSERT, return `{contract_id, status: 'PROPOSED'}`
- `fundEscrow(contractId, orgId)` → withTx: SELECT FOR UPDATE, cek status AGREED, UPDATE status IN_PROGRESS, INSERT escrow_accounts, appendLedgerEntry (DEBIT buyer, CREDIT escrow), return
- `deliverWork(contractId, orgId, workAttestation)` → UPDATE status DELIVERED
- `verifyWork(contractId, verifierId, verdict)` → cek verifier ACTIVE, jika PASS → VERIFIED, jika FAIL → DISPUTED
- `settleEscrow(contractId)` → withTx: SELECT FOR UPDATE, UPDATE escrow RELEASED, UPDATE contract SETTLED, appendLedgerEntry (DEBIT escrow, CREDIT seller)
- `disputeContract(contractId, fraudProof)` → withTx: cek challenge window, validasi fraud proof, UPDATE escrow SLASHED, UPDATE contract SLASHED, appendLedgerEntry

### WP4 — Controller Layer
Buat file: `server/src/controllers/pact_controller.js`
Fungsi:
- `postContract`, `postFund`, `postDeliver`, `postVerify`, `postSettle`, `postDispute`

### WP5 — Route Registration
Buat file: `server/src/routes/pact.js`
- 6 route sesuai PRD 1.4 §4.3
Daftarkan di `server/src/server.js`: `app.use('/api/v1/pact', pactRouter)`

### WP6 — Test Suite (Unit)
Buat file: `server/test/unit/pact_service.test.js`
6 test:
- `test_pact_happy_path` (PROPOSED → SETTLED)
- `test_pact_dispute_slash` (DISPUTED → SLASHED)
- `test_pact_dispute_invalid` (DISPUTED → VERIFIED)
- `test_pact_escrow_balanced`
- `test_pact_t0_reexec`
- `test_pact_t3_jury`

### WP7 — Test Suite (Concurrency)
Buat file: `server/test/concurrency/pact_concurrency.test.js`
1 test: `test_1000_concurrent_pact` — 1000 contract paralel, 0 escrow negative, ledger balanced.

### WP8 — Coverage Configuration
Modifikasi `package.json`:
```json
"test:coverage": "c8 --check-coverage --lines 100 --functions 100 --branches 100 --statements 100 --include 'server/src/services/pact_service.js' --include 'server/src/services/escrow_service.js' --include 'server/src/controllers/pact_controller.js' node --test server/test/"
```

### WP9 — Update PROGRESS.md
Update `docs/PROGRESS.md`: Fase C → DONE.
```
