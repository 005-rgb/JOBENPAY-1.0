# PROGRESS

## Status ringkas
- Langkah terakhir SELESAI: S04
- Langkah AKTIF: S12 (implementasi selesai; validasi dan gerbang commit menunggu Node.js/npm tersedia)
- Gerbang terakhir lulus: G0 (spike S01 ready) dan S04 verification gates (`node --test`, `eslint . --ext .js`, `node scripts/guard.js`)

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE) | Commit | Jam aktual | Catatan |
| S00 | DONE | feat(S00): project skeleton, guards, CI | 2026-10-30 | Node 22, guard, lint, dan health endpoint validasi berhasil |
| S01 | DONE | feat(S01): spike scripts and report template | 2026-10-30 | Skrip spike PayPal, webhook, AI JSON, dan template laporan dibuat; verifikasi env-missing dan lint/guard dijalankan |
| S02 | DONE | feat(S02): schema, migrations and crypto utilities | 2026-10-30 | Skema, util DB/crypto, dan migrasi dibuat; validasi DB real masih diblokir oleh PostgreSQL yang tidak aktif |
| S03 | DONE | feat(S03): hash-chained signed ledger | 2026-10-30 | Service `ledger.js`, CLI verify-ledger, validasi payload guard, dan tes unit/ledger selesai; DB-riil masih menunggu Postgres aktif |
| S04 | DONE | feat(S04): auth, sessions, RBAC, step-up, seed | 2026-10-30 | App Express 5, repositori auth/session, RBAC, step-up, audit/rate-limit, dan seed dibuat; validasi non-DB serta lint/guard berhasil |
| S12 | WIP | feat(S12): postgres job queue, worker, tick | 2026-10-30 | Queue PostgreSQL, worker, cron tick, cleanup, readiness, metrik, dan tes dibuat; `npm test`/lint/guard belum dapat dijalankan karena Node.js/npm tidak tersedia di environment |

## Resume (diisi saat WIP)
- Sudah selesai: S00-S04 dan implementasi S12 (antrean PostgreSQL dengan `SKIP LOCKED`, retry/backoff, worker restart-safe, tick, cleanup periodik, readiness, serta metrik antrean).
- Sudah diverifikasi untuk perubahan ini: pemeriksaan diagnostik editor tidak menemukan error dan `git diff --check` bersih. Tes integration untuk 50 job/4 worker, reclaim, retry hingga DEAD, deduplikasi, kill/restart, cleanup, metrik, dan tick sudah ditambahkan.
- Belum diverifikasi: `npm test`, lint, dan guard tidak dapat dijalankan karena `node`/`npm` tidak tersedia pada PATH; tes DB juga membutuhkan PostgreSQL aktif dan `TEST_DATABASE_URL`.
- File utama S12: `server/src/jobs/queue.js`, `server/src/jobs/registry.js`, `server/src/jobs/worker.js`, `server/src/jobs/tick.js`, `server/src/jobs/cleanup.js`, `server/migrations/009_jobs_queue.sql`, `server/test/integration/jobs.test.js`.
- Referensi `E-S12` di `docs/ROADMAP.md` dan `D18` di `docs/DECISIONS.md` tidak ditemukan pada checkout ini; implementasi mengikuti rincian S12 pada permintaan.
- Perintah lanjut: sediakan Node.js 22/npm dan PostgreSQL, lalu jalankan `npm test`, `npm run lint`, dan `npm run guard`; perbaiki jika ada kegagalan sebelum menandai S12 DONE.

## Blockers
- PostgreSQL belum aktif di `localhost:5432` sehingga validasi database riil untuk login/session/seed dan migrasi tetap diblokir dari environment ini. Semua pengujian yang memerlukan `TEST_DATABASE_URL` tetap perlu dijalankan pada lingkungan dengan postgres yang hidup.
- Node.js dan npm tidak tersedia pada PATH environment sesi ini; perintah `npm test`, `npm run lint`, dan `npm run guard` belum dapat dieksekusi.

## Pertanyaan untuk pemilik proyek
(kosong)
