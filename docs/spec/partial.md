# SPESIFIKASI DOMAIN KATEGORI: PARTIAL (K-PARTIAL)

**Dokumen:** `docs/spec/partial.md`  
**Kategori:** `PARTIAL`  
**Sub-Tipe:** `payment`, `refund`  
**Arah Dana:**  
- `payment`: IN (Penangkapan parsial dana dari pembeli ke rekening organisasi)  
- `refund`: OUT (Pengembalian dana parsial dari organisasi ke pembeli)  
**Konsumsi Anggaran:** TIDAK (Uang masuk / pengembalian dari saldo organisasi)  
**Provider Gateway:** PayPal Payments API (`/v2/payments/authorizations/{id}/capture` dan `/v2/payments/captures/{id}/refund`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi partial mengikuti *gate pipeline* (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan oleh agen AI)
2. `SUBMITTED` → `EVALUATING` (diambil oleh worker untuk evaluasi policy & limit otorisasi kumulatif)
3. `EVALUATING` → `APPROVED` (auto-approve jika memenuhi kriteria policy)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika jumlah di atas ambang batas atau otorisasi berisiko)
5. `EVALUATING` → `REJECTED` (jika akumulasi melebihi otorisasi atau otorisasi telah berstatus VOIDED/CAPTURED)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia atau kedaluwarsa)
8. `APPROVED` → `EXECUTING` (worker memanggil API PayPal Capture atau Refund)
9. `EXECUTING` → `COMPLETED` (berhasil via respons sinkron atau webhook `PAYMENT.CAPTURE.COMPLETED`, legs diposting ke ledger)
10. `EXECUTING` → `FAILED` (gagal di gateway)

---

## 2. Primitif Otorisasi & Pelacak Akumulasi (AD-10 & AD-27)
- **Tabel Primitif:** `payment_authorizations (authorization_id, org_id, authorized_amount_minor, captured_amount_minor, currency, status)`.
- **Constraint DB:** `chk_auth_captured_limit CHECK (captured_amount_minor <= authorized_amount_minor)`.
- **Penangkapan Final (`isFinal = true`):** Mengubah status otorisasi menjadi `CAPTURED` dan menutup peluang capture lanjutan.
- **Diferensiasi Sub-Tipe (AD-27):**
  - `sub_type = 'payment'`: Menangkap sebagian dana otorisasi via `POST /v2/payments/authorizations/{id}/capture` dengan flag `final_capture`.
  - `sub_type = 'refund'`: Mengembalikan sebagian dana dari penangkapan sebelumnya via `POST /v2/payments/captures/{id}/refund`.

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi PARTIAL yang sukses menghasilkan sepasang entri buku besar yang berimbang:
- **`payment`:**
  - **DEBIT:** `buyer:{counterparty_id}` (sebesar nilai capture parsial)
  - **CREDIT:** `org:main` (sebesar nilai capture parsial)
- **`refund`:**
  - **DEBIT:** `org:main` (sebesar nilai refund parsial)
  - **CREDIT:** `buyer:{counterparty_id}` (sebesar nilai refund parsial)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:** Header `PayPal-Request-Id = "jp_{intent_id}_partial_capture"`.
- Replay dengan payload identik mengembalikan HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

