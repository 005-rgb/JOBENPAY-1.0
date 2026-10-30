# PROGRESS

## Status ringkas
- Langkah terakhir SELESAI: S04
- Langkah AKTIF: S05 (WIP)
- Gerbang terakhir lulus: G0 (spike S01 ready) dan S04 verification gates (`node --test`, `eslint . --ext .js`, `node scripts/guard.js`)

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE) | Commit | Jam aktual | Catatan |
| S00 | DONE | feat(S00): project skeleton, guards, CI | 2026-10-30 | Node 22, guard, lint, dan health endpoint validasi berhasil |
| S01 | DONE | feat(S01): spike scripts and report template | 2026-10-30 | Skrip spike PayPal, webhook, AI JSON, dan template laporan dibuat; verifikasi env-missing dan lint/guard dijalankan |
| S02 | DONE | feat(S02): schema, migrations and crypto utilities | 2026-10-30 | Skema, util DB/crypto, dan migrasi dibuat; validasi DB real masih diblokir oleh PostgreSQL yang tidak aktif |
| S03 | DONE | feat(S03): hash-chained signed ledger | 2026-10-30 | Service `ledger.js`, CLI verify-ledger, validasi payload guard, dan tes unit/ledger selesai; DB-riil masih menunggu Postgres aktif |
| S04 | DONE | feat(S04): auth, sessions, RBAC, step-up, seed | 2026-10-30 | App Express 5, repositori auth/session, RBAC, step-up, audit/rate-limit, dan seed dibuat; validasi non-DB serta lint/guard berhasil |
| S05 | WIP | 4cbe4c6 | 2026-10-30 | PayPal sandbox client, koneksi terenkripsi, penerima webhook, fake server, dan tes sudah ditambahkan; validasi runtime menunggu Node.js 22 dan PostgreSQL |
| S12 | WIP | feat(S12): postgres job queue, worker, tick | 2026-10-30 | Queue PostgreSQL, worker, cron tick, cleanup, readiness, metrik, dan tes dibuat; `npm test`/lint/guard belum dapat dijalankan karena Node.js/npm tidak tersedia di environment |

## Resume (diisi saat WIP)
- Sudah selesai: S00-S04 dan implementasi S12 (antrean PostgreSQL dengan `SKIP LOCKED`, retry/backoff, worker restart-safe, tick, cleanup periodik, readiness, serta metrik antrean).
- Sudah diverifikasi untuk perubahan ini: pemeriksaan diagnostik editor tidak menemukan error dan `git diff --check` bersih. Tes integration/unit S05 untuk OAuth, redaksi kredensial, verifikasi webhook, deduplikasi, role, rate limit, dan guard sudah ditambahkan.
- Belum diverifikasi: `npm test`, lint, dan guard tidak dapat dijalankan karena `node`/`npm` tidak tersedia pada PATH; tes DB juga membutuhkan PostgreSQL aktif dan `TEST_DATABASE_URL`.
- File utama S12: `server/src/jobs/queue.js`, `server/src/jobs/registry.js`, `server/src/jobs/worker.js`, `server/src/jobs/tick.js`, `server/src/jobs/cleanup.js`, `server/migrations/009_jobs_queue.sql`, `server/test/integration/jobs.test.js`.
- Referensi `E-S12` di `docs/ROADMAP.md` dan `D18` di `docs/DECISIONS.md` tidak ditemukan pada checkout ini; implementasi mengikuti rincian S12 pada permintaan.
- Commit lokal: `fa89a6f feat(S12): postgres job queue, worker, tick`; push ke `origin/dev` tertahan karena kredensial GitHub tidak tersedia.
- Perintah lanjut: sediakan Node.js 22/npm, PostgreSQL, dan akses push GitHub; jalankan `npm test`, `npm run lint`, dan `npm run guard`, lalu push setelah gerbang hijau.
- S05 mengikuti spesifikasi permintaan karena `docs/ROADMAP.md` checkout ini tidak memiliki bagian E-S05. Endpoint verifikasi dan nama field cocok dengan contoh PayPal OpenAPI resmi (D20); `docs/SPIKE.md` PayPal/webhook masih BELUM DIJALANKAN sehingga belum diuji dengan akun Sandbox.
- File utama S05: `server/src/paypal/constants.js`, `server/src/paypal/client.js`, `server/src/repositories/paypalConnections.js`, `server/src/repositories/webhookEvents.js`, `server/src/jobs/webhook.js`, `server/src/app.js`, `server/test/helpers/fake-paypal.js`, dan tes `paypal-client`, `webhook-job`, `paypal`, serta `guard`.

## Blockers
- PostgreSQL belum aktif di `localhost:5432` sehingga validasi database riil untuk login/session/seed dan migrasi tetap diblokir dari environment ini. Semua pengujian yang memerlukan `TEST_DATABASE_URL` tetap perlu dijalankan pada lingkungan dengan postgres yang hidup.
- Node.js dan npm tidak tersedia pada PATH environment sesi ini; perintah `npm test`, `npm run lint`, dan `npm run guard` belum dapat dieksekusi.
- Git tersedia di `C:\\Program Files\\Git\\cmd\\git.exe`; `git diff --check` bersih. Tes, lint, dan guard tetap belum terverifikasi tanpa runtime Node.js 22.
- Commit implementasi S05: `4cbe4c6 feat(S05): PayPal sandbox connection and webhook receiver`; push masih menunggu validasi dan akses remote.
- Push GitHub ditolak karena kredensial tidak tersedia (`Cannot prompt because user interactivity has been disabled`).

## Pertanyaan untuk pemilik proyek
(kosong)
