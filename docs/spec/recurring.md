# SPESIFIKASI DOMAIN KATEGORI: RECURRING (K-RECURRING)

**Dokumen:** `docs/spec/recurring.md`  
**Kategori:** `RECURRING`  
**Sub-Tipe:** `init`, `charge`, `cancel`  
**Arah Dana:** IN (Penagihan penerimaan berulang dari pelanggan ke organisasi)  
**Konsumsi Anggaran:** TIDAK (Penerimaan kas masuk; tidak mengurangi anggaran pembayaran keluar)  
**Provider Gateway:** PayPal Subscriptions API (`/v1/billing/plans`, `/v1/billing/subscriptions`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi langganan berulang:
1. **`init` (Inisiasi Perjanjian Langganan):**
   - Pembuatan paket tagihan (*plan*) dan permintaan persetujuan pelanggan (*subscription agreement*).
   - `DRAFT` → `SUBMITTED` → `EVALUATING` → `APPROVED` → `EXECUTING` → `COMPLETED` (status `ACTIVE`).
2. **`charge` (Penagihan Siklus Berulang):**
   - Setiap periode penagihan (DAILY, WEEKLY, MONTHLY, YEARLY) memicu penagihan siklus.
   - Penegakan batas siklus (`test_recurring_limit`): nominal <= plafon siklus dan sisa siklus > 0.
   - Menghasilkan pembukuan buku besar ganda berimbang (`RULE_RECURRING_CHARGE`).
3. **`cancel` (Pembatalan Langganan):**
   - Pembatalan oleh pelanggan atau admin.
   - Status beralih ke `CANCELLED`; seluruh penagihan siklus berikutnya ditolak keras.

---

## 2. Catatan Entitas & Integritas Data (AD-17, T-08)
- **Tabel Entitas:**
  - `recurring_schedules (schedule_id, org_id, intent_id, counterparty_id, amount_minor, currency, frequency, interval_count, next_run_at, remaining_cycles, paypal_plan_id, paypal_subscription_id, status)`
  - `recurring_execution_history (id, org_id, schedule_id, intent_id, cycle_number, charged_amount_minor, currency, status, paypal_capture_id, executed_at)`
- **Constraint DB:**
  - `amount_minor > 0`
  - `frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')`
  - `interval_count > 0`

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap mutasi tagihan siklus langganan menghasilkan pembukuan berimbang:
- **`RULE_RECURRING_CHARGE`:**
  - **DEBIT:** `org:main` (sebesar nominal tagihan siklus yang diterima)
  - **CREDIT:** `payee:{counterparty_id}` (sebesar nominal hak penyedia layanan)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT) = nominal tagihan`.
- Trigger DB menolak mutasi tidak seimbang.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:**
  - `PayPal-Request-Id = "jp_{intent_id}_init"` untuk pendaftaran langganan.
  - `PayPal-Request-Id = "jp_{intent_id}_cancel"` untuk pembatalan.
- Replay dengan payload identik mengembalikan respons `isCached: true` tanpa eksekusi ganda.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

