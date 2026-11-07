# AGENTS.md — Working Rules & System Architecture for AI Builders

Dokumen ini adalah aturan kerja permanen untuk setiap AI builder (backend, database, keamanan, frontend) yang bekerja pada **JOBENPAY Universal Transaction Engine**.

---

## 1. Peran & Prinsip (Preamble A.1 & A.2)
Anda adalah AI builder senior untuk **JOBENPAY Universal Transaction Engine**. Anda bekerja dengan presisi tinggi pada sistem yang menggerakkan uang (PayPal Sandbox). Kesalahan kecil di ledger, state machine, atau idempotensi adalah kegagalan produk. Anda tidak boleh menebak, tidak boleh berimprovisasi pada logika uang, dan tidak boleh mengklaim selesai tanpa bukti tes.

**Produk:** Sistem yang menjalankan 15 kategori transaksi (28 pasangan kategori/sub-tipe) end-to-end: double-entry ledger yang selalu seimbang, state machine yang ditegakkan, policy engine bertahap (A/B/C/D) di mana AI hanya boleh **memperketat**, SAR per transaksi, idempotensi, rekonsiliasi, UI, dan test suite 100% hijau. Agen AI eksternal hanya **mengusulkan** transaksi; hanya manusia yang menyetujui; tidak ada tool MCP untuk approve/execute/cancel.

---

## 2. Stack Terkunci (Preamble A.3)
- **Runtime:** Node.js 22 LTS (`engines: ">=22.13 <23"`).
- **Bahasa:** JavaScript murni ESM (Dilarang keras TypeScript).
- **Web & Framework:** Express 5 (Backend), React 18 + Vite (Frontend).
- **Basis Data:** PostgreSQL 13+ (PostgreSQL 18.6 pada lingkungan aktif).
- **Validasi:** Zod 4.
- **Logging:** Pino (dengan redaksi otomatis rahasia & token).
- **Dependensi:** Tanpa dependensi native. Dilarang menambah dependensi baru tanpa persetujuan manusia dan catatan keputusan di `docs/DECISIONS.md`.
- **PayPal:** **Hanya Sandbox**. Host live dilarang keras dan dijaga oleh CI guard.

---

## 3. Aturan Emas PRD 1.3 §0
1. **Setiap transaksi menghasilkan double-entry ledger balanced** (`SUM(DEBIT) = SUM(CREDIT)` per mata uang). Trigger DB menolak insert yang tidak seimbang.
2. **Setiap kategori punya state machine eksplisit**; transisi ilegal ditolak oleh `transition()` dengan **HTTP 409 `ILLEGAL_TRANSITION`**.
3. **Setiap kategori punya aturan policy Tahap A/B/C/D**. AI hanya memperketat (tidak pernah mengubah REJECT → APPROVE).
4. **Setiap transaksi menghasilkan SAR** dengan `category`, `sub_type`, dan `legs_summary`.
5. **Idempotency wajib untuk semua mutasi**. Klien mengirim `Idempotency-Key` (unik per org); kunci ke PayPal diturunkan `PayPal-Request-Id = jp_{intent_id}_{step}`. Kunci sama + payload berbeda → **422 `IDEMPOTENCY_KEY_REUSED`**.
6. **Tidak ada bypass gerbang**: semua kategori wajib melewati Decision Engine yang sama (`EVALUATING` → `APPROVED`).

---

## 4. Aturan Keras Builder (Preamble A.5)
- **Tidak menebak:** Bila ada hal ambigu, jalankan Protokol Berhenti (A.7) dan catat di `docs/spec-gaps.md`.
- **Tidak mengubah tes agar lulus.**
- **Semua query lewat repository yang mewajibkan `orgId`.**
- **Semua mutasi uang dalam satu transaksi DB (`withTx`) bersama penulisan ledger** (`SELECT ... FOR UPDATE`).
- **Uang = BigInt satuan minor** via `money.js`. Dilarang `parseFloat` dan `Number()` pada variabel moneter.
- **Spesifikasi sebagai data di `shared/`:** State machine, error codes, policy rules berada di `shared/`.
- **Fail-closed:** Keraguan pada uang = REJECT atau REQUIRE_APPROVAL.
- **Akun "escrow" adalah akun buku internal, bukan escrow perbankan/PayPal.**

---

## 5. Peta Repositori (Repository Map)
```text
JOBENPAY-1.0/
├─ app.cjs                                # Startup bootstrap Passenger (cPanel)
├─ package.json                           # Config modul, engines, scripts
├─ AGENTS.md                              # Dokumen aturan kerja ini
├─ paypal/
│  └─ endpoints.js                        # Katalog tunggal terkunci endpoint PayPal
├─ server/
│  ├─ src/
│  │  ├─ app.js                           # Express application routes & security middleware
│  │  ├─ config.js                        # Konfigurasi runtime & environment guards
│  │  ├─ services/                        # Layanan bisnis (ledger, requests, evaluations, auth)
│  │  ├─ repositories/                    # Akses PostgreSQL terisolasi tenant (orgId)
│  │  ├─ jobs/                            # PostgreSQL job queue & background workers
│  │  └─ email/                           # Outbox worker terenkripsi AES-256-GCM & templates
│  ├─ migrations/                         # Migrasi skema database terurut
│  ├─ scripts/                            # migrate.js, seed.js, verify-ledger.js
│  └─ test/                               # Test suite node --test (unit, integration, security)
├─ shared/                                # Skema Zod, error-codes, canonical, state machines
├─ web/                                   # React 18 + Vite frontend
├─ spikes/                                # Skrip spike Sandbox per kategori & buyer harness
├─ fake-paypal/                           # Mock server PayPal stateful untuk pengujian offline CI
├─ cassettes/                             # Rekaman kaset HTTP deterministik
├─ docs/
│  ├─ spec/                               # Dokumen spesifikasi terkunci (READ-ONLY)
│  │  ├─ addendum.md                      # Addendum AD-01 s/d AD-37
│  │  ├─ tier-c-and-thin-specs.md         # Spesifikasi lengkap FINANCING, DEBIT, BULK, SPLIT
│  │  ├─ sandbox-support-matrix.md        # Matriks 28 baris dukungan Sandbox
│  │  ├─ webhook-catalog.md               # Katalog event webhook
│  │  ├─ verify-closure.md                # Tabel penutupan [VERIFY]
│  │  └─ sql/                             # Skema DDL & tes insert terverifikasi
│  ├─ spec-gaps.md                        # Daftar kesenjangan spesifikasi (Protokol Berhenti)
│  └─ traceability.csv                    # Matriks penelusuran FR, PRD §13, AD, T
└─ scripts/                               # Pagar CI (guard, lint-money, check-traceability, ccc)
```

---

## 6. Berkas Read-Only (Dilarang Diubah Tanpa Otorisasi Manusia)
Seluruh berkas di bawah direktori `docs/spec/*` berstatus **READ-ONLY**:
- `docs/spec/Blueprint_1_2.md`
- `docs/spec/addendum.md`
- `docs/spec/tier-c-and-thin-specs.md`
- `docs/spec/sql/*`
Perubahan pada berkas spesifikasi hanya boleh dilakukan melalui pembuatan dokumen Addendum baru yang disetujui manusia.

---

## 7. Perintah Pengujian & Pagar CI
- `npm test`: Menjalankan seluruh test suite (280+ tes).
- `npm run test:unit`: Menjalankan seluruh tes unit secara cepat.
- `npm run guard`: Memeriksa kepatuhan arsitektur, lisensi, dan batasan Sandbox.
- `npm run lint`: Memeriksa sintaksis JavaScript.
- `node scripts/lint-no-float-money.js`: Memeriksa larangan float/Number pada moneter.
- `node scripts/check-traceability.js`: Memeriksa kelengkapan 100% ID di traceability.csv.
- `node scripts/check-insert-tests.js`: Memeriksa pasangan uji insert SQL.
- `node scripts/ccc-check.js <KATEGORI>`: Memeriksa kelengkapan 14 butir implementasi kategori.

---

## 8. Aturan JOBENPAY 1.3-R (brownfield di atas PRD v1.2)

Sumber kebenaran: docs/spec/PRD_1_3R.md (PRD-R) > PRD v1.2 (perilaku yang SUDAH ADA) > docs/EVOLUTION.md > ingatanmu.
PRD v1.2 sudah dibangun dan berjalan. KAMU MENAMBAH, tidak membangun ulang. Perilaku PAYOUT/REFUND/ACCEPT_DISPUTE 1.2
tidak boleh berubah. Regresi = paket gagal.

### Siklus kerja per paket (berurutan)
1. Baca AGENTS.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/spec-gaps.md, lalu HANYA bagian PRD-R yang dirujuk paket.
2. Jalankan `npm test` DULU dan simpan jumlah lulus (baseline). Seluruh tes lama harus tetap hijau.
3. Verifikasi struktur repo aktual (ls/grep). JANGAN menebak nama berkas, tabel, kolom, atau fungsi. Bila beda dari PRD-R,
   pakai nama aktual dan catat di docs/spec/deviations.md.
4. Tulis rencana singkat (berkas, migrasi, nama tes, risiko), lalu TULIS TES YANG GAGAL LEBIH DULU (dibangkitkan dari data di shared/).
5. Implementasi minimal sampai hijau. Jalankan SELURUH CI (lint, unit, integrasi, konkurensi, guard, tes-dari-data, uji insert CHECK).
6. Perbarui docs/traceability.csv dan docs/PROGRESS.md. Commit `feat(BW-xx): ...`, push.

### Protokol berhenti (spec-gap)
Berhenti pada bagian terdampak bila: spesifikasi ambigu; dua sumber bertabrakan; perilaku PayPal belum terbukti di cassette;
kolom/endpoint/status/aturan tidak ada di PRD-R/1.2; atau butir [VERIFY] belum ditutup. Tulis docs/spec-gaps.md:
`SG-nnn — judul | Sumber A (berkas+bagian+kutipan<15 kata) | Sumber B | Pertanyaan tepat | Opsi≥2+konsekuensi | Bagian yang diblokir | Status OPEN`.
Lapor dan TUNGGU. Dilarang melanjutkan dengan "asumsi sementara". Keputusan manusia menjadi entri di docs/DECISIONS.md.

### Batas keras
- JavaScript ES2023 Node 22, tanpa TypeScript, tanpa dependensi native; dependensi baru hanya dengan catatan keputusan + lisensi allowlist.
- Hanya PayPal Sandbox (konstanta); hasil simulator selalu provider:"simulated" + label UI SIMULATED; label SANDBOX permanen.
- Uang = BigInt satuan minor + currency char(3) via helper tunggal; dilarang float/parseFloat/Number pada jalur uang (lint menggagalkan).
- Semua query lewat repository yang MEWAJIBKAN orgId; semua tabel baru: org_id NOT NULL + indeks diawali org_id + RLS/isolasi + tes isolasi.
- Mutasi uang (status + reservasi + jurnal + ledger bukti) dalam SATU transaksi (withTx). Ledger bukti (ledger_entries) ≠ jurnal akuntansi (journal_*).
- Tidak ada jalur yang melewati Decision Engine. Agen tidak punya tool/endpoint approve/execute/cancel. AI hanya memperketat; gagal → REQUIRE_APPROVAL.
- Spesifikasi sebagai data di shared/ (state-machines, policy-rules, journal-rules, webhook-routes, provider-status-maps, error-codes); tes DIBANGKITKAN dari data.
- Semua path/event/field PayPal hanya di providers/paypal/endpoints.js (hasil spike). Webhook = sinyal: verifikasi tanda tangan + cocokkan jumlah/mata uang/ref.
- Akun liability:* = catatan buku organisasi, BUKAN dana yang dipegang JOBENPAY. Dilarang nama/teks yang menyiratkan escrow JOBENPAY.
- Rahasia (token, kunci, kata sandi) tidak pernah di log/respons/fixture/cassette. Payload ledger bukti tanpa PII/identifier/teks bebas (id, enum, angka, hash).
- Jangan ubah tes lama kecuali spesifikasi berubah; bila diubah beri label test-changed + alasan tertulis. Kamu tidak boleh menyetujui merge sendiri.
- Diff kecil: satu paket, tanpa refactor di luar berkas yang diizinkan paket.


