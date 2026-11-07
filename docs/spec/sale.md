# SPESIFIKASI DOMAIN KATEGORI: SALE (K-SALE)

**Dokumen:** `docs/spec/sale.md`  
**Kategori:** `SALE`  
**Sub-Tipe:** `standard`  
**Arah Dana:** Masuk (`IN`)  
**Konsumsi Anggaran:** TIDAK (pembayaran masuk ke organisasi)  
**Provider Gateway:** PayPal Orders API v2 CAPTURE (`/v2/checkout/orders` & `/v2/checkout/orders/{id}/capture`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi penjualan mengikuti *gate pipeline* (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan oleh agen AI)
2. `SUBMITTED` → `EVALUATING` (diambil oleh background worker untuk evaluasi policy)
3. `EVALUATING` → `APPROVED` (auto-approve oleh policy)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika ada anomali atau permintaan khusus)
5. `EVALUATING` → `REJECTED` (pelanggaran kebijakan fatal atau fraud)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia atau kedaluwarsa)
8. `APPROVED` → `EXECUTING` (worker membuat PayPal Order dengan `intent: "CAPTURE"`, menghasilkan `orderId` dan `approvalUrl` bagi pembeli)
9. Persetujuan Pembeli: Dilakukan via browser pembeli / Buyer Harness otomatis.
10. `EXECUTING` → `COMPLETED` (capture berhasil via sync call atau webhook `PAYMENT.CAPTURE.COMPLETED`, legs diposting ke ledger)
11. `EXECUTING` → `FAILED` (capture ditolak atau webhook `PAYMENT.CAPTURE.DENIED`)

---

## 2. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi SALE yang sukses menghasilkan sepasang entri buku besar yang berimbang (`RULE_SALE_STANDARD`):
- **DEBIT:** `buyer:{counterparty_id}` (sebesar nilai transaksi)
- **CREDIT:** `org:main` (sebesar nilai transaksi kas masuk merchant)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`. Trigger database `trg_balanced` menolak setiap posting tidak seimbang.

---

## 3. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Menggunakan header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:** Header `PayPal-Request-Id = "jp_{intent_id}_{step}"`:
  - `step = "order_create"` untuk pembuatan order.
  - `step = "order_capture"` untuk pemanggilan capture order.
- Replay dengan kunci dan payload sama mengembalikan HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

---

## 4. Rekonsiliasi & Webhook
- Webhook PayPal:
  - `PAYMENT.CAPTURE.COMPLETED` memicu transisi `COMPLETED` dan posting buku besar secara idempoten (T-11).
  - `PAYMENT.CAPTURE.DENIED` memicu transisi ke `FAILED`.
  - `PAYMENT.CAPTURE.PENDING` tetap dalam status `EXECUTING`.
- Rekonsiliasi mencocokkan `settlement_records` dengan ID capture PayPal dan memperbarui `reconciliation_status = 'RECONCILED'`.

