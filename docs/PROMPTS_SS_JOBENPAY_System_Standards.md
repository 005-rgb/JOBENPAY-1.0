# JOBENPAY — PROMPTS_SS · Paket prompt agen untuk PRD-SS (Standar Sistem)
**Acuan spesifikasi:** `docs/spec/PRD_SS.md` (selanjutnya "PRD-SS") · basis kode: PRD v1.2 + 1.3 **yang sudah berjalan**.
**Format mengikuti BW/RL:** Prasyarat · Baca · Bangun · Tes · Selesai bila · Jangan · Commit. Satu paket = satu sesi = satu PR/rangkaian commit.
**Bahasa produk:** semua teks pengguna **English**. Dokumen/komentar kode boleh Indonesia. Bahasa Indonesia untuk produk **tidak dikerjakan** sampai ada instruksi (hanya disiapkan lewat infrastruktur locale).
**Mulai hanya di:** cabang `ss` dari cabang kerja terkini, staging + DB terpisah. **Jangan men-deploy ke situs yang sedang dinilai.**
**Pendekatan:** *identifikasi dulu → yang ada dibiarkan → yang kurang disempurnakan di tempat → yang belum ada dibangun lengkap.* SS-00 menentukan lingkup nyata semua paket lain lewat gap matrix.

---

## 0. Cara memakai (hemat kredit)
1. Tempel **Preamble (Bagian 1)** ke `AGENTS.md`/`replit.md` **di bawah** preamble yang sudah ada (BW/RL bila dipakai); aturan di sini menambah.
2. Tiap sesi tempel **PEMBUKA-SS (Bagian 2)** + satu ID paket `SS-xx`.
3. Urutan dan gerbang (PRD-SS §16): `SS-00 [GS0]` · `01→02 [GS1]` · `03→04→05 [GS2]` · `06→07→08 [GS3]` · `09→10 (→11 opsional) [GS4]` · `12 [GS5]`.
4. Paket 🔒 (keamanan, isolasi tenant, data pribadi, uang-berdekatan): model terkuat + sesi **PEMERIKSA-SS** terpisah. Paket 🔒: SS-01, 04, 05, 06, 09, 11.
5. Gerbang lulus dengan **keluaran tes yang ditempel di PR**, bukan klaim.
6. Tiap paket mengirim **vertikal utuh**: skema → logika → job → API (Zod+RBAC+tenant) → UI responsif → i18n EN → konten bantuan/tur modulnya → tes → dokumen. Tidak ada "UI nanti".

---

## 1. PREAMBLE SS (tempel ke AGENTS.md / replit.md)

```md
# Aturan JOBENPAY-SS (standar sistem di atas 1.2/1.3 yang sudah berjalan)

Sumber kebenaran: docs/spec/PRD_SS.md (DS-01…DS-12, S1–S12) > bagian bernomor PRD-SS > PRD 1.3 > PRD 1.2 (perilaku yang SUDAH ADA) > ingatanmu.
KAMU MELENGKAPI sistem yang berjalan. Perilaku Decision Engine, approval, ledger, jurnal, dan kontrak API tidak boleh berubah. Regresi = paket gagal.

## Siklus kerja per paket
1. Baca AGENTS.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/spec-gaps.md, docs/spec/gap-matrix.md, lalu HANYA bagian PRD-SS yang dirujuk paket.
2. Jalankan `npm test` DULU, simpan baseline (harus mencakup golden BW-00 dan golden SS-00). Semua tes lama tetap hijau.
3. Buka baris gap-matrix milik paket. Kerjakan HANYA delta: EXISTS_OK = jangan sentuh; EXISTS_IMPERFECT = perbaiki di tempat (tes karakterisasi dulu);
   MISSING = bangun lengkap. Verifikasi nama berkas/tabel/komponen aktual (ls/grep); JANGAN menebak. Selisih dengan PRD-SS → docs/spec/deviations.md.
4. Tulis rencana singkat (berkas, migrasi, tes, kunci i18n, konten bantuan/tur, risiko), tulis TES GAGAL DULU (dibangkitkan dari data bila ada), implementasi minimal, jalankan SELURUH CI.
5. Perbarui docs/traceability.csv, docs/PROGRESS.md, gap-matrix (status baris), docs/api/system-standards.md. Commit `feat(SS-xx): ...`, push.

## Protokol berhenti (spec-gap)
Berhenti pada bagian terdampak bila: spesifikasi ambigu; dua sumber bertabrakan; perilaku PayPal (mis. dukungan IDR) belum terbukti; nama/skema aktual tak cocok dan
pengganti tidak jelas; butir [VERIFY] terkait belum ditutup. Tulis docs/spec-gaps.md: `SG-nnn — judul | Sumber A | Sumber B | Pertanyaan tepat | Opsi≥2+konsekuensi | Bagian diblokir | OPEN`.
Lapor dan TUNGGU. Dilarang "asumsi sementara".

## Batas keras
- JavaScript ES2023 Node 22, tanpa TypeScript, tanpa dependensi native; dependensi baru hanya dengan ADR + lisensi allowlist (kandidat tunggal yang sudah disetujui: nodemailer, murni JS).
- Hanya PayPal Sandbox. Label SANDBOX permanen. Tidak ada klaim kepatuhan hukum/sertifikasi di UI, bantuan, atau email (grep otomatis).
- SEMUA teks pengguna English lewat kunci i18n (locales/en/*). Dilarang string literal tampak di JSX/server (lint). Bahasa lain tidak ditambahkan.
- Uang = BigInt satuan minor + currency char(3). Parsing/format HANYA lewat shared/format.js dan shared/currencies.js. Dilarang float/parseFloat/toFixed/Number pada jalur uang. Total tidak pernah dijumlahkan lintas mata uang.
- Pengaturan = data di shared/settings-registry.js; konten bantuan/tur/email/legal = data berversi di content/; tes DIBANGKITKAN dari data.
- Tabel org-scoped: org_id NOT NULL + indeks diawali org_id + isolasi/RLS + tes IDOR→404. Tabel user-scoped: hanya pemilik. Repository mewajibkan orgId.
- Ledger bukti/metrik/log tanpa PII (id, enum, angka, hash). IP disimpan kasar; UA hanya famili. Alamat email terenkripsi AES-GCM (+HMAC untuk dedup) seperti identifier payee 1.2.
- Tautan di email hanya dari APP_BASE_URL (bukan header Host). Konten bantuan dirender dari blok data; DILARANG dangerouslySetInnerHTML/HTML mentah/iframe.
- Tur dan bantuan TIDAK bertindak: tidak auto-klik, tidak auto-submit, tidak melewati step-up/approval.
- Tidak ada jalur yang melewati Decision Engine; agen tidak mendapat tool/endpoint baru yang bertindak. Perubahan sensitif butuh step-up + audit (+ ledger bukti bila ditandai).
- Pesan jujur: email belum dikonfigurasi → UI menyatakannya; IDR tidak didukung provider → UI menyatakannya; metrik/data tak tersedia = null/“not available”, bukan 0.
- UI: token CSS saja (tanpa literal warna/ukuran), state wajib (default/hover/fokus/disabled/loading/error/kosong/skeleton), tabel→kartu di sempit, tanpa overflow horizontal di 360/768/1366, axe 0 serius, terang dan gelap.
- Aturan "doc-with-feature": tiap paket menambah konten bantuan (artikel overview + ≥2 how-to + ≥1 troubleshooting bila relevan), entri glosarium, dan definisi tur + atribut data-tour untuk modul yang disentuhnya (berkas data JSON; renderer tiba di SS-07/08, guard ketat sejak SS-07).
- Jangan ubah tes lama kecuali spesifikasi berubah (label test-changed + alasan). Kamu tidak boleh menyetujui merge sendiri. Diff kecil: satu paket, tanpa refactor di luar berkas yang diizinkan.
```

---

## 2. Prompt utilitas

**PEMBUKA-SS**
```text
Baca AGENTS.md, docs/PROGRESS.md, docs/DECISIONS.md, docs/spec-gaps.md, docs/spec/gap-matrix.md. Kerjakan PAKET SS-xx dari docs/PROMPTS_SS.md (hanya bagian paket itu +
bagian PRD-SS yang dirujuk). Jalankan `npm test` dulu dan catat baseline. Buka baris gap-matrix paket ini; kerjakan hanya delta (ada=biarkan, kurang=sempurnakan di tempat,
belum=bangun lengkap). Verifikasi nama aktual; tulis rencana singkat; tes gagal dulu; implementasi minimal; jalankan SELURUH CI. Selesai bila semua "Selesai bila" hijau,
seluruh tes lama + golden tetap hijau, baris gap-matrix paket berstatus DONE dengan bukti. Gagal 3× berturut-turut atau spesifikasi ambigu: berhenti (Protokol Berhenti).
Akhiri: update PROGRESS.md, traceability, gap-matrix, docs/api; commit, push; Laporan Akhir (≤10 baris; berkas; tes baru + hasil; perintah yang benar-benar dijalankan;
kepatuhan butir ✓/✗; spec-gap baru; perubahan pada tes lama; kunci i18n baru; konten bantuan/tur baru; risiko tersisa).
```
**PENUTUP (kuota habis)** — pakai prompt BW (PENUTUP) dengan prefiks `wip(SS-xx)`. **LANJUT** — pakai prompt BW (LANJUT) untuk paket `SS-xx` berstatus WIP. **BLOCKER** — pakai prompt BW (BLOCKER).

**PEMERIKSA-SS (adversarial, sesi bersih, tanpa mengubah kode)**
```text
Audit TANPA mengubah kode: bandingkan SS-xx dengan PRD-SS (bagian dirujuk), gap-matrix, dan perilaku 1.2/1.3. Tabel [butir | Ya/Sebagian/Tidak | file:baris | catatan].
Periksa khusus: (a) regresi perilaku 1.2/1.3 (golden API, teks UI, geometri); (b) fitur EXISTS_OK yang ditulis ulang; (c) string pengguna tertanam / non-English;
(d) enumerasi akun (respons/waktu) pada forgot/reset/invite/login; (e) token tidak terikat email, tidak sekali pakai, tidak di-hash; (f) tautan email dari header Host;
(g) kebocoran lintas tenant/IDOR dan data pengguna lain; (h) PII di ledger bukti, log, metrik, params notifikasi/outbox; (i) pengaturan sensitif tanpa step-up/audit/ledger bukti;
(j) CSV injection, SVG/unggahan berbahaya, XSS pada konten bantuan; (k) tur/bantuan yang bertindak atas nama pengguna; (l) uang: float/toFixed/penjumlahan lintas mata uang;
(m) OWNER ganda/nol, arsip yang masih bisa menulis; (n) migrasi destruktif; (o) klaim kepatuhan/“secure/compliant” berlebihan.
Cobalah MEMATAHKAN: tulis tes serangan yang gagal (jangan perbaiki). Simpan ke docs/audit/SS-xx.md.
```
Lalu sesi terpisah: `Perbaiki hanya butir Tidak/Sebagian di docs/audit/SS-xx.md.`

---

# FASE S0 — Adopsi (GS0)

## SS-00 — Adopsi: audit, gap matrix, inventaris modul, golden UI, pagar CI
- **Prasyarat:** cabang `ss`; staging + DB terpisah.
- **Baca:** PRD-SS §0, §1, §2, §14 (1), §17, §18; PRD v1.2 §4, §7, §9–§13; `docs/PROGRESS.md`.
- **Bangun:**
  1. Salin PRD-SS → `docs/spec/PRD_SS.md`, prompt ini → `docs/PROMPTS_SS.md`. Buat `docs/spec/gap-matrix.md`, `docs/spec/module-inventory.md`, `docs/spec/baseline-ss.md`, `docs/spec/deviations.md`, tambah baris di `docs/traceability.csv` (AC PRD-SS §17, DS-01…12, [VERIFY] §18).
  2. **Audit fakta repo** (`file:baris`, tanpa "tidak tahu"): untuk **setiap kapabilitas PRD-SS §2** → status `EXISTS_OK | EXISTS_IMPERFECT | MISSING` + bukti + cacat konkret + paket pemilik. Wajib dijawab: status Tier B/C 1.2 (registrasi, verifikasi email, reset password, TOTP, undangan, CSV, email outbox, UI Indonesia, hapus org); skema aktual `sessions`, `email_tokens`, `notifications`, `audit_events`, `users`; mekanisme periode anggaran dan zona waktu mandat; sumber mata uang saat ini (kolom/konstanta); apakah resource `id` ada; jumlah string tertanam di JSX/server (hitung); versi Zod/i18next/Radix; ada/tidaknya OpenAPI; daftar rute + komponen shell; mekanisme step-up (`purpose`); penyimpanan unggahan; sifat append-only `audit_events`.
  3. **Inventaris modul** `module-inventory.md`: daftar modul UI nyata (rute, izin, ikon nav) yang menjadi dasar tur/bantuan/`help-coverage` (termasuk kategori 1.3 yang ada).
  4. **Golden UI:** (a) golden **teks tampak** untuk halaman utama (login, dashboard, requests, request detail, approvals, ledger, agents, mandates, payees, documents, settings, audit, developer, simulator) pada peran OWNER/APPROVER/VIEWER; (b) snapshot **geometri/visual** 360/768/1366 untuk halaman yang sama; simpan di `test/characterization-ui/` (dilindungi guard + label `test-changed`).
  5. **Spike [VERIFY]** (hanya baca/uji, tanpa kode produk): dukungan `Intl.NumberFormat` string desimal pada peramban target; `Intl.supportedValuesOf('timeZone')` di Node 22 host; SMTP host cPanel; lisensi `nodemailer` → `docs/spec/verify-closure.md` (satu baris per [VERIFY], bukti, dampak). Dukungan IDR PayPal ditutup di SS-01.
  6. Pagar CI baru (hanya yang belum ada), masing-masing dengan tes negatif: lint `no-literal-string` (mode lapor dulu, jumlah awal dicatat; jadi penegak di SS-02), cek tabel ber-`org_id`/pemilik punya isolasi, cek CHECK/UNIQUE/trigger punya insert valid+invalid, guard folder golden, cek traceability.
- **Tes:** `npm test` = baseline; golden API + UI lulus; pagar hijau pada repo saat ini dan merah pada contoh pelanggaran.
- **Selesai bila (GS0):** gap matrix lengkap tanpa "tidak tahu" dan disetujui manusia (ID + tanggal); module-inventory final; golden terkunci; CI hijau.
- **Jangan:** mengubah kode produk. **Commit:** `docs(SS-00): adopt baseline, gap matrix, module inventory, UI goldens`

---

# FASE S1 — Pengaturan dan i18n (GS1)

## SS-01 — Registri pengaturan, regional, mata uang (USD/IDR), format 🔒
- **Prasyarat:** GS0. **Baca:** PRD-SS §0.2 (DS-02,08,09,10,11), §3.1, §4, §5.1, §9 (referensi/pengaturan), §14 (3–5).
- **Bangun:**
  1. **Spike IDR (`SPIKE-CLOSE`):** uji di Sandbox dukungan IDR untuk Orders/Payouts/Invoicing (dan eksponen yang dipakai); simpan cassette; isi `providerCapability` di `shared/currencies.js`; tulis `verify-closure.md`. Tidak terbukti → `NO`/`UNKNOWN` dengan perilaku jujur (§4.3).
  2. **Data:** `shared/currencies.js` (USD, IDR), `shared/countries.js` (ISO 3166-1 α2 lengkap + region), `shared/locales.js` (`en` active, `id` planned), `shared/settings-registry.js` (§4.1, §4.2), `shared/format.js` (`formatMoney/parseMoney/formatDate/formatDateTime/formatNumber/formatRelative`).
  3. **Migrasi expand-only:** `org_settings`, `org_settings_history` (append-only), `user_preferences`; backfill org lama dengan default `US/UTC/USD`, `enabled=["USD"]`, tanpa mengubah perilaku; seed demo `ID/Asia/Jakarta/USD`.
  4. **Servis pengaturan:** resolusi pengguna→org→default; validasi registri; izin; step-up untuk sensitif; `expected_version` (409); riwayat; audit; ledger bukti hash-only untuk yang ditandai; satu transaksi. Aktivasi/penonaktifan mata uang (`ensureAccounts` bila jurnal ada; guard `CURRENCY_IN_USE` + daftar penghalang).
  5. **Decision Engine (Tahap A, deterministik):** tambah `CURRENCY_NOT_ENABLED` dan `CURRENCY_NOT_SUPPORTED_BY_PROVIDER` setelah cek mata uang 1.2; kode di `shared/error-codes.js` (EN) dengan `helpArticle`; dokumentasi urutan di `docs/policy-order.md`; org yang hanya memakai USD tidak berubah perilaku (golden).
  6. **API:** `GET /reference/*`, `GET /settings/registry`, `GET/PATCH /settings/org`, `POST /settings/org/currencies/{enable,disable}`, `GET /settings/org/history`, `GET/PATCH /me/preferences` (dasar; UI lengkap di SS-03). Matriks izin (data) + tes tabel-driven.
  7. **UI dasar:** halaman `/settings/org` tab **Regional** dan **Currencies** (dibangun dari registri; label dukungan provider; dialog step-up); wizard setup org (negara, zona waktu praisi dari `Intl`, mata uang dasar); footer: dialog "Region & language" (negara org + English saja). Semua teks via i18n EN (kunci baru di `locales/en`).
  8. Konten: artikel + glosarium (Minor units, Currency, Time zone) + data tur "Organization & regional settings".
- **Tes:** registri terbangkit (default valid, batas, izin, sensitif→step-up); versi konflik 409; riwayat append-only (UPDATE/DELETE ditolak); aktivasi USD→IDR→nonaktif (dengan dan tanpa penghalang); Tahap A kedua kode (matriks mata uang × org × capability); org lama identik (golden API); `parseMoney/formatMoney` properti ≥ 10.000 kasus (BigInt eksak, eksponen 0/2/3 untuk uji generik, penolakan input buruk), lint larangan float; total per mata uang di dasbor; IDOR/RBAC; zona waktu invalid ditolak; **perubahan zona waktu tidak mengubah batas periode anggaran mandat yang ada** (tes terhadap mekanisme aktual); ledger bukti tanpa PII.
- **Selesai bila:** hijau + golden API/UI sebelumnya identik; IDR berperilaku sesuai bukti spike dan jujur di UI.
- **Jangan:** FX/konversi; menjumlah lintas mata uang; float; mengubah periode anggaran 1.2. **Commit:** `feat(SS-01): settings registry, regional config, USD/IDR currency registry, format helpers`

## SS-02 — i18n penuh English, format di seluruh aplikasi
- **Prasyarat:** SS-01. **Baca:** PRD-SS §5.2, §4.5, §4.6, §14 (6).
- **Bangun:** ekstraksi **seluruh** string tampak ke `locales/en/<namespace>.json` per modul (UI, `error-codes`, nilai enum tampilan, email stub, konten tersisa); `i18next` (fallback `en`, plural, interpolasi aman, `missingKeyHandler` melempar di tes); aktifkan lint `no-literal-string` sebagai **penegak** (daftar pengecualian terdata + alasan); pseudo-locale `en-XA` (CI, uji overflow/ketertinggalan); semua tampilan angka/uang/tanggal/waktu melalui `shared/format.js` + preferensi (pengguna→org→default); pindahkan resource `id` (bila ada) ke `locales/id` berstatus `inactive` (tidak dimuat/ditampilkan); `docs/i18n-add-locale.md` + tes memakai fixture locale `xx` untuk membuktikan penambahan bahasa tanpa ubah kode (kelengkapan kunci, placeholder, plural).
- **Tes:** **golden teks UI identik** (teks English sama dengan sebelum ekstraksi, kecuali perbaikan typo yang dicatat); lint nol pelanggaran; pseudo-locale tanpa string tak-terkunci dan tanpa overflow 360/768/1366; kunci hilang → tes gagal; `xx` lulus kelengkapan dan dapat dimuat; format dengan preferensi (MDY/DMY/YMD, 12h/24h, zona waktu) terbukti di tabel request/ledger; golden geometri identik.
- **Selesai bila (GS1):** SS-01+02 hijau; 0 string tertanam; golden UI identik; bahasa lain tidak tampil di UI.
- **Jangan:** menambah bahasa Indonesia; mengubah copy tanpa mencatat; menyentuh logika bisnis. **Commit:** `refactor(SS-02): full English i18n extraction with locale registry and formatting`

---

# FASE S2 — Personalisasi, notifikasi, akun (GS2)

## SS-03 — Profil, preferensi, tema, personalisasi shell
- **Prasyarat:** GS1. **Baca:** PRD-SS §4.2, §5.3, §3.1 (saved_views), §9, §11.
- **Bangun:** `/settings/profile` dan `/settings/preferences` (dari registri; pratinjau langsung; "Reset to defaults"); **tema gelap** (set token gelap dengan nama token sama; `prefers-color-scheme` untuk `system`; tanpa literal; tanpa kilatan tema; flag `SS_DARK_THEME`; rute parity tetap terang); kepadatan tabel; page size; halaman awal (dibatasi izin); Quick Access kustom (katalog dibatasi izin, ≤ 8); widget dasbor (urut/sembunyi dari katalog); **tampilan tersimpan** (`saved_views`: kolom + filter + urutan per halaman tabel; default per halaman; berbagi org dengan izin `views.share`); menu avatar (Profile, Preferences, Theme, Language [English saja], Help, Sign out); pemilih organisasi di header bila anggota >1 org (`POST /me/switch-org`); persistensi server-side + salinan klien aman (try/catch).
- **Tes:** tiap preferensi tersimpan lintas sesi/perangkat; nilai ilegal ditolak; `start_page` terlarang oleh izin → ditolak; tema: kontras WCAG AA otomatis, tidak ada literal warna (stylelint), visual regression terang tidak berubah, baseline gelap; saved views (unik, satu default, berbagi hanya berizin, IDOR); widget/Quick Access hanya yang berizin; org switcher memperbarui `current_org_id` dan memutus data org lama; golden geometri terang identik; geometri gelap 360/768/1366; axe.
- **Selesai bila:** hijau; preferensi lengkap terpakai di seluruh aplikasi.
- **Jangan:** menambah pilihan bahasa selain English; mengubah tema parity default. **Commit:** `feat(SS-03): profile, preferences, dark theme, saved views and shell personalization`

## SS-04 — Outbox email dan notifikasi 🔒
- **Prasyarat:** SS-03. **Baca:** PRD-SS §3.5, §4.7, §5.4, §6 (`email_outbox`), §10, §12, §14 (9). ADR: `nodemailer` (bila disetujui).
- **Bangun:** migrasi `notification_preferences`, `notifications` (audit/extend), `email_outbox`, `digest_runs`; `shared/notification-events.js` (katalog §4.7); `notify(event_key, …)` (audiens dari izin, preferensi, `mandatory`, idempoten) dan **panggilan `notify` ditambahkan** pada handler peristiwa 1.2/1.3 (approval, eksekusi, rekonsiliasi, dispute, mandat, agen, kill switch, error koneksi PayPal) **tanpa mengubah logika**; inbox (lonceng + popover + `/notifications`, polling 5–15 dtk saat tab aktif); `/settings/notifications` (matriks event × kanal, mode Instant/Daily, quiet hours, event wajib terkunci + penjelasan); transport `EMAIL_TRANSPORT=smtp|log|off`; job `send_email` (backoff, 5 percobaan, `DEAD`), `build_digest` (jam lokal 08:00, idempoten); templat email English (`content/emails/`, HTML + teks, terversi) dengan tautan dari `APP_BASE_URL`; status jujur `SUPPRESSED(EMAIL_NOT_CONFIGURED)` + banner OWNER/ADMIN; `settings_cleanup` (retensi).
- **Tes:** audiens per izin (tabel-driven dari katalog); `mandatory` tidak dapat dimatikan; quiet hours (kecuali CRITICAL/mandatory); digest idempoten; outbox retry/`DEAD`/`SUPPRESSED`; **host header palsu tidak memengaruhi tautan**; `params` tanpa PII (tes pemindai); alamat terenkripsi (AAD); notifikasi tidak mengubah hasil handler 1.2 (golden); tenant isolation; IDOR; rate limit; e2e inbox; UI 360/768/1366.
- **Selesai bila:** hijau; transport `log` terbukti end-to-end; `smtp` teruji bila kredensial tersedia (jika tidak, ditandai ✗ dan UI tetap jujur).
- **Jangan:** mengirim email berisi rahasia (selain token sekali pakai); mengubah logika approval/eksekusi. **Commit:** `feat(SS-04): email outbox, notification inbox, preferences and digest`

## SS-05 — Akun dan keamanan 🔒
- **Prasyarat:** SS-04 (email). Flag `SS_RESET`. **Baca:** PRD-SS §3.2, §5.5, §6, §8, §14 (7).
- **Bangun (hanya delta sesuai gap-matrix):** migrasi `ALTER sessions/email_tokens`, `recovery_codes`, `login_events`; **forgot/reset password** lengkap sesuai §5.5 (respons generik, kerja hash semu untuk menyamakan waktu, rate limit email-hash 3/jam + IP 10/jam, token 32 byte terhash, TTL `RESET_TOKEN_TTL_MIN`, terikat `email_hash`, cabut token lama, kebijakan password, cabut semua sesi, konsumsi step-up, reset lockout, TOTP tetap, email "password changed" wajib, `login_events` + audit); ubah password; ubah email (verifikasi email baru + notifikasi ke lama); kirim ulang verifikasi; **kode pemulihan** (10, tampil sekali, hash, sekali pakai, regenerasi + step-up); sesi aktif (daftar, cabut satu/semua lain); riwayat login 90 hari; **idle timeout** org di middleware sesi; kebijakan `require_totp_roles` (arah ke setup saat login berikutnya); registrasi/verifikasi bila `MISSING` (hormati `REGISTRATION_ENABLED`; undangan boleh mendaftar saat publik ditutup — selesai di SS-06). UI: `/forgot-password`, `/reset-password`, `/verify-email`, `/settings/security` (password, TOTP, pemulihan, sesi, riwayat).
- **Tes:** **non-enumerasi** (email ada/tak ada → status, badan, dan waktu setara dalam toleransi; 1.000 sampel statistik); token: acak/hash/TTL/sekali pakai/terikat email (email berubah → ditolak)/dicabut oleh yang baru; rate limit ganda; kebijakan password (panjang org, daftar umum, = email); reset mencabut semua sesi + konsumsi step-up + TOTP tetap diminta; login dengan kode pemulihan sekali pakai + notifikasi; regenerasi membatalkan batch lama; cabut sesi benar-benar menolak request berikutnya; idle timeout; kebijakan TOTP org (login berikutnya, tidak memutus sesi berjalan); `login_events` kasar (IP /24, UA famili); IDOR; CSRF; golden login 1.2 identik; UI 360/768/1366 + axe.
- **Selesai bila:** hijau + Pemeriksa-SS tanpa temuan kritis/tinggi; email reset teruji (transport `log` atau `smtp`).
- **Jangan:** mengungkap keberadaan akun; mematikan TOTP saat reset; menyimpan token/kode pemulihan mentah. **Commit:** `feat(SS-05): password reset, account security, recovery codes, sessions and org security policy`
- **Selesai bila (GS2):** SS-03/04/05 hijau; golden tidak berubah; Pemeriksa-SS untuk SS-04 dan SS-05 terlampir.

---

# FASE S3 — Organisasi, bantuan, tur (GS3)

## SS-06 — Organisasi dan akses 🔒
- **Prasyarat:** GS2. **Baca:** PRD-SS §3.3, §5.1 (logo), §5.6, §6, §9, §14 (8).
- **Bangun:** migrasi `ALTER organizations (status…)`, `org_invitations`, `ownership_transfers`, `org_assets`; undangan (email terenkripsi + hash, peran ≤ otoritas pengundang, tanpa OWNER, `invite_domain_allowlist`, kirim ulang/cabut, TTL, penerimaan via `/accept-invite` termasuk pendaftaran bertoken); anggota (ubah peran, hapus; tidak dapat menghapus satu-satunya OWNER; sesi dicabut; approval pending tidak hilang); matriks peran baca-saja (`/settings/members/roles`); **transfer kepemilikan** (dua pihak step-up, TTL 7 hari, OWNER lama → ADMIN, invarian satu OWNER, ledger bukti); **arsip/pulihkan org** (OWNER + step-up; `ARCHIVED` ⇒ semua tulis `423 ORG_ARCHIVED`, agen ditolak, kill switch aktif; pulihkan); logo (PNG/JPEG ≤ 512 KB, magic bytes, dimensi header, di luar web root, rute terautentikasi, `nosniff`, **SVG ditolak**); UI org settings tab **General**, **Security policy** (idle, password min, require TOTP roles, domain allowlist), **Branding**; UI anggota/undangan/transfer/arsip.
- **Tes:** peran undangan (ADMIN tidak dapat OWNER/ubah OWNER); non-enumerasi undangan; satu OWNER di bawah konkurensi (transfer ganda, hapus paralel); arsip: matriks endpoint tulis → 423, agen tidak dapat mengusulkan, baca tetap; logo: tipe palsu/ukuran/SVG/polyglot ditolak; step-up pada semua aksi sensitif; ledger bukti `OWNERSHIP_TRANSFERRED/ORG_ARCHIVED/MEMBER_ROLE_CHANGED` tanpa PII; IDOR; RBAC tabel-driven; golden approval/eksekusi identik; UI + axe.
- **Selesai bila:** hijau + Pemeriksa-SS.
- **Jangan:** menghapus org (hanya arsip); mengizinkan OWNER ganda/nol. **Commit:** `feat(SS-06): invitations, members, ownership transfer, org archive, branding and security policy`

## SS-07 — Pusat bantuan tertulis (modul tersendiri)
- **Prasyarat:** SS-06. **Baca:** PRD-SS §5.7, §14 (3 `help-coverage`, 10), §8; `module-inventory.md`.
- **Bangun:** struktur `content/help/en/<module>/<slug>.json` + skema blok (heading, paragraph, list, steps, callout, code, image[alt wajib], table, link); **renderer React tanpa HTML mentah**; halaman `/help`, `/help/:module`, `/help/:module/:slug`, `/help/glossary`, `/help/releases` (breadcrumb, "On this page", artikel terkait, tanggal pembaruan, "Was this helpful?" → `help_feedback`); **pencarian klien** (indeks saat build: judul>heading>isi; toleransi salah ketik ringan; hasil dibatasi izin); **glosarium ≥ 40 istilah** + komponen `<Term>` (tooltip) dipasang di UI; **laci bantuan kontekstual** (tombol `?` di header, pintasan `?`, `content/help/route-map.json`); **bantuan untuk kode alasan** (`helpArticle` di `error-codes` + "Learn more" di pesan penolakan); catatan rilis `content/releases/*.json` + penanda "What's new"; **formulir Feedback** (tab 1.2 → `feedback_submissions` + notifikasi OWNER/ADMIN + email ke `org.support_email` bila diatur); **tulis konten English lengkap untuk SEMUA modul di module-inventory dan modul SS-01…06** (overview + ≥2 how-to + ≥1 troubleshooting per modul; panduan "Getting started", "Concepts" [mandat/anggaran/keputusan/ledger], "API & MCP" ringkas); `shared/help-coverage.js` + **guard CI**: modul tanpa kelengkapan, tautan internal rusak, gambar tanpa alt, kode alasan tanpa artikel → gagal.
- **Tes:** validasi skema konten; tautan internal/anchor; alt wajib; cakupan modul dari inventaris; kode alasan ↔ artikel; pencarian (peringkat, ambang salah ketik, izin, hasil nol dicatat metrik); XSS (konten berisi `<script>`/URL `javascript:` ditolak oleh skema/renderer); `rel="noopener noreferrer"`; feedback unik per (user, artikel, versi) + IDOR; laci kontekstual memetakan setiap rute di inventaris; UI 360/768/1366 + axe; tidak ada klaim kepatuhan (grep).
- **Selesai bila:** hijau; guard cakupan aktif dan ketat untuk semua paket berikutnya.
- **Jangan:** menyisipkan HTML mentah; menulis konten selain English. **Commit:** `feat(SS-07): written help center with search, glossary, contextual help and coverage guard`

## SS-08 — Tur interaktif, checklist onboarding, empty state
- **Prasyarat:** SS-07. Flag `SS_TOURS`. **Baca:** PRD-SS §3.4, §5.8, §14 (10).
- **Bangun:** migrasi `tutorial_progress`, `onboarding_state`; **mesin tur** (komponen sendiri di atas Radix Popover + overlay sorotan, **tanpa dependensi baru**) membaca `content/tours/en/*.json`; kartu langkah (Back/Next/Skip/Close, "Step n of N"), `Esc`, manajemen fokus + `aria-live`, hormati `reduce_motion`, **bottom sheet di 360 px**, target hilang >3 dtk → lewati dengan pesan, **tidak pernah mengirim formulir/mengklik aksi/melewati step-up**; progress per pengguna (mulai/lanjut/ulang/lewati, versi tur → lencana "Updated"); hub `/tours`; **Welcome tour** otomatis hanya sekali (dapat dimatikan `hints_enabled`); **tur per modul** dari `module-inventory.md` (Welcome · Organization & regional settings · PayPal connection · Agents & API keys · Mandates · Payees & documents · Requests & decisions · Approvals · Ledger & verification · Disputes · Developer & Simulator · Dashboard & notifications · Account & security · Reports & data · Help center + modul 1.3 yang ada); pasang atribut `data-tour` pada elemen target; **checklist "Getting started"** (`/getting-started` + kartu dasbor) dengan butir diturunkan dari **keadaan nyata** (PayPal connected, agent created, mandate active, payee added, first request evaluated, approver invited, TOTP enabled, org settings completed), hanya butir yang berizin untuk peran; **empty state berarah** di semua daftar (ikon, 1 kalimat, aksi utama bila berizin, "Learn more").
- **Tes:** E2E menjalankan **setiap tur pada peran yang ditentukan**: semua `data-tour` ada, tidak ada request mutasi terkirim selama tur (intersepsi jaringan), `Esc`, fokus kembali, bottom sheet 360; **CI gagal bila target hilang** (mencegah tur rusak); versi tur → lencana; progress lintas sesi; checklist diturunkan dari data (tes dengan keadaan org berbeda); empty state ada di semua daftar (tes dari inventaris); axe; geometri 360/768/1366.
- **Selesai bila (GS3):** SS-06/07/08 hijau; setiap modul memiliki artikel + tur + empty state; Pemeriksa-SS untuk SS-06.
- **Jangan:** tur yang bertindak; dependensi tur pihak ketiga; memaksa tur. **Commit:** `feat(SS-08): interactive tours, getting-started checklist and guided empty states`

---

# FASE S4 — Data, audit, sistem (GS4)

## SS-09 — Ekspor/impor, privasi, legal, retensi 🔒
- **Prasyarat:** GS3. **Baca:** PRD-SS §3.2, §3.6, §5.9, §6, §14 (11), §15.
- **Bangun:** migrasi `export_jobs`, `import_runs`, `data_export_requests`, `account_deletion_requests`, `consent_records`; **ekspor** `REQUESTS/DECISIONS/LEDGER/PAYEES/AUDIT/MEMBERS` CSV/JSON (filter = filter tabel; job asinkron, stream; >5.000 baris selalu job; tautan unduh bertanda tangan sekali pakai ≤ 10 mnt, teraudit; `sha256`; proteksi **CSV injection**; jumlah string desimal eksak + kolom `currency`; waktu UTC + zona org; masking PII per izin; ekspor LEDGER dengan hash rantai; ledger bukti `EXPORT_CREATED` untuk data keuangan; kedaluwarsa sesuai `org.exports.retention_days`) + tombol "Export" di tabel; **impor payee CSV** (≤ 2 MB/5.000 baris; pratinjau per baris; dedup HMAC; commit atomik atau skip-errors eksplisit; selalu `PENDING_REVIEW`); **My data & privacy**: ekspor data pribadi (tanpa data keuangan org — dinyatakan jelas), permintaan hapus akun (masa tenang 14 hari, batal, diblokir bila sole OWNER) + **pseudonimisasi** saat eksekusi (`Deleted user`, email → hash tak terpulihkan, hapus TOTP/sesi/preferensi/notifikasi/tur/riwayat; `user_id` tetap di audit/approval/ledger); **legal**: `/legal/terms|privacy|cookies|policy-updates` (konten berversi + tanggal efektif, varian per `region` bila ada, berlabel "Template — review with counsel", pernyataan "not a PayPal product / Sandbox only"), persetujuan versi baru (`consent_records`, modal saat login berikutnya), halaman cookie (hanya cookie esensial); footer terhubung; job `export_build`, `data_export_build`, `account_deletion_run`, `settings_cleanup` (retensi §5.9; tidak menyentuh ledger/audit/jurnal); konten bantuan + tur "Reports & data".
- **Tes:** ekspor (stream, injeksi `= + - @`, jumlah eksak, masking per peran, tautan sekali pakai/kedaluwarsa/IDOR, hash, retensi); impor (pratinjau, atomik, dedup, `PENDING_REVIEW`, batas ukuran, encoding); ekspor data pribadi (tidak memuat data org); hapus akun (blokir sole OWNER, pseudonimisasi, audit/ledger utuh, tidak dapat login setelahnya); consent versi baru memaksa persetujuan; retensi tidak menyentuh ledger/audit; pemindai PII pada keluaran; ledger bukti tanpa PII; UI + axe.
- **Selesai bila:** hijau + Pemeriksa-SS.
- **Jangan:** menghapus ledger/audit/jurnal; menyatakan "GDPR-compliant" atau sejenisnya. **Commit:** `feat(SS-09): exports, imports, privacy requests, legal documents and retention`

## SS-10 — Audit viewer, sistem, pencarian, pintasan, dokumentasi developer
- **Prasyarat:** SS-09. Flag `SS_SEARCH`. **Baca:** PRD-SS §5.10, §3.5 (announcements), §14 (12–13).
- **Bangun:** **penampil audit** `/audit` (filter aktor/tipe/entitas/tanggal, pencarian, detail ter-redaksi, ekspor via SS-09) + `shared/audit-events.js` (katalog) dan **tes bahwa tiap aksi sensitif SS menulis event**; pastikan `audit_events` append-only (trigger + REVOKE bila belum); **`/settings/system`** (versi/build/commit, DB/migrasi/worker, antrean org, pemakaian vs kuota dari penghitung 1.2, status email, feature flag baca-saja, tautan `/healthz`); **pengumuman** (`announcements` + `scripts/announce.js` + banner INFO/WARNING/CRITICAL dapat ditutup + halaman pemeliharaan); **halaman error** 403/404/500/423/offline/maintenance (kode referensi = request id, tautan bantuan); **pencarian global + palet perintah** `Ctrl/⌘+K` (`GET /search`: agen, payee, request by id/hash-prefiks, mandat, artikel bantuan, halaman pengaturan, aksi navigasi; terbatas tenant+izin; ILIKE/prefiks pada kolom ternormalisasi tanpa ekstensi; maks 5/tipe; hanya navigasi); **pintasan keyboard** (`shared/shortcuts.js`, `?`, dapat dimatikan), breadcrumb, dialog konfirmasi destruktif (ketik nama), state konsisten, stylesheet cetak halaman detail; **dokumentasi developer**: `docs/openapi.json` tulis-tangan + **tes dua arah** (setiap rute agen/REST terdokumentasi dan sebaliknya), contoh cURL/Node, daftar tool MCP, panduan webhook PayPal, changelog API, artikel Help "API & MCP"; konten bantuan + tur "Developer & Simulator", "Audit".
- **Tes:** audit (filter, IDOR, redaksi, append-only); katalog event ↔ aksi; sistem (izin, tidak membocorkan rahasia/ENV); pengumuman (jendela waktu, dismiss per pengguna, CRITICAL tidak dapat ditutup permanen); error pages untuk tiap kode; pencarian (izin, tenant, tidak ada hasil lintas org, tidak ada aksi uang dari palet); pintasan tidak aktif saat mengetik di input; OpenAPI dua arah; UI 360/768/1366 + axe.
- **Selesai bila:** hijau.
- **Jangan:** panel super-admin lintas organisasi; membocorkan nilai ENV. **Commit:** `feat(SS-10): audit viewer, system page, announcements, search palette, shortcuts and developer docs`

## SS-11 (opsional) — Delegasi approval + laporan terjadwal 🔒
- **Prasyarat:** SS-09, SS-10; keputusan pemilik; flag `SS_DELEGATION`, `SS_SCHEDULED_REPORTS` (default off). **Baca:** PRD-SS §3.7, §5.11.
- **Bangun:** `approval_delegations` (rentang waktu; penerima APPROVER aktif; tidak melebihi batas approver asal; **four-eyes tetap**: penerima ≠ pengaju request; keputusan mencatat `actor` + `on_behalf_of`; step-up per aktor; ledger bukti delegasi; kedaluwarsa otomatis; UI buat/cabut); `scheduled_reports` (harian/mingguan/bulanan di zona waktu org → email **tautan** unduhan lewat pipeline SS-09; jeda/hapus; job `scheduled_report_run` idempoten).
- **Tes:** delegasi tidak dapat melewati batas/four-eyes/step-up; request diajukan penerima → ditolak; kedaluwarsa; golden approval tanpa delegasi identik; konkurensi; laporan terjadwal idempoten, tautan sekali pakai, IDOR; flag off ⇒ identik.
- **Selesai bila:** semua hijau + Pemeriksa-SS. **Jangan:** melonggarkan aturan approval 1.2; lampiran data keuangan di email.
- **Commit:** `feat(SS-11): approval delegation and scheduled reports (flagged off)`
- **Gerbang GS4:** SS-09, 10 (dan 11 bila diambil) hijau.

---

# FASE S5 — Penutup (GS5)

## SS-12 — Hardening, aksesibilitas, responsif, regresi penuh, dokumentasi
- **Prasyarat:** GS4. **Baca:** PRD-SS §14, §15, §17; checklist SCC (Bagian 4).
- **Lakukan:** regresi penuh (suite 1.2/1.3/BW(/RL bila ada), golden API/teks/geometri) dengan **semua flag SS ON dan OFF**; E2E alur lengkap (org baru → wizard → tur Welcome → PayPal connect → agen → mandat → request → approval; forgot/reset; undang → terima → transfer; ekspor → unduh; hapus akun diblokir sole OWNER; ganti tema; notifikasi preferensi); geometri/overflow 360/768/1366 terang & gelap; axe 0 serius pada semua halaman SS; pemindai rahasia/PII pada respons/log/ledger/ekspor; grep klaim terlarang ("compliant", "certified", "GDPR-compliant", "secure by law", escrow, dll.); verifikasi `help-coverage`, tur E2E, `error-codes` ↔ artikel; `docs/` (PRD-SS final, traceability 100% terisi, runbook admin [email, reset, arsip, transfer, ekspor], panduan tambah-locale, panduan tambah-mata-uang, ringkasan keterbatasan jujur); **tabel klaim→bukti** di README (PRD-SS §15; hanya klaim terbukti); semua [VERIFY] §18 ditutup atau ditandai keputusan manusia.
- **Selesai bila (GS5):** seluruh AC §17 ✓ dengan keluaran tes terlampir; `docs/spec/ss-acceptance.md` memetakan tiap AC → tes/bukti; Pemeriksa-SS penuh tanpa temuan kritis/tinggi; golden identik; traceability 100%.
- **Jangan:** menambah fitur baru; menurunkan ambang demi hijau. **Commit:** `test(SS-12): hardening, accessibility, responsive regression and docs`

---

# 3. Gerbang (ringkas; lulus = keluaran tes terlampir)
| Gerbang | Setelah | Syarat inti |
|---|---|---|
| **GS0** | SS-00 | gap matrix + inventaris modul disetujui; golden API/teks/geometri terkunci; CI hijau |
| **GS1** | SS-01, 02 | registri pengaturan + mata uang + format; 0 string tertanam; golden UI identik; IDR jujur |
| **GS2** | SS-03, 04, 05 | personalisasi + tema; notifikasi/email jujur; akun/keamanan (non-enumerasi); Pemeriksa-SS |
| **GS3** | SS-06, 07, 08 | org/akses; bantuan + tur tiap modul; guard cakupan aktif |
| **GS4** | SS-09, 10 (11) | ekspor/impor/privasi/legal; audit/sistem/pencarian/docs developer |
| **GS5** | SS-12 | seluruh AC §17; regresi penuh flag ON/OFF; SCC ✓ |

# 4. Checklist penyelesaian standar sistem (SCC) — dicek di SS-12
1. Semua tes lama (1.2/1.3/BW(/RL), golden API, teks, geometri) hijau dengan flag SS **ON** dan **OFF**.
2. Gap matrix: semua baris `DONE` dengan bukti; tidak ada fitur `EXISTS_OK` yang ditulis ulang.
3. 0 string pengguna tertanam; semua UI/email/galat/bantuan English; bahasa lain tidak tampil; prosedur tambah-locale terbukti.
4. Pengaturan regional lengkap; USD lengkap; IDR sesuai bukti provider dan jujur; total per mata uang; tidak ada float di jalur uang.
5. Tidak ada enumerasi akun (forgot/reset/invite/login); token terhash, terikat email, sekali pakai; sesi dicabut saat reset.
6. Tautan email hanya dari `APP_BASE_URL`; status email jujur; tidak ada rahasia dalam email selain token sekali pakai.
7. Satu OWNER selalu terjaga; arsip = hanya-baca; transfer berstep-up kedua pihak.
8. Setiap modul punya artikel + tur + empty state; guard cakupan/tur/tautan/alt/kode alasan hijau; tur tidak pernah bertindak.
9. Ekspor aman (CSV injection, masking, tautan sekali pakai); impor atomik dan `PENDING_REVIEW`; hapus akun = pseudonimisasi; ledger/audit/jurnal utuh.
10. Isolasi tenant (IDOR→404) di semua endpoint baru; tabel user-scoped hanya pemilik; tidak ada PII di ledger bukti/metrik/log/params.
11. UI 360/768/1366 terang & gelap tanpa overflow; axe 0 serius; state wajib; tanpa literal desain.
12. README klaim→bukti hanya berisi klaim terbukti; tidak ada klaim kepatuhan hukum.
13. Pemeriksa-SS dijalankan untuk paket 🔒 dan butir Tidak/Sebagian sudah diperbaiki.

# 5. Hubungan dengan paket lain
- **BW (1.3-R):** SS tidak mengubah kategori/jurnal/eksekutor. Bila BW sudah berjalan, SS-01 memakai `ensureAccounts` untuk mata uang baru; bila tidak, bagian itu dilewati (dicatat gap-matrix).
- **RL (keandalan):** bila ada, `notify` SS-04 dipakai untuk alarm RL (mode terdegradasi, hold, kasus ketidakpastian); halaman `/reliability` memakai bantuan/tur SS-07/08 (tambahkan modul ke `module-inventory`). Tidak ada ketergantungan wajib.
- **EVOLUTION/TR:** tidak ada ketergantungan; peran dan izin baru ditambahkan hanya di `shared/permissions.js`.
- **Situs juri:** tidak disentuh; semuanya di cabang `ss` + staging.
