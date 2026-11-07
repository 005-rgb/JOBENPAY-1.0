# SPESIFIKASI DOMAIN KATEGORI: SCHEDULED (K-SCHEDULED)

**Dokumen:** `docs/spec/scheduled.md`  
**Kategori:** `SCHEDULED`  
**Sub-Tipe:** `payout`, `charge`  
**Arah Dana:** OUT (`payout` pengeluaran dana ke penerima) / IN (`charge` penarikan dana dari pembeli)  
**Konsumsi Anggaran:** `payout` = YA (reservasi saat submit; dilepas jika dibatalkan/ditolak saat fire); `charge` = TIDAK  
**Provider Gateway:** PayPal Payouts API (`/v1/payments/payouts`) untuk `payout`; PayPal Orders API v2 (`/v2/checkout/orders`) untuk `charge`  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi terjadwal mengikuti evaluasi bertahap dua kali (dual evaluation: submit & fire time):
1. `DRAFT` → `SUBMITTED` (diusulkan dengan waktu jatuh tempo `scheduled_at`)
2. `SUBMITTED` → `EVALUATING` (evaluasi pertama: validasi zona waktu ber-offset, reservasi anggaran untuk payout, pengecekan batas mandat `validTo`)
3. `EVALUATING` → `SCHEDULED` (disetujui secara otomatis untuk masuk antrean jatuh tempo)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika nominal di atas batas auto-approve)
5. `EVALUATING` → `REJECTED` (jika tanggal melampaui `validTo` atau tanpa offset zona waktu)
6. `NEEDS_APPROVAL` → `SCHEDULED` (disetujui oleh Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh Approver)
8. `SCHEDULED` → `EXECUTING` (worker mengambil jadwal jatuh tempo menggunakan `SELECT ... FOR UPDATE SKIP LOCKED` dan melakukan **evaluasi ulang**)
9. `SCHEDULED` → `CANCELLED` (dibatalkan oleh manusia atau kill switch sebelum waktu penembakan; reservasi anggaran dilepas)
10. `SCHEDULED` → `REJECTED` (evaluasi ulang saat fire gagal: mandat kadaluwarsa/dicabut, org beku, atau agen nonaktif; reservasi anggaran dilepas)
11. `EXECUTING` → `COMPLETED` (eksekusi berhasil, legs diposting ke ledger)
12. `EXECUTING` → `FAILED` (eksekusi gateway gagal)

---

## 2. Catatan Antrean Jadwal & Integritas Data (AD-14, T-01)
- **Tabel Entitas:** `scheduled_runs (id, org_id, intent_id, scheduled_at, status, fired_at, re_eval_outcome, created_at, updated_at)`.
- **Constraint DB:**
  - `status IN ('PENDING', 'FIRED', 'CANCELLED', 'FAILED')`
  - `UNIQUE(intent_id)`
  - Index terurut: `(status, scheduled_at) WHERE status = 'PENDING'` untuk worker lock cepat.
- **Validasi Waktu & Zona Waktu:**
  - Input waktu `scheduled_at` wajib ISO-8601 dengan offset timezone eksplisit (misal `Z`, `+07:00`, `-05:00`). Input naive datetime ditolak dengan HTTP 422 `TIMEZONE_OFFSET_REQUIRED`.
  - Jadwal yang melampaui masa berlaku mandat (`scheduled_at > mandate.validTo`) ditolak dengan HTTP 422 `SCHEDULE_OUT_OF_RANGE`.

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap transaksi SCHEDULED yang selesai diposting saat mencapai status `COMPLETED`:
- **`payout`:**
  - **DEBIT:** `org:main` (sebesar nominal transaksi keluar)
  - **CREDIT:** `payee:{counterparty_id}` (sebesar nominal diterima penerima)
- **`charge`:**
  - **DEBIT:** `buyer:{counterparty_id}` (sebesar nominal pembayaran pembeli)
  - **CREDIT:** `org:main` (sebesar penerimaan kas organisasi)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT)` per mata uang.

---

## 4. Idempotensi & Eksekusi Tepat Sekali (Exactly-Once Firing)
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:**
  - `PayPal-Request-Id = "jp_{intent_id}_sched_payout"`.
  - `PayPal-Request-Id = "jp_{intent_id}_sched_capture"`.
- Replay dengan payload identik mengembalikan HTTP 200 identik.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.
- Pekerja paralel menggunakan `SELECT ... FOR UPDATE SKIP LOCKED` menjamin 1 intent hanya ditembak tepat satu kali.

