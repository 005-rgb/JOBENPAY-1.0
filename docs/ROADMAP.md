# JOBENPAY — Roadmap Pembangunan di Replit AI (presisi tinggi terhadap PRD v1.2)

Rekap singkat: langkah S00 mengikuti PRD 9.3, 9.10, 14.8, 15.1, 19.3 serta aturan kerja yang diuraikan di bagian A/B/D/G roadmap ini.

## A. Strategi inti

Masalah utama adalah kuota Replit AI habis dan akun bisa berganti, jadi repo harus menjadi memori proyek. Satu sumber kebenaran adalah PRD dan roadmap, serta progress/decisions di docs. Untuk S00, fokusnya adalah skeleton yang bersifat portabel dan aman: Node 22, JavaScript murni, CI guard, MIT license, kesehatan server, dan konfigurasi lingkungan.

## B. Aturan kerja agen

```md
# replit.md — aturan tetap proyek JOBENPAY

Kamu membangun JOBENPAY persis sesuai docs/PRD.md (v1.2). PRD menang atas ingatan/asumsi kamu.
Dilarang menebak. Jika PRD tidak jelas → baca docs/DECISIONS.md; jika masih tidak ada → TULIS pertanyaan di docs/PROGRESS.md bagian "Blockers" dan BERHENTI.

## Cara kerja tiap sesi
1. Baca docs/PROGRESS.md, lalu docs/DECISIONS.md.
2. Baca HANYA bagian docs/ROADMAP.md untuk langkah yang diminta, dan HANYA bagian PRD yang dirujuk langkah itu (pakai docs/prd/NN-*.md atau grep). JANGAN membaca seluruh PRD.
3. Kerjakan hanya langkah itu. Tidak ada fitur, refactor, atau "perbaikan" di luar langkah.
4. Jalankan perintah kriteria-lulus langkah. Perbaiki sampai hijau.
5. STOP-LOSS: jika tes yang sama gagal 3 kali berturut-turut dengan penyebab tidak jelas, berhenti. Tulis gejala, dugaan, dan file terkait di PROGRESS.md "Blockers". Jangan terus mencoba.
6. Akhiri dengan: perbarui docs/PROGRESS.md, git commit (pesan Inggris: `feat(Sxx): ...`), git push.

## Batas keras (tidak boleh dilanggar)
- JavaScript ES2023 di Node 22. Tanpa TypeScript, tanpa transpiler server, tanpa dependensi native. Tidak ada file .ts/.tsx.
- Sandbox-only: base URL PayPal adalah konstanta https://api-m.sandbox.paypal.com. Host live PayPal tidak boleh muncul di source.
- Uang = bigint satuan minor + currency char(3). Tidak pernah float. pg bigint dikembalikan sebagai string → parse ke BigInt/Number aman (<2^53) di satu helper saja.
- Semua query tabel bertenant lewat repository yang MEWAJIBKAN orgId.
- Operasi uang (reservasi anggaran, ubah status + tulis ledger) dalam SATU transaksi (withTx).
- Fail-closed: AI gagal/timeout/JSON tidak valid → REQUIRE_APPROVAL, tidak pernah AUTO_APPROVE. AI hanya memperketat.
- Agen tidak pernah mengeksekusi; kredensial PayPal tidak pernah ke klien/LLM/log.
- Tidak ada nilai warna/ukuran literal di luar web/src/styles/tokens.css.
- Tidak ada logo/nama PayPal sebagai identitas UI. Hanya label faktual ("Connect PayPal Sandbox").
- Nama endpoint/field/event PayPal ditandai [VERIFY] di PRD: cocokkan dengan dokumentasi resmi, catat hasilnya di DECISIONS.md.
- Tes server pakai `node --test`. Tidak ada Jest/Vitest di server.
- Jangan commit rahasia. Jangan menambah dependensi tanpa mencatat nama + lisensi di THIRD_PARTY_NOTICES.md (hanya MIT/Apache-2.0/BSD/ISC/0BSD).

## Perintah standar
npm run dev | start | migrate | seed | setup | test | test:unit | lint | guard
```

## D. Keputusan yang menutup celah PRD

| # | Celah di PRD | Keputusan |
| --- | --- | --- |
| D1 | 15.1: `app.cjs` mengimpor `./src/server.js`, tetapi pohon repo menaruh `src/` di dalam `server/` | `app.cjs` memanggil `import('./server/src/server.js')`. Cron: `node server/src/jobs/tick.js`. Skrip: `server/scripts/*.js` (migrate, seed, verify-ledger); `package.json` root menyediakan alias `npm run migrate` dst. |
| D2 | Struktur paket: kapan `shared/` dan `web/` punya `package.json`? | **Satu `package.json` root** untuk server + shared (impor relatif `../../shared/...`). `web/` punya `package.json` sendiri, memakai `shared/` lewat alias Vite `@shared`. `npm run setup` = `npm --prefix web ci && npm --prefix web run build && npm run migrate && npm run seed`. `web/dist` tidak di-commit; dibangun CI dan `setup`. |
| D3 | 9.7: rumus `entry_hash` memakai `‖` tanpa encoding; `created_at` timestamptz berpresisi mikrodetik vs JS milidetik | Encoding: `SHA-256(utf8( prev_hash + "\n" + canonical_json(payload) + "\n" + seq + "\n" + org_id + "\n" + type + "\n" + created_at_iso ))`. `created_at_iso` = string ISO-8601 UTC **milidetik** yang dibuat di aplikasi dan disimpan di kolom `created_at` (jangan `now()` DB). `prev_hash` entri pertama = 64 nol. Tanda tangan Ed25519 atas `entry_hash` (hex). |
| D4 | 10.1: canonical JSON | Fungsi tunggal `canonicalJson()` di `shared/canonical.js`: kunci terurut leksikografis rekursif, tanpa spasi, `undefined` dibuang, angka JSON biasa, tanpa float untuk uang. Dipakai untuk policy, request_hash, ledger. Diuji dengan vektor tetap. |
| D5 | 10.2: `request_hash` untuk PAYOUT | Payload hash: `{orgId, agentId, mandateVersionId, action, amountMinor (string), currency, payeeId, targetRef: null, documentSha256 (atau null)}`. |
| D6 | Periode anggaran (`mandate_budget_periods`) dibuat kapan | Dibuat malas (lazy) saat reservasi pertama pada periode berjalan, dalam zona waktu `schedule.timezone`. Periode MONTH = bulan kalender. Reservasi: `UPDATE ... SET reserved_minor = reserved_minor + $x WHERE reserved+spent+$x <= limit` (satu statement atomik; 0 baris = `BUDGET_EXCEEDED`). |
| D7 | Eksekusi: kapan `reserved` → `spent` | Saat status → EXECUTED (respons PayPal sukses). REJECTED/FAILED/CANCELLED/EXPIRED melepas reservasi. |
| D8 | Kode alasan | Satu berkas `shared/error-codes.js` berisi semua kode di PRD 9.5 (A, B, C) + kode umum (`UNAUTHENTICATED`, `FORBIDDEN`, `VALIDATION_FAILED`, `NOT_FOUND`, `RATE_LIMITED`, `IDEMPOTENCY_CONFLICT`, `STEP_UP_REQUIRED`, dll.) dengan pesan EN. |
| D9 | Seed demo | `seed.js` idempoten membuat: org "JOBENPAY Demo", user `owner@`, `judge@` (JUDGE), `approver@`, `viewer@`; kata sandi dari env `SEED_*_PASSWORD` (jika kosong, dibangkitkan acak dan dicetak sekali). Agen demo, mandat demo (US$50 total, US$15 per transaksi, sesuai 9.11), 3 payee sintetis, invoice contoh. Semua berlabel "SYNTHETIC". |
| D10 | Preset JUDGE di skema | Role disimpan sebagai `memberships.role` ∈ {OWNER, ADMIN, APPROVER, OPERATOR, VIEWER} + kolom `is_judge boolean`. Hak JUDGE = OWNER kecuali kredensial PayPal, manajemen anggota, hapus org (13.3). |
| D11 | Konfigurasi AI untuk Replit | `AI_PROVIDER` ∈ {`anthropic`, `openai`, `replay`}. Default dev: `replay`. Rekaman di `server/test/ai-eval/recordings/`. UI menampilkan banner "REPLAY MODE" bila `replay`. |
| D12 | Waktu | Semua timestamp server di UTC; konversi zona hanya untuk jadwal mandat dan tampilan UI. |
| D13 | Tabel Tier B | Skema tetap dibuat lengkap (agar migrasi tidak berubah), tetapi UI/endpoint Tier B tidak dibuat. |
| D14 | Hasil spike G0 (PayPal/Passenger) | Ditulis di `docs/SPIKE.md` oleh Anda/agen, lalu keputusan (mis. "Payouts tersedia: ya/tidak, aksi pengganti: ...") disalin ke DECISIONS. |

## G. Templat `docs/PROGRESS.md`

```md
# PROGRESS

## Status ringkas
- Langkah terakhir SELESAI: (mis. S05)
- Langkah AKTIF: (mis. S06, status WIP/IDLE)
- Gerbang terakhir lulus: (mis. G0)

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE) | Commit | Jam aktual | Catatan |
| S00 | TODO | | | |
... (S00–S19, F01–F06)

## Resume (diisi saat WIP)
- Sudah selesai: ...
- Belum: ...
- File setengah jadi: ...
- Perintah lanjut: ...

## Blockers
(kosong)

## Pertanyaan untuk pemilik proyek
(kosong)
```

## E-S00 — Skeleton, CI, aturan tetap

- PRD: 9.3, 9.10, 14.8, 15.1, 19.3.
- Buat: struktur repo 15.1 (+ D1, D2); `package.json` (`type: module`, `engines: >=22.13 <23`, `license: MIT`), `.nvmrc`=22, `LICENSE` MIT, `.gitignore`, `.env.example` (semua env dari 15.3 langkah 4 + `SEED_*`, `AI_DAILY_BUDGET_USD`, `REGISTRATION_ENABLED`), `replit.md`, `docs/prd/NN-*.md` (potongan PRD per heading `## N.` via skrip `scripts/split-prd.js`), `docs/PROGRESS.md`, `docs/DECISIONS.md`, `app.cjs`, `server/src/server.js` (Express 5 minimal: `/healthz`, `/readyz` stub; boot gagal jika `process.versions.node` bukan mayor 22), `server/src/config.js` (Zod), `docker-compose.yml`, `.github/workflows/ci.yml`, `scripts/guard.js` (pagar 14.8: bukan Node 22, ada `.ts/.tsx`, LICENSE hilang, host live PayPal di source, dependensi native, lisensi di luar allowlist, README tanpa bagian wajib), `eslint`+`prettier`, secret scan (gitleaks di CI).
- Lulus bila: `node -v` = 22.x; `npm run guard` hijau; `npm run lint` hijau; `GET /healthz` 200; `git log` ada commit pertama bertanggal 30 Okt 2026; GitHub About menampilkan lisensi MIT.
- Jangan: menambah fitur, tabel, atau UI.
