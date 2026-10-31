# PROGRESS

## Status ringkas
- Langkah terakhir SELESAI: S04
- Langkah AKTIF: F02 (WIP; validasi integrasi DB tertunda)
- Gerbang terakhir lulus: build web, CSS lint, geometry S1/S2, lint, guard, dan `npm test` (28 lulus, 10 dilewati karena database)

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE) | Commit | Jam aktual | Catatan |
| S00 | DONE | feat(S00): project skeleton, guards, CI | 2026-10-30 | Node 22, guard, lint, dan health endpoint validasi berhasil |
| S01 | DONE | feat(S01): spike scripts and report template | 2026-10-30 | Skrip spike PayPal, webhook, AI JSON, dan template laporan dibuat; verifikasi env-missing dan lint/guard dijalankan |
| S02 | DONE | feat(S02): schema, migrations and crypto utilities | 2026-10-30 | Skema, util DB/crypto, dan migrasi dibuat; validasi DB real masih diblokir oleh PostgreSQL yang tidak aktif |
| S03 | DONE | feat(S03): hash-chained signed ledger | 2026-10-30 | Service `ledger.js`, CLI verify-ledger, validasi payload guard, dan tes unit/ledger selesai; DB-riil masih menunggu Postgres aktif |
| S04 | DONE | feat(S04): auth, sessions, RBAC, step-up, seed | 2026-10-30 | App Express 5, repositori auth/session, RBAC, step-up, audit/rate-limit, dan seed dibuat; validasi non-DB serta lint/guard berhasil |
| S05 | WIP | 4cbe4c6 | 2026-10-30 | PayPal sandbox client, koneksi terenkripsi, penerima webhook, fake server, dan tes dibuat; validasi integrasi DB/Sandbox masih tertunda |
| S06 | WIP | a12cc63 | 2026-10-30 | Implementasi S06 di-commit; unit test/lint/guard lulus, tetapi validasi database dan seed masih menunggu PostgreSQL |
| S12 | WIP | feat(S12): postgres job queue, worker, tick | 2026-10-30 | Queue PostgreSQL, worker, tick, cleanup, readiness, metrik, dan tes dibuat; tes/lint/guard non-DB lulus, validasi integrasi menunggu PostgreSQL |
| F01 | WIP | | 2026-10-30 | Scaffold web, token desain awal, design-spec, dan harness parity dibuat; token final/M-TOKEN dan G1 masih belum diputuskan |
| F02 | WIP | feat(F02): app shell and base components | 2026-10-31 | AppShell, komponen dasar, fixtures S1/S2, feedback endpoint, dan CSP dibuat; seluruh gate UI lulus, validasi DB ditunda |

## Resume (diisi saat WIP)
- Sudah selesai: S00-S04 dan implementasi S12 (antrean PostgreSQL dengan `SKIP LOCKED`, retry/backoff, worker restart-safe, tick, cleanup periodik, readiness, serta metrik antrean).
- Validasi F02: `npm --prefix web run build`, `lint:css`, `test:geometry` (46 assertion S1/S2), `npm run lint`, `npm run guard`, `npm test` (28 lulus, 10 dilewati, 0 gagal), dan `git diff --check` lulus. Geometry memakai Chrome sistem melalui `CHROMIUM_EXECUTABLE_PATH` karena unduhan Chromium Playwright gagal akibat TLS.
- F02 tetap WIP: sepuluh tes integrasi/database dilewati tanpa PostgreSQL/`TEST_DATABASE_URL`; keberhasilan feedback yang menulis `audit_events` belum tervalidasi pada database.
- Node.js 22.20.0/npm 10.9.3 tersedia sementara dari direktori sesi Copilot untuk menjalankan pemeriksaan; belum ditambahkan ke PATH sistem.
- File utama F02: `web/src/components/AppShell.jsx`, `web/src/components/AppShell.module.css`, `web/src/components/primitives.jsx`, `web/src/components/primitives.module.css`, `web/src/i18n.js`, `server/src/app.js`, `server/test/unit/app-shell-security.test.js`, dan `scripts/geometry-test.js`.
- S06 commit lokal `a12cc63 feat(S06): agents, API keys, payees`; tes unit kini ikut lulus, tetapi validasi database dan `npm run seed` tetap perlu diulang pada PostgreSQL tes.
- Push commit S06 dicoba, tetapi ditolak karena kredensial GitHub tidak tersedia (`Cannot prompt because user interactivity has been disabled`).
- File utama S12: `server/src/jobs/queue.js`, `server/src/jobs/registry.js`, `server/src/jobs/worker.js`, `server/src/jobs/tick.js`, `server/src/jobs/cleanup.js`, `server/migrations/009_jobs_queue.sql`, `server/test/integration/jobs.test.js`.
- Referensi `E-S12` di `docs/ROADMAP.md` dan `D18` di `docs/DECISIONS.md` tidak ditemukan pada checkout ini; implementasi mengikuti rincian S12 pada permintaan.
- Commit lokal: `fa89a6f feat(S12): postgres job queue, worker, tick`; push ke `origin/dev` tertahan karena kredensial GitHub tidak tersedia.
- Perintah lanjut: sediakan PostgreSQL/`TEST_DATABASE_URL`, jalankan migrasi dari awal pada database tes terpisah dan tes integrasi; kemudian ulangi gerbang sebelum menandai F02 selesai.
- S05 mengikuti spesifikasi permintaan karena `docs/ROADMAP.md` checkout ini tidak memiliki bagian E-S05. Endpoint verifikasi dan nama field cocok dengan contoh PayPal OpenAPI resmi (D20); `docs/SPIKE.md` PayPal/webhook masih BELUM DIJALANKAN sehingga belum diuji dengan akun Sandbox.
- File utama S05: `server/src/paypal/constants.js`, `server/src/paypal/client.js`, `server/src/repositories/paypalConnections.js`, `server/src/repositories/webhookEvents.js`, `server/src/jobs/webhook.js`, `server/src/app.js`, `server/test/helpers/fake-paypal.js`, dan tes `paypal-client`, `webhook-job`, `paypal`, serta `guard`.
- S06 mengikuti spesifikasi terperinci pada prompt terlampir. Checkout tidak memiliki bagian E-S06 di `docs/ROADMAP.md`, dan `docs/PRD.md` hanya berisi judul; tes/lint/guard belum dapat dijalankan karena Node.js/npm tidak tersedia, sedangkan tes integrasi S06 membutuhkan PostgreSQL.
- File utama S06: `server/migrations/010_s06_agent_keys_payee_changed_at.sql`, `server/src/auth/agentAuth.js`, `server/src/repositories/agents.js`, `server/src/repositories/payees.js`, `server/src/app.js`, `server/scripts/seed.js`, `server/test/integration/agents-payees.test.js`, dan tes unit autentikasi/identifier.
- D21 mendokumentasikan lookup prefix acak lintas-tenant hanya pada tahap autentikasi awal; seluruh operasi berikutnya dibatasi `org_id`.

## Blockers
- PostgreSQL belum aktif di `localhost:5432`; sepuluh tes integrasi/database dilewati. Migrasi dari awal dan integrasi (termasuk feedback audit) perlu dijalankan dengan `TEST_DATABASE_URL` pada database tes terpisah sebelum F02 dinyatakan DONE.
- Node.js 22.20.0/npm 10.9.3 dipakai dari folder sesi sementara; environment sistem belum memiliki Node/npm pada PATH.
- Git tersedia di `C:\\Program Files\\Git\\cmd\\git.exe`; `git diff --check`, lint, guard, build web, CSS lint, geometry, dan tes otomatis saat ini lulus.
- Commit implementasi S05: `4cbe4c6 feat(S05): PayPal sandbox connection and webhook receiver`; push dicoba tetapi tertahan karena kredensial remote tidak tersedia.
- Push GitHub ditolak karena kredensial tidak tersedia (`Cannot prompt because user interactivity has been disabled`).
- Untuk lanjut urutan setelah S06, F01 mensyaratkan keputusan manual M-TOKEN (warna final); token final belum tersedia. G1/F03 juga belum lulus.
- Lanjutan build tertahan: `docs/ROADMAP.md` checkout ini hanya merinci E-S00, `docs/prd/` tidak berisi spesifikasi langkah lanjutan, dan PRD utama hanya berisi judul. Tidak ada kriteria yang cukup untuk mengimplementasikan S07 atau fase berikutnya tanpa menebak. Minta spesifikasi langkah berikutnya atau keputusan M-TOKEN untuk F01.
- F01 mengikuti spesifikasi F01 pada lampiran; `docs/ROADMAP.md` checkout tidak memuat E-F01. Nilai token memakai estimasi awal PRD 12.2 karena `docs/ui-reference/token-final.json` belum tersedia; D22 mencatat hal ini.
- F01 tidak menambahkan `@axe-core/playwright` karena MPL-2.0 tidak termasuk lisensi yang diizinkan repo. Sesuai keputusan pemilik, memakai Playwright built-in role locators sebagai pengganti smoke-check terbatas; dicatat di D23.
- F02 masih WIP sampai validasi database integrasi dilakukan. Unduhan browser Playwright lokal gagal karena TLS, tetapi geometry lokal berhasil memakai Chrome sistem; CI UI memakai image Playwright yang sudah menyediakan browser.
- File F01 dibuat/diubah: `web/package.json`, Vite/React scaffold dan CSS token files, `docs/ui-reference/design-spec.json`, `scripts/geometry-test.js`, `server/src/app.js`, `scripts/guard.js`, `.github/workflows/ci.yml`, `README.md`, `THIRD_PARTY_NOTICES.md`, `docs/DECISIONS.md`, `.gitignore`.

## Pertanyaan untuk pemilik proyek
(kosong)
