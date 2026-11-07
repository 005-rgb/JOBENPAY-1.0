# SPESIFIKASI DOMAIN KATEGORI: VOID (K-VOID)

**Dokumen:** `docs/spec/void.md`  
**Kategori:** `VOID`  
**Sub-Tipe:** `authorization`, `order`  
**Arah Dana:** NONE (Pembatalan hold penahanan dana)  
**Konsumsi Anggaran:** TIDAK  
**Provider Gateway:** PayPal Payments API (`/v2/payments/authorizations/{id}/void`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi pembatalan mengikuti *gate pipeline* (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan oleh agen AI)
2. `SUBMITTED` → `EVALUATING` (diambil oleh worker untuk validasi keabsahan otorisasi)
3. `EVALUATING` → `APPROVED` (auto-approve jika memenuhi limit dan otorisasi sah)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika otorisasi bernilai besar atau instruksi manual)
5. `EVALUATING` → `REJECTED` (jika otorisasi sudah di-capture, sudah voided, atau tidak ditemukan)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia atau kedaluwarsa)
8. `APPROVED` → `EXECUTING` (worker memanggil API Void PayPal untuk `authorization`, atau pembatalan internal untuk `order` per AD-11)
9. `EXECUTING` → `COMPLETED` (void berhasil via respons sinkron atau webhook `PAYMENT.AUTHORIZATION.VOIDED`, status di `payment_authorizations` menjadi `VOIDED`, legs diposting ke ledger)
10. `EXECUTING` → `FAILED` (gagal di gateway)

---

## 2. Primitif Otorisasi & Pencegahan Capture Pasca-Void (WP V-0 & AD-11)
- **Tabel Primitif:** `payment_authorizations (authorization_id, org_id, authorized_amount_minor, captured_amount_minor, currency, status, expires_at)`.
- **Constraint DB:** `chk_auth_captured_limit CHECK (captured_amount_minor <= authorized_amount_minor)`.
- **Integritas Status:** Upaya capture pada otorisasi yang telah berstatus `VOIDED` ditolak tegas dengan HTTP 422 `AUTHORIZATION_VOIDED`.
- **Diferensiasi Sub-Tipe (AD-11):**
  - `sub_type = 'authorization'`: Menghubungi PayPal Payments API `POST /v2/payments/authorizations/{id}/void`.
  - `sub_type = 'order'`: Murni pembatalan internal Jobenpay tanpa pemanggilan ke PayPal.

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi VOID yang sukses menghasilkan sepasang entri buku besar yang berimbang:
- **`authorization`:**
  - **DEBIT:** `buyer:{counterparty_id}` (sebesar nilai hold)
  - **CREDIT:** `org:authorized_holds` (sebesar nilai hold)
- **`order`:**
  - **DEBIT:** `buyer:{counterparty_id}` (sebesar nilai order)
  - **CREDIT:** `org:pending_orders` (sebesar nilai order)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:** Header `PayPal-Request-Id = "jp_{intent_id}_void"`.
- Replay dengan payload identik mengembalikan HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

