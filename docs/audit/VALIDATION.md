# Ringkasan

Checkpoint pada 2026-11-01; audit source/unit S01-S06, S12, dan F01-F03 selesai dengan pengecualian manual/database. S07 belum diaudit karena kriterianya tidak ada di checkout. Status `NOT-VERIFIED` berarti kriteria langkah belum diaudit lengkap, bukan klaim bahwa implementasinya gagal.

| Langkah | Status akhir | PASS | PARTIAL | FAIL | MANUAL | UNVERIFIABLE | Commit |
|---|---|---:|---:|---:|---:|---:|---|
| S01 | VERIFIED-WITH-EXCEPTIONS | 8 | 0 | 0 | 4 | 0 | tidak tersedia |
| S02 | VERIFIED-WITH-EXCEPTIONS | 9 | 0 | 0 | 0 | 3 | tidak tersedia |
| S03 | VERIFIED-WITH-EXCEPTIONS | 5 | 0 | 0 | 0 | 4 | tidak tersedia |
| S04 | VERIFIED-WITH-EXCEPTIONS | 6 | 0 | 0 | 0 | 6 | tidak tersedia |
| S12 | VERIFIED-WITH-EXCEPTIONS | 2 | 0 | 0 | 0 | 7 | tidak tersedia |
| S05 | VERIFIED-WITH-EXCEPTIONS | 6 | 0 | 0 | 2 | 4 | tidak tersedia |
| S06 | VERIFIED-WITH-EXCEPTIONS | 4 | 0 | 0 | 0 | 7 | tidak tersedia |
| F01 | NOT-VERIFIED | 1 | 0 | 0 | 2 | 0 | tidak tersedia |
| F02 | NOT-VERIFIED | 2 | 0 | 0 | 0 | 1 | tidak tersedia |
| F03 | NOT-VERIFIED | 1 | 0 | 0 | 0 | 1 | tidak tersedia |
| S07 | NOT-VERIFIED | 0 | 0 | 0 | 0 | 0 | tidak tersedia |

Angka di atas hanya menghitung kriteria eksplisit yang dibuktikan pada checkpoint ini. Butir yang belum diaudit tidak dihitung sebagai PASS.

# Baseline & hasil validator

Node dijalankan melalui `C:\laragon\bin\nodejs\node-v22\node.exe` karena tidak ada di PATH shell.

| Pemeriksaan | Hasil |
|---|---|
| `node -v` | `v22.23.2` |
| `git status --short`, `git log --oneline -30`, `git remote -v`, `git rev-parse` | UNVERIFIABLE: direktori tidak memiliki `.git`; tidak ada status/riwayat/remote yang bisa dibuktikan |
| `npm ci` (root) | PASS; 287 paket ditambahkan. npm melaporkan 8 advisories (7 moderate, 1 high) |
| `npm run lint` | PASS setelah menambahkan direktori Node dan `node_modules/.bin` ke PATH |
| `npm run guard` | FAIL: `.github/workflows/ci.yml` tidak ada |
| `npm run migrate` (dua percobaan) | FAIL: autentikasi PostgreSQL sebagai `postgres` ditolak; tidak ada `DATABASE_URL` pada environment |
| `npm test` | 121 total; 112 pass, 0 fail, 9 skip (integrasi tanpa database) |
| `npm --prefix web ci` | PASS; 296 paket ditambahkan. npm melaporkan 13 advisories (6 moderate, 7 high) |
| `npm --prefix web run build` | PASS |
| `npm --prefix web run lint:css` | PASS |
| `npm run test:unit` | 108 total; 108 pass, 0 fail, 0 skip |
| `DATABASE_URL` / `TEST_DATABASE_URL` | Tidak tersedia sebagai environment variables |
| `node app.cjs` tanpa kunci runtime | Exit 1 dan menyebut nama tiga kunci yang hilang; tidak mencetak nilai rahasia |
| Uji format runtime keys | PASS dengan kunci acak di memori; nilai tidak dicetak |

`npm run validate:static`: ST-01..06 PASS; ST-07 UNVERIFIABLE (tidak ada Git untuk mengetahui berkas ter-track); ST-08..11 PASS; ST-12 UNVERIFIABLE (status tracked `web/dist` tidak dapat diperiksa); ST-13..15 PASS. Validator exit 1 karena dua pemeriksaan tersebut tidak dapat dibuktikan.

`npm run validate:schema`: SC-01..10 UNVERIFIABLE karena `DATABASE_URL` tidak tersedia. Skrip mencetak FAIL saat catalog tidak dapat dibaca; laporan ini mengklasifikasikan kondisi lingkungan itu sebagai UNVERIFIABLE, bukan bukti skema salah.

# Detail per langkah

| ID | Persyaratan | Status | Bukti | Tindakan |
|---|---|---|---|---|
| V-S01-1 | Skrip empat spike dan `docs/SPIKE.md` ada | PASS | `scripts/spike/{paypal-oauth,paypal-payout,webhook-echo,ai-json}.js` dan `docs/SPIKE.md` ditemukan | Tidak ada |
| V-S01-2 | Semua spike tanpa env gagal jelas tanpa stack | PASS | Node 22 menjalankan empat skrip; tiap skrip mencetak `env belum diisi`, exit 1, tanpa stack trace | Tidak ada |
| V-S01-3 | OAuth sandbox memakai Basic auth/grant client credentials tanpa mencetak token | PASS | `paypal-oauth.js` menggunakan host sandbox dan menghapus `access_token` dari payload sebelum logging | Tidak ada |
| V-S01-4 | Payout USD 1.00 idempoten dan menampilkan status/detail batch | PASS | `paypal-payout.js` memakai UUID request ID, `spike_<timestamp>`, lalu GET payout batch | Tidak ada |
| V-S01-5 | Echo menyimpan raw body/header dan memanggil verifikasi signature | PASS | `webhook-echo.js`; body yang disimpan kini string raw, verifikasi pakai endpoint sandbox | Hasil webhook riil tetap MANUAL pada V-S01-9(b) |
| V-S01-6 | AI spike membatasi provider, memvalidasi Zod, timeout 20 dtk, mencatat waktu | PASS | `ai-json.js`; amount minor divalidasi string digit agar presisi integer terjaga | Panggilan provider riil tetap MANUAL pada V-S01-9(d) |
| V-S01-7 | Empat bagian SPIKE mencatat perintah, hasil, keputusan, tanggal | PASS | Keempat heading dan field tercantum di `docs/SPIKE.md`; hasil belum diisi, ditangani sebagai MANUAL | Tidak ada |
| V-S01-8 | `spike-out/` diabaikan dan env spike ada tanpa nilai | PASS | `.gitignore` memuat `spike-out/`; seluruh empat variabel spike wajib ada dan kosong di `.env.example` | Pelacakan `.env` tidak dapat diverifikasi tanpa Git (ST-07) |
| V-S01-9(a-d) | Hasil nyata dari spike PayPal, webhook, hosting, AI | MANUAL | `docs/SPIKE.md`: keempat hasil tetap `BELUM DIJALANKAN` | Pemilik menjalankan spike dengan kredensial/hosting sendiri; jangan menebak hasil |
| V-S02-1 / SC-01..10 | Validasi katalog skema dan seluruh persyaratan DB | UNVERIFIABLE | `npm run validate:schema`; tidak ada `DATABASE_URL` | Sediakan DB terpisah, jalankan migrasi, lalu ulangi validator |
| V-S02-2 | Migrasi idempoten dan advisory lock, termasuk dua proses paralel | UNVERIFIABLE | Dua `npm run migrate` berakhir dengan kegagalan autentikasi PostgreSQL; data migrasi tidak berubah | Ulangi dua migrasi serial dan dua proses paralel pada DB tes |
| V-S02-3 | Pool, bigint parser, dan utilitas minor-unit | PASS | ST-15 PASS; tes unit `money.test.js` menguji BigInt, integer, string, nol, negatif, pecahan, dan unsafe integer | Memperbaiki penerimaan nominal negatif dan Number yang tak aman |
| V-S02-4 | `withTx` commit/rollback dan rethrow | PASS | `tx.test.js` memverifikasi BEGIN/COMMIT/ROLLBACK, pelepasan client, dan error asli | Tidak ada |
| V-S02-5 | Canonical JSON dan vektor golden | PASS | `canonical.test.js` memuat golden vector yang diwajibkan dan larangan BigInt | Tidak ada |
| V-S02-6 | AES-GCM/AAD, IV acak, scrypt, timing-safe compare, Ed25519, kid | PASS | `crypto.test.js` kini memeriksa IV berbeda, ciphertext korup, AAD salah, salt 16-byte, parameter scrypt, signature, dan rumus kid | Memperbaiki `kidFromPublicKey` agar meng-hash DER bytes, bukan representasi string Buffer |
| V-S02-7 | Error response tanpa stack atau pesan internal | PASS | `errors.test.js` memverifikasi error internal menjadi INTERNAL generik tanpa stack; tes regresi auth/feedback lulus | Mengubah error aplikasi terstruktur menjadi `AppError` agar status/kode publik tetap terjaga |
| V-S02-8 | Redaksi log untuk header dan field rahasia | PASS | `logger.test.js` menangkap output Pino dan memastikan authorization/cookie/client_secret/api_key/password/*_enc tidak muncul | Menambahkan redaksi rekursif untuk field dengan suffix `_enc` |
| V-S02-9 | `gen-keys.js` mengeluarkan tiga jenis kunci tanpa menulis file | PASS | Source hanya memakai `node:crypto` dan `console.log`; tidak menjalankan generator agar key tidak tercetak ke terminal | Tidak ada |
| V-S02-10 | Format key tervalidasi, tanpa default, boot tanpa key ditolak | PASS | `node app.cjs` tanpa key exit 1; uji in-memory menerima base64 32-byte dan Ed25519 PKCS8 yang valid | D25 mencatat perubahan |
| V-S02-11 | CHECK budget dan trigger immutable dites pada DB | UNVERIFIABLE | Tes integrasi DB diskip karena database tes belum tersedia; total suite saat ini 9 skip | Jalankan tes integrasi setelah database tes disediakan |
| V-S02-12 | Tidak menambah endpoint/UI S02 dan notices memuat pg/zod/pino | PASS | Berkas S02 yang berubah tidak menambah route/UI; `THIRD_PARTY_NOTICES.md` mencantumkan pg, zod, pino | Tidak ada |
| V-S03-1 | Tipe ledger minimum persis; tambahan dicatat | PASS | `LEDGER_TYPES` memuat event wajib dan `MANDATE_EXPIRED`; tambahan dicatat di D28 | Tidak ada |
| V-S03-2 | Append wajib tx, kunci head, seq+1, ISO ms disimpan | PASS | `ledger.js` memakai head row `FOR UPDATE`, `new Date().toISOString()` dan insert timestamp eksplisit; tes tanpa tx kini tidak diskip | Tidak ada |
| V-S03-3 | Crosscheck independen hash dan tanda tangan | UNVERIFIABLE | `scripts/validate/ledger-crosscheck.js` tidak mengimpor `ledger.js`, memverifikasi rumus hash, Ed25519, dan presisi timestamp; `node --check` PASS, tetapi DB/keys tidak tersedia untuk eksekusi | Jalankan `npm run validate:ledger -- --org <uuid>` atau `--all` dengan DB dan key |
| V-S03-4 | Genesis hash nol dan sequence kontigu | PASS | `ledger.js` menginisialisasi `ZERO_HASH` 64 nol dan mulai dari `last_seq + 1` | Tidak ada |
| V-S03-5 | Payload melarang kunci secret/token/identifier secara nested | PASS | Tes unit ledger menguji `client_secret` dan nested `token`; implementasi memeriksa kunci secara rekursif | Tidak ada |
| V-S03-6 | Verifikasi chain, signature, head, batch 500, hasil terstruktur | UNVERIFIABLE | Implementasi `verifyChain` dan crosscheck mengandung pemeriksaan tersebut; validasi chain membutuhkan DB | Jalankan tes integrasi ledger pada PostgreSQL |
| V-S03-7 | 100 append concurrent, isolasi org, rollback, enam jenis tamper, rotasi key | UNVERIFIABLE | Tes integrasi sudah menguji 100 append paralel dan enam mutasi; tes diskip karena `TEST_DATABASE_URL` tidak tersedia | Jalankan `npm test` dengan database khusus |
| V-S03-8 | CLI `--org`/`--all` exit status pada data bersih | UNVERIFIABLE | CLI mem-parsing kedua argumen; crosscheck `--all` menyatakan DATABASE_URL wajib; tidak ada DB uji | Jalankan `npm run verify-ledger -- --all` setelah seed pada DB bersih |
| V-S03-9 | Export async JSON, tidak ada update/delete entry, operasi tenant bertenant | PASS | `exportLedger` async iterator; source scan hanya menemukan INSERT/SELECT ledger entries, tanpa UPDATE/DELETE; enumerasi global CLI `--all` dicatat D29 | Tidak ada |
| V-S04-1 | Registrasi publik nonaktif secara default | PASS | `REGISTRATION_ENABLED` default 0; `auth.test.js` memverifikasi respons `REGISTRATION_DISABLED` tanpa database | Tidak ada |
| V-S04-2 | Password disimpan sebagai hash, bukan plaintext | PASS | Login memakai `verifyPassword`; seed memakai `hashPassword` dan hanya mencetak password sintetis yang digenerate, bukan menulisnya ke tabel | Tidak ada |
| V-S04-3 | Rate limit login 10 permintaan/60 detik diberlakukan | UNVERIFIABLE | Login kini memakai `enforceRateLimit`; bucket menggunakan upsert atomik. Eksekusi DB tidak tersedia | Jalankan tes login/rate-limit dengan `TEST_DATABASE_URL` |
| V-S04-4 | Lima kegagalan login mengunci akun 15 menit | UNVERIFIABLE | `recordLoginFailure` menaikkan counter atomik dan mengatur `locked_until`; alur belum dapat diuji terhadap PostgreSQL | Jalankan tes lockout dan konkurensi pada DB tes |
| V-S04-5 | Sesi acak, hanya hash token disimpan, expiry 12 jam, cookie aman | PASS | Token 32-byte dibuat baru, SHA-256 disimpan, cookie HttpOnly/SameSite=Lax/Secure di luar development, dan lookup mengecek expiry | Uji siklus sesi lengkap pada DB tes |
| V-S04-6 | CSRF memakai secret acak dan pembandingan timing-safe | PASS | Secret 32-byte per sesi; middleware menolak token hilang/salah dan memakai `timingSafeEqual` | Tidak ada |
| V-S04-7 | Matriks OWNER/ADMIN/APPROVER/OPERATOR/VIEWER/JUDGE sama dengan PRD §13.3 | PASS | Tes tabel memeriksa setiap role terhadap setiap permission; memperbaiki typo APPROVER dan akses berlebih ADMIN, APPROVER, OPERATOR | Tidak ada |
| V-S04-8 | JUDGE hanya aktif pada tenant demo dan dikecualikan dari kredensial PayPal/anggota/hapus organisasi | UNVERIFIABLE | Role efektif JUDGE dibatasi slug tenant demo; endpoint kredensial PayPal owner-only; tes integrasi ditambahkan tetapi diskip tanpa DB; endpoint anggota/hapus organisasi belum tersedia | Jalankan tes authz Judge dan tinjau endpoint anggota/hapus organisasi saat tersedia |
| V-S04-9 | Step-up mengikat password, purpose, expiry lima menit, dan konsumsi sekali | UNVERIFIABLE | Purpose divalidasi; grant dipakai satu kali dan freeze/unfreeze kini mematok `FREEZE_TOGGLE`; tes salah-purpose dan benar-purpose ditambahkan namun belum dieksekusi | Jalankan tes integrasi step-up pada DB tes |
| V-S04-10 | Operasi sesi dan membership dibatasi tenant aktif | UNVERIFIABLE | Login memilih membership pengguna; `/auth/me` dan middleware mengambil org dari `session.current_org_id`; tes isolasi memerlukan fixture multi-tenant PostgreSQL | Jalankan tes isolasi lintas-tenant |
| V-S04-11 | Seed demo aman dan idempoten pada eksekusi berulang | UNVERIFIABLE | Seed memakai advisory transaction lock, synthetic records, hash password, dan upsert/lookup; belum bisa dijalankan tanpa DB/key env | Jalankan `npm run seed` dua kali pada database khusus |
| V-S04-12 | Audit login/step-up mencatat aksi tanpa password/kredensial | PASS | Source mencatat LOGIN_FAILED/LOCKOUT/LOGIN_SUCCESS/STEP_UP_GRANTED tanpa memasukkan password atau PayPal secret | Periksa isi audit setelah tes DB |
| V-S12-1 | Registry mencakup tipe job yang diminta; handler belum tersedia berakhir DEAD | PASS | Registry mencantumkan 11 tipe; handler yang belum ada melempar `NOT_IMPLEMENTED`, dan unit test registry lulus | Implement handler sesuai langkah pemilik berikutnya |
| V-S12-2 | Dedup, klaim atomik `SKIP LOCKED`, dan satu kali eksekusi | UNVERIFIABLE | Implementasi menggunakan partial unique dedupe index dan `FOR UPDATE SKIP LOCKED`; tes paralel tersedia tetapi dilewati tanpa DB | Jalankan tes queue pada PostgreSQL |
| V-S12-3 | Retry exponential+jitter, batas lima percobaan, dan DEAD | UNVERIFIABLE | Logika retry ada di `fail`; pengujian delay/attempts ada namun integrasi dilewati tanpa DB | Jalankan retry tests pada PostgreSQL |
| V-S12-4 | Lease 60 detik, heartbeat, reclaim setelah worker crash | UNVERIFIABLE | Claim/reclaim dan heartbeat terimplementasi; tes restart worker tersedia namun dilewati tanpa DB | Jalankan crash/restart test pada PostgreSQL |
| V-S12-5 | Worker concurrency 2, poll 2 detik+jitter, heartbeat proses | PASS | Konstanta worker sesuai §9.9 PRD; poll/jitter default 2000/500 ms, concurrency 2, process heartbeat 10 detik | Tidak ada |
| V-S12-6 | Cron tick dibatasi maksimal 55 detik | UNVERIFIABLE | Validasi durasi membatasi `drainQueue` sampai 55.000 ms dan integrasi menguji exit time; tes dilewati tanpa DB | Jalankan tick integration test pada PostgreSQL |
| V-S12-7 | Cleanup transaksional, TTL session/rate-limit/job, expiry mandate, reschedule satu jam | UNVERIFIABLE | Operasi dan reschedule implementasi ada; tes transactional cleanup tersedia namun dilewati tanpa DB | Jalankan cleanup integration test pada PostgreSQL |
| V-S12-8 | `/readyz` memeriksa koneksi DB, migrasi terbaru, serta heartbeat worker saat aktif | UNVERIFIABLE | Pemeriksaan source mencakup ketiga gate; readiness tidak dapat diuji dengan DB/worker pada checkpoint ini | Jalankan health/readiness test dengan worker aktif/nonaktif |
| V-S12-9 | Dashboard admin menampilkan depth, DEAD, dan umur webhook tanpa bocor tenant | UNVERIFIABLE | Metrik kini tenant-scoped lewat `jobs.org_id`/`webhook_events.org_id`, hanya untuk OWNER/ADMIN/JUDGE; build lulus, tes API DB ditambahkan namun dilewati | Uji dashboard owner/viewer/JUDGE pada PostgreSQL |
| V-S05-1 | Base URL selalu PayPal Sandbox; override hanya untuk test | PASS | `PAYPAL_API_BASE` adalah konstanta sandbox; unit test memastikan override diabaikan di production; ST-05 PASS | Tidak ada |
| V-S05-2 | OAuth Client Credentials memakai Basic auth dan token dicache sampai margin expiry | PASS | Fake PayPal menguji OAuth, cache satu token, dan testConnection; access token tidak dicetak | Tidak ada |
| V-S05-3 | Kredensial tersimpan terenkripsi dengan AAD tenant dan tidak dikirim balik | PASS | Client decrypt memakai AAD per-org; enkripsi/AAD diliput tes crypto; API hanya mengembalikan masked client ID | Tidak ada |
| V-S05-4 | Retry tidak menggandakan write non-idempoten | PASS | POST hanya di-retry bila ada `PayPal-Request-Id`; GET retryable; unit test membuktikan POST tanpa key berhenti setelah 503 pertama dan POST ber-key tetap idempoten | Tidak ada |
| V-S05-5 | Payout mengirim `PayPal-Request-Id` dan duplikat tidak membuat payout kedua | PASS | Tes fake PayPal mengirim idempotency ID, mengulang request, dan memastikan hanya satu payout; transient 503 juga diuji | Tidak ada |
| V-S05-6 | Error PayPal memakai kode publik dan meredaksi secret/token | PASS | Unit test memastikan response/error details tidak membocorkan client ID/secret; client memakai pesan generik | Tidak ada |
| V-S05-7 | Simpan/rotasi/hapus kredensial owner-only; token/kunci tidak terekspos ke non-owner | UNVERIFIABLE | Route membatasi write ke OWNER dan GET menyembunyikan webhook URL dari non-owner; integration assertions ada tetapi tidak berjalan tanpa DB | Jalankan tes PayPal integration pada PostgreSQL |
| V-S05-8 | Webhook mempertahankan raw body, memverifikasi signature sebelum insert | UNVERIFIABLE | Express raw middleware dan verify-webhook-signature ada; tes valid/invalid tersedia tetapi diskip tanpa DB | Jalankan webhook integration test |
| V-S05-9 | Event terverifikasi dan job dipersistenkan satu kali dalam transaksi tenant yang sama | UNVERIFIABLE | INSERT event, dedupe, dan enqueue `org_id` satu transaksi; test duplicate event belum berjalan tanpa DB | Jalankan dedupe/transaction test PostgreSQL |
| V-S05-10 | Webhook membatasi 120/min dan unknown token tidak mengungkap token | UNVERIFIABLE | Bucket key di-hash, status 429/404 dan body generik diuji di suite integration yang diskip tanpa DB | Jalankan rate-limit/token test |
| V-S05-11 | OAuth dan payout nyata pada akun Sandbox | MANUAL | `docs/SPIKE.md` mencatat spike PayPal belum dijalankan; hasil eksternal tidak dapat disimpulkan dari fake server | Pemilik menjalankan spike dengan kredensial Sandbox |
| V-S05-12 | Pengiriman webhook nyata, verifikasi, dan status payout Sandbox | MANUAL | Belum ada hasil webhook nyata; simulasi fake tidak membuktikan perilaku provider/akun | Pemilik menjalankan spike webhook dan mencatat hasil |
| V-F01-1 | Token desain final/M-TOKEN disetujui pemilik | MANUAL | `token-final.json` tidak tersedia; D22 menyatakan nilai sekarang estimasi PRD 12.2 | Pemilik menyediakan token final sebelum G1 |
| V-F01-2 / ST-10 | Tidak ada warna/ukuran literal UI di luar tokens | PASS | ST-10 PASS; production build, CSS lint, dan geometry parity 46 assertion PASS | Breakpoint dipusatkan di `web/src/styles/tokens.css`; transparansi memakai token |
| V-F01-3 | Inspeksi UI final dan keputusan gerbang G1 | MANUAL | Tidak ada URL hosting/konfirmasi visual pemilik pada checkpoint ini | Pemilik memeriksa UI dan mengonfirmasi G1 |
| V-F02-1 | CSP dan header keamanan shell web | PASS | `app-shell-security.test.js` memeriksa CSP, `nosniff`, dan `no-referrer`; tes lulus dalam `npm test` | Tidak ada |
| V-F02-2 | Feedback memerlukan sesi dan CSRF sebelum menulis audit event | PASS | Route memasang `requireSession` dan `requireCsrf`; tes memastikan request anonim ditolak | Tes POST feedback valid dan persistensi `audit_events` masih memerlukan PostgreSQL |
| V-F02-3 | Feedback tersimpan ke database dan ditangani end-to-end | UNVERIFIABLE | Source menulis `FEEDBACK_SUBMITTED`, tetapi integration test DB tidak dapat dijalankan | Jalankan integration test feedback dengan `TEST_DATABASE_URL` |
| V-F03-1 | Route/tindakan frontend untuk OWNER/ADMIN/OPERATOR/JUDGE konsisten dengan backend | PASS | Menyamakan JUDGE pada agent/payee/trust/kill-switch UI dengan route API; mock-API browser check lulus untuk JUDGE dan VIEWER, termasuk deep link payee |
| V-F03-2 | Journey login, PayPal Sandbox, agent/key, payee, dan freeze melalui PostgreSQL | UNVERIFIABLE | `scripts/f03-e2e.js` tersedia, tetapi belum dijalankan karena `TEST_DATABASE_URL` tidak tersedia | Jalankan E2E dengan database khusus dan fake PayPal |
| ST-01..06, ST-08..11, ST-13..15 | Pemeriksaan statis terkait bahasa, metadata, dependensi, host, uang, tenant, error codes, UI, dan pool | PASS | Keluaran `npm run validate:static` pada checkpoint ini | Pertahankan validator dan ulangi setelah perubahan |
| ST-07 | Pola rahasia hanya pada berkas yang tidak ter-track; `.env` terabaikan | UNVERIFIABLE | Checkout tidak memiliki `.git` | Ulangi `git ls-files` dan `git check-ignore` pada checkout Git |
| ST-12 | `web/dist` tidak ter-track dan tidak ada `__parity` setelah build | UNVERIFIABLE | Tidak ada `.git`; scan output build tidak menemukan `__parity` | Buktikan tracking status pada checkout Git |
| V-S06-1 | Format dan entropi kunci API agen | PASS | Unit test memeriksa format `jp_sbx_{prefix}_{secret}`, parser menolak key tambahan, dan generator memakai 6 byte prefix acak serta 24 byte secret acak | Tidak ada |
| V-S06-2 | Penyimpanan HMAC saja dan kunci rahasia hanya ditampilkan saat penerbitan | UNVERIFIABLE | Source menyimpan HMAC dengan pepper dan respons daftar hanya mengembalikan metadata; assertion DB/API ada di integration test tetapi dilewati tanpa `TEST_DATABASE_URL` | Jalankan agents/payees integration test pada PostgreSQL |
| V-S06-3 | Autentikasi key memverifikasi HMAC secara timing-safe dan menolak revoked/disabled; rate limit 60/menit | PASS | Unit test menguji collision prefix, HMAC, revoked, disabled, format salah, dan rate limit; test memakai dependency injection, bukan DB | Uji rate limit dan status key melalui integration test |
| V-S06-4 | Operasi agen dan key terikat tenant; rotasi/revoke memerlukan step-up | UNVERIFIABLE | Repository memakai `org_id`, rotasi atomik mencabut key lama dan menerbitkan key baru, dan test lintas-tenant/step-up tersedia tetapi dilewati tanpa DB | Jalankan agents/payees integration test pada PostgreSQL |
| V-S06-5 | Identifier payee dienkripsi dengan AAD tenant, dinormalisasi sebelum HMAC, dan dimasking | PASS | Unit test mendekripsi dengan AAD tenant, menguji HMAC normalisasi, serta memeriksa mask EMAIL/PHONE/PAYPAL_ID | Tidak ada |
| V-S06-6 | Respons API payee tidak mengungkap identifier plaintext | PASS | `publicPayee` hanya mengembalikan `identifierMasked`; assertion create/update/list kini secara eksplisit menolak identifier plaintext, namun integration test DB belum berjalan | Jalankan assertion API pada PostgreSQL |
| V-S06-7 | Payee tenant isolation dan pencegahan duplikat identifier | UNVERIFIABLE | Query create/read/update tenant-scoped dan unique constraint `(org_id, identifier_hmac)` ada; assertion duplikat/lintas-tenant memerlukan PostgreSQL | Jalankan agents/payees integration test pada PostgreSQL |
| V-S06-8 | Perubahan identifier mencatat revision HMAC dan `changed_at` | UNVERIFIABLE | Source menulis revision dan timestamp bersama perubahan; tes DB memeriksa nilai lama/baru dan timestamp, tetapi dilewati tanpa database | Jalankan agents/payees integration test pada PostgreSQL |
| V-S06-9 | Perubahan trust memerlukan role berizin, step-up, dan ledger event tenant | UNVERIFIABLE | Route mengikat grant ke `TRUST_PAYEE` dan menulis event dalam transaksi; test role/no-grant/granted ada tetapi belum dieksekusi | Jalankan agents/payees integration test pada PostgreSQL |
| V-S06-10 | Seed S06 idempoten dan demo API key tidak dicetak ulang | UNVERIFIABLE | Integration test menjalankan seed dua kali dan memeriksa jumlah data serta output satu kali; belum berjalan tanpa `TEST_DATABASE_URL` | Jalankan agents/payees integration test pada PostgreSQL |
| V-S06-11 | Status key, payee, dan seed berperilaku benar melalui persistensi PostgreSQL | UNVERIFIABLE | Integrasi S06 dilewati karena `TEST_DATABASE_URL` tidak tersedia; source/unit tidak membuktikan constraint, transaksi, atau persistensi runtime | Sediakan DB tes lalu jalankan `npm test` |
| V-S07, G-01..G-10 lain | Kriteria lain | UNVERIFIABLE / belum diaudit | Kriteria S07 tidak ditemukan di `docs/ROADMAP.md`/`docs/PRD.md` checkout; G1 owner decisions tetap manual | Minta/pulihkan spesifikasi S07 sebelum audit; jangan mengasumsikan bukti lama |

# Perbaikan yang dilakukan

- Checkpoint lokal ini belum dapat di-commit karena folder kerja bukan repositori Git.
- Menambahkan `scripts/validate/static.js` dan `scripts/validate/schema.js`, serta npm aliases `validate:static`, `validate:schema`, `validate`, `setup`, dan `test:unit`.
- Menguatkan validasi format key dan mewajibkan tiga key runtime pada entry point server; keputusan D25.
- Memindahkan custom media breakpoints ke `tokens.css` dan mengganti literal `transparent` dengan token.
- S01: menyimpan body webhook sebagai raw string dan mengubah amount pada AI spike menjadi integer minor-unit string (D26).
- S02/S03: menolak amount negatif/unsafe, mengamankan error INTERNAL, memperbaiki kid SHA-256 dan redaksi `*_enc`, menambah tes unit, mengubah head PK lewat migrasi maju 014, serta menambahkan crosscheck ledger dan tes append paralel (D27-D29).
- S04: memperbaiki matriks RBAC agar cocok dengan PRD §13.3, membatasi JUDGE pada tenant demo, mengikat pemilihan tenant ke membership sesi, menyembunyikan webhook URL PayPal dari non-owner, memberlakukan rate limit login, membuat increment lockout atomik, dan mengikat freeze ke purpose `FREEZE_TOGGLE`.
- S12: menyertakan `org_id` pada job, menambahkan metrik antrean tenant-scoped pada dashboard OWNER/ADMIN/JUDGE, serta tes integrasi untuk isolasi metrik dan pemeriksaan authz/step-up.
- S05: membatasi retry write PayPal tanpa idempotency key dan menambah regresi retry/idempotency; webhook/connection integration tests tetap menunggu DB dan bukti Sandbox nyata tetap MANUAL.
- S06: mengaudit lifecycle API key, isolasi tenant, enkripsi/masking payee, revisi identifier, trust, dan seed; memperbaiki ekspektasi integration test agar respons create/update tidak mengharapkan identifier plaintext.
- F03: menyelaraskan route/tindakan UI JUDGE dengan permission backend, dan mencegah VIEWER membuka form payee melalui deep link; test browser memakai API mock lulus.

CHECKPOINT S01 VERIFIED-WITH-EXCEPTIONS 2026-11-01 no-commit-Git-metadata-unavailable
CHECKPOINT S02 VERIFIED-WITH-EXCEPTIONS 2026-11-01 no-commit-Git-metadata-unavailable
CHECKPOINT S03 VERIFIED-WITH-EXCEPTIONS 2026-11-01 no-commit-Git-metadata-unavailable
CHECKPOINT S04 VERIFIED-WITH-EXCEPTIONS 2026-11-01 no-commit-Git-metadata-unavailable
CHECKPOINT S12 VERIFIED-WITH-EXCEPTIONS 2026-11-01 no-commit-Git-metadata-unavailable
CHECKPOINT S05 VERIFIED-WITH-EXCEPTIONS 2026-11-01 no-commit-Git-metadata-unavailable
CHECKPOINT S06 VERIFIED-WITH-EXCEPTIONS 2026-11-01 no-commit-Git-metadata-unavailable

# Keputusan baru

- D25-D29 di `docs/DECISIONS.md`: validasi key runtime, money string pada AI spike, primary key ledger head, event expiry tambahan, dan batas enumerasi global CLI `--all`.

# Sisa untuk pemilik

1. **Database test** — sediakan `DATABASE_URL` dan `TEST_DATABASE_URL` untuk database terpisah; jalankan `npm run migrate` dua kali, `npm run validate:schema`, lalu `npm test`. Catat koneksi yang dipakai (tanpa rahasia) dan jumlah lulus/gagal/skip di bagian ini.
2. **Checkout Git** — buka workspace dari checkout yang memiliki `.git` dan remote; ulangi `git status --short`, `git log --oneline -30`, `git remote -v`, `git rev-parse HEAD`, ST-07, ST-12, serta commit/push checkpoint.
3. **CI** — tambahkan/konfirmasikan `.github/workflows/ci.yml` dengan job server dan UI; `npm run guard` saat ini gagal karena berkas itu tidak ada. Setelah push, buka GitHub Actions dan catat status workflow di sini.
4. **Spike Sandbox/hosting/AI** — jalankan perintah persis yang tercantum per bagian di `docs/SPIKE.md`, isi hasil/keputusan/tanggal berdasarkan bukti, dan perbarui bagian ini. Jangan membagikan secret di log.
5. **UI final dan hosting** — putuskan M-TOKEN dari acuan desain, jalankan geometry/E2E di CI, validasi login dan koneksi Sandbox pada URL hosting, lalu minta pemilik memeriksa UI secara visual.
6. **Dependensi** — tinjau advisories yang dilaporkan `npm ci` root/web sebelum G1; tidak dilakukan `npm audit fix` otomatis.

# Kesiapan Gerbang G1 (+S07)

| Kriteria | Status | Alasan |
|---|---|---|
| Login di URL hosting | butuh pemilik | Belum ada URL hosting yang diuji dalam sesi ini |
| Koneksi PayPal Connected | butuh pemilik | Spike Sandbox belum dijalankan |
| Agen + key + payee via UI | belum | Alur end-to-end belum diaudit |
| CI hijau | belum | Workflow CI tidak ada pada workspace ini |
| Geometri S1 lulus | PASS lokal; visual owner pending | Geometry parity menjalankan S1/S2, 46 assertions lulus di Chrome sistem; ini bukan persetujuan visual pemilik |
| Kalibrasi jam | butuh pemilik | Belum ada hasil kalibrasi yang dibuktikan |

## Resume

- Fase selesai: audit source/unit S01-S06, S12, dan F01-F03 dengan pengecualian manual/database.
- Langkah aktif: S07 terblokir sampai kriteria terperinci tersedia.
- Bukti terbaru: `npm test` 121 total (112 pass, 0 fail, 9 skip); `npm run lint`, web build, CSS lint, geometry parity (46 assertions), dan mock-API browser role checks pass.
- Perintah lanjut: sediakan kriteria S07; setelah itu jalankan database integration/E2E dan selesaikan M-TOKEN/G1 berdasarkan bukti pemilik.
- Batas checkpoint: tidak ada Git metadata atau kredensial DB; commit/push dan pemeriksaan database belum mungkin.
