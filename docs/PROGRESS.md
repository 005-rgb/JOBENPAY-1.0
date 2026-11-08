# PROGRESS

## Status ringkas
- **Langkah terakhir dikerjakan**: Implementasi Penuh PRD 1.7 Cognitive Provenance Layer (CPL) & PRD 1.6 Decision Integrity Proof (DIP).
- **Langkah saat ini**: Seluruh Fase PRD 1.4, 1.5, 1.6, & 1.7 LULUS 100% (DIP, CPL Deterministic Replay Engine, Reproducibility Score, Conformance Runner 10/10 vectors, dan 80+ CPL unit/adversarial/concurrency tests PASSED).
- **Validasi lokal terkini**:
  - `npm test` (`scripts/test-suite.js`): **976 / 976 tes lulus 100% tanpa gagal/skip** (termasuk 30 golden characterization tests, 4 negative CI guard tests, 1.000 property tests seimbang, 6/6 tamper classes, dan 8 organisasi verified).
  - Pagar CI (9 pagar): 100% LULUS (`guard`, `check-spec-lock`, `check-tenant-isolation`, `check-insert-tests`, `guard-characterization`, `lint-no-float-money`, `check-traceability`, `check-tests-from-data`, `secret-scan`).
  - Traceability (`docs/traceability.csv`): 135/135 ID berstatus `done` (0 pending-by-design, 100% terlacak).
  - CCC Check (15 Kategori / 28 Pasangan): 14/14 butir terpenuhi per kategori (100% LENGKAP).
  - UI Geometry Parity (`scripts/geometry-test.js`): 46/46 asersi lulus 0 horizontal overflow.
  - Dokumentasi API (`docs/API_REFERENCE.md`): Dibangkitkan secara deterministik dari skema Zod.
  - Spec Gaps (`docs/spec-gaps.md`): 6/6 butir berstatus DITUTUP.
  - Vulnerability Audit: 0 vulnerabilities (`npm audit`).
- **Blueprint PRD**: `docs/spec/PRD_1_3R.md` & `docs/spec/addendum-1_3R.md` (APPROVED).
- **Status Git**: Branch `dev`.

## Tabel Paket Brownfield PRD 1.3-R (BW-00 s/d BW-22)
| Paket | Gerbang | Status | Baseline / Hasil Tes | Catatan |
|---|---|---|---|---|
| BW-00 | GB0 | DONE | 30 Golden Tests, 4 Negative CI Tests | Baseline 1.2 doc, snapshot v12 fixture, guard isolasi tenant & karakterisasi |
| BW-01 | GB0 | DONE | 28/28 Matriks Sandbox, Cassettes | Spike Sandbox, support matrix, verify closure V-01..V-06, providers/paypal/endpoints.js |
| BW-02 | GB0 | DONE | check-spec-lock.js LULUS | Addendum APPROVED, 0 open VERIFY, spec lock terkunci |
| BW-03 | GB1 | DONE | bw03-migration.test.js 4/4 | Migrasi forward-only expand skema universal, 45 tabel ber-org_id terindeks |
| BW-04 | GB1 | DONE | server/src/domain/journal.js | Double-entry journal engine berimbang, lines_hash berantai bukti, verifyJournal |
| BW-05 | GB1 | DONE | shared/policy-rules.js | Policy schema v2, adapter v1->v2, rule registry, policy-order.md |
| BW-06 | GB1 | DONE | shared/state-machines.js | State machine berbasis data 15 kategori, transisi atomik withTx |
| BW-07 | GB1 | DONE | providers/ProviderAdapter.js | Provider adapter (PayPalProvider, PartnerSimulatorProvider berlabel SIMULATED) |
| BW-08 | GB1 | DONE | shared/webhook-routes.js, /books | Webhook catalog, recon daily job, GET /books trial balance |
| BW-09 | GB2 | DONE | CCC 14/14, refund-e2e.test.js | REFUND full & partial, kumulatif, window 180 hari |
| BW-10 | GB2 | DONE | CCC 14/14, void-e2e.test.js | VOID authorization & order lokal |
| BW-11 | GB2 | DONE | CCC 14/14, dispute-e2e.test.js | DISPUTE response via agent SYSTEM, persetujuan manusia |
| BW-12 | GB3 | DONE | CCC 14/14, payment_plans | Persetujuan terikat rencana (plan-bound approvals), plan_hash |
| BW-16 | GB3 | DONE | CCC 14/14, exposure guards | Eksposur open authorization, open receivable, batas refund-rate 30 hari |
| BW-17 | GB3 | DONE | CCC 14/14, idor-routes 5/5 | API terpadu /transactions, MCP proposal tools aman (0 approve/execute tool) |
| BW-13 | GB4 | DONE | CCC 14/14, down_payment-e2e | DOWN_PAYMENT saga (initial, settle, forfeit) |
| BW-14 | GB4 | DONE | CCC 14/14, invoice-e2e | INVOICE receivable, issue, send, webhook paid |
| BW-15 | GB4 | DONE | CCC 14/14, sale-e2e | SALE awaiting_payer, Buyer Harness, capture |
| BW-18 | GB5 | DONE | Geometry Parity 46/46 | UI transaksi dinamis, detail, journal table, token murni |
| BW-19 | GB5 | DONE | 976/976 test suite hijau | Hardening penuh, chaos drills, fuzzing, key rotation |
| BW-20 | Tier B | DONE | CCC 14/14, bulk & sched-e2e | SCHEDULED, BULK streaming chunking, TRANSFER p2p |
| BW-21 | Tier B | DONE | CCC 14/14, split-e2e | SPLIT collect, platform fee bps, hold period, payout |
| BW-22 | Tier B | DONE | CCC 14/14, recurring-e2e | RECURRING internal schedules, cycle count, cancel |

**Gerbang Terakhir Lulus: Gerbang GB0, GB1, GB2, GB3, GB4, GB5 & Tier B (100% LULUS).**

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
| LEDGER-CSV | DONE | feat(ledger-csv) | 2026-11-06 | Streaming ekspor CSV audit ledger (FR-902/FR-1206) dengan mitigasi OWASP formula injection, tombol UI di halaman Ledger |
| APPROVAL-EMAIL | DONE | feat(approval-email) | 2026-11-06 | Email notifikasi persetujuan (FR-704) template `approvalNeeded`, enqueue outbox otomatis terenkripsi AES-256-GCM saat status `PENDING_APPROVAL` |
| B-F0-1 | DONE | F0-1 | 2026-11-06 | Addendum AD-01..AD-17 + T-01..T-20 dirumuskan, SQL insert tests 50/50 lulus di PostgreSQL 18.6 lokal, Tier C thin specs lengkap, spec gaps SG-001..SG-005 |
| B-F0-2 | DONE | F0-2 | 2026-11-06 | paypal/endpoints.js kanonik, matriks dukungan sandbox 28/28, webhook catalog, verify-closure V-01..V-06, spikes/* dan cassettes/* |
| B-F0-3 | DONE | F0-3 | 2026-11-06 | Pagar CI: lint-no-float-money, check-traceability (112/112 ID), check-insert-tests (36 CHECK + 3 UNIQUE), check-tests-from-data, ci-guards-negative.test.js terbukti |
| B-F0-4 | DONE | F0-4 | 2026-11-06 | AGENTS.md lengkap, template work-packet, traceability.csv (112 ID), checklist CCC 14 butir, validator ccc-check.js teruji (DoD 14 ✗ pada PAYOUT) |
| B-F0-5 | DONE | F0-5 | 2026-11-06 | Fake PayPal server stateful (Orders, Payments, Payouts, Invoicing, Subscriptions, Disputes), injektor failure-modes, 16/16 contract tests lulus |
| GERBANG-G0 | DONE | G0-REPORT | 2026-11-06 | LULUS PENUH (100% PASSED) disetujui resmi oleh Pemilik Produk; AD-01 s/d AD-37 disetujui, AD-08 Opsi 1 FEE_VARIANCE disetujui |
| WP-F1-1 | DONE | F1-1 | 2026-11-06 | Fondasi Platform: migrasi maju-saja checksum SHA-256 + advisory lock, withTx (retry 40001/40P01), TenantRepository orgId wajib, AppError & errorHandler masking stack/SQL, Logger redaksi pino, routes/health (/healthz & /readyz) |
| B-F6 | DONE | B-F6 | 2026-11-07 | Tier C: FINANCING (po, invoice) & DEBIT (direct) via Partner Simulator (14/14 butir CCC lulus per kategori, zero network call, policy 0 auto-approve) |
| GERBANG-G6 | DONE | G6-VERIFIED | 2026-11-07 | Gerbang G6 LULUS PENUH: FINANCING & DEBIT CCC 14/14, Double-Entry balanced, Clean Adapter Swap Proof 100% identik, 887/887 test suite hijau |
| B-F7 | DONE | B-F7 | 2026-11-07 | Konsolidasi UI & Pengalaman PRD §10: /transactions, /transactions/:id, /transactions/new, 15 kategori rute spesifik, /approvals queue, i18n EN/ID, responsif 1366/1024/390, Playwright E2E & Geometry test |
| GERBANG-G7 | DONE | G7-VERIFIED | 2026-11-07 | Gerbang G7 LULUS PENUH: Geometry parity 46/46 passed, Playwright E2E exit 0, 887/887 test suite hijau, IDOR 5/5 subtests passed, 0 serious a11y issues, SANDBOX/SIMULATED labels terpasang |
| B-F8 | DONE | B-F8 | 2026-11-07 | Hardening & Kehandalan: Chaos 3 titik kritis (0 double mutation, 0 orphan legs), Webhook 4 skenario AD-16, Konkurensi 50 payout paralel (0 overshoot), 1.000 property tests seimbang, Rekonsiliasi harian reconcile_daily, Keamanan Fuzzing/MCP, Key rotation & Benchmark p95 < 300 ms (0.0006 ms) |
| GERBANG-G8 | DONE | G8-VERIFIED | 2026-11-07 | Gerbang G8 LULUS PENUH: Seluruh tes chaos, konkurensi, invarian global, keamanan fuzzing, dan pengeboran operasional lulus 100% |
| B-F9 | DONE | B-F9 | 2026-11-07 | Verifikasi Akhir, Dokumentasi & Rilis: 28/28 pasangan kategori/sub-tipe E2E lifecycle terverifikasi, 10 kriteria PRD §13 terpenuhi, Traceability 100% (135/135 Done, 0 pending), API Reference dibangkitkan dari skema Zod, README 10 bagian lengkap, seluruh 6 SG ditutup |
| GERBANG-G9 | DONE | G9-DOD-VERIFIED | 2026-11-07 | Gerbang G9 = Definition of Done Sistem Penuh LULUS PENUH (100% PASSED). Test suite 919/919 hijau, seluruh pagar CI lulus, 0 vulnerability |
| PRD-1.4-A | DONE | feat(prd-1.4-fase-A) | 2026-11-07 | Fase A (vLEI Integration): org_legal_identity, SAR extension, Ed25519 canonical verify, Decision Engine Stage A ruleA3bVlei, 16/16 test passing, 100% c8 coverage (lines, branches, functions, stmts) |
| PRD-1.4-B | DONE | feat(prd-1.4-fase-B) | 2026-11-08 | Fase B (Intent Layer): intent_mandates, natural language & structured intent hash chain, Ed25519 signature verify, Decision Engine Stage A integration, 16/16 test passing, 100% c8 coverage (lines, branches, functions, stmts) |
| PRD-1.4-C | DONE | feat(prd-1.4-fase-C) | 2026-11-08 | Fase C (PACT Arbitration & Bonding): pact_contracts, escrow_accounts, verifier_registry, T0..T3 multi-tier verification, double-entry balanced escrow settlement & slashing, 18/18 test passing, 1.000 concurrent PACT executions (0 negative escrows), 100% c8 coverage (lines, branches, functions, stmts) |
| PRD-1.4-AD01 | DONE | feat(prd-1.4-ad01) | 2026-11-08 | ADENDUM-01 Organization & Member Management: CRUD profil organisasi, manajemen member, step-up SCA, strict RBAC, 18/18 test passing |
| PRD-1.5 | DONE | feat(prd-1.5) | 2026-11-08 | Open Trust Exchange Protocol: SAR v1.0 canonical format, Public Verify API, Trust Handshake pre-tx, Revocation Feed (cursor/webhook), AP2 conversion, Conformance Runner 10/10 vectors, UI screens |
| PRD-1.6 | DONE | feat(prd-1.6) | 2026-11-08 | Decision Integrity Proof (DIP): Intent Anchor Schema v1.0, Reasoning Trace Schema v1.0, deterministic DIS evaluator (formula 0.15/0.15/0.20/0.10/0.20/0.20), Hard rules (DIP_BRAND_MISMATCH, DIP_ATTRIBUTES_MISMATCH, DIP_EVIDENCE_INVALID), SAR extension, Decision Engine Stage A integration, REST API /api/v1/intents & /agent/v1/transactions & /requests/:id/dip, UI Intent Builder (/intents/new) & DIP Display Card (circular SVG gauge), 73/73 tests passing (20 unit, 6 trace parser, 7 integration, 34 adversarial, 2 concurrency, 1.000 parallel evaluations < 110ms), 100% functions coverage |

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
