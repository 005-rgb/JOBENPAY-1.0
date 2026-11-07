# JOBENPAY — PRD-SS · Standar Sistem (Pengaturan Global, Personalisasi, Tutorial, Pusat Bantuan, Notifikasi, Akun, Data)
**Versi:** 1.0 · **Basis:** PRD v1.2 (+ 1.3) **yang sudah dibangun** · **Bahasa dokumen:** Indonesia · **Bahasa produk (UI/email/bantuan):** **English penuh**.
**Sifat:** brownfield. Sistem **mengidentifikasi dulu** (SS-00): yang sudah ada **dibiarkan**, yang kurang **disempurnakan di tempat**, yang belum ada **dibangun lengkap**. Tidak ada perubahan perilaku Decision Engine, approval, ledger, jurnal, atau kontrak API 1.2/1.3.

---

## 0. Posisi, keputusan, prioritas

### 0.1 Prioritas bila konflik
`DS di §0.2` > bagian bernomor dokumen ini > PRD 1.3 (perilaku yang SUDAH ADA) > PRD 1.2 > ingatan agen. Perilaku 1.2/1.3 yang sudah berjalan tidak berubah; golden karakterisasi (BW-00) dan golden UI (SS-00) adalah hakim.

### 0.2 Konfirmasi jawaban pemilik → Keputusan (DS)
| ID | Jawaban pemilik | Keputusan teknis | Catatan jujur |
|---|---|---|---|
| DS-01 | Default semua **English**; Indonesia dikembangkan **setelah ada instruksi** | Satu-satunya locale aktif `en`. Infrastruktur i18n lengkap (kunci, plural, `Intl`, locale registry); menambah bahasa = tambah folder + daftar + lulus tes kelengkapan, **tanpa mengubah kode** | Sumber daya `id` yang mungkin sudah ada di 1.2 dipindah ke `locales/id/` berstatus `inactive` (tidak dimuat, tidak ditampilkan) |
| DS-02 | Mata uang **USD dan IDR**, dapat bertambah sesuai fitur PayPal | `shared/currencies.js` (registri data: kode ISO 4217, eksponen, simbol, `providerCapability`). Org mengaktifkan subset; **default org = {USD}**; USD sempurna; IDR dapat diaktifkan OWNER | **IDR belum tentu didukung PayPal untuk transaksi `[VERIFY]` (SS-01 spike).** Jika tidak: IDR tetap sah untuk **tampilan, anggaran, dan pembukuan**, tetapi eksekusi uang IDR ditolak `CURRENCY_NOT_SUPPORTED_BY_PROVIDER`. Tidak ada FX/konversi (tetap di luar cakupan 1.2); total tidak pernah dijumlahkan lintas mata uang |
| DS-03 | **Reset password belum ada** → bangun lengkap | Alur forgot/reset penuh (§5.5) + ubah password/email, kode pemulihan, sesi aktif | Tabel `email_tokens` kind `RESET` kemungkinan sudah di skema; kodenya diaudit SS-00 |
| DS-04 | Semua dibangun; identifikasi dulu; ada → biarkan; kurang → sempurnakan; belum → bangun | SS-00 menghasilkan **gap matrix** (`EXISTS_OK / EXISTS_IMPERFECT / MISSING`) per kapabilitas; tiap paket hanya mengerjakan delta barisnya | Dilarang menulis ulang fitur `EXISTS_OK` |
| DS-05 | Sesuai regulasi pada umumnya | Kapabilitas privasi dan transparansi **umum**: consent versi, ekspor data pribadi, permintaan hapus (pseudonimisasi), halaman legal berversi, retensi, pencatatan audit, aksesibilitas WCAG AA, pengungkapan cookie esensial | **Bukan klaim kepatuhan hukum.** Teks legal adalah templat yang wajib ditinjau pemilik/penasihat hukum; sistem hanya Sandbox |
| DS-06 | Tutorial = **tur interaktif + bantuan tertulis sebagai modul tersendiri** (seperti Google Cloud) | Modul Help Center (`/help`) berisi artikel tertulis (konten sebagai data) + modul Tours (tur terpandu per modul) + checklist "Getting started" + bantuan kontekstual | Tur **tidak pernah mengeksekusi aksi** untuk pengguna |
| DS-07 | Urutan S1–S4 disetujui | S1 pengaturan+i18n+preferensi; S2 akun/keamanan+notifikasi+org; S3 help+tur; S4 data/audit/sistem/pencarian; opsional S4+ | Lihat §16 |
| DS-08 | — (turunan) | **Base currency = default saja** (bukan kunci): menentukan default form/dasbor. Menonaktifkan mata uang diblokir bila dipakai mandat aktif/request terbuka/reservasi (`CURRENCY_IN_USE`) | Menyederhanakan rancangan awal "kunci setelah transaksi pertama" |
| DS-09 | — | **Zona waktu organisasi hanya memengaruhi tampilan, batas hari laporan/ekspor, dan default zona waktu mandat baru.** Batas periode anggaran mandat yang ada **tidak berubah** (tetap mengikuti mekanisme 1.2; SS-00 mencatatnya) | Hindari menggeser pembukuan |
| DS-10 | — | Semua timestamp disimpan UTC; konversi hanya di lapisan tampilan/ekspor | — |
| DS-11 | — | Pengaturan sensitif (mata uang aktif, kebijakan keamanan, transfer kepemilikan, arsip org, kode pemulihan, hapus akun) memakai **step-up**, tercatat di audit; yang bersifat organisasi juga di ledger bukti (hash/enum saja, tanpa PII) | — |
| DS-12 | — | Tidak ada dependensi native; dependensi baru hanya dengan ADR + lisensi allowlist (kandidat: `nodemailer`, murni JS). Tidak ada Redis/WebSocket (cPanel): polling | — |

### 0.3 Non-goal
SSO/SAML; billing produk; aplikasi mobile; FX; bahasa selain Inggris (siklus ini); editor tema bebas; PDF generator; multi-region data residency; panel super-admin lintas organisasi; klaim kepatuhan hukum.

---

## 1. Aturan Emas (S1–S12)
1. **Adopsi dulu.** Tidak ada paket yang membangun sebelum baseline SS-00 dan baris gap-nya jelas. Nama tabel/rute/komponen = **aktual**, bukan tebakan.
2. **Perbaiki di tempat.** `EXISTS_IMPERFECT` diperbaiki lewat perubahan kecil dengan tes karakterisasi lebih dulu; bukan ditulis ulang.
3. **Pengaturan adalah data.** Semua pengaturan terdaftar di `shared/settings-registry.js` (kunci, tipe, cakupan, default, validasi Zod, izin, sensitif, efek). UI formulir dan validasi server dibangkitkan dari registri yang sama.
4. **Hierarki:** default platform (data/ENV) → organisasi → pengguna. Nilai tidak valid ditolak di server (Zod), bukan hanya klien.
5. **Tidak ada string pengguna yang ditulis langsung** di JSX/server (lint `no-literal-string`); semua lewat kunci i18n; format angka/mata uang/tanggal hanya lewat `shared/format.js`.
6. **Uang tetap BigInt satuan minor.** Parsing input mata uang berbasis string + eksponen ISO 4217; dilarang float/`toFixed` di jalur uang (lint 1.2/BW tetap).
7. **Tidak ada klaim berlebihan:** tidak ada kata "compliant/certified/secure by law" di UI/bantuan; tingkat yang jujur (mis. email "delivery not configured").
8. **Tur dan bantuan tidak bertindak.** Tidak ada auto-klik/auto-submit; tidak ada tur yang melewati step-up atau approval.
9. **Isolasi:** tabel org-scoped `org_id` + RLS/repository ber-`orgId` + tes IDOR→404; tabel user-scoped hanya dapat diakses pemiliknya; tidak ada agregat lintas organisasi.
10. **Privasi:** payload ledger bukti/metrik/log tanpa PII (id, enum, angka, hash); IP disimpan kasar (/24 atau /48) dan UA hanya famili; retensi terkonfigurasi + job pembersih.
11. **Konten sebagai data** (artikel, tur, istilah, templat email, legal): berkas terversi di repo, diuji (struktur, tautan, cakupan), dirender oleh komponen — **bukan HTML mentah**.
12. **Satu sumber URL:** tautan di email dibangun dari `APP_BASE_URL` (ENV), tidak pernah dari header `Host`.

---

## 2. Inventaris dan strategi adopsi (SS-00)
SS-00 menghasilkan `docs/spec/baseline-ss.md` dan `docs/spec/gap-matrix.md` dengan `file:baris`. Kapabilitas minimal yang **wajib** diaudit (status + bukti):

| Kelompok | Kapabilitas yang diaudit |
|---|---|
| Akun | registrasi, verifikasi email, login/lockout, reset password, TOTP, step-up, sesi (tabel `sessions` kolom aktual), ganti password/email, kode pemulihan |
| Organisasi | anggota, undangan, peran/izin (matriks `shared/permissions`), multi-org, arsip/hapus, pemilih org, kill switch |
| Pengaturan | `/settings/org|members|paypal|security`, `users.locale`, zona waktu (di mandat), mata uang (di mandat/anggaran), footer pemilih negara/bahasa |
| Personalisasi | profil, tema, kepadatan, kolom/filter tersimpan, quick access, halaman awal |
| Notifikasi | tabel/rute notifikasi in-app, lonceng, email outbox, preferensi, templat |
| Bantuan | `/onboarding` stepper, empty state, tooltip, dokumentasi, tab Feedback |
| Data | CSV/ekspor, impor payee, retensi, hapus dokumen, `/audit` (cakupan event, UI) |
| Sistem | `/healthz` `/readyz`, metrik antrean, kuota AI, halaman error, banner, feature flag, `/developer`, OpenAPI |
| i18n | pustaka (i18next), berkas kunci, string yang ditulis langsung (hitung), resource `id` |
| UI baseline | daftar rute + tangkapan 360/768/1366, tes parity/visual yang ada (FR-1307) |

**Golden SS-00:** (a) `test/characterization/` BW-00 tetap; (b) **golden teks UI**: teks tampak dari halaman utama (login, dashboard, requests, approvals, ledger, settings) sebelum SS-02 — setelah ekstraksi i18n teks harus **identik**; (c) snapshot geometri/visual 3 lebar.

Aturan klasifikasi: `EXISTS_OK` = tidak disentuh; `EXISTS_IMPERFECT` = daftar cacat konkret + paket yang memperbaiki; `MISSING` = paket yang membangun. Hasil audit memutuskan lingkup nyata tiap paket (paket tidak boleh mengklaim selesai bila baris belum `DONE`).

---

## 3. Model data (migrasi expand-only; nama FK = aktual dari SS-00)
Konvensi: `uuid` via `gen_random_uuid()`, `timestamptz`, tabel org-scoped `org_id NOT NULL` + indeks diawali `org_id` + isolasi; tabel user-scoped dikunci `user_id`. Semua CHECK/UNIQUE/FK/trigger punya tes insert valid+invalid.

### 3.1 Pengaturan dan preferensi
```sql
CREATE TABLE org_settings (
  org_id uuid NOT NULL REFERENCES organizations(org_id),
  key text NOT NULL,
  value jsonb NOT NULL,
  version int NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by uuid REFERENCES users(user_id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key)
);
CREATE TABLE org_settings_history (          -- append-only
  history_id bigserial PRIMARY KEY,
  org_id uuid NOT NULL, key text NOT NULL,
  old_value jsonb, new_value jsonb NOT NULL, version int NOT NULL,
  changed_by uuid, step_up_grant_id uuid, reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON org_settings_history (org_id, key, changed_at DESC);
CREATE TABLE user_preferences (
  user_id uuid NOT NULL REFERENCES users(user_id),
  key text NOT NULL, value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE saved_views (
  view_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, user_id uuid NOT NULL,
  page_key text NOT NULL, name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  config jsonb NOT NULL, is_default boolean NOT NULL DEFAULT false,
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, page_key, name)
);
CREATE UNIQUE INDEX saved_views_one_default ON saved_views (org_id, user_id, page_key) WHERE is_default;
CREATE TABLE org_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('LOGO')),
  storage_path text NOT NULL, mime text NOT NULL CHECK (mime IN ('image/png','image/jpeg')),
  bytes int NOT NULL CHECK (bytes BETWEEN 1 AND 524288), sha256 text NOT NULL,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, kind)
);
```
`org_settings_history`: trigger tolak UPDATE/DELETE; `REVOKE UPDATE,DELETE` dari role aplikasi.

### 3.2 Akun, keamanan, privasi
```sql
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_coarse text, ADD COLUMN IF NOT EXISTS ua_family text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz, ADD COLUMN IF NOT EXISTS revoked_reason text;
ALTER TABLE email_tokens ADD COLUMN IF NOT EXISTS email_hash text, ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
CREATE TABLE recovery_codes (
  code_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(user_id),
  batch_id uuid NOT NULL, code_hash text NOT NULL, used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, code_hash)
);
CREATE TABLE login_events (
  event_id bigserial PRIMARY KEY, user_id uuid, org_id uuid,
  kind text NOT NULL CHECK (kind IN ('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT','PASSWORD_RESET_REQUESTED','PASSWORD_RESET_DONE','PASSWORD_CHANGED','EMAIL_CHANGED','TOTP_ENABLED','TOTP_DISABLED','RECOVERY_USED','SESSION_REVOKED')),
  session_id uuid, ip_coarse text, ua_family text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON login_events (user_id, created_at DESC);
CREATE TABLE consent_records (
  consent_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(user_id),
  document_key text NOT NULL CHECK (document_key IN ('terms','privacy')), version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(), ip_coarse text, UNIQUE (user_id, document_key, version)
);
CREATE TABLE data_export_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(user_id),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','READY','FAILED','EXPIRED')),
  file_path text, sha256 text, requested_at timestamptz NOT NULL DEFAULT now(), ready_at timestamptz, expires_at timestamptz,
  CHECK ((status = 'READY') = (file_path IS NOT NULL AND sha256 IS NOT NULL))
);
CREATE TABLE account_deletion_requests (
  request_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(user_id),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','CANCELLED','COMPLETED','BLOCKED')),
  requested_at timestamptz NOT NULL DEFAULT now(), scheduled_for timestamptz NOT NULL,
  completed_at timestamptz, block_reason text
);
CREATE UNIQUE INDEX one_open_deletion ON account_deletion_requests (user_id) WHERE status = 'REQUESTED';
```

### 3.3 Organisasi dan akses
```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED')),
  ADD COLUMN IF NOT EXISTS archived_at timestamptz, ADD COLUMN IF NOT EXISTS archived_by uuid;
CREATE TABLE org_invitations (
  invitation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(org_id),
  email_enc bytea NOT NULL, email_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN','APPROVER','OPERATOR','VIEWER')),
  invited_by uuid NOT NULL REFERENCES users(user_id), token_id uuid REFERENCES email_tokens(token_id),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','EXPIRED','REVOKED')),
  expires_at timestamptz NOT NULL, accepted_by uuid, accepted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_invite ON org_invitations (org_id, email_hash) WHERE status = 'PENDING';
CREATE TABLE ownership_transfers (
  transfer_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(org_id),
  from_user uuid NOT NULL, to_user uuid NOT NULL, CHECK (from_user <> to_user),
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), decided_at timestamptz
);
CREATE UNIQUE INDEX one_open_transfer ON ownership_transfers (org_id) WHERE status = 'PROPOSED';
```
Peran INVITE tidak mencakup `OWNER` (kepemilikan hanya via transfer). Invarian: setiap org aktif memiliki **tepat satu** OWNER (tes + trigger/guard di `transition()`).

### 3.4 Bantuan, tur, umpan balik
```sql
CREATE TABLE tutorial_progress (
  user_id uuid NOT NULL REFERENCES users(user_id), tour_id text NOT NULL, tour_version int NOT NULL,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','DISMISSED')),
  step_index int NOT NULL DEFAULT 0 CHECK (step_index >= 0), started_at timestamptz, completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, tour_id)
);
CREATE TABLE onboarding_state (
  user_id uuid NOT NULL, org_id uuid NOT NULL, dismissed_at timestamptz, PRIMARY KEY (user_id, org_id)
);
CREATE TABLE help_feedback (
  feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, user_id uuid NOT NULL,
  article_id text NOT NULL, article_version int NOT NULL, helpful boolean NOT NULL,
  comment text CHECK (comment IS NULL OR char_length(comment) <= 1000), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_id, article_version)
);
CREATE TABLE feedback_submissions (
  feedback_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('BUG','IDEA','QUESTION','OTHER')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 5 AND 2000), route text, app_version text,
  status text NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','READ')), created_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.5 Notifikasi dan email
```sql
CREATE TABLE notification_preferences (
  user_id uuid NOT NULL, org_id uuid NOT NULL, event_key text NOT NULL,
  in_app boolean NOT NULL, email boolean NOT NULL,
  email_mode text NOT NULL DEFAULT 'INSTANT' CHECK (email_mode IN ('INSTANT','DAILY')),
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, org_id, event_key)
);
-- notifications: audit tabel 1.2; tambah kolom bila belum ada
CREATE TABLE IF NOT EXISTS notifications (
  notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL,
  event_key text NOT NULL, severity text NOT NULL CHECK (severity IN ('INFO','WARNING','HIGH','CRITICAL')),
  params jsonb NOT NULL DEFAULT '{}', entity_type text, entity_id text, read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_unread ON notifications (user_id, org_id, created_at DESC) WHERE read_at IS NULL;
CREATE TABLE email_outbox (
  email_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid, user_id uuid,
  to_email_enc bytea NOT NULL, to_email_hash text NOT NULL, template_key text NOT NULL, template_version int NOT NULL,
  locale text NOT NULL DEFAULT 'en', params jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SENT','FAILED','DEAD','SUPPRESSED')),
  attempts int NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
  suppressed_reason text, sent_at timestamptz, dedupe_key text UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON email_outbox (status, next_attempt_at);
CREATE TABLE digest_runs (user_id uuid NOT NULL, org_id uuid NOT NULL, run_date date NOT NULL, sent_at timestamptz, PRIMARY KEY (user_id, org_id, run_date));
CREATE TABLE announcements (
  announcement_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 280), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), CHECK (ends_at > starts_at)
);
```
`params` pada `email_outbox`/`notifications` hanya nilai aman (id, enum, angka, label non-PII); alamat email terenkripsi AES-GCM (AAD = `email_id`) seperti identifier payee 1.2.

### 3.6 Data, ekspor, impor
```sql
CREATE TABLE export_jobs (
  export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('REQUESTS','DECISIONS','LEDGER','PAYEES','AUDIT','MEMBERS')),
  format text NOT NULL CHECK (format IN ('CSV','JSON')), filters jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','READY','FAILED','EXPIRED')),
  row_count bigint, file_path text, sha256 text, created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz, expires_at timestamptz, downloaded_at timestamptz, error_code text,
  CHECK ((status = 'READY') = (file_path IS NOT NULL AND sha256 IS NOT NULL))
);
CREATE TABLE import_runs (
  import_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PAYEES')), status text NOT NULL DEFAULT 'PREVIEWED' CHECK (status IN ('PREVIEWED','COMMITTED','FAILED','EXPIRED')),
  file_sha256 text NOT NULL, row_count int NOT NULL, ok_count int NOT NULL, error_count int NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(), committed_at timestamptz,
  CHECK (ok_count + error_count = row_count)
);
```

### 3.7 Opsional (SS-11)
`approval_delegations(org_id, from_user, to_user, valid_from, valid_to, status)` dan `scheduled_reports(org_id, user_id, kind, format, cron_spec, status, last_run_at)` — skema pada paket SS-11 (flag; default off).

---

## 4. Registri dan data konfigurasi

### 4.1 Pengaturan organisasi (`shared/settings-registry.js`, cakupan ORG)
| Kunci | Tipe / nilai | Default | Izin tulis | Sensitif (step-up) | Efek |
|---|---|---|---|---|---|
| `org.display_name` | string 2–80 | nama org | `settings.org.write` | — | segera |
| `org.legal_name` | string ≤120 | kosong | `settings.org.write` | — | segera |
| `org.country` | ISO 3166-1 α2 | `US` | `settings.org.write` | — | default & varian teks legal |
| `org.timezone` | IANA (divalidasi `Intl`) | `UTC` | `settings.org.write` | — | tampilan/laporan/default mandat baru (DS-09) |
| `org.base_currency` | kode ∈ mata uang aktif | `USD` | `settings.org.write` | **ya** | default form/dasbor (DS-08) |
| `org.enabled_currencies` | himpunan ⊆ platform, ⊇ base | `["USD"]` | `settings.currency.write` | **ya + ledger bukti** | `ensureAccounts` per mata uang; guard `CURRENCY_IN_USE` |
| `org.default_locale` | ∈ locale aktif | `en` | `settings.org.write` | — | default pengguna baru |
| `org.date_format` | `MDY\|DMY\|YMD` | `MDY` | `settings.org.write` | — | default pengguna |
| `org.week_start` | `SUN\|MON` | `SUN` | `settings.org.write` | — | filter/laporan |
| `org.fiscal_year_start_month` | 1–12 | 1 | `settings.org.write` | — | laporan saja |
| `org.address` | teks ≤300 | kosong | `settings.org.write` | — | dokumen/legal |
| `org.support_email` | email | kosong | `settings.org.write` | — | footer/Help |
| `org.security.idle_timeout_min` | 5–480 | 60 | `settings.security.write` | **ya** | semua sesi anggota |
| `org.security.password_min_length` | 12–64 | 12 | `settings.security.write` | **ya** | perubahan/reset berikutnya |
| `org.security.require_totp_roles` | subset {OWNER,ADMIN,APPROVER,OPERATOR} | `[]` | `settings.security.write` | **ya + ledger bukti** | paksa pengaturan TOTP saat login berikutnya |
| `org.security.invite_domain_allowlist` | daftar domain | `[]` | `settings.security.write` | **ya** | undangan |
| `org.exports.retention_days` | 1–30 | 7 | `settings.org.write` | — | umur file ekspor |
Nilai di luar batas/ tipe → `422 SETTING_INVALID`. Pembaruan memakai `expected_version` (optimistic lock → `409 SETTING_VERSION_CONFLICT`). Tiap perubahan menulis `org_settings_history` + audit event; yang bertanda ledger bukti menulis entri `{event, key, version, value_hash}`.

### 4.2 Preferensi pengguna (cakupan USER)
`user.language` (hanya `en` aktif), `user.timezone` (default = org), `user.date_format`, `user.time_format` (`12h|24h`, default `12h`), `user.theme` (`light|dark|system`, default `light`), `user.density` (`comfortable|compact`), `user.start_page` (`dashboard|requests|approvals` — dibatasi izin), `user.default_org`, `user.page_size` (25/50/100), `user.reduce_motion` (`system|on|off`), `user.shortcuts_enabled`, `user.hints_enabled` (tooltip tur), `user.quick_access` (≤8 id dari katalog izin), `user.dashboard_widgets` (urutan+visibilitas dari katalog), `user.dismissed_announcements`. Semua divalidasi Zod dan dipetakan ke izin (halaman yang tak boleh dilihat tidak dapat menjadi `start_page`).

### 4.3 Mata uang (`shared/currencies.js`)
Baris: `{code, numeric, exponent, symbol, name, platformEnabled, providerCapability:{payments:'YES|NO|UNKNOWN', evidence:cassetteId}}`. Awal: `USD` (exp 2, YES), `IDR` (exp 2 menurut ISO 4217; `providerCapability` ditetapkan SS-01). **Menambah mata uang = tambah satu baris + lulus tes** (eksponen valid, contoh format, kapabilitas berbukti atau `NO`); tidak ada perubahan kode lain. Aturan keputusan: mata uang request/mandat harus ∈ `org.enabled_currencies` (`CURRENCY_NOT_ENABLED`, Tahap A, setelah A-cek mata uang 1.2) dan `providerCapability.payments ≠ NO` untuk eksekusi (`CURRENCY_NOT_SUPPORTED_BY_PROVIDER`). Dasbor menampilkan total **per mata uang**.

### 4.4 Negara dan zona waktu
`shared/countries.js` (ISO 3166-1 α2 lengkap: kode, nama EN, `region` ∈ {NA, LATAM, EMEA, APAC}); `region` hanya memilih varian teks legal dan saran default. Daftar zona waktu dari `Intl.supportedValuesOf('timeZone')` (Node 22; di klien dengan fallback daftar statis terverifikasi).

### 4.5 Locale (`shared/locales.js`)
`[{code:'en', status:'active', label:'English'}, {code:'id', status:'planned'}]` (hanya `active` dimuat/ditampilkan). **Prosedur tambah bahasa** (`docs/i18n-add-locale.md`, diuji): salin `locales/en` → `locales/<kode>`, terjemahkan, ubah status → `active`; tes kelengkapan (semua kunci ada, placeholder sama, plural valid), tes pseudo-locale, tes format `Intl` lulus. Bahasa UI, email, konten bantuan, dan penjelasan AI dipisah sebagai empat pengaturan di masa depan; **saat ini semuanya `en`**.

### 4.6 Format (`shared/format.js`)
`formatMoney(minor BigInt, currency, {locale})` → string desimal eksak dari BigInt + eksponen, lalu `Intl.NumberFormat` (menerima string desimal) dengan `currencyDisplay:'code'` (nominal selalu disertai kode mata uang — aturan 1.2); `parseMoney(text, currency)` → BigInt (menolak desimal berlebih, huruf, notasi ilmiah; hanya pemisah locale `en`); `formatDate/DateTime(ts, tz, prefs)`; `formatRelative`. Dilarang `toFixed`, `parseFloat`, `Number()` pada uang.

### 4.7 Katalog event notifikasi (`shared/notification-events.js`)
Baris: `{key, category, severity, defaultChannels:{inApp,email}, defaultEmailMode, mandatory, audience (izin), templateKey, deepLink}`. Kategori: `APPROVALS, EXECUTION, RECONCILIATION, DISPUTES, MANDATES, AGENTS, SECURITY, MEMBERS, DATA, SYSTEM`. Event minimal: `APPROVAL_REQUESTED, APPROVAL_DECIDED, APPROVAL_EXPIRING, REQUEST_REJECTED_BY_GATE, EXECUTION_SUCCEEDED, EXECUTION_FAILED, RECONCILIATION_MISMATCH, DISPUTE_OPENED, DISPUTE_DEADLINE, MANDATE_EXPIRING, MANDATE_BUDGET_THRESHOLD, AGENT_DISABLED, KILL_SWITCH_ACTIVATED, PAYPAL_CONNECTION_ERROR, SECURITY_NEW_LOGIN, SECURITY_PASSWORD_RESET_REQUESTED, SECURITY_PASSWORD_CHANGED, SECURITY_EMAIL_CHANGED, SECURITY_TOTP_CHANGED, SECURITY_RECOVERY_CODES_REGENERATED, SECURITY_API_KEY_EVENT, MEMBER_INVITED, MEMBER_JOINED, MEMBER_ROLE_CHANGED, OWNERSHIP_TRANSFER_PROPOSED, OWNERSHIP_TRANSFERRED, EXPORT_READY, ACCOUNT_DELETION_SCHEDULED, ANNOUNCEMENT`. `mandatory=true` (tidak dapat dimatikan emailnya): semua `SECURITY_*`, `KILL_SWITCH_ACTIVATED`, `OWNERSHIP_*`, `ACCOUNT_DELETION_SCHEDULED`.

---

## 5. Spesifikasi per modul

### 5.1 Pengaturan regional, mata uang, org (SS-01, SS-06)
- **Servis pengaturan** `settings.get(orgId|userId)`, `settings.set(tx, scope, ...)`: validasi registri, izin, step-up bila sensitif (memakai `step_up_grants` 1.2 dengan `purpose`), versi, riwayat, audit, ledger bukti bila ditandai — satu transaksi. Resolusi nilai: pengguna → organisasi → default platform. Server menyajikan `GET /settings/registry` (definisi untuk UI) sehingga formulir dibangun dari data.
- **Aktivasi mata uang**: validasi `platformEnabled`, buat akun pembukuan bila modul jurnal ada (`ensureAccounts(orgId, currency)` idempoten, satu transaksi), entri ledger bukti `CURRENCY_ENABLED`. **Penonaktifan** hanya bila tidak ada mandat ACTIVE/request terbuka/reservasi pada mata uang itu (`CURRENCY_IN_USE`, daftar penghalang dikembalikan).
- **Org wizard**: saat org baru (atau org yang belum menyelesaikan setup) mengisi negara, zona waktu (praisi dari `Intl` browser), mata uang dasar; org lama ter-backfill default (`US/UTC/USD`) **tanpa mengubah perilaku**, org seed demo `ID/Asia/Jakarta/USD`.
- **Logo org**: PNG/JPEG ≤ 512 KB, magic bytes, dimensi dibaca dari header (≤ 1024 px), disimpan di luar web root, dilayani lewat rute terautentikasi dengan `nosniff` dan tipe tetap; **SVG ditolak**.
- **Footer** (FR-1304): pemilih negara/bahasa membuka dialog "Region & language": menampilkan negara org (tautan ke pengaturan bila berizin) dan daftar bahasa aktif (**English** saja); tidak menampilkan bahasa yang `planned`.

### 5.2 i18n penuh (SS-02)
Ekstraksi **seluruh** string tampak ke `locales/en/*.json` (namespace per modul), pesan galat server (`error-codes` EN), email, nilai enum yang ditampilkan. `eslint no-literal-string` (JSX + server) dengan daftar pengecualian terdata; tes **teks identik** vs golden SS-00; pseudo-locale `en-XA` (aksen + panjang +30%) di CI untuk mendeteksi string tertanam dan overflow; `i18next` dengan fallback `en`, `missingKeyHandler` melempar di tes. Format tanggal/angka mengikuti preferensi pengguna → org → default. Sumber daya `id` yang ada dipindahkan ke `locales/id` (`inactive`).

### 5.3 Personalisasi (SS-03)
- **Profil** (`/settings/profile`): nama tampilan, email (ubah via alur §5.5), avatar = inisial (tetap 1.2), zona waktu, org default.
- **Preferensi** (`/settings/preferences`): semua kunci §4.2; pratinjau langsung; "Reset to defaults".
- **Tema gelap**: set token gelap di `tokens.css` (nama token sama, nilai berbeda; **tanpa literal** di luar token); `prefers-color-scheme` untuk `system`; kontras WCAG AA diuji otomatis; rute parity `/__parity/*` tetap terang; visual regression gelap punya baseline sendiri. Flag `SS_DARK_THEME`.
- **Kepadatan tabel**, **page size**, **kolom tersimpan** dan **filter tersimpan** (`saved_views`; "shared" memerlukan `views.share`), **halaman awal**, **Quick Access kustom** (katalog dibatasi izin), **widget dasbor** (urut/sembunyi dari katalog).
- **Menu avatar**: Profile, Preferences, Theme (segmented), Language (hanya English; tidak ada pilihan lain), Help, Sign out; **pemilih organisasi** di header bila anggota >1 org.
- **Persistensi**: server-side (lintas perangkat); klien menyimpan salinan hanya untuk render awal tanpa kilatan tema (`localStorage` dibungkus try/catch).

### 5.4 Notifikasi dan email (SS-04)
- **Pembuat notifikasi** `notify(event_key, {orgId, params, entity})`: menentukan audiens dari `audience` (izin), menerapkan preferensi (`mandatory` selalu), menulis `notifications` (in-app) dan/atau `email_outbox`; idempoten via `dedupe_key`. Pemanggilan dari handler peristiwa 1.2 (approval, eksekusi, rekonsiliasi, dispute, mandat, agen, kill switch, PayPal error) **hanya menambah panggilan `notify`** — tidak mengubah logika.
- **Inbox**: lonceng + popover (belum dibaca, 10 terbaru), halaman `/notifications` (filter kategori/dibaca, "Mark all read", kursor), polling 5–15 dtk saat tab aktif (cPanel; tanpa WebSocket).
- **Preferensi** (`/settings/notifications`): matriks event × (In-app, Email) + mode email (Instant/Daily digest); event `mandatory` terkunci dengan penjelasan; **Quiet hours** (mulai/selesai, zona waktu pengguna): menunda email non-mandatory bukan-`CRITICAL` hingga selesai (in-app tidak terpengaruh); daftar default per peran.
- **Email**: transport `EMAIL_TRANSPORT=smtp|log|off` (ENV: host/port/user/pass/`EMAIL_FROM`); job `send_email` dengan backoff (5 percobaan), `DEAD` bila habis; `off` ⇒ status `SUPPRESSED(reason=EMAIL_NOT_CONFIGURED)` dan **UI jujur**: banner untuk OWNER/ADMIN "Email delivery is not configured"; templat EN (HTML sederhana + teks) bertaut/ber-versi di `content/emails/`; tautan dari `APP_BASE_URL`; tidak ada rahasia selain token sekali pakai; header `List-Unsubscribe` hanya untuk digest. **Digest**: job per jam memilih pengguna yang jam lokalnya 08:00 dan belum menerima (`digest_runs`), meringkas event `DAILY`.
- **Retensi**: notifikasi 180 hari; `email_outbox` 30 hari setelah `SENT`; dibersihkan `settings_cleanup`.

### 5.5 Akun dan keamanan (SS-05)
**Forgot/reset password** (bangun lengkap bila `MISSING`):
1. `POST /auth/forgot {email}` — selalu `200` generik (tanpa enumerasi), waktu respons disamakan (kerja hash semu), rate limit per email-hash (3/jam) dan per IP (10/jam); bila akun ada & terverifikasi: token acak 32 byte (SHA-256 tersimpan), kedaluwarsa 30 mnt, **terikat `email_hash`**, token RESET lama dicabut; email via outbox.
2. `POST /auth/reset {token, new_password}` — token valid/tak terpakai/tak kedaluwarsa/email belum berubah; kebijakan password (min panjang org/platform ≥ 12, bukan sama dengan email, tidak ada di daftar sandi umum bawaan 10k); set `password_hash` (scrypt 1.2); **cabut semua sesi** pengguna, konsumsi `step_up_grants`, reset `failed_login_count/locked_until`, tandai token terpakai; **TOTP tidak dinonaktifkan** (login tetap meminta TOTP); email "password changed" (mandatory); `login_events` + audit.
3. **Ubah password** (butuh password lama + step-up bila TOTP aktif), **ubah email** (verifikasi email baru + notifikasi ke email lama; token terikat), **kirim ulang verifikasi**.
4. **TOTP**: setup/enable/disable (step-up), **kode pemulihan** (10 kode, tampil sekali, tersimpan sebagai hash, sekali pakai, regenerasi membatalkan batch lama dengan step-up), login dengan kode pemulihan mencatat `RECOVERY_USED` + notifikasi.
5. **Sesi aktif** (`/settings/security`): daftar (perangkat/UA famili, IP kasar, terakhir aktif), cabut satu/semua lainnya; **riwayat login** 90 hari; **idle timeout** org ditegakkan di middleware sesi (`SESSION_IDLE_TIMEOUT`).
6. **Kebijakan org `require_totp_roles`**: pengguna beralamat peran tersebut tanpa TOTP diarahkan ke setup saat login (tidak dapat mengakses fitur lain sampai selesai); tidak memutus sesi yang berjalan secara mendadak (berlaku di login berikutnya atau setelah 24 jam).
7. **Registrasi**: bila 1.2 menutupnya (flag `REGISTRATION_ENABLED`), tetap hormati; **undangan** boleh mendaftar dengan token meski registrasi publik ditutup.

### 5.6 Organisasi dan akses (SS-06)
- **Anggota** (`/settings/members`): daftar (peran, status TOTP, terakhir aktif), undang (email + peran; peran ≤ otoritas pengundang; ADMIN tidak dapat mengundang/mengubah OWNER), kirim ulang, cabut, ubah peran, hapus anggota (tidak dapat menghapus satu-satunya OWNER; sesi dicabut; reservasi/approval pending milik anggota ditangani: approval pending tetap, aktor dicatat).
- **Matriks peran** (`/settings/members/roles`): tabel baca-saja dari `shared/permissions.js` (data) — peran × izin, dengan deskripsi.
- **Transfer kepemilikan**: OWNER mengusulkan ke anggota (ADMIN+TOTP aktif bila kebijakan) → penerima menerima (step-up kedua pihak) → OWNER lama menjadi ADMIN; invarian satu OWNER; kedaluwarsa 7 hari; ledger bukti `OWNERSHIP_TRANSFERRED`.
- **Arsip/pulihkan org** (bukan hapus; ledger/jurnal tak boleh hilang): OWNER + step-up; org `ARCHIVED` = **hanya baca**; semua endpoint tulis → `423 ORG_ARCHIVED`; agen tidak dapat mengusulkan; kill switch otomatis aktif; dapat dipulihkan OWNER.
- **Pemilih organisasi** untuk anggota >1 org (mengubah `sessions.current_org_id`).

### 5.7 Pusat bantuan tertulis (SS-07)
- **Konten sebagai data** `content/help/en/<module>/<slug>.json`: `{id, version, module, type (OVERVIEW|CONCEPT|HOWTO|REFERENCE|TROUBLESHOOTING), title, summary, updated, audiencePermissions?, related[], blocks[]}`; `blocks` ∈ {heading, paragraph, list, steps, callout(note|warning|tip), code, image(src dari aset bundel + alt wajib), table, link(internal|external)}. Dirender oleh komponen React (tanpa HTML mentah/`dangerouslySetInnerHTML`); tautan eksternal `rel="noopener noreferrer"` + ikon; tanpa iframe.
- **Struktur halaman** (`/help`, `/help/:module`, `/help/:module/:slug`): beranda dengan "Getting started", per modul, kotak cari, panel samping "On this page", breadcrumb, "Was this helpful?" (👍/👎 + komentar → `help_feedback`), artikel terkait, tanggal pembaruan.
- **Pencarian**: indeks klien dibangun saat build (judul, heading, ringkasan, isi) — tanpa server; peringkat sederhana (judul>heading>isi); tahan salah ketik ringan (prefiks/ambang jarak edit ≤1); hasil dibatasi izin pengguna (artikel `audiencePermissions`).
- **Glosarium** (`content/help/en/glossary.json`, ≥ 40 istilah: Mandate, Policy, Budget, Reservation, Payee, Trust status, Decision, Reason code, Approval, Step-up, Four-eyes, Idempotency, Ledger, Hash chain, Reconciliation, Webhook, Sandbox, Agent, API key, MCP, Role, Minor units, …) dengan tooltip `<Term>` di UI.
- **Bantuan kontekstual**: tombol `?` di header membuka laci samping berisi artikel untuk rute saat ini (`content/help/route-map.json`: rute → artikel/tur); tombol `?` pada kartu/judul tertentu; pintasan `?`.
- **Reason code ↔ bantuan**: setiap kode di `shared/error-codes.js` memiliki `helpArticle` (guard CI); pesan penolakan menampilkan "Learn more".
- **Catatan rilis** (`content/releases/*.json`) di `/help/releases` + penanda "What's new" di menu avatar (bergantung versi terakhir dilihat, disimpan di preferensi).
- **Umpan balik produk**: tab Feedback 1.2 → formulir (kategori + pesan + rute + versi aplikasi) → `feedback_submissions`, juga memberi notifikasi in-app ke OWNER/ADMIN dan email ke `org.support_email` bila diatur.
- **Cakupan**: `shared/help-coverage.js` memetakan modul → {overview, ≥ 2 how-to, ≥ 1 troubleshooting, tur, rute}; CI gagal bila ada modul tanpa kelengkapan, bila tautan internal rusak, gambar tanpa `alt`, atau kode alasan tanpa artikel. Konten ditulis dalam **English**.

### 5.8 Tur interaktif, checklist, empty state (SS-08)
- **Mesin tur** (komponen sendiri di atas Radix Popover + overlay sorotan; **tanpa dependensi baru**): definisi tur sebagai data `content/tours/en/<tour>.json`: `{id, version, module, titleKey, audiencePermissions, steps:[{id, route, target:'[data-tour="x"]'|null, placement, title, body, requires:{permission?, flag?, entityExists?}, advance:'next'|'click-target'|'route'}]}`. Perilaku: sorot target, kartu langkah (Back/Next/Skip/Close, "Step n of N"), `Esc` menutup, fokus dipindah ke kartu dan dikembalikan saat selesai, `aria-live`, hormati `reduce_motion`; di 360 px kartu berupa **bottom sheet**; target tak ditemukan dalam 3 dtk → langkah dilewati dengan pesan; tur **tidak mengirim formulir, tidak mengklik tombol aksi**, dan berhenti di depan dialog step-up.
- **Progress** per pengguna (`tutorial_progress`): mulai/lanjut/ulang/lewati; versi tur naik ⇒ lencana "Updated" (tidak memaksa). **Hub** `/tours` (daftar tur per modul dengan status, durasi perkiraan, tombol Start/Resume/Restart). Tur dimulai otomatis **hanya** untuk "Welcome tour" pertama (dapat dimatikan `hints_enabled`).
- **Tur per modul (minimum)**: Welcome (app shell) · Organization & regional settings · PayPal connection · Agents & API keys · Mandates · Payees & documents · Requests & decisions · Approvals · Ledger & verification · Disputes · Developer & Simulator · Dashboard & notifications · Account & security · Reports & data · Help center; **ditambah modul baru dari inventaris SS-00** (mis. Transactions/Invoices/Down payments bila ada). Daftar final = `module-inventory.md`.
- **Checklist "Getting started"** (`/getting-started` + kartu dasbor): butir diturunkan dari **keadaan nyata** (bukan flag manual): PayPal connected · agent created · mandate active · payee added · first request evaluated · approver invited · TOTP enabled · org settings completed. Hanya butir yang dapat dikerjakan peran pengguna yang tampil; tiap butir menaut ke tur + artikel; kartu dapat ditutup (`onboarding_state`).
- **Empty state berarah** di semua daftar: ikon, penjelasan 1 kalimat, tombol aksi utama (bila berizin), tautan "Learn more" ke artikel/tur.
- **Penjaga tur**: tes E2E menjalankan setiap tur dan memastikan setiap `data-tour` tersedia pada rute dan peran yang ditentukan; CI gagal bila elemen target hilang (mencegah tur rusak setelah perubahan UI).

### 5.9 Data, laporan, privasi, legal (SS-09)
- **Ekspor** (`/settings/data`, serta tombol "Export" di tabel): CSV/JSON untuk `REQUESTS, DECISIONS, LEDGER, PAYEES, AUDIT, MEMBERS`; filter = filter tabel; job asinkron (stream, tanpa buffer penuh; >5.000 baris selalu job) → `READY` → unduh tautan bertanda tangan sekali pakai ≤ 10 mnt, teraudit; `sha256` dicatat; **proteksi CSV injection** (sel diawali `= + - @ \t \r` diberi awalan `'`); jumlah sebagai string desimal eksak + kolom `currency`; waktu UTC + kolom zona waktu org; kolom PII dimasking sesuai izin; ekspor LEDGER menyertakan hash rantai; ekspor keuangan mencatat ledger bukti `EXPORT_CREATED{kind,row_count,sha256}`; file kedaluwarsa `org.exports.retention_days`.
- **Impor payee CSV**: unggah ≤ 2 MB / 5.000 baris, pratinjau (per baris valid/galat dengan alasan), deduplikasi (HMAC identifier), **commit atomik** (semua-atau-tidak, atau "skip errors" eksplisit), payee impor selalu `PENDING_REVIEW`; tidak membuat payee TRUSTED.
- **Privasi pengguna**: halaman "My data" — ekspor data pribadi (profil, preferensi, persetujuan, riwayat login, keanggotaan, notifikasi, umpan balik; **bukan** data keuangan organisasi — jelas dinyatakan), permintaan hapus akun (masa tenang 14 hari, dapat dibatalkan; diblokir bila satu-satunya OWNER org aktif → diminta transfer/arsip); eksekusi = **pseudonimisasi**: `display_name='Deleted user'`, email diganti hash tak dapat dipulihkan, TOTP/sesi/preferensi/notifikasi/tur/riwayat login dihapus, `user_id` dipertahankan pada audit/approval/ledger (tidak mengandung PII).
- **Legal**: `/legal/terms`, `/legal/privacy`, `/legal/cookies`, `/legal/policy-updates` — konten sebagai data berversi + tanggal efektif (EN, varian per `region` bila ada); **pengguna menyetujui versi baru** (modal + `consent_records`) saat login berikutnya; templat berlabel "Template — review with counsel"; pernyataan "JOBENPAY is not a PayPal product. Connected to PayPal Sandbox only." tetap; cookie: hanya cookie esensial (sesi/CSRF/preferensi) — halaman menjelaskannya; tanpa pelacak pihak ketiga.
- **Retensi** (job `settings_cleanup`): `login_events` 90 hr, notifikasi 180 hr, outbox 30 hr, `help_feedback`/`feedback` 365 hr, ekspor sesuai kebijakan; **tidak pernah** menyentuh ledger/audit/jurnal.

### 5.10 Audit, sistem, pencarian, developer, UX lintas modul (SS-10)
- **Penampil audit** (`/audit`, izin `audit.read`): tabel dengan filter (aktor, tipe, entitas, rentang tanggal), pencarian, detail JSON ter-redaksi, ekspor via §5.9; **katalog event** (`shared/audit-events.js`) dan tes bahwa tiap aksi sensitif SS menulis event; tabel append-only (trigger + REVOKE; bila belum ada, dibangun).
- **Sistem** (`/settings/system`, OWNER/ADMIN): versi/build/commit, status DB/migrasi/worker, kedalaman antrean (milik org), pemakaian vs kuota (panggilan AI/hari, usulan/jam, per API key — dari penghitung 1.2), status email (configured/not), daftar feature flag (baca-saja), tautan ke `/healthz`.
- **Pengumuman/banner**: tabel `announcements` diisi lewat CLI `scripts/announce.js` (tanpa panel super-admin); banner di header (INFO/WARNING/CRITICAL), dapat ditutup per pengguna; juga halaman pemeliharaan statis.
- **Halaman error** 403/404/500/423/offline/maintenance dengan bahasa jelas, kode referensi (request id), tautan bantuan.
- **Pencarian global + palet perintah** (`Ctrl/⌘+K`): `GET /search?q=` terbatas tenant+izin (agen, payee, request by id/hash-prefiks, mandat, artikel bantuan, halaman pengaturan, aksi navigasi); ILIKE/prefiks pada kolom ternormalisasi (tanpa ekstensi `pg_trgm`); maks 5 per tipe; hanya navigasi (tidak mengeksekusi aksi uang).
- **Pintasan keyboard** (`shared/shortcuts.js`; `?` menampilkan daftar; dapat dimatikan), **breadcrumb**, **dialog konfirmasi** aksi destruktif (ketik nama untuk hapus/arsip), state loading/error/kosong konsisten, stylesheet cetak untuk halaman detail.
- **Dokumentasi developer** (`/developer` + Help "API & MCP"): `docs/openapi.json` ditulis tangan + **tes bahwa setiap rute agen/REST terdaftar terdokumentasi dan sebaliknya**; contoh cURL/Node; daftar tool MCP; panduan webhook PayPal; changelog API.

### 5.11 Opsional (SS-11, flag `SS_DELEGATION`, `SS_SCHEDULED_REPORTS`, default off) 🔒
- **Delegasi approval**: OWNER/ADMIN atau pemilik delegasi membuat `approval_delegations` (rentang waktu; penerima harus APPROVER aktif; **tidak melebihi batas approver asal**; **four-eyes tetap berlaku** — penerima ≠ pengaju); keputusan mencatat `actor` dan `on_behalf_of`; delegasi tidak dapat dibuat untuk request yang diajukan penerima sendiri; step-up tetap per aktor; ledger bukti mencatat delegasi.
- **Laporan terjadwal**: jadwal ekspor harian/mingguan/bulanan (zona waktu org) → email tautan unduhan (bukan lampiran), memakai pipeline §5.9; dapat dijeda/dihapus.

---

## 6. State machine (data di `shared/state-machines.js`; tes dibangkitkan)
| Scope | Transisi legal (aktor) |
|---|---|
| `email_token` | `ISSUED→USED` (user) · `ISSUED→EXPIRED` (job) · `ISSUED→REVOKED` (system/user) |
| `invitation` | `PENDING→ACCEPTED` (invitee) · `PENDING→EXPIRED` (job) · `PENDING→REVOKED` (admin) |
| `ownership_transfer` | `PROPOSED→ACCEPTED|DECLINED` (penerima) · `PROPOSED→CANCELLED` (pengusul) · `PROPOSED→EXPIRED` (job) |
| `org_status` | `ACTIVE→ARCHIVED` (OWNER+step-up) · `ARCHIVED→ACTIVE` (OWNER+step-up) |
| `export_job` | `QUEUED→RUNNING→READY|FAILED` (worker) · `READY→EXPIRED` (job) |
| `data_export` | `QUEUED→READY|FAILED` · `READY→EXPIRED` |
| `deletion_request` | `REQUESTED→CANCELLED` (user) · `REQUESTED→COMPLETED` (job, setelah jadwal) · `REQUESTED→BLOCKED` (system) |
| `tour_progress` | `NOT_STARTED→IN_PROGRESS→COMPLETED|DISMISSED` · `COMPLETED|DISMISSED→IN_PROGRESS` (restart) |
| `email_outbox` | `PENDING→SENDING→SENT` · `SENDING→FAILED→PENDING` (retry) · `FAILED→DEAD` (percobaan habis) · `PENDING→SUPPRESSED` |
| `import_run` | `PREVIEWED→COMMITTED|FAILED|EXPIRED` |
Semua transisi lewat satu fungsi `transition(tx, scope, id, to, actor)` (ilegal → 409 `ILLEGAL_TRANSITION`). Transisi request/approval 1.2 **tidak berubah**.

## 7. Jurnal dan ledger bukti
**Tidak ada aturan jurnal baru.** Pengaktifan mata uang memanggil `ensureAccounts` (bila modul jurnal ada). **Ledger bukti** (hash/enum/id saja) hanya untuk peristiwa tingkat-organisasi: `CURRENCY_ENABLED|DISABLED`, `BASE_CURRENCY_CHANGED`, `SECURITY_POLICY_CHANGED`, `OWNERSHIP_TRANSFERRED`, `ORG_ARCHIVED|RESTORED`, `MEMBER_ROLE_CHANGED`, `MEMBER_REMOVED`, `EXPORT_CREATED`(keuangan). Peristiwa tingkat-pengguna (reset password, login, preferensi) hanya di **audit**/`login_events`.

## 8. Kode alasan dan galat baru (`shared/error-codes.js`, EN; `helpArticle` wajib)
`CURRENCY_NOT_ENABLED`, `CURRENCY_NOT_SUPPORTED_BY_PROVIDER`, `CURRENCY_IN_USE`, `SETTING_INVALID`, `SETTING_VERSION_CONFLICT`, `SETTING_FORBIDDEN`, `STEP_UP_REQUIRED` (1.2), `RESET_TOKEN_INVALID`, `PASSWORD_POLICY_VIOLATION`, `SESSION_IDLE_TIMEOUT`, `TOTP_SETUP_REQUIRED`, `INVITE_ROLE_NOT_ALLOWED`, `INVITE_DOMAIN_NOT_ALLOWED`, `LAST_OWNER_PROTECTED`, `ORG_ARCHIVED` (423), `OWNERSHIP_TRANSFER_INVALID`, `EXPORT_TOO_LARGE`, `IMPORT_INVALID`, `ACCOUNT_DELETE_BLOCKED`, `CONSENT_REQUIRED`, `FILE_TYPE_NOT_ALLOWED`, `RATE_LIMITED` (1.2). Hanya dua kode mata uang pertama masuk Tahap A Decision Engine (deterministik; urutan didokumentasikan di `docs/policy-order.md`).

## 9. API dan RBAC
Semua di `/api/v1` (sesi + CSRF; Zod; IDOR→404; rate limit; kode galat stabil). Tidak ada tool MCP baru yang bertindak.

| Area | Endpoint | Izin |
|---|---|---|
| Referensi | `GET /reference/countries|currencies|timezones|locales` | sesi |
| Pengaturan | `GET /settings/registry` · `GET/PATCH /settings/org` · `POST /settings/org/currencies/{enable,disable}` · `GET /settings/org/history` · `POST/GET /settings/org/logo` | `settings.read` / `settings.org.write` / `settings.currency.write` / `settings.security.write` |
| Profil/preferensi | `GET/PATCH /me/profile` · `GET/PATCH /me/preferences` | sesi |
| Akun | `POST /auth/forgot` · `/auth/reset` · `/auth/change-password` · `/auth/change-email/{request,confirm}` · `/auth/verify-email/resend` · `/auth/recovery-codes/regenerate` · `GET /auth/sessions` · `DELETE /auth/sessions/:id` · `DELETE /auth/sessions` · `GET /auth/login-history` | publik (forgot/reset, rate limit) / sesi |
| Anggota | `GET/POST /members/invitations` · `POST …/:id/{resend,revoke}` · `POST /auth/invitations/accept` · `PATCH /members/:id/role` · `DELETE /members/:id` · `GET /members/roles` | `members.read` / `members.manage` |
| Org | `POST /org/ownership-transfers` · `…/:id/{accept,decline,cancel}` · `POST /org/{archive,restore}` · `POST /me/switch-org` | `org.transfer` / `org.archive` / sesi |
| Privasi | `GET/POST /me/consents` · `POST/GET /me/data-export` · `POST/DELETE /me/delete-request` | sesi |
| Notifikasi | `GET /notifications` · `POST /notifications/:id/read` · `POST /notifications/read-all` · `GET /notification-events` · `GET/PUT /me/notification-preferences` | sesi |
| Bantuan/tur | `GET/PUT /me/tutorials[/:id]` · `GET /onboarding/checklist` · `POST /onboarding/checklist/dismiss` · `POST /help/feedback` · `POST /feedback` | sesi |
| Tampilan | `GET/POST/PATCH/DELETE /saved-views` | sesi / `views.share` |
| Data | `POST/GET /exports` · `GET /exports/:id[/download]` · `POST /imports/payees/{preview,commit}` | `export.create` / `import.payees` |
| Sistem | `GET /audit` · `GET /search` · `GET /system/info` · `GET /system/usage` · `GET /announcements` · `GET /legal/documents` | `audit.read` / sesi / `system.read` / publik |

**Matriks izin** (data di `shared/permissions.js`; tes tabel-driven per peran):
| Izin | OWNER | ADMIN | APPROVER | OPERATOR | VIEWER | JUDGE |
|---|---|---|---|---|---|---|
| `settings.read` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `settings.org.write` | ✓ | ✓ | – | – | – | – |
| `settings.currency.write`, `settings.security.write` | ✓ | – | – | – | – | – |
| `members.read` | ✓ | ✓ | ✓ | – | – | ✓ |
| `members.manage` | ✓ | ✓* | – | – | – | – |
| `org.transfer`, `org.archive` | ✓ | – | – | – | – | – |
| `audit.read` | ✓ | ✓ | – | – | – | ✓ |
| `export.create` | ✓ | ✓ | ✓ (requests/decisions) | ✓ (requests/decisions) | – | ✓ |
| `import.payees` | ✓ | ✓ | – | ✓ | – | – |
| `views.share` | ✓ | ✓ | – | – | – | – |
| `system.read` | ✓ | ✓ | – | – | – | ✓ |
*ADMIN tidak dapat memengaruhi OWNER. JUDGE hanya-baca di tenant demo; tidak dapat mengubah pengaturan keamanan, anggota, transfer, arsip, hapus akun. Preferensi/profil/notifikasi pribadi: semua peran.

## 10. Job baru (antrean 1.2; idempoten; `dedupe_key`; tahan crash)
`send_email`, `build_digest`, `expire_tokens_and_invites`, `expire_transfers`, `export_build`, `data_export_build`, `account_deletion_run`, `settings_cleanup`, `session_idle_sweep`, `announcement_sweep` (opsional), `scheduled_report_run` (SS-11).

## 11. UI — responsif, lengkap, tanpa literal desain
Mengikuti token/komponen 1.2 (parity P1) dan label SANDBOX; **semua string lewat i18n (EN)**; state wajib (default/hover/fokus/disabled/loading/error/kosong/skeleton); tabel → kartu di layar sempit; tanpa overflow horizontal di **360/768/1366**; axe 0 pelanggaran serius; fokus-trap dialog + `Esc`; grafik/ikon SVG.
| Rute | Isi |
|---|---|
| `/forgot-password`, `/reset-password`, `/accept-invite`, `/verify-email` | kartu pusat (pola login), pesan generik, indikator kekuatan password, status token |
| `/settings/profile`, `/settings/preferences` | formulir dari registri, pratinjau tema/format, "Reset to defaults" |
| `/settings/notifications` | matriks event × kanal, kategori yang dapat dilipat, quiet hours, banner "email not configured" |
| `/settings/security` | password, TOTP, kode pemulihan (dialog tampil-sekali + unduh), sesi aktif, riwayat login |
| `/settings/org` | tab General · Regional (negara, zona waktu, tanggal, awal minggu, fiskal) · Currencies (USD/IDR, base, status dukungan provider berlabel) · Security policy · Branding (logo) |
| `/settings/members`, `/settings/members/roles` | tabel anggota/undangan (kartu di 360), dialog undang/ubah peran/transfer, matriks peran |
| `/settings/data` | Export (daftar job, status, unduh), Import payee (unggah→pratinjau→commit), My data & privacy |
| `/settings/system` | versi, kesehatan, antrean, kuota, email, flags |
| `/notifications` | inbox penuh |
| `/help`, `/help/:module[/:slug]`, `/help/glossary`, `/help/releases` | pusat bantuan (pencarian, TOC samping, feedback) |
| `/tours`, `/getting-started` | hub tur, checklist |
| `/audit` | penampil audit |
| `/legal/:doc` | dokumen legal berversi |
| Global | header: org switcher, `?` bantuan, lonceng, avatar menu; laci bantuan kontekstual; palet perintah; banner pengumuman; footer terhubung ke pengaturan; halaman error |

## 12. Konfigurasi (Zod; default; batas) — ENV/platform
| Kunci | Default | Batas |
|---|---|---|
| `APP_BASE_URL` | wajib | URL https (kecuali dev) |
| `EMAIL_TRANSPORT` | `off` | `smtp|log|off` |
| `EMAIL_FROM`, `SMTP_*` | — | valid bila `smtp` |
| `RESET_TOKEN_TTL_MIN` | 30 | 10–120 |
| `INVITE_TTL_DAYS` | 7 | 1–30 |
| `PASSWORD_MIN_LENGTH_PLATFORM` | 12 | 8–64 (lantai) |
| `LOGIN_EVENT_RETENTION_DAYS` | 90 | 30–365 |
| `NOTIFICATION_RETENTION_DAYS` | 180 | 30–730 |
| `EXPORT_MAX_ROWS` | 1.000.000 | 10.000–5.000.000 |
| `DELETION_GRACE_DAYS` | 14 | 7–30 |
| `UPLOAD_LOGO_MAX_BYTES` | 524288 | ≤ 1 MiB |
| Flag: `SS_CURRENCY_IDR`, `SS_EMAIL`, `SS_RESET`, `SS_DARK_THEME`, `SS_TOURS`, `SS_SEARCH`, `SS_DELEGATION`, `SS_SCHEDULED_REPORTS` | per gerbang | bool |

## 13. Metrik (tanpa PII di label)
`auth_reset_requests_total{result}`, `auth_login_total{result}`, `email_outbox_depth{status}`, `email_sent_total{template,result}`, `notifications_created_total{event}`, `export_jobs_total{kind,status}`, `settings_changes_total{key}`, `tour_started_total{tour}`, `tour_completed_total{tour}`, `help_search_zero_results_total`, `help_feedback_total{helpful}`, `search_requests_total`, `session_revoked_total{reason}`.

## 14. Test suite (wajib hijau)
1. **Regresi:** suite 1.2/1.3/BW, golden BW-00, **golden teks UI**, golden geometri; perilaku keputusan/approval/jurnal identik; `judge-smoke` hijau.
2. **Skema:** insert valid+invalid setiap CHECK/UNIQUE/FK/indeks parsial/trigger (append-only history, satu OWNER, satu invite pending, satu deletion terbuka); tes katalog isolasi (tabel baru tanpa `org_id`/kunci pemilik → gagal).
3. **Dibangkitkan dari data:** `settings-registry` (default valid, batas, izin, sensitif butuh step-up), `currencies`, `countries`, `permissions` (peran × izin), `notification-events`, `state-machines`, `help-coverage`, `error-codes` (tiap kode punya EN + `helpArticle`).
4. **Pengaturan:** hierarki resolusi, optimistic lock (409), validasi Zod, step-up, riwayat, ledger bukti hash-only; aktivasi/penonaktifan mata uang (`CURRENCY_IN_USE` dengan penghalang), `CURRENCY_NOT_ENABLED` dan `CURRENCY_NOT_SUPPORTED_BY_PROVIDER` di Tahap A, org lama tak berubah perilaku, IDR berdasar capability.
5. **Uang & format:** `parseMoney/formatMoney` (BigInt eksak, eksponen 0/2/3 untuk uji generik, penolakan input salah, properti ≥ 10.000 kasus round-trip), lint larangan float; total per mata uang.
6. **i18n:** tidak ada string literal (lint), pseudo-locale tanpa overflow/ketidakterjemahan, kunci hilang gagal, prosedur tambah-locale (fixture `xx`) lulus tes kelengkapan.
7. **Akun:** reset (token acak/hash/TTL/sekali pakai/terikat email; **tanpa enumerasi** — respons dan waktu setara; rate limit; kebijakan password; cabut semua sesi; TOTP tetap), ubah password/email, kode pemulihan (sekali pakai, regenerasi), sesi (cabut), idle timeout, `require_totp_roles`, undangan bertoken saat registrasi tertutup.
8. **Org & akses:** peran undangan ≤ otoritas; satu OWNER (konkurensi: dua transfer/hapus paralel → invarian terjaga); transfer; arsip → semua tulis `423`, agen ditolak; IDOR semua endpoint.
9. **Notifikasi/email:** audiens per izin; `mandatory` tak dapat dimatikan; quiet hours; digest idempoten; outbox retry/DEAD/SUPPRESSED; **tautan dari `APP_BASE_URL` (uji header `Host` palsu)**; tanpa PII di `params`/log.
10. **Bantuan/tur:** validasi skema konten, tautan internal, `alt` gambar, cakupan modul, kode alasan ↔ artikel; pencarian (peringkat, toleransi, izin); E2E setiap tur (target ada, tidak ada aksi terkirim, `Esc`, fokus, bottom sheet 360); versi tur → lencana; progress.
11. **Data/privasi:** ekspor (stream, injeksi CSV, jumlah string eksak, masking, tautan sekali pakai/kedaluwarsa, hash), impor (pratinjau, atomik, `PENDING_REVIEW`), ekspor data pribadi (tanpa data org), hapus akun (diblokir bila sole OWNER; pseudonimisasi; audit utuh), consent versi baru, retensi tidak menyentuh ledger/audit.
12. **Keamanan:** logo (magic bytes, SVG ditolak, `nosniff`), IDOR, CSRF, rate limit, pemindai rahasia/PII pada respons dan log baru.
13. **UI:** E2E setiap halaman, geometri/overflow 360/768/1366 (terang & gelap), axe 0 serius, state wajib, tanpa literal desain, kontras tema gelap, footer/pemilih bahasa hanya English.

## 15. Klaim yang boleh dibuat (klaim → bukti)
| Klaim | Bukti |
|---|---|
| "Fully English UI with i18n ready for more languages" | lint no-literal-string + pseudo-locale + tes tambah-locale |
| "USD complete; IDR supported for bookkeeping, and for transactions where the provider supports it" | kapabilitas berbukti (cassette) + tes mata uang |
| "Guided tours and written help for every module" | `help-coverage` hijau + E2E tur |
| "Password reset without account enumeration" | tes respons/waktu setara |
| "Your data export and deletion requests are supported" | tes ekspor/hapus + pseudonimisasi |
| "Email notifications" | **hanya bila `EMAIL_TRANSPORT=smtp` terverifikasi**; selain itu UI menyatakan belum dikonfigurasi |
| Kepatuhan hukum apa pun | **tidak diklaim** |

## 16. Rencana kerja, gerbang, rollout
| WP | Isi | Jam |
|---|---|---|
| SS-00 | Adopsi: baseline, gap matrix, inventaris modul, golden teks/geometri, pagar CI | 16 |
| SS-01 | Registri pengaturan, regional, mata uang (USD/IDR), format, spike kapabilitas IDR, API | 24 |
| SS-02 | i18n penuh EN: ekstraksi, lint, pseudo-locale, format app-wide, prosedur locale | 24 |
| SS-03 | Profil, preferensi, tema gelap, kepadatan, tampilan tersimpan, widget, menu avatar | 24 |
| SS-04 | Outbox email, notifikasi (inbox, preferensi, digest, quiet hours) | 26 |
| SS-05 | Akun & keamanan: reset, ubah password/email, pemulihan, sesi, kebijakan | 28 |
| SS-06 | Organisasi & akses: undangan, anggota, matriks peran, transfer, arsip, logo, org settings UI | 26 |
| SS-07 | Pusat bantuan: konten, renderer, pencarian, glosarium, kontekstual, feedback, guard | 30 |
| SS-08 | Tur interaktif, checklist, empty state, guard E2E | 28 |
| SS-09 | Ekspor/impor, privasi, legal, retensi | 28 |
| SS-10 | Audit viewer, sistem, pengumuman, error pages, pencarian/palet, pintasan, docs developer | 28 |
| SS-11 (opsional) | Delegasi approval + laporan terjadwal | 20 |
| SS-12 | Hardening, a11y, responsif, regresi penuh, dokumentasi, README klaim | 24 |
| **Total inti (SS-00…10, 12)** | | **≈ 306** |
**Gerbang:** **GS0** (SS-00) · **GS1** (SS-01, 02: pengaturan+i18n tanpa regresi) · **GS2** (SS-03, 04, 05: personalisasi, notifikasi, akun) · **GS3** (SS-06, 07, 08: org, bantuan, tur) · **GS4** (SS-09, 10, 11: data, audit, sistem) · **GS5** (SS-12). Rollout: cabang `ss`, staging + DB terpisah; flag per modul; migrasi expand-only; backfill org lama dengan default tanpa mengubah perilaku; **situs yang sedang dinilai tidak disentuh**.

## 17. Acceptance Criteria (Definition of Done)
1. Gap matrix lengkap; **tidak ada** fitur `EXISTS_OK` yang ditulis ulang; semua baris `MISSING/IMPERFECT` berstatus `DONE` dengan bukti.
2. Suite 1.2/1.3/BW + golden (API, teks UI, geometri) hijau; perilaku keputusan/approval/jurnal/ledger tidak berubah.
3. Pengaturan regional lengkap (negara, zona waktu, mata uang dasar/aktif, format, awal minggu, fiskal) dari registri data; perubahan sensitif ber-step-up, berhistori, ber-ledger bukti bila ditandai.
4. USD lengkap end-to-end; IDR dapat diaktifkan dan berperilaku sesuai kapabilitas provider (jujur di UI); menambah mata uang = satu baris data + tes; total per mata uang.
5. UI, email, pesan galat, bantuan **100% English**; tidak ada string tertanam (lint); prosedur tambah bahasa terbukti dengan fixture.
6. Personalisasi pengguna lengkap (profil, tema terang/gelap/sistem, kepadatan, halaman awal, page size, quick access, widget, tampilan tersimpan) dan tersimpan server-side.
7. Notifikasi: katalog event, inbox, preferensi, quiet hours, digest, email dengan status transport jujur; event wajib tak dapat dimatikan.
8. Akun: reset password tanpa enumerasi, ubah password/email, kode pemulihan, sesi aktif, riwayat login, idle timeout, kebijakan TOTP org.
9. Organisasi: undangan, anggota, matriks peran, transfer kepemilikan, arsip/pulihkan (hanya-baca saat arsip), logo; satu OWNER selalu terjaga.
10. Pusat bantuan dan tur tersedia untuk **setiap modul** dalam inventaris; cakupan, tautan, `alt`, kode alasan ↔ artikel lulus guard; tur tidak pernah bertindak.
11. Ekspor/impor, ekspor data pribadi, permintaan hapus (pseudonimisasi), consent versi, halaman legal, retensi berfungsi dan teruji.
12. Audit viewer, halaman sistem, pengumuman, halaman error, pencarian/palet perintah, dokumentasi developer (OpenAPI sinkron dengan rute).
13. Semua endpoint: Zod, RBAC tabel-driven, isolasi tenant (IDOR→404), CSRF, rate limit, kode galat stabil; tabel klaim→bukti (§15) di README hanya memuat klaim terbukti.
14. UI responsif 360/768/1366 (terang & gelap), axe 0 serius, state wajib, tanpa literal desain.
15. Seluruh `[VERIFY]` §18 ditutup dengan bukti atau ditandai keputusan manusia.

## 18. Daftar `[VERIFY]` (ditutup di SS-00/SS-01)
1. Dukungan PayPal Sandbox untuk **IDR** (Orders, Payouts, Invoicing; eksponen yang dipakai PayPal). 2. Mata uang lain yang didukung PayPal (untuk pengembangan registri). 3. Mekanisme periode anggaran 1.2 (UTC vs zona waktu mandat) dan penyimpanan `period` pada reservasi. 4. Status fitur Tier B/C 1.2 di repo (registrasi, reset, TOTP, undangan, CSV, email outbox, UI ID, hapus org). 5. Dukungan `Intl.NumberFormat` string desimal pada peramban target (Chrome/Firefox/Safari/Edge dua versi terakhir) dan fallback. 6. `Intl.supportedValuesOf('timeZone')` di Node 22 pada host cPanel. 7. Ketersediaan SMTP di host cPanel (port, batas kirim). 8. Skema aktual `sessions`, `email_tokens`, `notifications`, `audit_events`. 9. Zod versi terpasang (untuk skema registri). 10. Lisensi dan kelayakan `nodemailer` (atau transport SMTP alternatif).

## 19. Risiko
| Risiko | Mitigasi |
|---|---|
| Ekstraksi i18n mengubah teks/tata letak | Golden teks + geometri, pseudo-locale, PR bertahap per modul |
| IDR tidak didukung PayPal | Kapabilitas per mata uang; IDR tetap sah untuk pembukuan; pesan jujur |
| Tema gelap merusak parity PayPal | Default terang; rute parity tetap terang; baseline visual gelap terpisah; flag |
| Reset password disalahgunakan (enumerasi, spam) | Respons/waktu setara, rate limit ganda, token terikat email |
| Tur rusak saat UI berubah | Guard E2E; target `data-tour` terdaftar; CI gagal |
| Konten bantuan basi | `updated` + cakupan wajib + paket fitur wajib menyertakan artikel/tur (aturan "doc-with-feature") |
| Email tak terkirim di cPanel | Status transport jujur, `SUPPRESSED`, banner untuk OWNER |
| Klaim kepatuhan berlebihan | Templat berlabel, tabel klaim→bukti, larangan kata tertentu (grep) |
| Pengaturan keamanan mengunci OWNER sendiri | Kebijakan berlaku di login berikutnya, pemulihan via reset + kode pemulihan, tes skenario |
