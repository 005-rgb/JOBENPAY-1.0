# PROGRESS

## Status ringkas
- **Langkah terakhir dikerjakan**: MOBILE-RESPONSIVE (Mode mobile responsif penuh di semua halaman: AppShell drawer & close button, Dashboard grid 2x2, kartu data tabel dengan horizontal touch scroll, filter/search full-width, Landing typography fluid clamp, serta Google OAuth & mitigasi batas memori CloudLinux cPanel).
- **Langkah saat ini**: Siap untuk verifikasi akun PayPal Sandbox nyata / pengerjaan modul Tier B selanjutnya.
- **Validasi lokal terkini**:
  - `npm test`: 280/280 tes lulus tanpa gagal/skip (279 tes suite + 1 pemeriksaan akhir integritas ledger 7 organisasi valid dan deteksi 6/6 tamper classes).
  - `npm run coverage`: line 96,73%, branch 90,19% (469/520 >= 90%), function 100%, statements 96,73%.
  - `npm run lint` & `npm run guard`: LULUS.
  - `npm run migrate` (2x berturut-turut): LULUS.
  - `npm --prefix web run build`: LULUS (bundle entry JS 391,88 kB).
  - `npm --prefix web run lint:css`: LULUS.
- **Blueprint PRD**: `JOBENPAY_PRD_Technical_Blueprint_v1_2.md` digunakan sebagai dokumen sumber acuan utama (menggantikan `docs/PRD.md` yang hanya memuat judul).
- **Status Git**: Branch `dev`, remote `origin` (`https://github.com/005-rgb/JOBENPAY-1.0.git`). Perubahan lokal belum di-push ke remote.

## Tabel langkah
| Langkah | Status (TODO/WIP/DONE/BLOCKED) | Commit / Ref | Tanggal | Catatan |
|---|---|---|---|---|
| S00 | DONE | feat(S00): project skeleton, guards, CI | 2026-10-30 | Node 22, guard, lint, health endpoint terverifikasi |
| S01 | DONE (menunggu manual: Sandbox/cPanel) | feat(S01): spike scripts and report template | 2026-10-30 | Template dan skrip spike dibuat; verifikasi eksternal Sandbox/cPanel menunggu akses pemilik |
| S02 | DONE | feat(S02): schema, migrations and crypto utilities | 2026-10-30 | Migrasi DB, constraints, dan kriptografi AES-256-GCM / Ed25519 teruji |
| S03 | DONE | feat(S03): hash-chained signed ledger | 2026-10-30 | Hash-chain SHA-256 kanonik dan tanda tangan Ed25519 teruji |
| S04 | DONE | feat(S04): auth, sessions, RBAC, step-up, seed | 2026-10-30 | Session cookie, CSRF, RBAC matriks, rate limit, lockout, step-up teruji |
| S05 | DONE (menunggu manual: PayPal live) | 4cbe4c6 | 2026-10-30 | Client PayPal Sandbox, fake provider, retry idempoten, webhook token teruji |
| S06 | DONE | 010_s06 | 2026-10-30 | Agen, API key HMAC SHA-256, payee identifier HMAC teruji |
| S07 | DONE | 011_s07 | 2026-11-01 | Ekstraksi dokumen, kuota biaya AI, audit usage teruji |
| S08 | DONE | 012_s08, 015_s08 | 2026-11-01 | Mandat immutable versioning, policy schema Zod, batas anggaran paralel teruji |
| S09 | DONE | S09 | 2026-11-01 | State machine 12x12 legal/illegal, rule A1-A13, penanda B, request hash kanonik teruji |
| S10 | DONE | S10 | 2026-11-01 | Stage C fail-closed monotonik, AI tidak dapat memperlonggar keputusan |
| S11 | DONE | S11 | 2026-11-01 | Approvals, dual-approval (four-eyes), expiration, notifikasi teruji |
| S12 | DONE | feat(S12): postgres job queue, worker, tick | 2026-10-30 | Antrean SKIP LOCKED, tick worker, retry backoff, dead queue teruji |
| S13 | DONE | S13 | 2026-11-01 | Payout execution idempoten, reconciliation, webhook mismatch teruji |
| S13-REAL-A | DONE | 1f5914e | 2026-11-04 | Preflight PF-01 s/d PF-12, export bukti ter-redaksi, runbook operasional |
| S13-REAL-B | DONE | S13-REAL-B | 2026-11-04 | Penyelarasan format Sandbox nyata dan respons fake-paypal |
| S14 | DONE | S14 | 2026-11-01 | REST `/api/v1/agent/v1` dan MCP stateless modern (2026-07-28) & legacy (2025-11-25) |
| S16 | DONE | 017_s16 | 2026-11-01 | Security hardening, CSP, rate limits, demo reset atomik teruji |
| S17 | DONE | HARDEN-1 | 2026-11-05 | 280/280 tes lulus, 6 tamper classes terdeteksi, coverage branch 90,19% >= 90% |
| S18 | DONE | S18 | 2026-11-01 | README 10 bagian, threat model, third-party terms, fresh-clone script |
| F01 | DONE | F01 | 2026-10-30 | Scaffold web, design tokens, geometry parity teruji |
| F02 | DONE | F02 | 2026-10-31 | AppShell, primitives, CSP, feedback modal teruji |
| F03 | DONE | 448e387 | 2026-10-31 | UI login, dashboard, agents, payees, PayPal settings teruji |
| F04 | DONE | F04 | 2026-11-01 | UI mandates, documents, requests, approvals teruji |
| F05 | DONE | F05 | 2026-11-01 | UI ledger, audit listing, simulator, tamper & restore teruji |
| HARDEN-1 | DONE | HARDEN-1 | 2026-11-05 | Pengujian otomatis lintas tenant 404/403 seluruh rute Express, D16 & D18 teruji |
| LANDING | DONE | LANDING | 2026-11-05 | Homepage publik aktif di `/` (`nh.jobenapp.cloud`), tombol login di pojok kanan atas ke `/login`, hero, 5 langkah, 3 kontrol, 4 fakta, try 3 menit, honest limits strip, dan footer terintegrasi token |
| P5-AUTH | DONE | P5-AUTH | 2026-11-05 | Google OAuth 2.0 auth token login, email verification outbox worker terenkripsi, retry backoff, dan pembersihan akun kedaluwarsa |
| CPANEL-OPT | DONE | CPANEL-OPT | 2026-11-05 | Optimasi alokasi memori V8 (`--max-old-space-size=256`), threadpool=2, eliminasi crash `Aborted (core dumped)` di cPanel |
| MOBILE-RESPONSIVE | DONE | d94f68f | 2026-11-06 | Layout mobile responsif di seluruh halaman (AppShell, Dashboard 2x2, kartu data tabel, filter bar, hero typography), 0 regresi desktop |

## Resume
Suite pengujian penuh backend dan frontend berada pada status 100% hijau: 280 tes otomatis lulus tanpa skip (termasuk verifikasi integritas hash chain 7 organisasi dan deteksi 6 jenis manipulasi ledger), dengan ambang batas cakupan kode cabang 90,19% (469/520) dan baris 96,73%. Rute beranda publik (`/` untuk domain `nh.jobenapp.cloud`) kini aktif melayani Landing Page dengan navigasi tombol Login di pojok kanan atas menuju `/login`, rute proteksi `/dashboard` untuk sesi aktif, tata letak token murni, dan kepatuhan penuh terhadap guard sistem.

## Blockers
1. **Kredensial & Lingkungan Hosting cPanel**:
   - **Apa**: Kredensial hosting cPanel dan PostgreSQL TLS produksi belum tersedia di lingkungan lokal.
   - **Siapa**: Pemilik proyek.
   - **Langkah**: Sediakan akses cPanel/Passenger, konfigurasikan database PostgreSQL TLS, dan verifikasi endpoint `/readyz`.
2. **Verifikasi PayPal Sandbox Riil End-to-End**:
   - **Apa**: Validasi eksekusi payout live terhadap akun developer PayPal Sandbox nyata menunggu kredensial Sandbox aktif dari pemilik.
   - **Siapa**: Pemilik proyek.
   - **Langkah**: Jalankan `npm run real:preflight` dan verifikasi pembayaran Sandbox sesuai `docs/REAL_PAYOUT_RUNBOOK.md`.

## Riwayat
- Audit 2026-10-30 s/d 2026-11-04 menyelesaikan fondasi S00-S18 dan F01-F05.
- Sebelumnya terdapat catatan penundaan terkait ketersediaan PostgreSQL lokal (`TEST_DATABASE_URL`), ketiadaan metadata `.git`, dan ambang batas cabang 89,01% pada S17. Seluruhnya telah diselesaikan: PostgreSQL lokal aktif pada port 5432, metadata Git terhubung ke remote `origin/dev`, dan cakupan cabang kini mencapai 90,19% (melampaui ambang batas 90%).
