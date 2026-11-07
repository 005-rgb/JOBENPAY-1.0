# Urutan Evaluasi Kebijakan Mandat (Policy Evaluation Order)

Dokumen ini mendokumentasikan urutan deterministik evaluasi policy engine pada JOBENPAY Universal Transaction Engine (PRD-R §5 / BW-05).

---

## 1. Pipeline Evaluasi Tiga Tahap

```text
[Request Masuk] 
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ Stage A: Deterministic Hard Checks (Aturan Universal) │ ── Gagal ──► REJECT
└────────────────────────────────────────────────────────┘
       │ Lolos
       ▼
┌────────────────────────────────────────────────────────┐
│ Stage B: Risk Indicators & Category Markers            │ ── Terpicu ─► REQUIRE_APPROVAL
└────────────────────────────────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ Stage C: AI Intent Check (Hanya Memperketat)          │ ── Eskalasi ─► REQUIRE_APPROVAL / REJECT
└────────────────────────────────────────────────────────┘
       │ Lolos (Semua Bersih & di Bawah Cap Auto-Approve)
       ▼
[AUTO_APPROVE]
```

---

## 2. Rincian Urutan Tahap A (Deterministic Hard Checks)

1. **A1 (`ORG_FROZEN`)**: Memeriksa apakah organisasi dalam status beku (*kill-switch* aktif).
2. **A2 (`AGENT_DISABLED`)**: Memeriksa apakah status agen AI pemohon aktif (`ACTIVE`).
3. **A3 (`MANDATE_INACTIVE`)**: Memeriksa apakah mandat pembayaran agen aktif dan dalam masa berlaku (`valid_from` s/d `valid_to`).
4. **A4 (`ACTION_NOT_ALLOWED`)**: Memeriksa apakah aksi diizinkan oleh mandat v1.
5. **A4b (`CATEGORY_NOT_ALLOWED` & `SUBTYPE_NOT_ALLOWED`)**: Pada mandat v2, memeriksa apakah kategori dan sub-tipe transaksi terdaftar dalam `allowedCategories`. Mandat v1 yang diadaptasi hanya mengizinkan kategori `PAYOUT` (dan aksi v1.2), sedangkan kategori universal baru berstatus *default-deny*.
6. **A5 (`CURRENCY_NOT_ALLOWED`)**: Memeriksa kecocokan mata uang transaksi dengan mata uang mandat.
7. **A6 (`CAP_EXCEEDED`)**: Memeriksa apakah nilai transaksi melebihi batas per-transaksi (`perTransactionCapMinor`).
8. **A7 (`PAYEE_BLOCKED` & `PAYEE_NOT_ALLOWED`)**: Memeriksa status blokir pihak penerima dan allowlist mandat.
9. **A8 (`TARGET_INVALID`)**: Memeriksa format referensi target untuk kategori terkait.
10. **A9 (`OUTSIDE_TIME_WINDOW`)**: Memeriksa jadwal operasional yang diizinkan (hari dan jam kerja).
11. **A10 (`VELOCITY_EXCEEDED`)**: Memeriksa batas frekuensi transaksi per jam dan batas harian per penerima.
12. **A11 (`DUPLICATE_SUSPECTED`)**: Memeriksa kesamaan faktur/penerima dalam jendela deteksi duplikat.
13. **A12 (`INVOICE_REQUIRED` & `INVOICE_MISMATCH_AMOUNT`)**: Memeriksa keberadaan dokumen faktur dan toleransi jumlah bila diwajibkan.
14. **A13 (`BUDGET_EXCEEDED`)**: Memeriksa apakah sisa anggaran periode mencukupi untuk reservasi transaksi.
15. **A14 (`EXPOSURE_AUTH_EXCEEDED` / `EXPOSURE_RECEIVABLE_EXCEEDED` / `REFUND_RATE_EXCEEDED`)**: Memeriksa batas eksposur terbuka dan tingkat refund 30 hari.

---

## 3. Rincian Urutan Tahap B (Risk Indicators)

1. **B1 (`PAYEE_NEW`)**: Pihak penerima baru pertama kali bertransaksi atau belum terverifikasi penuh.
2. **B2 (`PAYEE_CHANGED`)**: Rincian akun pembayaran pihak penerima berubah dalam 30 hari terakhir.
3. **B3 (`INVOICE_PAYEE_MISMATCH`)**: Nama penerima pada faktur tidak cocok dengan nama pihak terdaftar.
4. **B4 (`AMOUNT_REQUIRES_APPROVAL`)**: Jumlah transaksi melampaui batas persetujuan otomatis (`autoApproveBelowMinor`).
5. **B5 (`DOC_INJECTION_SUSPECTED`)**: Terdeteksi indikasi manipulasi prompt (*prompt injection*) pada dokumen lampiran.
6. **B6 (`TIER_C_REQUIRES_APPROVAL`)**: Kategori Tier C (`FINANCING`, `DEBIT`) selalu mewajibkan persetujuan manusia.
7. **B7 (`DISPUTE_RESPONSE_REQUIRES_HUMAN`)**: Tanggapan terhadap sengketa selalu memerlukan telaah manusia sebelum dikirim ke PayPal.

---

## 4. Rincian Tahap C (AI Policy Intent Check)

- AI **HANYA DAPAT MEMPERKETAT** (`combineDecisions`). AI dilarang keras mengubah `REJECT` menjadi `AUTO_APPROVE` atau `REQUIRE_APPROVAL`.
- Bila AI tidak dapat diakses (*timeout* / penyedia AI gangguan), sistem *fail-closed* ke `REQUIRE_APPROVAL` atau `REJECT`.
