# SPESIFIKASI DOMAIN KATEGORI: SPLIT (K-SPLIT)

**Dokumen:** `docs/spec/split.md`  
**Kategori:** `SPLIT`  
**Sub-Tipe:** `collect`, `split`, `hold`, `payout`  
**Arah Dana:** IN_OUT (Pengumpulan dana dari pembeli/pelanggan ke escrow, lalu pemisahan menjadi komisi platform fee dan pembagian hak penerima)  
**Konsumsi Anggaran:** YA (Mengkonsumsi anggaran saat pelepasan dana/payout)  
**Provider Gateway:** PayPal Orders API v2 (`/v2/checkout/orders` untuk `collect`) + PayPal Payouts API v1 (`/v1/payments/payouts` untuk distribusi)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi split payments mencakup 4 fase sub-tipe:
1. **`collect` (Pengumpulan Dana):**
   - `DRAFT` → `SUBMITTED` (order checkout dibuat)
   - `SUBMITTED` → `EVALUATING` → `APPROVED` → `EXECUTING` (pembeli menyelesaikan pembayaran)
   - `EXECUTING` → `COMPLETED` (dana masuk ke rekening escrow `org:split_escrow`)
2. **`split` (Pemisahan Dana):**
   - Menghitung potongan komisi platform (`platform_fee_bps` dengan BigInt `mulBpsFloor`)
   - `platform_fee = floor(total * bps / 10000)`
   - `payee_share = total - platform_fee`
   - Memastikan `sum(shares) + platform_fee === total` dengan 0 diferensial (zero-diff)
3. **`hold` (Penahanan Dana Sementara):**
   - Menahan bagian penerima tertentu hingga tercapainya milestone atau berakhirnya holding period (`hold_until`)
4. **`payout` (Pencairan Dana):**
   - Mengirimkan hak bersih penerima via gateway PayPal Payouts

---

## 2. Catatan Entitas & Integritas Data (AD-13, AD-17, T-13, T-14)
- **Tabel Entitas:** `split_records (id, org_id, intent_id, sub_type, parent_intent_id, total_amount_minor, currency, platform_fee_bps, platform_fee_minor, recipient_counterparty_id, recipient_share_minor, status, paypal_reference_id)`.
- **Constraint DB:**
  - `total_amount_minor > 0`
  - `platform_fee_bps BETWEEN 0 AND 10000`
  - `platform_fee_minor >= 0`

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap mutasi split wajib menghasilkan pembukuan yang seimbang:
- **`RULE_SPLIT_COLLECT`:**
  - **DEBIT:** `org:main`
  - **CREDIT:** `org:split_escrow`
- **`RULE_SPLIT_SPLIT`:**
  - **DEBIT:** `org:split_escrow` (nominal total)
  - **CREDIT:** `org:main` (komisi platform fee)
  - **CREDIT:** `payee:{counterparty_id}` (hak bersih penerima)
- **`RULE_SPLIT_HOLD`:**
  - **DEBIT:** `payee:{counterparty_id}`
  - **CREDIT:** `org:split_escrow`
- **`RULE_SPLIT_PAYOUT`:**
  - **DEBIT:** `org:split_escrow`
  - **CREDIT:** `payee:{counterparty_id}`
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` pada seluruh mata uang.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:**
  - Order collect: `PayPal-Request-Id = "jp_{intent_id}_collect"`
  - Payout split: `PayPal-Request-Id = "jp_{intent_id}_split_payout"`
- Replay dengan payload identik mengembalikan status yang sama (`replayed: true`).
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

