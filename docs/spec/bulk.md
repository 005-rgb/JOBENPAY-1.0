# SPESIFIKASI DOMAIN KATEGORI: BULK (K-BULK)

**Dokumen:** `docs/spec/bulk.md`  
**Kategori:** `BULK`  
**Sub-Tipe:** `payout`  
**Arah Dana:** OUT (Distribusi massal pembayaran keluar ke banyak penerima)  
**Konsumsi Anggaran:** YA (Reservasi total anggaran batch saat submit; pelepasan presisi untuk item yang gagal)  
**Provider Gateway:** PayPal Payouts API v1 (`/v1/payments/payouts` dengan `items[]`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi massal melibatkan relasi hierarkis Intent Induk (Batch) dan Intent Anak (Item):
1. `DRAFT` → `SUBMITTED` (diusulkan dengan array item, maksimal 15.000 item)
2. `SUBMITTED` → `EVALUATING` (evaluasi kepatuhan: batas 15.000 item, reservasi total anggaran batch, verifikasi status payee seluruh item)
3. `EVALUATING` → `APPROVED` (disetujui otomatis jika memenuhi batas per-transaksi dan allowlist payee)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika ada item dengan payee baru `PAYEE_NEW` atau total batch melebihi batas approval)
5. `EVALUATING` → `REJECTED` (jika jumlah item > 15.000 memicu `BULK_TOO_LARGE` atau anggaran tidak mencukupi)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia / Approver; seluruh reservasi anggaran dilepas)
8. `APPROVED` → `EXECUTING` (worker menembakkan batch ke PayPal Payouts API)
9. Status Terminal Induk dihitung secara agregat dari status anak:
   - Seluruh item berhasil → `COMPLETED`
   - Sebagian berhasil, sebagian gagal → `PARTIALLY_COMPLETED` (bagian anggaran untuk item gagal dilepaskan)
   - Seluruh item gagal → `FAILED` (seluruh reservasi anggaran dilepaskan)

---

## 2. Catatan Batch & Penanganan Skala Besar (AD-17, T-19)
- **Tabel Entitas:** `bulk_batches (batch_id, org_id, parent_intent_id, item_count, total_amount_minor, currency, status, paypal_batch_id)`.
- **Constraint DB:**
  - `item_count > 0 AND item_count <= 15000`
  - Relasi intent anak: `transaction_intents.parent_intent_id` menunjuk ke parent intent.
- **Streaming & Chunking Payload (T-19):**
  - Payload berukuran besar di-stream dan diproses dalam pecahan (chunk) 500 item untuk mencegah memory spike pada worker runtime.

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap item pembayaran yang berhasil menghasilkan sepasang entri buku besar yang berimbang:
- **Per Item Sukses:**
  - **DEBIT:** `org:main` (sebesar nominal item yang sukses)
  - **CREDIT:** `payee:{counterparty_id}` (sebesar nominal yang diterima penerima)
- **Item Gagal:** Tidak diposting ke ledger; alokasi anggaran yang direservasi dikembalikan.
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT) = total nominal item sukses`.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi untuk batch induk).
- **Engine ke PayPal:**
  - `PayPal-Request-Id = "jp_{parent_intent_id}_bulk_payout"`.
  - Item tracking: `sender_item_id = "bulk_item_{parent_intent_id}_{index}"`.
- Replay dengan payload identik mengembalikan respons HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

