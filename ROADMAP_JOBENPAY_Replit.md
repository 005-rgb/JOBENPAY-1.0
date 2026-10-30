# JOBENPAY — Roadmap Pembangunan di Replit AI (presisi tinggi terhadap PRD v1.2)

Berkas ini dimasukkan ke repo sebagai `docs/ROADMAP.md`. PRD ditaruh di `docs/PRD.md`. **Repo adalah memori proyek.** Akun Replit boleh ganti kapan saja; konteks tidak hilang karena semua keputusan, status, dan spesifikasi langkah ada di berkas.

---

## A. Strategi inti (kenapa roadmap ini berbentuk begini)

Masalah: kuota Replit AI habis → ganti akun → agen baru tidak tahu apa-apa → risiko menyimpang dari PRD, mengulang kerja, atau boros kuota membaca PRD 1 megabyte-an.

Solusi (6 mekanisme):

1. **Satu sumber kebenaran di repo:** `docs/PRD.md` (utuh), `docs/prd/NN-*.md` (potongan per bagian), `docs/ROADMAP.md` (spesifikasi langkah S00–S30), `docs/PROGRESS.md` (status), `docs/DECISIONS.md` (keputusan yang menutup celah PRD), `replit.md` (aturan tetap yang otomatis dibaca agen).
2. **Prompt per sesi selalu sama, pendek** (Bagian C). Yang berubah hanya ID langkah. Detail langkah sudah di repo, tidak perlu Anda ketik ulang.
3. **Satu langkah = satu unit kerja yang selesai dalam satu sesi/kuota**, dengan kriteria lulus berupa perintah yang bisa dijalankan (`npm test ...`). Tidak ada "kira-kira selesai".
4. **Commit + push GitHub di akhir setiap langkah.** Akun baru tinggal *Import from GitHub*, lalu tempel prompt pembuka.
5. **Aturan hemat kuota** (Bagian B): membaca hanya bagian PRD yang ditunjuk, tes sebagai hakim, berhenti setelah 3 kali gagal, tanpa refactor di luar langkah.
6. **Kerja yang tidak butuh AI dikerjakan manual** (Bagian F): spike PayPal, color-picker token, deploy cPanel, Devpost.

**Batas Replit yang harus diketahui sejak awal** (tidak ada di PRD):

| Hal | Konsekuensi |
| --- | --- |
| Replit bukan cPanel | Replit hanya **lingkungan pengembangan**. Deploy produksi ke cPanel dilakukan manual (Bagian F, M-DEPLOY). Kode hanya bergantung pada `DATABASE_URL`, env, `npm start`, jadi portabel. |
| Tidak ada Docker di Replit | `docker compose` (PRD 15.11/metrik 8) **dibuat sebagai berkas** tapi diuji di GitHub Actions, bukan di Replit. |
| Node 22 | Set di `.replit`/Nix: modul `nodejs-22` (cek ketersediaan; jika tidak ada, catat di DECISIONS dan beri tahu saya). |
| Playwright + pixelmatch + Liberation Sans terkunci | **Jangan dijalankan di Replit.** Jalankan di GitHub Actions (image Playwright dipin). Di Replit cukup tes geometri ringan jika memungkinkan. |
| PostgreSQL | Pakai PostgreSQL bawaan Replit (≥ 13). `gen_random_uuid()` harus tersedia. |
| Secret | Isi lewat panel Secrets Replit, bukan berkas. Jangan commit `.env`. |

---

## B. Aturan kerja agen (dimasukkan ke `replit.md`)

Salin blok ini **persis** ke `replit.md` di root repo (langkah S00 mengerjakannya, tapi Anda boleh membuatnya manual dulu).

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

---

## C. Prompt tetap (yang Anda tempel ke Replit)

### C.1 Prompt PEMBUKA (tempel di awal setiap sesi/akun baru; ganti `Sxx`)

```text
Baca replit.md, docs/PROGRESS.md, docs/DECISIONS.md. Lalu kerjakan LANGKAH Sxx dari docs/ROADMAP.md
(hanya bagian itu + bagian PRD yang ia rujuk). Jangan baca seluruh PRD. Jangan mengerjakan di luar langkah.
Sebelum menulis kode, tulis rencana singkat (daftar file yang akan dibuat/diubah) dan langsung eksekusi.
Selesai bila semua perintah "Lulus bila" di langkah itu hijau. Jika gagal 3x berturut-turut: berhenti dan
catat di PROGRESS.md "Blockers". Akhiri: update PROGRESS.md, git commit, git push.
```

### C.2 Prompt PENUTUP (jika kuota hampir habis di tengah langkah)

```text
Kuota hampir habis. Jangan mulai pekerjaan baru. Sekarang: (1) jalankan `npm run lint && npm test` dan
catat hasilnya; (2) di docs/PROGRESS.md tulis: langkah aktif, sub-butir yang SUDAH selesai, yang BELUM,
file yang setengah jadi, dan perintah tepat untuk melanjutkan; (3) commit dengan pesan `wip(Sxx): ...` dan push.
```

### C.3 Prompt LANJUT setelah ganti akun (langkah belum selesai)

```text
Lanjutkan LANGKAH Sxx yang berstatus WIP di docs/PROGRESS.md. Baca bagian "Resume" di sana, lalu bagian
Sxx di docs/ROADMAP.md. Kerjakan HANYA sisa butir yang belum selesai. Jalankan kriteria "Lulus bila".
```

### C.4 Prompt PEMERIKSA (sisipkan setelah tiap gerbang; murah dan mencegah penyimpangan)

```text
Audit TANPA mengubah kode: bandingkan implementasi langkah Sxx dengan bagian PRD yang dirujuk. Keluarkan tabel:
[ID requirement | terpenuhi Ya/Sebagian/Tidak | file:baris | catatan]. Tandai setiap penyimpangan dari PRD.
Tulis hasilnya ke docs/audit/Sxx.md. Jangan memperbaiki apa pun.
```

Lalu perbaikannya di sesi terpisah: `Perbaiki hanya butir "Tidak/Sebagian" di docs/audit/Sxx.md.`

### C.5 Prompt BLOCKER (agen buntu / loop)

```text
Berhenti mengubah kode. Baca "Blockers" di PROGRESS.md. Jelaskan akar masalah dalam ≤ 10 baris dan 2 opsi
perbaikan dengan trade-off. Jangan menerapkan apa pun sebelum saya memilih.
```

---

## D. Keputusan yang menutup celah PRD (masukkan ke `docs/DECISIONS.md` pada S00)

Saya menemukan ketidakkonsistenan kecil di PRD v1.2. Tanpa keputusan di bawah, agen akan menebak berbeda tiap akun.

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

Tambahkan butir baru ke tabel ini setiap kali ada keputusan; jangan pernah menyimpan keputusan hanya di percakapan.

---

## E. Spesifikasi langkah (S00–S30)

Format tiap langkah: **PRD** (bagian yang dibaca) · **Buat** · **Lulus bila** (perintah/uji) · **Jangan** (batas). Perkiraan jam mengacu pada Bagian 16.2 PRD.

### FASE 0 — Fondasi (menuju G0, 30–31 Okt)

**S00 — Skeleton, CI, aturan tetap (≈3 jam)**
- PRD: 9.3, 9.10, 14.8, 15.1, 19.3.
- Buat: struktur repo 15.1 (+ D1, D2); `package.json` (`type: module`, `engines: >=22.13 <23`, `license: MIT`), `.nvmrc`=22, `LICENSE` MIT, `.gitignore`, `.env.example` (semua env dari 15.3 langkah 4 + `SEED_*`, `AI_DAILY_BUDGET_USD`, `REGISTRATION_ENABLED`), `replit.md` (Bagian B), `docs/prd/NN-*.md` (potongan PRD per heading `## N.` via skrip `scripts/split-prd.js`), `docs/PROGRESS.md` (templat di Bagian G), `docs/DECISIONS.md` (isi tabel D), `app.cjs`, `server/src/server.js` (Express 5 minimal: `/healthz`, `/readyz` stub; boot gagal jika `process.versions.node` bukan mayor 22), `server/src/config.js` (Zod), `docker-compose.yml` (PostgreSQL), `.github/workflows/ci.yml`, `scripts/guard.js` (pagar 14.8: bukan Node 22, ada `.ts/.tsx`, LICENSE hilang, host live PayPal di source, dependensi native, lisensi di luar allowlist, README tanpa bagian wajib), `eslint`+`prettier`, secret scan (gitleaks di CI).
- Lulus bila: `node -v` = 22.x; `npm run guard` hijau; `npm run lint` hijau; `GET /healthz` 200; `git log` ada commit pertama bertanggal 30 Okt 2026; GitHub About menampilkan lisensi MIT.
- Jangan: menambah fitur, tabel, atau UI.

**S01 — Spike kemampuan (kode pendukung; ≈3 jam, sebagian manual)**
- PRD: 17.2 butir 1–4, 9.8, 16.2 WP0.
- Buat: `scripts/spike/paypal-oauth.js`, `paypal-payout.js` (payout sandbox US$1 ke penerima sandbox), `webhook-echo.js` (endpoint publik yang mencatat header + body dan memanggil verify-webhook-signature), `ai-json.js` (panggilan AI berskema Zod ≤ 20 dtk), `docs/SPIKE.md` (templat laporan go/no-go a–d dari G0).
- Lulus bila: Anda menjalankan skrip dengan kredensial sandbox Anda dan mengisi `docs/SPIKE.md` (a: payout berhasil atau aksi pengganti; b: webhook publik terverifikasi; c: Node 22 + `app.cjs` hidup di cPanel atau Plan B; d: AI mengembalikan JSON valid).
- Jangan: menyentuh kode produk. Kredensial hanya lewat env, tidak di-commit.
- **Gerbang G0** → Bagian F, checklist G0.

### FASE 1 — Backend inti (menuju G1, 31 Okt–2 Nov)

**S02 — Data layer & utilitas (≈3 jam)**
- PRD: 10, 10.1, 10.2, 9.3, 8 (observabilitas), D3–D8.
- Buat: `server/migrations/001_*.sql` … (semua tabel Bagian 10 termasuk Tier B; trigger immutable `mandate_versions`, trigger tolak UPDATE/DELETE `ledger_entries`; `CHECK reserved+spent<=limit`; unique parsial satu mandat ACTIVE per agent; index diawali `org_id`; email `lower()` unique), `server/scripts/migrate.js` (advisory lock, `schema_migrations`, hanya maju), `server/src/db/pool.js` (maks 5, statement_timeout 10 dtk, parser bigint), `withTx`, `shared/canonical.js`, `shared/error-codes.js`, `server/src/lib/{crypto,errors,logger}.js` (AES-256-GCM dengan AAD `table:column:orgId`, HMAC, scrypt N=2^15 r=8 p=1, Ed25519 sign/verify, TOTP stub kosong), pino dengan redaksi (9.3).
- Lulus bila: `npm run migrate` dari DB kosong sukses dan idempoten; `node --test server/test/unit/` hijau untuk canonicalJson (vektor tetap), AES round-trip + AAD salah gagal, scrypt+timingSafeEqual, Ed25519 round-trip; percobaan UPDATE pada `ledger_entries` dan `mandate_versions` ditolak trigger (tes).
- Jangan: membuat endpoint.

**S03 — Ledger (≈4 jam; dikerjakan SEBELUM auth penuh karena semua langkah lain menulis ledger)**
- PRD: 9.7, FR-901–902, D3, 14.4.
- Buat: `server/src/services/ledger.js` (`appendEntry(tx, {orgId,type,subjectType,subjectId,payload})` dengan `ledger_heads FOR UPDATE`), `verifyChain(orgId)` → `{valid, checkedEntries, firstBrokenSeq}`, ekspor JSON, CLI `server/scripts/verify-ledger.js` (`parseArgs`), manajemen `kid` kunci tanda tangan.
- Lulus bila: tes unit+integrasi: 100 entri paralel pada satu org → `seq` tanpa lubang; tamper (ubah 1 byte payload, hapus entri, tukar urutan, ubah signature) terdeteksi 100% dengan `firstBrokenSeq` benar; ledger antar-org terisolasi.
- Jangan: membuat UI ledger.

**S04 — Auth, sesi, RBAC, step-up, seed (≈6 jam)**
- PRD: FR-102, FR-105, 13.2, 13.3, 11.1 (Auth), D9, D10.
- Buat: login/logout/`/auth/me`, cookie `jp_sid`, hash token sesi, CSRF per sesi, lockout 5/15 mnt, rate limit via `rate_limit_buckets`, middleware `requireRole`, preset JUDGE, `POST /auth/step-up` (password; grant ≤ 5 mnt, sekali pakai per purpose), `REGISTRATION_ENABLED=0` menolak `/auth/register`, `seed.js` (D9), `audit_events` untuk aksi sensitif.
- Lulus bila: tes integrasi: login benar/salah, lockout, CSRF ditolak tanpa token, role ditolak sesuai matriks 13.3 (tabel-driven test seluruh baris Tier A), **isolasi lintas tenant** (user org A tidak bisa membaca resource org B untuk setiap repository yang ada), step-up kedaluwarsa/sekali pakai.
- Jangan: TOTP, registrasi, reset password (Tier B).

**S05 — Koneksi PayPal + penerima webhook (≈5 jam)**
- PRD: 9.6 (webhook), 9.10, FR-201–203, 11.1 (PayPal, Webhook), [VERIFY] 1 & 3, hasil `docs/SPIKE.md`.
- Buat: `server/src/paypal/client.js` (konstanta base URL, OAuth token cache, `fetch` + `AbortSignal.timeout`, retry hanya 429/5xx/jaringan), `paypal_connections` CRUD (kredensial terenkripsi, tidak pernah dikembalikan ke klien), tes koneksi, `POST /webhooks/paypal/:webhookToken` (rate limit 120/mnt/token, verifikasi tanda tangan, dedup `paypal_event_id` unik, simpan lalu enqueue `process_webhook`), simulasi PayPal palsu `server/test/helpers/fake-paypal.js` (dipakai semua tes berikutnya).
- Lulus bila: tes dengan fake-paypal: koneksi sukses/gagal; webhook tanda tangan salah → 400 & tidak disimpan sebagai verified; event duplikat tidak diproses dua kali; guard menolak host live; kredensial tidak muncul di log (tes redaksi).

**S06 — Agen, API key, payee (≈4 jam)**
- PRD: FR-301–303, FR-501–502, 13.2 (API key), 11.1.
- Buat: CRUD agen; key `jp_sbx_<prefix8>_<secret32>` (HMAC+pepper, tampil sekali, revoke, rotasi, `last_used_at`); middleware auth agen (Bearer) + rate limit 60/mnt/key; CRUD payee (identifier terenkripsi + HMAC + masked), `payee_revisions` otomatis saat identifier berubah, `POST /payees/:id/trust` (step-up).
- Lulus bila: key hanya terlihat sekali; key revoked → 401; agen A tidak bisa membaca resource agen B; mengubah identifier payee menghasilkan revisi; identifier tidak pernah muncul plaintext di respons/log.

### FASE 2 — Antarmuka dasar (menuju G1, 1–2 Nov; boleh paralel dengan S05–S06)

**F01 — Token, design-spec, parity fixture (≈2 jam; prasyarat manual M-TOKEN selesai)**
- PRD: 12.1, 12.2, 12.11, FR-1301, FR-1306.
- Buat: `web/` (Vite+React JSX), `web/src/styles/tokens.css` (nilai final dari color-picker Anda), `docs/ui-reference/design-spec.json` (selector/property/expected/tolerance dari 12.2–12.4), `stylelint` pelarang nilai literal, rute dev-only `/__parity/s1` dan `/__parity/s2` (tidak masuk build produksi), `scripts/geometry-test.js` (Playwright; **jalan di CI**).
- Lulus bila: `npm --prefix web run build` hijau; stylelint hijau; di CI tes geometri S1/S2 hijau.
- Jangan: halaman produk.

**F02 — App shell (≈4 jam)**
- PRD: 12.3, 12.4 (Button, Link, Modal, Toast, Tooltip), 12.6, 12.8, FR-1302, FR-1305.
- Buat: sidebar 240, Create menu, nav + submenu (penamaan 12.3), header 72 dengan chip SANDBOX, ikon `</>`, lonceng+badge, avatar, tab Feedback, footer penuh (FR-1304), wordmark JOBENPAY buatan sendiri, Radix yang di-skin, ikon `lucide-react` stroke 1.5, i18next (EN saja di Tier A; kunci siap ID), CSP sesuai 13.2.
- Lulus bila: geometri sidebar/header/Create/footer pada `/__parity/s1` & `s2` dalam toleransi ±2 px; tidak ada string "PayPal" di aset UI selain label faktual (grep otomatis); tidak ada overflow horizontal di 1366.

**F03 — Login + Home + Agents + Payees + Settings PayPal (≈6 jam)**
- PRD: 12.5 (baris `/login`, `/dashboard`, form), 9.2, FR-1201 (dasar), FR-1203 (kill switch UI), 11.1.
- Buat: `/login`, `/dashboard` (S1: caption "Remaining mandate budget", tile "Connect PayPal Sandbox", Quick Access 7 item, Agent Performance 6 kartu — data dari `GET /dashboard/summary`), `/agents`, `/agents/:id` (key tampil sekali dengan banner), `/payees`, `/settings/paypal` (+ tes koneksi + URL webhook), kill switch (`/org/freeze`, `/org/unfreeze` dengan step-up dialog) + banner merah.
- Lulus bila: dari UI Anda dapat login → hubungkan PayPal sandbox → buat agen & key → buat payee; polling 3 detik pada daftar aktif; state wajib (12.4: default/hover/fokus/disabled/loading/error/kosong/skeleton) ada di komponen.
- **Gerbang G1** → Bagian F.

### FASE 3 — Otak sistem (menuju G2, 3–5 Nov)

**S07 — Adapter AI + dokumen + ekstraksi + deteksi injeksi (≈6 jam)**
- PRD: 9.8, FR-503–505, 13.1 (injeksi, unggahan), D11, 9.11.
- Buat: `server/src/ai/{index,anthropic,openai,replay}.js` (`generateStructured({task,schema,input})`, temp 0, timeout 20 dtk, 1 retry, validasi Zod, prompt berversi, penghitung biaya harian `AI_DAILY_BUDGET_USD` → melewati batas = error terklasifikasi), prompt: delimiter data + larangan mengikuti instruksi dalam dokumen + tanpa tool; upload multipart (magic bytes PDF/PNG/JPG/TXT, ≤ 10 MB, nama acak, di luar web root, SHA-256, stream), job `extract_document` (TXT dan PDF teks), `injection_flags` = heuristik (pola instruksi, teks tersembunyi) + AI.
- Lulus bila: dokumen berinjeksi contoh → `injection_flags` terisi; file palsu (ekstensi ≠ magic bytes) ditolak; AI timeout/JSON rusak → error terklasifikasi (bukan crash); mode `replay` menjalankan semua tes tanpa kunci.

**S08 — Mandat (≈6 jam)**
- PRD: 10.1, FR-401–405, 13.2 (step-up `ACTIVATE_MANDATE`), D4, D6.
- Buat: skema Zod policy (`shared/policy.schema.js`, sama persis dengan 10.1), parser NL→policy (AI, tervalidasi), editor manual (validasi), versi immutable, aktivasi (step-up) → `policy_canonical`, `policy_hash`, tanda tangan Ed25519, entri ledger `MANDATE_ACTIVATED`, satu ACTIVE per agen, suspend/revoke, `GET /mandates/:id/budget`.
- Lulus bila: UPDATE `mandate_versions` ditolak; aktivasi kedua pada agen yang sama menonaktifkan/menolak sesuai aturan; tanda tangan dapat diverifikasi ulang; ledger memuat entri aktivasi; policy tidak valid ditolak dengan pesan terbaca.

**S09 — Decision Engine Tahap A + B + reservasi anggaran + state machine (≈6 jam)**
- PRD: 9.4, 9.5 Tahap A (aturan 1–13) & B, FR-601 (**PAYOUT saja**), FR-602–604, D5–D8.
- Buat: `transition(tx, request, to, actor)` (tolak transisi ilegal, tulis ledger, kelola reservasi), tiap aturan A sebagai fungsi murni + kode alasan, Tahap B (penanda), reservasi atomik (D6), deteksi duplikat, `request_hash`, `request_evaluations`.
- Lulus bila: **tabel-driven test: satu tes minimal per aturan A1–A13 dan per penanda B** (nama tes memuat kode alasan); semua transisi legal/ilegal diuji; 50 usulan paralel → 0 overshoot anggaran; keputusan tanpa AI p95 < 300 ms (uji beban ringan).
- Jangan: REFUND/ACCEPT_DISPUTE (aturan 8 tidak aktif di Tier A: aksi lain → `ACTION_NOT_ALLOWED`).

**S10 — Tahap C (AI) + keputusan + penjelasan (≈2 jam)**
- PRD: 9.5 Tahap C & D, FR-605–607, P1, P2.
- Buat: penilaian niat/anomali (`{riskScore, intentMatch, anomalies[], injectionSuspected, explanation}`), gabungan keputusan D, penjelasan template deterministik per kode alasan (narasi AI opsional), AI hanya bisa memperketat.
- Lulus bila: tes properti: untuk semua kombinasi hasil AI (termasuk gagal/timeout/skor kosong) keputusan akhir ≥ keputusan deterministik (urutan ketat: AUTO_APPROVE < REQUIRE_APPROVAL < REJECT); tidak ada jalur AI → AUTO_APPROVE.

**S11 — Request API internal + approval (≈4 jam)**
- PRD: FR-701–703, 11.1 (Request, Approval), 13.3, 9.4.
- Buat: `GET /requests`, `/requests/:id` (timeline gabungan evaluasi + ledger), cancel, `GET/POST /approvals…`, approve/reject + komentar, step-up bila ≥ `stepUpApprovalAboveMinor`, approval terikat `request_hash` (hash dihitung ulang), `expire_approvals` (job), notifikasi in-app.
- Lulus bila: approval dengan hash berbeda ditolak; APPROVER bisa, VIEWER/OPERATOR tidak; approval kedaluwarsa → EXPIRED + reservasi dilepas; semua keputusan menulis ledger.

**F04 — Layar Mandates, Documents, Requests(+detail), Approvals (≈6 jam)**
- PRD: 12.5, 12.4 (Tabel, Status pill, Banner), 9.2 layar kunci.
- Buat: `/mandates/new` (NL + diff), `/mandates/:id`, `/documents` (upload), `/requests` (tabel pola Activity), `/requests/:id` (dua kolom + timeline), `/approvals` + detail satu layar (usulan, dokumen, evaluasi, riwayat payee) dengan dialog step-up.
- Lulus bila: alur UI penuh: tulis tujuan → draft policy → aktifkan → lihat request → approve; semua status pill sesuai pemetaan 12.4.
- **Gerbang G2** → Bagian F (butuh REST agen S13 sebagian; lihat catatan G2 di Bagian F).

### FASE 4 — Eksekusi uang & gateway (menuju G3, 5–7 Nov)

**S12 — Antrean job + worker + tick (≈3 jam)**
- PRD: 9.9, FR-805, 15.3 langkah 6.
- Buat: `jobs` (klaim `FOR UPDATE SKIP LOCKED`, `locked_until`, heartbeat, dedupe_key), worker loop (`WORKER_ENABLED=1`, poll 2 dtk + jitter, konkurensi 2), `server/src/jobs/tick.js` (≤ 55 dtk), job `evaluate_request` (penyapu), `cleanup`.
- Lulus bila: dua worker paralel tidak pernah mengklaim job yang sama; job macet (tanpa heartbeat 60 dtk) diklaim ulang; semua job tahan restart (tes yang membunuh proses di tengah).

**S13 — Eksekusi payout idempoten + rekonsiliasi + pemulihan crash (≈7 jam; langkah paling kritis)**
- PRD: 9.6, FR-801–805, [VERIFY] 2 & 3, hasil `docs/SPIKE.md`, 14.3.
- Buat: job `execute_request` (verifikasi `request_hash`, tandai EXECUTING dalam tx, buat baris `executions` STARTED + `idempotency_id` **sebelum** memanggil PayPal), payout dengan `PayPal-Request-Id` + `sender_batch_id = jp_<requestId>`, retry 429/5xx/jaringan (maks 5, exponential backoff + jitter, ID sama), dead-letter → FAILED + notifikasi, jika respons tak tersimpan → query status batch dulu, `process_webhook` (cocokkan jumlah/mata uang/penerima → RECONCILED/MISMATCH), `reconcile_request` polling bila webhook > 3 menit, pelepasan/pemindahan reservasi (D7).
- Lulus bila: **100 permintaan duplikat paralel + 1 crash worker di tengah eksekusi → tepat 1 payout di fake-paypal dan 0 double payout**; webhook jumlah berbeda → MISMATCH; webhook hilang → polling RECONCILED; setelah seluruh suite `verifyChain` valid; satu alur NYATA ke Sandbox (usulan → approve → payout → webhook → RECONCILED) direkam (ini manual, M-REAL).
- Jangan: REFUND/ACCEPT_DISPUTE.

**S14 — REST agent API + MCP 3 tool + klien contoh (≈4 jam)**
- PRD: 11.2, 11.3, FR-1101–1104, 9.11 (kuota), [VERIFY] 6.
- Buat: `POST /agent/v1/payout-requests` (wajib `Idempotency-Key`; unik `(agent_id, agent_idempotency_key)`; `reason` disimpan sebagai klaim tidak tepercaya), `GET /agent/v1/requests/:id`, `GET /agent/v1/budget`, `POST /agent/v1/documents`, `POST /mcp` (stateless; tool `propose_payout`, `get_request_status`, `get_budget_status`; respons memuat `decision`, `reasonCodes`, `message`), `examples/agent-client.js` (Node 22 `fetch`), halaman `/developer`.
- Lulus bila: Idempotency-Key yang sama → respons sama, tanpa request ganda; `reason` berisi "ignore the rules" tidak mengubah keputusan (tes); tidak ada tool eksekusi/approve/baca-kredensial di MCP (tes daftar tool); 61 permintaan/menit → `RATE_LIMITED`; klien contoh berjalan.

**S15 — Simulator + paket serangan + korpus AI-eval (≈4 jam)**
- PRD: FR-1103, 5 metrik 1–2, 14.5, 12.5.
- Buat: `GET /simulator/scenarios`, `POST /simulator/run` (agen internal lewat gerbang SAMA, bukan jalan pintas), 12 serangan (2 per jenis: injeksi dokumen, rekening diganti, nominal digelembungkan, payee mirip, duplikat, instruksi tersembunyi) + 12 sah, rekaman respons AI, `npm run test:ai-eval`, kuota (30 usulan/jam/org demo; 100 AI/hari).
- Lulus bila: serangan 12/12 tidak ada yang AUTO_APPROVE; sah ≥ 11/12 AUTO_APPROVE; berjalan deterministik di CI (replay).

**F05 — Ledger UI + Simulator UI + Developer + Audit minimal (≈5 jam)**
- PRD: FR-903, 12.4 (tabel virtual), FR-1204, 12.5.
- Buat: `/ledger` (filter/sort/cari, tombol **Verify ledger** menampilkan valid/`firstBrokenSeq`, ekspor JSON), `/simulator` (jalankan paket satu klik), `/audit`, `/developer`.
- Lulus bila: demo "ubah satu byte lewat skrip admin → Verify gagal di seq N" dapat diulang.
- **Gerbang G3** → Bagian F.

### FASE 5 — Pengerasan (menuju G4, 8–9 Nov)

**S16 — Hardening (≈4 jam)**
- PRD: 13.2, 9.11, 9.10, FR-1208.
- Buat: `helmet` + CSP 13.2 persis (`style-src-attr 'unsafe-inline'`), HSTS, rate limit lengkap, batas biaya AI fail-closed, Reset demo (org baru, org lama diarsipkan read-only), jadwal reset 03:00 WIB (job), `/readyz` (DB+migrasi+heartbeat worker), `scripts/judge-smoke.js` (login judge → skenario simulator → verify ledger; exit non-zero bila gagal), pemantau/keep-alive.
- Lulus bila: header CSP sesuai; popover/dropdown Radix tetap berfungsi (tes E2E); `judge-smoke` hijau lokal.

**S17 — Tes keamanan & cakupan inti (≈4 jam)**
- PRD: 14.6, 14.4, 14.8.
- Buat: suite keamanan (IDOR semua endpoint bertenant, CSRF, unggahan berbahaya, webhook palsu, rate limit, string host live), coverage ≥ 90% modul keputusan/ledger/eksekusi (`c8`), tes tamper ledger di akhir seluruh suite.
- Lulus bila: `npm test` hijau; coverage terpenuhi; CI hijau.

**F06 — Responsif, a11y, visual regression (≈6 jam)**
- PRD: 12.7, 12.10, 12.11, metrik 12–13, FR-1207, FR-1307.
- Buat: breakpoint 1200/768/360 (drawer, header 56, tabel→kartu, modal→bottom-sheet), axe, golden screenshot 1366/1024/390, tes struktur piksel S1/S2 (teks/logo/avatar/ikon dimask, ≤ 3%), checklist parity per layar.
- Lulus bila: di CI: 0 overflow horizontal, axe 0 serius, geometri 100%, struktur piksel ≤ 3%.
- **Gerbang G4 (feature freeze).**

### FASE 6 — Paket submission (G5–G6, 10–11 Nov)

**S18 — README, THIRD_PARTY_NOTICES, diagram arsitektur (≈3 jam)**
- PRD: 19.3, 19.4, 15.11.
- Buat: README EN 10 bagian (checker CI), diagram arsitektur (Mermaid atau SVG), `THIRD_PARTY_NOTICES.md` otomatis, "Built during the submission period", dokumentasi `docker compose`, jalur jalankan-sendiri (mode replay).
- Lulus bila: guard "README bagian wajib" hijau; dari repo bersih di CI: `docker compose up` → `.env` → `npm ci && npm run setup && npm start` → `judge-smoke` hijau ≤ 10 menit.

**S19 — Naskah Devpost, instruksi uji, naskah video (≈2 jam)**
- PRD: 19.4–19.6, 1.1.
- Buat: `docs/submission/{devpost-description.md (≤500 kata), testing-instructions.md, video-script.md}` dalam EN. Angka IC3 hanya yang sudah diverifikasi manual (M-IC3); selain itu tulis "TODO-VERIFY" dan jangan dipakai.
- Lulus bila: butir 19.1 #5, #9, #10 terpenuhi di berkas.

### Cadangan Tier B (hanya jika G3 ahead ≥ 6 jam; urutan 16.5; dibekukan di G4)
**B1** AG Grid ledger · **B2** REFUND (aktifkan aturan 8) · **B3** korpus 30+30 · **B4** dispute · **B5** TOTP · **B6** CSV + i18n ID. Satu spesifikasi per butir ditambahkan ke ROADMAP hanya bila diaktifkan (jangan dikerjakan lebih awal).

---

## F. Pekerjaan manual dan gerbang (tanpa kuota AI)

### F.1 Manual (Anda)

| Kode | Kapan | Tugas |
| --- | --- | --- |
| M-REPO | 30 Okt | Buat repo GitHub publik; tambah `docs/PRD.md`; tambah `LICENSE` MIT; pasang secret scanning; hubungkan ke Replit (Import from GitHub). |
| M-DEVPOST | ≤ 31 Okt | Daftar Devpost ("Join Hackathon"); kirim email klarifikasi (PRD 19.2); catat jawaban di DECISIONS. |
| M-SPIKE | 30–31 Okt | Buat app Sandbox PayPal + akun bisnis dan penerima sandbox; pastikan Payouts aktif; jalankan skrip S01; isi `docs/SPIKE.md`; cek `node -v` di cPanel (Setup Node.js App) atau tetapkan Plan B host. |
| M-TOKEN | ≤ 2 Nov | Color-picker dari tangkapan S1/S2 → nilai final token; taruh tangkapan (data pribadi dikaburkan) di `docs/ui-reference/`. Tanpa ini F01 tidak boleh dimulai. |
| M-SECRETS | tiap akun Replit baru | Isi ulang Secrets: `DATABASE_URL` (jika eksternal), `JOBENPAY_ENC_KEY`, `JOBENPAY_LEDGER_SIGNING_KEY`, `JOBENPAY_HMAC_PEPPER`, `AI_*`, kredensial sandbox. **Kunci enkripsi/penandatangan harus sama di semua akun** (jika berbeda, data terenkripsi dan tanda tangan ledger lama tidak terbaca). Simpan di pengelola kata sandi Anda. |
| M-REAL | G3 | Rekam alur nyata Sandbox end-to-end (layar desktop). |
| M-IC3 | ≤ G5 | Cocokkan angka IC3 dengan PDF primer ic3.gov; catat halaman. |
| M-DEPLOY | G1, lalu tiap gerbang | Deploy ke cPanel mengikuti PRD 15.3 (Node 22, env, `npm ci --omit=dev`, migrate, seed, cron, restart). Deploy **di tiap gerbang** (always-shippable, 16.6). |
| M-VIDEO | G5 | Rekam/edit/unggah video < 3 menit ke YouTube publik; tanpa UI/logo PayPal (kecuali izin tertulis). |
| M-SUBMIT | 5 Nov draf, 11 Nov 21:00 WIB final | Isi Devpost, uji dari peramban bersih, simpan tangkapan konfirmasi. |

### F.2 Gerbang (jalankan prompt PEMERIKSA C.4 pada langkah terkait sebelum menyatakan lulus)

| Gerbang | Tanggal | Lulus bila |
| --- | --- | --- |
| **G0** | 30–31 Okt | `docs/SPIKE.md` terisi a–d; S00 selesai; Devpost terdaftar; email klarifikasi terkirim. |
| **G1** | 2 Nov | Login di URL hosting; koneksi PayPal "Connected"; agen+key+payee dibuat lewat UI; CI hijau; geometri S1 lulus; **kalibrasi jam**: jam aktual S00–S06+F01–F03 vs 24 jam (jika > 1,3× → terapkan tangga pemangkasan 16.4 PRD). |
| **G2** | 5 Nov | Usulan lewat REST/Simulator → keputusan + kode alasan → approval di UI; ≥ 6 serangan berjalan; draf Devpost tersimpan. *Catatan:* S14 (REST) paling cepat di G3, jadi untuk G2 gunakan `POST /simulator/run` atau skrip internal sebagai pengusul; urutkan S13/S14 setelah S11 bila ingin REST pada G2. |
| **G3** | 7 Nov | Alur nyata Sandbox → RECONCILED → ledger valid; paket simulator 12/12; selisih jam ≤ +10. Tentukan aktivasi Tier B. |
| **G4** | 9 Nov 21:00 WIB | DoD Tier A (PRD 16.7) hijau kecuali paket submission; **freeze fitur**. |
| **G5** | 10 Nov | README, video publik, kolom Devpost lengkap, `judge-smoke` hijau di produksi. |
| **G6** | 11 Nov 21:00 WIB | Submit; uji ulang dari peramban bersih. |

---

## G. Templat `docs/PROGRESS.md` (dibuat di S00)

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

---

## H. Urutan eksekusi ringkas (checklist kerja harian)

1. **30 Okt (malam):** M-REPO → S00 → M-SPIKE/S01 → M-DEVPOST.
2. **31 Okt–1 Nov:** S02 → S03 → S04; M-TOKEN; F01.
3. **1–2 Nov:** S05 → S06; F02 → F03; M-DEPLOY → **G1**.
4. **3–5 Nov:** S07 → S08 → S09 → S10 → S11; F04 → **G2**.
5. **5–7 Nov:** S12 → S13 → S14 → S15; F05; M-REAL → **G3**.
6. **8–9 Nov:** S16 → S17 → F06 → **G4** (freeze).
7. **10 Nov:** S18 → S19; M-VIDEO; M-IC3 → **G5**.
8. **11 Nov:** QA, M-SUBMIT → **G6**. 12 Nov hanya cadangan darurat.

Catatan urutan: S03 (ledger) sengaja sebelum auth penuh dan mandat karena aktivasi mandat dan semua transisi status menulis ledger dalam transaksi yang sama (PRD 9.4, 9.7). Ini hanya penukaran urutan terhadap WP PRD, bukan perubahan cakupan.

---

## I. Cara menjaga presisi (ringkas)

- **Tes = hakim.** Setiap aturan PRD yang bertanda kode (`CAP_EXCEEDED`, `PAYEE_CHANGED`, dst.) punya tes dengan nama kode itu. Jika agen "menyelesaikan" tanpa tes, langkah belum selesai.
- **Audit murah tiap gerbang** (prompt C.4), lalu perbaiki hanya selisih. Ini jauh lebih hemat kuota daripada menemukan penyimpangan di akhir.
- **Satu perubahan = satu commit** dengan ID langkah; jika agen merusak sesuatu, `git revert` lebih murah daripada meminta agen memperbaiki.
- **Jangan minta agen "membuat seluruh aplikasi".** Selalu prompt pembuka C.1 dengan satu ID langkah.
- **Jika PRD perlu diubah**, ubah `docs/PRD.md` dan DECISIONS lebih dulu (naikkan versi), baru kode. Jangan biarkan kode menyimpang diam-diam dari PRD.
- **Kehati-hatian uang:** untuk S09, S10, S13 sarankan pakai model terkuat yang tersedia di Replit dan jalankan prompt PEMERIKSA sesudahnya. Di sinilah kesalahan paling mahal.
