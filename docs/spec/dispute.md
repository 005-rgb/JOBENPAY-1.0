# SPESIFIKASI DOMAIN KATEGORI: DISPUTE (K-DISPUTE)

**Dokumen:** `docs/spec/dispute.md`  
**Kategori:** `DISPUTE`  
**Sub-Tipe:** `chargeback`, `inquiry`  
**Arah Dana:** OUT (chargeback deduksi dari kas organisasi ke pembeli) / NETRAL (inquiry klarifikasi tanpa deduksi dana)  
**Konsumsi Anggaran:** TIDAK (Deduksi klaim sengketa perbankan/pembeli; bukan inisiatif belanja/payout agen)  
**Provider Gateway:** PayPal Customer Disputes API v1 (`/v1/customer-disputes`, `/v1/customer-disputes/{id}/accept-claim`, `/v1/customer-disputes/{id}/provide-evidence`)  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi sengketa pelanggan mengikuti alur pertahanan maker/checker terpadu (`PIPE`):
1. `DRAFT` → `SUBMITTED` (diusulkan dari webhook ingest `CUSTOMER.DISPUTE.CREATED` atau pelaporan kasus)
2. `SUBMITTED` → `EVALUATING` (diambil oleh worker untuk validasi kelengkapan berkas bukti dan batas waktu respons)
3. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi ke manusia — **AD-23: Acceptance klaim WAJIB persetujuan manusia**, 0 AUTO_APPROVE untuk eksekusi terima klaim)
4. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver setelah meninjau bundel bukti)
5. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia / Approver jika bukti tidak memadai)
6. `APPROVED` → `EXECUTING` (worker mengirimkan bukti tandingan ke PayPal API atau menerima klaim atas persetujuan manusia)
7. `EXECUTING` → `COMPLETED` (dispute terselesaikan via webhook `CUSTOMER.DISPUTE.RESOLVED`, status di tabel `disputes` menjadi `RESOLVED`, legs diposting ke ledger)
8. `EXECUTING` → `FAILED` (gagal terkirim atau waktu respons habis / kadaluwarsa)

---

## 2. Catatan Sengketa & Integritas Data (AD-12, AD-23, T-06)
- **Tabel Entitas:** `disputes (id, org_id, paypal_dispute_id, status, reason, amount_minor, currency, respond_by, raw)`.
- **Constraint & Aturan Keamanan:**
  - `amount_minor > 0`
  - AD-23: Agen AI eksternal hanya diperbolehkan merekomendasikan bukti atau mengusulkan penerimaan klaim; eksekusi penerimaan klaim (`accept-claim`) mutlak memerlukan otorisasi manusia.
  - Fail-closed: Jika model AI mendeteksi keraguan atau skor risiko tinggi, keputusan langsung jatuh pada `NEEDS_APPROVAL` atau `REJECTED`.

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi DISPUTE yang terselesaikan menghasilkan sepasang entri buku besar yang berimbang:
- **`chargeback`:**
  - **DEBIT:** `org:main` (sebesar nominal klaim sengketa yang dimenangkan pembeli)
  - **CREDIT:** `buyer:{counterparty_id}` (sebesar nominal klaim sengketa yang dikembalikan ke pembeli)
- **`inquiry`:**
  - Entri memo seimbang: **DEBIT** `org:main` dan **CREDIT** `org:main` (nol pergeseran saldo riil kas)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.
- **Waktu Posting:** Saat transisi status ke `COMPLETED`.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:**
  - `PayPal-Request-Id = "jp_{intent_id}_dispute_accept"`.
  - `PayPal-Request-Id = "jp_{intent_id}_dispute_evidence"`.
- Replay dengan payload identik mengembalikan respons HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

