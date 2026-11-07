# SPESIFIKASI DOMAIN KATEGORI: DOWN_PAYMENT (K-DOWN_PAYMENT)

**Dokumen:** `docs/spec/down_payment.md`  
**Kategori:** `DOWN_PAYMENT`  
**Sub-Tipe:** `initial`, `settlement`, `forfeit`  
**Arah Dana:**  
- `initial`: IN (Penangkapan uang muka ke escrow buku internal organisasi)  
- `settlement`: IN (Penangkapan pelunasan sisa tagihan ke kas utama organisasi)  
- `forfeit`: NONE / INTERNAL (Klaim uang muka yang hangus dari escrow buku ke pendapatan denda organisasi)  
**Konsumsi Anggaran:** TIDAK (Uang masuk / klaim escrow internal)  
**Provider Gateway:** PayPal Payments API (`/v2/checkout/orders` dengan `intent: "AUTHORIZE"`, `/v2/payments/authorizations/{id}/capture`, `/v2/payments/authorizations/{id}/void`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi uang muka mengikuti *gate pipeline* (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan oleh agen AI)
2. `SUBMITTED` → `EVALUATING` (diambil oleh worker untuk validasi policy, relasi pesanan, dan masa berlaku otorisasi)
3. `EVALUATING` → `APPROVED` (auto-approve jika memenuhi limit dan syarat kontrak)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika nominal besar atau otorisasi berisiko)
5. `EVALUATING` → `REJECTED` (jika nominal melebihi batas atau otorisasi kedaluwarsa > 29 hari)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia atau kedaluwarsa)
8. `APPROVED` → `EXECUTING` (worker memanggil API PayPal Capture parsial untuk `initial`, capture final untuk `settlement`, atau void untuk `forfeit`)
9. `EXECUTING` → `COMPLETED` (berhasil via respons sinkron atau webhook `PAYMENT.CAPTURE.COMPLETED`, status di `down_payment_accounts` diperbarui, legs diposting ke ledger)
10. `EXECUTING` → `FAILED` (gagal di gateway)

---

## 2. Pelacak Akun Uang Muka & Batas 29 Hari (AD-04, AD-26, T-09)
- **Tabel Entitas:** `down_payment_accounts (org_id, intent_id, counterparty_id, dp_amount_minor, settlement_amount_minor, total_amount_minor, status, authorization_id, authorization_expires_at)`.
- **Constraint DB:**
  - `CHECK (dp_amount_minor + COALESCE(settlement_amount_minor, 0) <= total_amount_minor)`
  - `CHECK (status <> 'SETTLED' OR dp_amount_minor + COALESCE(settlement_amount_minor, 0) = total_amount_minor)`
- **Jendela Otorisasi 29 Hari (AD-26):**
  - PayPal membatasi otorisasi pembayaran maksimum 29 hari.
  - Sisa tagihan wajib diselesaikan (`settlement`) sebelum batas 29 hari berakhir.
  - Jika pesanan dibatalkan atau pembeli wanprestasi (`forfeit`), sisa otorisasi di PayPal di-void secara otomatis untuk melepaskan hold limit kartu pembeli, dan uang muka diakui dari escrow.

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi DOWN_PAYMENT yang sukses menghasilkan sepasang entri buku besar yang berimbang:
- **`initial`:**
  - **DEBIT:** `buyer:{counterparty_id}` (sebesar nilai uang muka)
  - **CREDIT:** `org:down_payment_escrow` (sebesar nilai uang muka)
- **`settlement`:**
  - **DEBIT:** `buyer:{counterparty_id}` (sebesar nilai pelunasan sisa)
  - **CREDIT:** `org:main` (sebesar nilai pelunasan sisa)
- **`forfeit`:**
  - **DEBIT:** `org:down_payment_escrow` (sebesar nilai uang muka)
  - **CREDIT:** `org:main` (sebesar nilai uang muka)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:**
  - Initial: Header `PayPal-Request-Id = "jp_{intent_id}_dp_initial"`.
  - Settlement: Header `PayPal-Request-Id = "jp_{intent_id}_dp_settle"`.
  - Forfeit: Header `PayPal-Request-Id = "jp_{intent_id}_dp_forfeit"`.
- Replay dengan payload identik mengembalikan HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

