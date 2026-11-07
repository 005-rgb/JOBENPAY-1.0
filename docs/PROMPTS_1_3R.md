# JOBENPAY — PROMPTS_1_3R (Brownfield) · Paket prompt agen untuk PRD 1.3-R
**Acuan spesifikasi:** `docs/spec/PRD_1_3R.md` (selanjutnya "PRD-R") · pelengkap `docs/EVOLUTION.md` · basis kode: PRD v1.2 **yang sudah berjalan**.
**Paket ini menggantikan** "Prompt AI Builder per Fase F0–F9" untuk proyek Anda, karena paket itu mengasumsikan repo kosong (F0-3, F1, F2 membangun ulang auth, org, klien PayPal, agen, job, ledger, uang, payee, AI, mandat, design system yang sudah ada di 1.2). Yang dipertahankan dari paket itu: spec-lock, spike Sandbox + matriks, fake PayPal berbasis cassette + contract test, tes dibangkitkan dari data, `ccc-check`, protokol berhenti.
**Mulai hanya setelah:** kompetisi/penjurian selesai ATAU di cabang `v13` + staging + DB terpisah. **Jangan men-deploy ke situs yang sedang dinilai juri.**

---

## 0. Cara memakai (hemat kredit)
1. Tempel **Preamble (Bagian 1)** ke `AGENTS.md`/`replit.md` sekali (dibaca otomatis).
2. Tiap sesi tempel **PEMBUKA (Bagian 2)** + satu ID paket `BW-xx`. Satu paket = satu sesi = satu PR/rangkaian commit.
3. Urutan dan gerbang wajib (PRD-R §14): `BW-00→01→02 [GB0]` · `03…08 [GB1]` · `09,10,11 [GB2]` · `12,16,17 [GB3]` · `13,14,15 [GB4]` · `18,19 [GB5]` · Tier B `20–22`.
4. Paket bertanda 🔒 (uang, jurnal, kunci, isolasi tenant, eksekusi): model terkuat + sesi **PEMERIKSA** terpisah sesudahnya.
5. Format paket: **Prasyarat · Baca · Bangun · Tes · Selesai bila · Jangan · Commit.**
6. Tidak ada WP yang boleh dilanjutkan bila gerbang sebelumnya belum lulus dengan **keluaran tes**, bukan klaim.

---

## 1. PREAMBLE (tempel ke AGENTS.md / replit.md)

```md
# Aturan JOBENPAY 1.3-R (brownfield di atas PRD v1.2)

Sumber kebenaran: docs/spec/PRD_1_3R.md (PRD-R) > PRD v1.2 (perilaku yang SUDAH ADA) > docs/EVOLUTION.md > ingatanmu.
PRD v1.2 sudah dibangun dan berjalan. KAMU MENAMBAH, tidak membangun ulang. Perilaku PAYOUT/REFUND/ACCEPT_DISPUTE 1.2
tidak boleh berubah. Regresi = paket gagal.

## Siklus kerja per paket (berurutan)
1. Baca AGENTS.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/spec-gaps.md, lalu HANYA bagian PRD-R yang dirujuk paket.
2. Jalankan `npm test` DULU dan simpan jumlah lulus (baseline). Seluruh tes lama harus tetap hijau.
3. Verifikasi struktur repo aktual (ls/grep). JANGAN menebak nama berkas, tabel, kolom, atau fungsi. Bila beda dari PRD-R,
   pakai nama aktual dan catat di docs/spec/deviations.md.
4. Tulis rencana singkat (berkas, migrasi, nama tes, risiko), lalu TULIS TES YANG GAGAL LEBIH DULU (dibangkitkan dari data di shared/).
5. Implementasi minimal sampai hijau. Jalankan SELURUH CI (lint, unit, integrasi, konkurensi, guard, tes-dari-data, uji insert CHECK).
6. Perbarui docs/traceability.csv dan docs/PROGRESS.md. Commit `feat(BW-xx): ...`, push.

## Protokol berhenti (spec-gap)
Berhenti pada bagian terdampak bila: spesifikasi ambigu; dua sumber bertabrakan; perilaku PayPal belum terbukti di cassette;
kolom/endpoint/status/aturan tidak ada di PRD-R/1.2; atau butir [VERIFY] belum ditutup. Tulis docs/spec-gaps.md:
`SG-nnn — judul | Sumber A (berkas+bagian+kutipan<15 kata) | Sumber B | Pertanyaan tepat | Opsi≥2+konsekuensi | Bagian yang diblokir | Status OPEN`.
Lapor dan TUNGGU. Dilarang melanjutkan dengan "asumsi sementara". Keputusan manusia menjadi entri di docs/DECISIONS.md.

## Batas keras
- JavaScript ES2023 Node 22, tanpa TypeScript, tanpa dependensi native; dependensi baru hanya dengan catatan keputusan + lisensi allowlist.
- Hanya PayPal Sandbox (konstanta); hasil simulator selalu provider:"simulated" + label UI SIMULATED; label SANDBOX permanen.
- Uang = BigInt satuan minor + currency char(3) via helper tunggal; dilarang float/parseFloat/Number pada jalur uang (lint menggagalkan).
- Semua query lewat repository yang MEWAJIBKAN orgId; semua tabel baru: org_id NOT NULL + indeks diawali org_id + RLS/isolasi + tes isolasi.
- Mutasi uang (status + reservasi + jurnal + ledger bukti) dalam SATU transaksi (withTx). Ledger bukti (ledger_entries) ≠ jurnal akuntansi (journal_*).
- Tidak ada jalur yang melewati Decision Engine. Agen tidak punya tool/endpoint approve/execute/cancel. AI hanya memperketat; gagal → REQUIRE_APPROVAL.
- Spesifikasi sebagai data di shared/ (state-machines, policy-rules, journal-rules, webhook-routes, provider-status-maps, error-codes); tes DIBANGKITKAN dari data.
- Semua path/event/field PayPal hanya di providers/paypal/endpoints.js (hasil spike). Webhook = sinyal: verifikasi tanda tangan + cocokkan jumlah/mata uang/ref.
- Akun liability:* = catatan buku organisasi, BUKAN dana yang dipegang JOBENPAY. Dilarang nama/teks yang menyiratkan escrow JOBENPAY.
- Rahasia (token, kunci, kata sandi) tidak pernah di log/respons/fixture/cassette. Payload ledger bukti tanpa PII/identifier/teks bebas (id, enum, angka, hash).
- Jangan ubah tes lama kecuali spesifikasi berubah; bila diubah beri label test-changed + alasan tertulis. Kamu tidak boleh menyetujui merge sendiri.
- Diff kecil: satu paket, tanpa refactor di luar berkas yang diizinkan paket.
```

---

## 2. Prompt utilitas

**PEMBUKA**
```text
Baca AGENTS.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/spec-gaps.md. Kerjakan PAKET BW-xx dari docs/PROMPTS_1_3R.md
(hanya bagian paket itu + bagian PRD-R yang dirujuk). Jalankan `npm test` dulu dan catat baseline. Tulis rencana singkat lalu
eksekusi; tes yang gagal ditulis lebih dulu. Selesai bila semua butir "Selesai bila" hijau DAN seluruh tes lama tetap hijau.
Gagal 3× berturut-turut atau spesifikasi ambigu: berhenti (Protokol Berhenti / PROGRESS.md Blockers). Akhiri: update PROGRESS.md
dan traceability, commit, push, lalu tulis Laporan Akhir (ringkasan ≤10 baris; berkas; tes baru + hasil; perintah yang benar-benar
dijalankan; kepatuhan butir paket ✓/✗; spec-gap baru; perubahan pada tes lama; risiko tersisa untuk reviewer).
```
**PENUTUP (kuota habis)**
```text
Jangan mulai hal baru. (1) `npm run lint && npm test`, catat hasil; (2) PROGRESS.md: paket aktif, butir selesai/belum, berkas setengah jadi,
migrasi yang sudah/belum diterapkan, perintah lanjut persis; (3) commit `wip(BW-xx): …` dan push.
```
**LANJUT**
```text
Lanjutkan PAKET BW-xx berstatus WIP. Baca "Resume" di PROGRESS.md + bagian paketnya. Jalankan baseline `npm test` dulu. Kerjakan HANYA sisa butir.
```
**PEMERIKSA (adversarial, sesi bersih, tanpa mengubah kode)**
```text
Audit TANPA mengubah kode: bandingkan implementasi BW-xx dengan PRD-R (bagian yang dirujuk paket) dan PRD v1.2. Tabel
[butir | Ya/Sebagian/Tidak | file:baris | catatan]. Periksa khusus: (a) regresi perilaku 1.2; (b) jalur ke provider tanpa request APPROVED;
(c) kebocoran lintas tenant; (d) jurnal tak seimbang/ter-update; (e) efek ganda saat crash/duplikat/paralel; (f) AI yang melonggarkan keputusan;
(g) PII di payload ledger bukti; (h) rahasia di log/cassette; (i) migrasi destruktif; (j) kategori aktif tanpa flag/mandat.
Cobalah MEMATAHKAN: tulis tes serangan yang gagal (jangan perbaiki). Simpan ke docs/audit/BW-xx.md.
```
Lalu sesi terpisah: `Perbaiki hanya butir Tidak/Sebagian di docs/audit/BW-xx.md.`
**BLOCKER**
```text
Berhenti mengubah kode. Baca Blockers PROGRESS.md. Jelaskan akar masalah ≤10 baris + 2 opsi dengan trade-off. Jangan menerapkan sebelum saya memilih.
```

---

# FASE 0 — Adopsi dan spec-lock (GB0)

## BW-00 — Adopsi 1.2: audit, karakterisasi, baseline, staging
- **Prasyarat:** cabang `v13`; staging + DB terpisah tersedia.
- **Baca:** PRD-R §0, §1, §13; PRD v1.2 §9.4, §9.5, §10; `docs/PROGRESS.md`.
- **Bangun:**
  1. Salin PRD-R → `docs/spec/PRD_1_3R.md`, prompt ini → `docs/PROMPTS_1_3R.md`, `docs/EVOLUTION.md` bila ada. Buat `docs/spec-gaps.md`, `docs/spec/deviations.md`, `docs/traceability.csv` (kolom `id,jenis(FR|AC|DK|VERIFY),deskripsi,wp,tes,status,bukti`; isi dari butir PRD-R §15, DK-01…10, §17).
  2. **Audit fakta repo** → `docs/spec/baseline-1_2.md`, dengan `file:baris`: nama tabel/PK/FK `payment_requests`, `executions`, `webhook_events`, `request_evaluations`, `approvals`, `ledger_entries`, `mandate_versions`; daftar status aktual; daftar kode alasan aktual; skema policy aktual (nama field persis); enum `action`; format `request_hash` (D5); alur sinkron/asinkron evaluasi (D18) dan apakah AI ada di jalur request; bagaimana REFUND/ACCEPT_DISPUTE ditangani saat ini; endpoint/tool MCP aktual; mekanisme idempotensi aktual; penyimpanan rate limit; keberadaan RLS; nama konstanta flag env. Tidak boleh ada "tidak tahu": telusuri sampai pasti.
  3. **Tes karakterisasi (snapshot perilaku)**: untuk PAYOUT (dan REFUND/ACCEPT_DISPUTE bila ada) rekam respons API, urutan transisi, entri ledger, kode alasan pada ≥ 25 skenario (lolos, tiap aturan A1–A13, tiap penanda B, AI gagal, approval, duplikat, crash). Simpan sebagai golden di `test/characterization/`. Folder ini **tidak boleh diubah** oleh paket lain (guard CI + label `test-changed`).
  4. Baseline: `npm test` (jumlah lulus), coverage, durasi, p95 keputusan A/B, `judge-smoke`. Simpan di baseline doc.
  5. Fixture DB: dump skema + data demo teranonimkan → `server/test/fixtures/v12-snapshot.sql` untuk uji migrasi.
  6. Pagar CI baru (hanya yang belum ada): lint larangan float uang; cek traceability; cek tes-dari-data; cek tiap CHECK/UNIQUE/trigger punya insert uji valid+invalid; cek tabel ber-`org_id` punya kebijakan isolasi; guard folder `test/characterization/`. Tiap pagar punya tes negatif (membuktikan ia GAGAL pada pelanggaran).
- **Tes:** `npm test` = baseline; golden lulus; pagar baru hijau di repo saat ini dan merah pada contoh pelanggaran.
- **Selesai bila:** baseline doc lengkap tanpa "tidak tahu"; ≥ 25 golden; fixture dapat dimuat; CI hijau.
- **Jangan:** mengubah kode produk. **Commit:** `docs(BW-00): adopt 1.2 baseline, characterization goldens, CI fences`

## BW-01 — Spike Sandbox + matriks + cassette + Buyer Harness (sebagian manual) 🔒
- **Prasyarat:** BW-00. Kredensial Sandbox (akun bisnis + personal) di env **lokal** (tidak dicommit; kredensial produk tetap diisi lewat UI OWNER seperti 1.2).
- **Baca:** PRD-R §6, §17.
- **Bangun:** `spikes/<primitif>/*.js` (panggilan nyata ke host Sandbox saja) + `spikes/lib/*`; cassette `{scenarioId, step, request{method,path,headersAllowlist,body}, response{status,headersAllowlist,body}, recordedAt, sandboxFlag:true}` dengan redaksi deterministik (Authorization, token, email akun). Skenario wajib: (1) Orders CAPTURE: create→persetujuan pembeli→capture (PENDING/DENIED bila bisa); (2) Orders AUTHORIZE→persetujuan→`/authorize`, simpan `expiration_time`; (3) capture parsial berganda (`final_capture` true/false) + perilaku sisa; (4) re-authorize + honor period nyata; (5) void (belum/sebagian/seluruhnya ter-capture); (6) refund penuh, parsial, berulang, melebihi, mata uang beda, setelah refund penuh, saldo kurang; (7) Invoicing create→send→(bayar via harness | record-payment)→cancel + urutan webhook + apakah `INVOICE.UPDATED` terpicu saat dilihat + daftar status resmi; (8) Payouts tunggal/batch/status item + idempotensi `sender_batch_id` dan `PayPal-Request-Id`; (9) Disputes: yang bisa disimulasikan; `provide-evidence`, `accept-claim`; **path final** (`/v1/customer/disputes/...` vs `/v1/customer-disputes/...`); (10) Webhook: pendaftaran, verifikasi (`verify-webhook-signature` dan `node:crypto`), katalog event nyata (payload disanitasi); (11) Reporting/Balances API di Sandbox (ketersediaan, penundaan); (12) perilaku `PayPal-Request-Id` (retensi, payload berbeda, batas panjang); (13) Buyer Harness Playwright (devDependency): login akun personal Sandbox + setujui approval URL; jalankan 5×, ukur stabilitas; uji `payment_source` kartu uji.
  Keluaran: `docs/spec/sandbox-support-matrix.md` (tabel 28 pasangan kategori/sub-tipe: Didukung YA/SEBAGIAN/TIDAK · bukti cassette · butuh harness · keputusan untuk yang tidak didukung: simulator berlabel ATAU aksi pengganti), `docs/spec/webhook-catalog.md`, `docs/spec/verify-closure.md` (satu baris per `[VERIFY]` §17: pertanyaan · jawaban · bukti · dampak ke PRD-R), `providers/paypal/endpoints.js` (draf).
- **Tes:** cassette dapat diputar ulang; skrip menolak host non-sandbox; tidak ada rahasia di cassette (scan).
- **Selesai bila:** 28 baris matriks terisi; semua `[VERIFY]` ditutup dengan bukti atau ditandai "TIDAK DAPAT DIVERIFIKASI → keputusan manusia"; katalog webhook lengkap.
- **Jangan:** menulis kode aplikasi; menyimpulkan perilaku PayPal tanpa cassette. **Commit:** `test(BW-01): sandbox spike, support matrix, cassettes`

## BW-02 — Penutupan spesifikasi (agen menyusun DRAFT, manusia memutuskan)
- **Prasyarat:** BW-01.
- **Baca:** PRD-R seluruh §0, §17; `docs/spec/verify-closure.md`, matriks Sandbox.
- **Bangun:** `docs/spec/addendum-1_3R.md`: untuk tiap `[VERIFY]` yang jawabannya mengubah PRD-R, tulis konteks → opsi (≥ 2) → konsekuensi → rekomendasi → status `DRAFT-UNTUK-PERSETUJUAN`; **jangan mengubah status menjadi APPROVED** dan **jangan menjawab keputusan DK**. Perbarui PRD-R hanya setelah ada APPROVED (diff terlihat). Tulis juga: (a) tabel `provider-status-maps` (status PayPal → status internal) untuk invoice/capture/authorization/payout item/dispute; (b) daftar final webhook → handler → transisi → aktor; (c) keputusan untuk primitif yang tidak didukung Sandbox; (d) keputusan DK-01…DK-10 yang dibalik pemilik.
- **Tes:** `scripts/check-spec-lock.js` gagal bila ada `[VERIFY]` terbuka di PRD-R yang dirujuk paket berstatus mulai.
- **Selesai bila (GB0):** addendum APPROVED oleh manusia (ID + tanggal); matriks 28/28; tidak ada `[VERIFY]` terbuka untuk BW-03…BW-11; CI hijau. Jika ✗ → jangan lanjut.
- **Jangan:** kode aplikasi. **Commit:** `docs(BW-02): spec lock addendum`

---

# FASE 1 — Mesin umum (GB1)

## BW-03 — Migrasi skema PRD-R §3 🔒
- **Prasyarat:** GB0. **Baca:** PRD-R §3, §13; `baseline-1_2.md`.
- **Bangun:** migrasi **expand-only** (forward-only, di bawah mekanisme migrasi yang ada): `payment_requests` kolom baru + CHECK `pr_category_subtype` + indeks; `provider_authorizations`, `provider_captures`, `dp_accounts`, `invoices`, `chart_of_accounts`, `journal_entries`, `journal_lines` (+ trigger seimbang deferred per mata uang, trigger anti UPDATE/DELETE, `REVOKE UPDATE,DELETE` dari role aplikasi), `payment_plans`, `exposure_locks`, `executions.step` + `UNIQUE(request_id, step)` + `provider_request_id UNIQUE`; kolom `disputes` bila belum; agen/mandat `kind='SYSTEM'` per org (idempoten, backfill). Backfill: baris lama → `category/sub_type/primitive/direction` sesuai PRD-R §3.1 (REFUND/ACCEPT_DISPUTE dipetakan). Isolasi/RLS pada semua tabel baru. Nama kolom PK/FK = **aktual** dari baseline.
- **Tes:** `db/tests/*` insert **valid dan invalid untuk setiap CHECK/UNIQUE/FK/trigger** (PRD-R §12.3 — termasuk jurnal tak seimbang per mata uang ditolak saat COMMIT; line_count mismatch; UPDATE/DELETE baris jurnal ditolak; `captured>authorized`; `refunded>gross`; `gross≠net+fee`; dp+settled>total); migrasi dari `v12-snapshot.sql` idempoten, tanpa kehilangan baris; **seluruh golden karakterisasi dan suite 1.2 tetap hijau**; tes katalog: tabel baru tanpa `org_id`/isolasi → gagal.
- **Selesai bila:** semua di atas hijau; tidak ada DROP/RENAME destruktif.
- **Jangan:** logika kategori; mengubah kolom lama. **Commit:** `feat(BW-03): expand schema for universal transactions`

## BW-04 — Jurnal: bagan akun, posting engine, tautan ledger bukti 🔒
- **Prasyarat:** BW-03. **Baca:** PRD-R §3.4, §7, §10; `services/ledger.js`.
- **Bangun:** `shared/journal-rules.js` (PRD-R §7 sebagai data: `ruleId, primitive/event, debit[], credit[], sumber jumlah, kondisi`); `server/src/domain/journal.js`: `ensureAccounts(orgId,currency)`, `post(tx, request, ruleId, amounts, step)` → membuat `journal_entries` + `journal_lines`, memvalidasi seimbang **di aplikasi dan trigger**, menghitung `lines_hash` (canonicalJson, angka string BigInt, baris terurut), memanggil `appendEntry` (payload `{journal_entry_id, lines_hash, rule_id, request_id}`) dan mengisi `ledger_seq` — semua di transaksi pemanggil; idempoten per `(request, step, rule)`; `reverse(tx, entryId, reason)` untuk koreksi (entri pembalik, bukan UPDATE); `verifyJournal(orgId)` (hash baris vs ledger, keseimbangan, trial balance). Perluas `sar.js`: SAR v1.1 inti (PRD-R §10) + `verifySar`.
- **Tes:** terbangkit: satu tes seimbang per aturan jurnal; properti (≥10.000 kasus, generator sendiri): rangkaian operasi acak tak pernah tak seimbang, trial balance total debit = kredit; posting dua kali untuk langkah sama → tidak ada baris ganda; SAR yang diubah gagal verifikasi; `lines_hash` dimodifikasi → `verifyJournal` mendeteksi; payload ledger bukti ditolak bila memuat kunci terlarang (PII).
- **Selesai bila:** semua hijau; tidak ada penulisan jurnal di luar `journal.js` (grep dalam tes).
- **Jangan:** memposting dari kategori (itu paket kategori). **Commit:** `feat(BW-04): double-entry journal with hash-linked evidence ledger`

## BW-05 — Policy v2, adapter mandat v1, registry aturan 🔒
- **Prasyarat:** BW-03. **Baca:** PRD-R §3.8, §5.1–5.3, §5.4; skema 10.1 aktual.
- **Bangun:** `shared/policy.schema.js` (Zod v1 dan v2 berdampingan; `schemaVersion` ikut canonical + tanda tangan); adapter baca v1→v2 (PRD-R §3.8: `allowedActions` → `allowedCategories`; **tidak menulis ulang** mandat v1; kategori baru default deny); `shared/policy-rules.js` + `registerRule({code, categories, subTypes, stage, evaluate(ctx)→{outcome,details}})`; `shared/error-codes.js` diperluas dengan **seluruh kode PRD-R §5.1/§5.2** (pesan EN+ID); `docs/policy-order.md`; aturan A4b `CATEGORY_NOT_ALLOWED/SUBTYPE_NOT_ALLOWED` + `ENABLED_CATEGORIES`; kerangka aturan per kategori terdaftar tetapi evaluasinya diisi di paket kategori (stub mengembalikan `CATEGORY_NOT_IMPLEMENTED` untuk kategori belum dibangun); aktivasi mandat v2 menulis ledger bukti (sudah ada) dan tetap step-up.
- **Tes:** mandat v1 dibaca benar dan **hanya** PAYOUT (+aksi 1.2) diizinkan; kategori baru → `CATEGORY_NOT_ALLOWED`; tanda tangan diubah → mandat ditolak; versi lama tak dapat dimodifikasi; seluruh golden karakterisasi identik; matriks kategori × kode terbangkit; properti "AI tak pernah melonggarkan" (10.000 kombinasi hasil A/B × keluaran AI).
- **Selesai bila:** hijau; urutan evaluasi terdokumentasi dan A1–A13 identik hasilnya.
- **Commit:** `feat(BW-05): policy schema v2 with v1 adapter and rule registry`

## BW-06 — State machine berbasis data 🔒
- **Prasyarat:** BW-05. **Baca:** PRD-R §4.
- **Bangun:** `shared/state-machines.js` (baris `{scope, category?, from, to, actors[], guard?, effects[]}` untuk `request` (inti 1.2 + `AWAITING_PAYER`, `PROVIDER_PENDING`), `dp_account`, `invoice`, `plan`); `transition(tx, id, to, actor, ctx?, scope='request')` memakai data, mengunci baris `FOR UPDATE`, ilegal → 409 `ILLEGAL_TRANSITION` (details from/to/actor/category); legal → ubah status + ledger bukti + reservasi/pelepasan anggaran dan eksposur — **satu transaksi**; kegagalan ledger membatalkan perubahan. Semua primitif melewati `EVALUATING` (tidak ada `RECEIVED→APPROVED`). Baris untuk kategori belum dibangun tetap terdata (tes `pending-by-design` dihitung CI, bukan di-skip diam-diam).
- **Tes:** terbangkit: per baris 1 tes legal per aktor diizinkan + 1 ilegal; atomik (ledger gagal → status tidak berubah); konkurensi: dua `transition()` paralel → tepat satu menang, satu 409; golden 1.2 identik.
- **Selesai bila:** hijau; tidak ada transisi di kode yang tak ada di data.
- **Commit:** `feat(BW-06): data-driven state machines for request and objects`

## BW-07 — Adapter/eksekutor per langkah + fake PayPal diperluas 🔒
- **Prasyarat:** BW-03, BW-06, GB0. **Baca:** PRD-R §6.1–6.3, §8; kode eksekusi 1.2 (S13); jika EV-01 ada, gunakan antarmuka provider-nya.
- **Bangun:** `providers/ProviderAdapter.js` (kontrak PRD-R §6.1), `PayPalProvider` (membungkus kode PayPal 1.2, **jangan tulis ulang logika payout**), `PartnerSimulatorProvider` (selalu `provider:"simulated"`); `providers/paypal/endpoints.js` final dari BW-01; `executor.js` per `(request, step)` dengan urutan durable §6.3 (STARTED+provider_request_id → panggil → simpan respons ter-redaksi → [objek provider + jurnal + transition + ledger dalam satu tx] → SUCCEEDED); pemulihan crash di tiap titik (panggil ulang dengan `provider_request_id` sama atau `query`; status tak pasti → reservasi ditahan + eskalasi, D37); retry 429/5xx/jaringan maks 5 (backoff+jitter, ID sama) → dead-letter → FAILED + notifikasi; **fake-paypal** diperluas untuk Orders/Payments (authorize/capture/void/refund)/Invoicing/Disputes dari cassette, stateful (capture menambah `captured`, refund mengurangi sisa, void mencegah capture, idempotensi `PayPal-Request-Id`), mode kegagalan terprogram (429+Retry-After, 5xx, timeout, respons ganda, webhook duplikat/terlambat/terbalik/palsu); **contract test** fake vs Sandbox (`CONTRACT_REAL=1`).
- **Tes:** fault injection di 3 titik crash untuk primitif contoh (PAYOUT lewat jalur baru + satu primitif baru); respons ganda; timeout lalu sukses; **200 eksekusi duplikat paralel pada request sama → 1 panggilan efektif**; PAYOUT lewat executor baru menghasilkan golden identik; tes struktural: tidak ada pemanggilan provider di luar `executor.js`.
- **Selesai bila:** hijau; 0 efek ganda; golden PAYOUT identik.
- **Commit:** `feat(BW-07): step-wise durable executor, provider adapters, extended fake paypal`

## BW-08 — Webhook katalog, rekonsiliasi, bukti harian 🔒
- **Prasyarat:** BW-07. **Baca:** PRD-R §6.4–6.5; `docs/spec/webhook-catalog.md`.
- **Bangun:** `shared/webhook-routes.js` (event → primitif/objek → handler → transisi → aktor `webhook`) dari katalog BW-01; handler memverifikasi tanda tangan **sebelum** proses; dedup `paypal_event_id` UNIQUE (duplikat = 200 tanpa efek); urutan terbalik/terlambat idempoten (transisi yang sudah lewat tidak mundur; ilegal dicatat, bukan 5xx tak terbatas); event tak dikenal → `UNHANDLED` + alarm; webhook sebagai **sinyal**: sebelum transisi, cocokkan jumlah/mata uang/ref (GET ke provider bila perlu); `PAYMENT.CAPTURE.PENDING/DENIED/REVERSED` ditangani (`PROVIDER_PENDING`, `FAILED`, jurnal pembalik); job `poll_pending_executions` menutup webhook hilang; job `reconcile_daily` → bandingkan `Σ journal(paypal:balance)` dengan Reporting/Balances API (bila Sandbox mendukung; kalau tidak, dengan `provider_captures/executions`) → alarm `BOOKS_DRIFT`; `/books` data endpoint (trial balance + status).
- **Tes:** webhook duplikat, terbalik, terlambat, palsu (4xx tanpa efek), tak dikenal; polling menutup webhook hilang; jumlah berbeda → MISMATCH + alarm; REVERSED → jurnal pembalik seimbang; tabel webhook-routes terbangkit satu tes per baris.
- **Selesai bila (GB1):** PAYOUT 1.2 berjalan lewat mesin baru **tanpa perubahan kontrak** (golden identik) dan nyata di Sandbox sampai `RECONCILED`; 200 duplikat + crash → 0 double payout; 50 usulan paralel → 0 overshoot; ledger valid, jurnal seimbang; CI penuh + laporan Pemeriksa untuk BW-04, 06, 07 terlampir.
- **Commit:** `feat(BW-08): webhook routing, reconciliation and daily books proof`

---

# FASE 2 — Irisan 1: REFUND, VOID, DISPUTE (GB2)

> Template untuk **setiap kategori** (BW-09…BW-15): lakukan urut — (1) tes gagal dulu dari data; (2) aturan Tahap A/B terdaftar + kode alasan + tes memicu/tidak memicu; (3) baris state machine + tes terbangkit; (4) aturan jurnal + tes seimbang; (5) langkah eksekusi + webhook handler; (6) idempotensi + konkurensi + crash; (7) SAR; (8) API Zod + (MCP tool bila ada) + RBAC + IDOR; (9) fake PayPal skenario + E2E; (10) `ccc-check <KATEGORI>` hijau 14/14 (keberadaan migrasi+insert test, baris data, tes terbangkit, jurnal+properti, adapter+fake+contract, webhook+4 tes, idempotensi, konkurensi, SAR, API+Zod, UI states, ≥2 kasus serangan AI-eval, E2E, dokumen+traceability). Kategori berikutnya tidak boleh mulai sebelum 14/14.

## BW-09 — REFUND (full/partial, kumulatif) 🔒
- **Prasyarat:** GB1. **Baca:** PRD-R §2.3, §3.2 (`provider_captures`), §5.1 (REFUND), §6.2, §7.
- **Bangun:** aturan `CAPTURE_NOT_FOUND`, `REFUND_EXCEEDS_REFUNDABLE`, `REFUND_WINDOW_EXPIRED`, `REFUND_CURRENCY_MISMATCH`, `REFUND_RATE_EXCEEDED` (kerangka; angka eksposur di BW-16), Tahap B `REFUND_NEAR_WINDOW_END`; satu penghitung kumulatif = `provider_captures.refunded_minor` diperbarui hanya di `transition()`→EXECUTED dengan `FOR UPDATE`; `PARTIAL.refund` dinormalisasi ke REFUND `is_partial`; `REFUND.full` setelah refund parsial = sisa; langkah `refund` (`PayPal-Request-Id=jp_{id}_refund`); jurnal `contra:refunds` ← `paypal:balance`; webhook `PAYMENT.CAPTURE.REFUNDED` memverifikasi jumlah; anggaran: mengonsumsi anggaran mandat (A13).
- **Tes khusus:** `test_refund_exceeds_original`, `test_refund_window_expired`, `test_partial_cumulative`, `test_refund_e2e`, `test_duplicate_refund` (100 paralel → 1 refund), refund setelah penuh → ditolak, mata uang beda, golden REFUND 1.2 (jika ada) identik.
- **Commit:** `feat(BW-09): REFUND category`

## BW-10 — VOID 🔒
- **Prasyarat:** BW-09. **Baca:** PRD-R §3.2 (`provider_authorizations`), §5.1 (VOID), §2.3.
- **Bangun:** `VOID.authorization` (langkah `void`; hanya otorisasi belum ter-capture seluruhnya; `VOID_NOT_ALLOWED`, `AUTHORIZATION_NOT_FOUND/EXPIRED`); `VOID.order` = pembatalan **internal** request/invoice yang belum dibayar (definisikan "belum dibayar" per status; **tidak ada panggilan void ke PayPal**); tanpa jurnal tetapi entri ledger bukti; pelepasan eksposur openAuthorization; webhook `PAYMENT.AUTHORIZATION.VOIDED`.
- **Tes khusus:** `test_void_uncaptured`, `test_void_captured` (REJECT), void sebagian-ter-capture → sisa saja, void ganda idempoten.
- **Commit:** `feat(BW-10): VOID category`

## BW-11 — DISPUTE respons (agen SYSTEM) 🔒
- **Prasyarat:** BW-10. **Baca:** PRD-R §3.6, §4.6, §5.1 (DISPUTE), §6.2, §7.
- **Bangun:** webhook `CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED` membuat/ memperbarui `disputes` dan (opsional sesuai addendum) request `DISPUTE_RESPOND` oleh **agen SYSTEM** (`origin=WEBHOOK`, idempotency `wh:{event_id}`); respons `accept_claim` / `provide_evidence` = request ter-gerbang dengan Tahap B `DISPUTE_RESPONSE_REQUIRES_HUMAN` (selalu approval manusia); paket bukti disusun dari ledger/dokumen/transaksi (ringkasan, tanpa PII berlebih; AI hanya menyusun draf — tidak mengirim); aturan `DISPUTE_NOT_OPEN/WINDOW_EXPIRED/AMOUNT_MISMATCH`; jurnal sesuai hasil (LOST/PARTIALLY_WON → `expense:chargebacks`; WON tanpa jurnal, hanya ledger bukti); path dispute **dari hasil spike**.
- **Tes khusus:** tanpa approval tidak ada panggilan ke PayPal; dispute dibuat sistem tidak menyalahi `agent_id/mandate NOT NULL`; webhook duplikat tidak membuat request ganda; tenggat lewat → REJECT.
- **Selesai bila (GB2):** REFUND, VOID, DISPUTE 14/14 CCC; golden 1.2 identik; Pemeriksa BW-09…11 tanpa temuan kritis.
- **Commit:** `feat(BW-11): DISPUTE response category with system agent`

---

# FASE 3 — Rencana, eksposur, API (GB3)

## BW-12 — Persetujuan terikat rencana 🔒
- **Prasyarat:** GB2. **Baca:** PRD-R §3.5, §5.6, §8.
- **Bangun:** `payment_plans` service (`createPlan`, `canonicalizePlan`, `plan_hash`, `approvePlan`, expiry); request v2 `request_hash` memuat `planHash`; `transition()` + keputusan: langkah n `AUTO_APPROVE` hanya bila kondisi PRD-R §5.6(3) **semua** terpenuhi, jika tidak `REQUIRE_APPROVAL` + `PLAN_STEP_MISMATCH/PLAN_NOT_APPROVED/PLAN_EXPIRED`; UI dialog approval menampilkan seluruh langkah; plan tak pernah melonggarkan Tahap A; ubah rencana → hash baru → approval lama batal; ledger bukti untuk tiap peristiwa rencana.
- **Tes:** langkah menyimpang jumlah/tanggal/counterparty → REQUIRE_APPROVAL; plan kedaluwarsa; `PAYEE_CHANGED` di tengah rencana → approval; approval dengan hash usang ditolak; properti: tidak ada kombinasi plan × hasil A/B/AI yang menurunkan keparahan.
- **Commit:** `feat(BW-12): plan-bound approvals`

## BW-16 — Eksposur dan refund-rate 🔒
- **Prasyarat:** BW-12. **Baca:** PRD-R §5.5.
- **Bangun:** `exposure.js` (open authorization, open receivable, refund-rate 30 hari; BigInt/floor), `exposure_locks` `SELECT … FOR UPDATE` per org+mata uang di transaksi pembuatan request; aturan `EXPOSURE_AUTH_EXCEEDED`, `EXPOSURE_RECEIVABLE_EXCEEDED`, `REFUND_RATE_EXCEEDED` (aktifkan di BW-09); endpoint ringkasan eksposur untuk dashboard.
- **Tes:** 50 AUTHORIZE paralel → batas tak terlampaui; refund-rate pembagi nol aman; pelepasan saat VOID/EXPIRED/capture penuh.
- **Commit:** `feat(BW-16): exposure budgets and refund-rate guard`

## BW-17 — API terpadu, MCP, SAR final, endpoint konsol 🔒
- **Prasyarat:** BW-12, BW-16. **Baca:** PRD-R §8, §9, §10.
- **Bangun:** `POST /agent/v1/transactions` (Bearer saja; Zod per kategori; `Idempotency-Key` wajib; replay 200 identik byte-per-byte; badan beda → 422 `IDEMPOTENCY_KEY_REUSED`; kategori belum dibangun → 422 `CATEGORY_NOT_IMPLEMENTED`; respons §9.2); pembungkus tipis `/agent/v1/{refunds,voids,down-payments,invoices,sales}`; tool MCP `propose_refund/void/down_payment/invoice/sale` (+ alias baca) — tes struktural daftar tool (tak ada approve/execute/cancel/credential); endpoint konsol §9.4 dengan RBAC (perluas matriks 13.3 sebagai data + tes tabel-driven), step-up, ledger; OpenAPI/dokumentasi endpoint baru; SAR v1.1 final (paspor transaksi untuk saga).
- **Tes:** replay identik; 200 paralel kunci sama → 1 request; IDOR semua endpoint baru → 404; agen tanpa `allowedCategories` → `CATEGORY_NOT_ALLOWED`; tidak ada endpoint dengan dua jenis auth; suite 1.2 + golden identik.
- **Selesai bila (GB3):** plan + eksposur + API hijau; Pemeriksa BW-12, 16, 17 tanpa temuan kritis.
- **Commit:** `feat(BW-17): unified agent API, MCP tools, console endpoints, SAR`

---

# FASE 4 — Irisan 3: uang masuk (GB4)

## BW-13 — DOWN_PAYMENT (saga) 🔒
- **Prasyarat:** GB3. **Baca:** PRD-R §3.2–3.3, §4.3, §5.1 (DP), §5.6, §6.2, §7.
- **Bangun:** pola DP: plan (initial → settlement/forfeit/refund) + `dp_accounts`; `initial` = ORDER(AUTHORIZE) → `AWAITING_PAYER` → `authorize` → CAPTURE(dp) dengan `final_capture` eksplisit [dari spike]; simpan `expiration_time`/`honor_until` ke `provider_authorizations`; `confirm-delivery` oleh manusia dengan bukti (dokumen/atestasi tercatat; agen hanya mengusulkan); `settlement` = CAPTURE(sisa) (`SETTLEMENT_EXCEEDS_REMAINING`); `forfeit` = VOID(sisa) + reklasifikasi jurnal; `REFUNDED` = REFUND(dp)+VOID(sisa); jobs `expire_authorizations` dan `reauthorize_if_needed` (AUTHORIZE ulang melewati gerbang lagi); jurnal DP (PRD-R §7) termasuk pengakuan saat SETTLED; `dp_settled_exact` ditegakkan DB dan `transition()`.
- **Tes khusus:** `test_dp_initial_partial`, `test_dp_settlement`, `test_dp_forfeit`, `test_dp_e2e` (initial→confirm→settle; initial→forfeit; initial→refund), `test_dp_settlement_race` (2 paralel → 1), otorisasi kedaluwarsa → `EXPIRED` + eksposur dilepas, settlement di luar rencana → REQUIRE_APPROVAL.
- **Commit:** `feat(BW-13): DOWN_PAYMENT category`

## BW-14 — INVOICE (piutang) 🔒
- **Prasyarat:** BW-13. **Baca:** PRD-R §3.3, §4.4, §5.1 (INVOICE), §6.2, §7; `provider-status-maps`.
- **Bangun:** `INVOICE_ISSUE` → `INVOICE_SEND` (dua request ter-gerbang atau satu pola dengan plan) ; `INVOICE_RECORD_PAYMENT` (hanya untuk pembayaran di luar PayPal; **bukan** membayar atas nama pembeli); status internal dipetakan dari `provider_status` (bukan tebakan); `OVERDUE` diturunkan lewat kueri; `INVOICING.INVOICE.PAID/CANCELLED` via webhook + pencocokan jumlah; `WRITTEN_OFF` hanya manusia + approval; aturan `INVOICE_NUMBER_DUPLICATE`, `DUE_DATE_OUT_OF_RANGE`, `EXPOSURE_RECEIVABLE_EXCEEDED`; jurnal basis kas saat pembayaran dikonfirmasi; **membayar invoice vendor tetap PAYOUT + dokumen** (tidak ada primitif baru) — tambahkan tes dan teks UI yang membedakan.
- **Tes khusus:** `test_invoice_e2e` (issue→send→webhook paid; issue→send→record-payment), pembayaran parsial berulang → kumulatif ≤ amount, cancel, nomor duplikat, webhook urutan terbalik.
- **Commit:** `feat(BW-14): INVOICE receivable category`

## BW-15 — SALE (menunggu pembeli) 🔒
- **Prasyarat:** BW-14. **Baca:** PRD-R §4.1 (`AWAITING_PAYER`), §5.1 (SALE), §6.2, §7.
- **Bangun:** pola SALE: ORDER_CREATE (CAPTURE intent) → `AWAITING_PAYER` (menyimpan approve URL; dikembalikan ke agen/manusia, **JOBENPAY tidak menyetujui atas nama pembeli**) → webhook `CHECKOUT.ORDER.APPROVED` → CAPTURE → `EXECUTED`; `payer_deadline` + job → `EXPIRED` melepas eksposur; Tahap B counterparty baru; capture `PENDING/DENIED/REVERSED` ditangani; fee/net tercatat; jurnal SALE.
- **Tes khusus:** `test_sale_balanced`, `test_sale_e2e` (fake + Buyer Harness dev-only; satu rekaman nyata manual), pembeli tak pernah menyetujui → EXPIRED, capture tanpa persetujuan ditolak oleh fake (meniru PayPal), duplikat webhook.
- **Selesai bila (GB4):** DOWN_PAYMENT, INVOICE, SALE 14/14 CCC; seluruh E2E hijau; golden 1.2 identik.
- **Commit:** `feat(BW-15): SALE category with awaiting-payer state`

---

# FASE 5 — UI dan hardening (GB5)

## BW-18 — UI PRD-R §11
- **Prasyarat:** GB4. **Baca:** PRD-R §11; token/komponen 1.2 (§12 PRD 1.2).
- **Bangun:** `/transactions`, `/transactions/:id` (timeline, kartu aksi, **tabel jurnal**, tautan SAR, rantai induk-anak), `/transactions/new` (form dinamis; field dari skema Zod per kategori), `/down-payments`, `/invoices`, `/plans/:id`, `/disputes`, `/books`; dialog aksi uang menampilkan ringkasan persis yang diikat hash; label SANDBOX/SIMULATED; state wajib (default/hover/fokus/disabled/loading/error/kosong/skeleton); tabel→kartu di layar sempit; tanpa literal desain (stylelint); i18n EN (+ID bila sudah ada).
- **Tes:** E2E UI alur penuh per kategori (fake PayPal); geometri/overflow 360/768/1366; axe 0 pelanggaran serius; tidak ada string yang menyiratkan escrow (grep otomatis).
- **Commit:** `feat(BW-18): universal transaction UI`

## BW-19 — Hardening, chaos, regresi penuh, rilis staging 🔒
- **Prasyarat:** BW-18. **Baca:** PRD-R §12, §13, §15.
- **Bangun/lakukan:** suite keamanan (IDOR semua endpoint baru, CSRF, mandat v1 tak bisa kategori baru, MCP tanpa tool terlarang, rahasia tak di log/cassette); chaos: matikan DB/AI/provider/worker saat beban → tidak ada AUTO_APPROVE/efek ganda; 200 duplikat + crash per primitif; verifikasi `verifyChain` + `verifyJournal` + `verifySar` setelah seluruh suite; ccc-check semua kategori; coverage ≥ 90% modul keputusan/jurnal/eksekusi (c8); `docs/` (PRD-R final, traceability 100% terisi, runbook, ringkasan keterbatasan Sandbox jujur); tabel klaim→bukti di README; rilis ke **staging**; satu rekaman nyata Sandbox per kategori (M-REAL, manual).
- **Selesai bila (GB5):** seluruh §15 PRD-R hijau; Pemeriksa penuh tanpa temuan kritis/tinggi; golden 1.2 identik; traceability 100%. Rilis produksi (jika ada) = keputusan manusia terpisah setelah penjurian.
- **Commit:** `test(BW-19): hardening, chaos, full regression, staging release`

---

# TIER B (hanya bila GB5 lulus dan ada ruang)

## BW-20 — SCHEDULED + BULK + TRANSFER (sebagai PAYOUT)
- **Baca:** PRD-R §2.3, §5.7. **Bangun:** `execute_at` pada primitif dasar; **dua evaluasi** (submit mereservasi anggaran; fire mengecek ulang mandat aktif, `ORG_FROZEN`, status payee, kedaluwarsa rencana → REJECT bila gagal); job `run_scheduled`; BULK induk + anak PAYOUT (status induk dihitung dari anak: COMPLETED/PARTIALLY_COMPLETED; batas 15.000 dari spike → `BULK_TOO_LARGE`; streaming payload; persetujuan per batch dengan plan_hash, anggaran per item); TRANSFER = PAYOUT dengan `counterparty.kind='MEMBER'` (tanpa primitif baru).
- **Tes:** mandat dicabut sebelum jadwal → REJECT saat fire; 15.000 lolos/15.001 ditolak; item gagal melepas reservasi item itu saja; golden PAYOUT identik. **Commit:** `feat(BW-20): scheduled, bulk and transfer as payout patterns`

## BW-21 — SPLIT
- **Baca:** PRD-R §2.3, §7 (Tier B). **Bangun:** `split_rules` per org per aturan (kolom `max_platform_fee_bps` eksplisit; bukan satu aturan per org), pola collect (CAPTURE) → split → hold → payout; **fee = floor(total × bps / 10000), payee = total − fee** (jumlah selalu persis total; untuk multi-penerima alokasi sisa dengan largest-remainder deterministik); `hold_period_hours=0` tetap lewat job (tidak melompat gerbang); akun `liability:payee_payable`, `revenue:platform_fees`; rilis hold oleh aktor yang ditentukan addendum; label jelas bahwa tidak ada escrow JOBENPAY.
- **Tes:** `test_split_fee_calculation`, properti ≥ 10.000 kasus (selalu menjumlah persis), `PLATFORM_FEE_EXCEEDED`, payout parsial gagal tidak menghilangkan sisa. **Commit:** `feat(BW-21): SPLIT pattern`

## BW-22 — RECURRING (jadwal internal)
- **Baca:** PRD-R §0.2 DK-07, §5.7. **Bangun:** `recurring_schedules` (`org_id`, `counterparty_id`, `amount_minor`, `currency`, `frequency`, `interval_count`, `next_run_at`, `remaining_cycles`, `status`); job membuat satu request ter-gerbang per siklus (`origin=PLAN`, idempotency `plan:{id}:{cycle}`), evaluasi ulang tiap siklus (perubahan harga, anggaran, payee berubah → approval); fungsi siklus-per-bulan eksak untuk DAILY/WEEKLY/MONTHLY/YEARLY × interval (integer, pembulatan ke atas) + tes; `cancel` = request ter-gerbang; mode PayPal Subscriptions hanya "deteksi lalu batalkan" (label jelas) bila dipilih.
- **Tes:** `test_recurring_limit`, kegagalan satu siklus tidak menghentikan jadwal tanpa kebijakan, siklus ganda tidak mungkin (dedupe), mandat dicabut → siklus berikutnya REJECT. **Commit:** `feat(BW-22): internal recurring schedules`

---

## Lampiran A — Template baris PROGRESS.md
```md
| Paket | Status (TODO/WIP/DONE) | Commit | Jam aktual vs rencana | Baseline tes | Catatan |
| BW-00 … BW-22 |
Gerbang terakhir lulus: (GB0…GB5)
```
## Lampiran B — Daftar paket 🔒 (wajib Pemeriksa + model terkuat)
BW-01, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 19.
## Lampiran C — Hubungan dengan EVOLUTION.md
BW-03 memakai pola isolasi/RLS dari EV-04 bila sudah ada (jika belum, pasang kebijakan isolasi hanya pada tabel baru). BW-07 memakai antarmuka provider EV-01 bila ada. BW-04 mematuhi aturan "tanpa PII di payload ledger" (EV-08/ADR-E10). Dua rencana tidak saling memblokir; urutan yang disarankan: EV-00, EV-01, EV-04, EV-07, EV-08 → BW-00…BW-19 → sisa EVOLUTION.
