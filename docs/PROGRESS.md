# PROGRESS

## Status ringkas
- Langkah terakhir SELESAI: S02
- Langkah AKTIF: S03, status BLOCKED
- Gerbang terakhir lulus: G0 (spike S01 ready)

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE) | Commit | Jam aktual | Catatan |
| S00 | DONE | feat(S00): project skeleton, guards, CI | 2026-10-30 | Node 22, guard, lint, dan health endpoint validasi berhasil |
| S01 | DONE | feat(S01): spike scripts and report template | 2026-10-30 | Skrip spike PayPal, webhook, AI JSON, dan template laporan dibuat; verifikasi env-missing dan lint/guard dijalankan |
| S02 | DONE | feat(S02): schema, migrations and crypto utilities | 2026-10-30 | Skema, util DB/crypto, dan migrasi dibuat; validasi DB real masih diblokir oleh PostgreSQL yang tidak aktif |
| S03 | BLOCKED | feat(S03): hash-chained signed ledger | 2026-10-30 | Service `ledger.js`, CLI verify-ledger, dan tes S03 dibuat; validasi end-to-end terhadap DB riil tetap diblokir karena PostgreSQL tidak tersedia di `localhost:5432` |

## Resume (diisi saat WIP)
- Sudah selesai: repositori dibuat, S00-S02 diverifikasi sesuai ruang lingkup, dan S03 mengimplementasikan ledger hash-chain, validasi rantai, export JSON, serta CLI verifikasi dengan payload guard dan key rotation.
- Belum: validasi nyata terhadap `TEST_DATABASE_URL` dan `npm run verify-ledger -- --all` pada database riil karena PostgreSQL tidak hidup di environment ini.
- File setengah jadi: `server/src/services/ledger.js`, `server/scripts/verify-ledger.js`, `server/test/integration/ledger.test.js`, `server/test/unit/ledger.test.js`
- Perintah lanjut: pasang PostgreSQL lokal atau jalankan `docker compose up -d postgres`, lalu `npm run migrate`, `npm test`, dan `npm run verify-ledger -- --all`.

## Blockers
- PostgreSQL tidak dapat dijangkau di `localhost:5432` (`ECONNREFUSED ::1:5432` dan `127.0.0.1:5432`). Semua validasi database yang membutuhkan `TEST_DATABASE_URL`/DB riil tetap diblokir dari environment ini, sehingga S03 end-to-end tidak bisa diselesaikan tanpa server Postgres aktif.

## Pertanyaan untuk pemilik proyek
(kosong)
