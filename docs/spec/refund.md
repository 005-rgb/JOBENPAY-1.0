# SPESIFIKASI DOMAIN KATEGORI: REFUND (K-REFUND)

**Dokumen:** `docs/spec/refund.md`  
**Kategori:** `REFUND`  
**Sub-Tipe:** `full`, `partial`  
**Arah Dana:** Keluar (`OUT` - pengembalian ke pembeli)  
**Konsumsi Anggaran:** TIDAK (dikurangkan dari kas merchant atas penjualan sebelumnya)  
**Provider Gateway:** PayPal Payments API (`/v2/payments/captures/{id}/refund`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi pengembalian dana mengikuti *gate pipeline* (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan oleh agen AI)
2. `SUBMITTED` → `EVALUATING` (diambil oleh worker untuk validasi keabsahan capture dan policy)
3. `EVALUATING` → `APPROVED` (auto-approve jika memenuhi limit dan capture valid)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika nilai melebihi batas atau capture telah lama)
5. `EVALUATING` → `REJECTED` (jika kumulatif refund melebihi nilai capture asli atau jendela 180 hari terlampaui)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia atau kedaluwarsa)
8. `APPROVED` → `EXECUTING` (worker memanggil API Refund PayPal)
9. `EXECUTING` → `COMPLETED` (refund berhasil via respons sinkron atau webhook `PAYMENT.CAPTURE.REFUNDED`, legs diposting ke ledger dan tabel pelacak kumulatif diperbarui)
10. `EXECUTING` → `FAILED` (gagal di PayPal)

---

## 2. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi REFUND yang sukses menghasilkan sepasang entri buku besar yang berimbang:
- **DEBIT:** `org:main` (sebesar nilai transaksi pengembalian)
- **CREDIT:** `buyer:{counterparty_id}` (sebesar nilai transaksi pengembalian)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`.

---

## 3. Pelacak Kumulatif & Batas Jendela Waktu (T-10 & PRD §11)
- **Tabel Pelacak:** `capture_refund_trackers (capture_id, org_id, capture_amount_minor, refunded_amount_minor, currency)`.
- **Constraint DB:** `chk_refund_not_exceed_capture CHECK (refunded_amount_minor <= capture_amount_minor)`.
- **Pelanggaran Batas:** Jika pengembalian melebihi capture asli, sistem menolak dengan HTTP 422 `REFUND_EXCEEDS_ORIGINAL`.
- **Jendela Waktu:** Pengembalian dana setelah 180 hari dari capture asli ditolak dengan HTTP 422 `REFUND_WINDOW_EXPIRED`.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:** Header `PayPal-Request-Id = "jp_{intent_id}_refund"`.
- Replay dengan payload identik mengembalikan HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

