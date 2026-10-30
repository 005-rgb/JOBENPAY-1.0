# PROGRESS

## Status ringkas
- Langkah terakhir SELESAI: S01
- Langkah AKTIF: S02, status BLOCKED
- Gerbang terakhir lulus: G0 (spike S01 ready)

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE) | Commit | Jam aktual | Catatan |
| S00 | DONE | feat(S00): project skeleton, guards, CI | 2026-10-30 | Node 22, guard, lint, dan health endpoint validasi berhasil |
| S01 | DONE | feat(S01): spike scripts and report template | 2026-10-30 | Skrip spike PayPal, webhook, AI JSON, dan template laporan dibuat; verifikasi env-missing dan lint/guard dijalankan |
| S02 | BLOCKED | feat(S02): schema, migrations and crypto utilities | 2026-10-30 | Skema, util DB/crypto, dan SQL migration dibuat; validasi real database diblokir oleh PostgreSQL yang tidak tersedia pada localhost:5432 |

## Resume (diisi saat WIP)
- Sudah selesai: repositori dibuat, skala S00 dan S01 diverifikasi, serta komponen S02 (SQL schema, script migrasi, util `canonicalJson`, `money`, `withTx`, AES/scrypt/Ed25519, logger, error handler, dan tests) diimplementasikan.
- Belum: validasi end-to-end database `npm run migrate` dua kali sukses karena PostgreSQL tidak tersedia di environment lokal.
- File setengah jadi: `server/migrations/*.sql`, `server/scripts/migrate.js`, `server/src/db/*.js`, `server/src/lib/*.js`, `shared/*.js`
- Perintah lanjut: `npm run test`, `npm run lint`, `npm run guard`, dan menjalankan `npm run migrate` saat PostgreSQL lokal atau CI tersedia.

## Blockers
- PostgreSQL tidak dapat dijangkau di `localhost:5432` (`ECONNREFUSED ::1:5432` dan `127.0.0.1:5432`). `npm run migrate` gagal 3 kali berturut-turut, sehingga validasi end-to-end S02 terhadap DB real tidak bisa diselesaikan dari environment ini.

## Pertanyaan untuk pemilik proyek
(kosong)
