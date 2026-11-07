# SPESIFIKASI DOMAIN KATEGORI: INVOICE (K-INVOICE)

**Dokumen:** `docs/spec/invoice.md`  
**Kategori:** `INVOICE`  
**Sub-Tipe:** `standard`  
**Arah Dana:** IN (Penerimaan pembayaran faktur dari klien ke kas organisasi)  
**Konsumsi Anggaran:** TIDAK (Uang masuk piutang usaha; tidak memotong anggaran keluar)  
**Provider Gateway:** PayPal Invoicing API v2 (`/v2/invoicing/invoices`, `/v2/invoicing/invoices/{id}/send`, `/v2/invoicing/invoices/{id}/payments`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi penagihan faktur mengikuti *gate pipeline* (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan oleh agen AI)
2. `SUBMITTED` → `EVALUATING` (diambil oleh worker untuk validasi keunikan nomor faktur dan keabsahan dokumen/kontrak)
3. `EVALUATING` → `APPROVED` (auto-approve jika memenuhi kriteria policy)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika nominal melebihi ambang batas atau dokumen mencurigakan)
5. `EVALUATING` → `REJECTED` (jika nomor faktur duplikat atau parameter tidak valid)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia atau kedaluwarsa)
8. `APPROVED` → `EXECUTING` (worker membuat faktur di PayPal Invoicing v2 dan mengirimkannya ke klien)
9. `EXECUTING` → `COMPLETED` (pembayaran diterima dari klien via respons sinkron atau webhook `INVOICING.INVOICE.PAID`, status di `invoice_records` menjadi `PAID`, legs diposting ke ledger)
10. `EXECUTING` → `FAILED` (faktur dibatalkan atau pembayaran gagal)

---

## 2. Catatan Faktur & Integritas Penomoran (T-05)
- **Tabel Entitas:** `invoice_records (invoice_id, org_id, intent_id, counterparty_id, invoice_number, amount_minor, currency, due_date, status, paypal_invoice_id, document_id)`.
- **Constraint DB:**
  - `amount_minor > 0`
  - `UNIQUE(org_id, invoice_number)` — Menjamin penomoran faktur unik dan tidak dapat digunakan ganda di dalam organisasi yang sama.
- **Siklus Status Faktur:** `DRAFT` → `SENT` → `PAID` (atau `CANCELLED` / `OVERDUE`).

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi INVOICE yang sukses menghasilkan sepasang entri buku besar yang berimbang:
- **`standard`:**
  - **DEBIT:** `buyer:{counterparty_id}` (sebesar nilai faktur yang dibayar)
  - **CREDIT:** `org:main` (sebesar nilai faktur yang dibayar)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:**
  - Pembuatan: `PayPal-Request-Id = "jp_{intent_id}_invoice_create"`.
  - Pengiriman: `PayPal-Request-Id = "jp_{intent_id}_invoice_send"`.
  - Pembayaran: `PayPal-Request-Id = "jp_{intent_id}_invoice_pay"`.
- Replay dengan payload identik mengembalikan HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

