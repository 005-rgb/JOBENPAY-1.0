# SPESIFIKASI DOMAIN KATEGORI: PAYOUT (K-PAYOUT)

**Dokumen:** `docs/spec/payout.md`  
**Kategori:** `PAYOUT`  
**Sub-Tipe:** `standard`  
**Arah Dana:** Keluar (`OUT`)  
**Konsumsi Anggaran:** YA  
**Provider Gateway:** PayPal Payouts API (`/v1/payments/payouts`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi payout mengikuti *gate pipeline* (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan oleh agen AI)
2. `SUBMITTED` → `EVALUATING` (diambil oleh background worker untuk evaluasi)
3. `EVALUATING` → `APPROVED` (auto-approve oleh policy Tahap A/B/C/D)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika melebihi batas atau payee baru)
5. `EVALUATING` → `REJECTED` (pelanggaran kebijakan fatal)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia atau kedaluwarsa)
8. `APPROVED` → `EXECUTING` (worker memulai eksekusi ke PayPal Sandbox)
9. `EXECUTING` → `COMPLETED` (item sukses di PayPal, legs diposting ke ledger)
10. `EXECUTING` → `FAILED` (gagal di PayPal, anggaran dilepaskan)

---

## 2. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi PAYOUT yang sukses menghasilkan tepat sepasang entri buku besar yang berimbang:
- **DEBIT:** `org:main` (sebesar nilai transaksi)
- **CREDIT:** `payee:{counterparty_id}` (sebesar nilai transaksi)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`.

---

## 3. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Menggunakan header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:** Menggunakan `sender_batch_id = "jp_{intent_id}"` dan header `PayPal-Request-Id = "jp_{intent_id}_payout"`.
- Permintaan ulang dengan kunci yang sama dan payload identik menghasilkan replay respons 200 identik.
- Permintaan ulang dengan kunci sama namun payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

---

## 4. Rekonsiliasi & Webhook
- Webhook PayPal:
  - `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` memicu penyelesaian transaksi ke `COMPLETED` dan posting ledger.
  - `PAYMENT.PAYOUTS-ITEM.FAILED` memicu status `FAILED` dan melepaskan reservasi anggaran.
- Rekonsiliasi mencocokkan `settlement_records` dengan data status webhook dan polling item PayPal.

