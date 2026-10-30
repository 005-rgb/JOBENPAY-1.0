# PROGRESS

## Status ringkas
- Langkah terakhir SELESAI: S04
- Langkah AKTIF: tidak ada (semua langkah yang direncanakan pada tahap ini telah diselesaikan secara code-path; validasi DB riil masih menunggu PostgreSQL aktif)
- Gerbang terakhir lulus: G0 (spike S01 ready) dan S04 verification gates (`node --test`, `eslint . --ext .js`, `node scripts/guard.js`)

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE) | Commit | Jam aktual | Catatan |
| S00 | DONE | feat(S00): project skeleton, guards, CI | 2026-10-30 | Node 22, guard, lint, dan health endpoint validasi berhasil |
| S01 | DONE | feat(S01): spike scripts and report template | 2026-10-30 | Skrip spike PayPal, webhook, AI JSON, dan template laporan dibuat; verifikasi env-missing dan lint/guard dijalankan |
| S02 | DONE | feat(S02): schema, migrations and crypto utilities | 2026-10-30 | Skema, util DB/crypto, dan migrasi dibuat; validasi DB real masih diblokir oleh PostgreSQL yang tidak aktif |
| S03 | DONE | feat(S03): hash-chained signed ledger | 2026-10-30 | Service `ledger.js`, CLI verify-ledger, validasi payload guard, dan tes unit/ledger selesai; DB-riil masih menunggu Postgres aktif |
| S04 | DONE | feat(S04): auth, sessions, RBAC, step-up, seed | 2026-10-30 | App Express 5, repositori auth/session, RBAC, step-up, audit/rate-limit, dan seed dibuat; validasi non-DB serta lint/guard berhasil |

## Resume (diisi saat WIP)
- Sudah selesai: repositori dibuat, S00-S04 dibangun sesuai ruang lingkup, termasuk app Express 5, repositori auth/session/org/membership/step-up/audit/rateLimit, middleware RBAC, step-up flow, dan seed idempoten untuk organisasi demo.
- Sudah diverifikasi: `node --test` berhasil dengan suite non-DB yang relevan, `eslint . --ext .js` bersih, dan `node scripts/guard.js` lulus.
- Belum: validasi end-to-end terhadap `TEST_DATABASE_URL` dan alur login/session sebenarnya pada PostgreSQL riil karena database masih tidak aktif di environment ini.
- File utama: `server/src/app.js`, `server/src/auth/permissions.js`, `server/src/repositories/*.js`, `server/src/services/ledger.js`, `server/scripts/seed.js`, `server/test/auth.test.js`, `server/test/helpers/testApp.js`
- Perintah lanjut: pastikan PostgreSQL aktif (`docker compose up -d postgres` atau layanan lokal), jalankan `npm run migrate`, lalu `npm test` untuk membuktikan alur auth/session DB-backed.

## Blockers
- PostgreSQL belum aktif di `localhost:5432` sehingga validasi database riil untuk login/session/seed dan migrasi tetap diblokir dari environment ini. Semua pengujian yang memerlukan `TEST_DATABASE_URL` tetap perlu dijalankan pada lingkungan dengan postgres yang hidup.

## Pertanyaan untuk pemilik proyek
(kosong)
