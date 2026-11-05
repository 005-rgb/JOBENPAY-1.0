# LAPORAN ANALISIS KESENJANGAN PRD v1.2 VS CODEBASE AKTIF
**JOBENPAY — AI Agent Financial Gateway & Tamper-Evident Ledger**
*Status Dokumen: 5 November 2026 | Berdasarkan: `JOBENPAY_PRD_Technical_Blueprint_v1_2.md` & `docs/PROGRESS.md`*

---

## 1. Ringkasan Eksekutif & Persentase Kelulusan

Berdasarkan perbandingan menyeluruh antara **PRD & Technical Blueprint v1.2** dengan **kondisi repositori aktif** (`server/`, `web/`, migrasi basis data, dan 280 pengujian otomatis), berikut adalah ringkasan tingkat penyelesaian proyek:

| Kategori Lingkup | Definisi PRD (Bagian 4.4) | Jumlah Fitur | Selesai 100% | Parsial / Belum | % Penyelesaian |
|---|---|---|---|---|---|
| **Tier A (Wajib MVP)** | Komitmen utama lomba/hackathon (100 jam) | 39 fitur | **39 fitur** | 0 fitur kode (2 item operasional riil) | **100% (Kode)** / **95% (DoD Operasional)** |
| **Tier B (Bonus / Stretch)** | Fitur tambahan bernilai tinggi | 11 fitur | **2 fitur** | 9 fitur | **18,2%** |
| **Tier C (Roadmap / Masa Depan)**| Fitur jangka panjang di luar siklus lomba | 6 fitur | 0 fitur | 6 fitur | **0%** (Sesuai rencana) |
| **Total Keseluruhan** | Seluruh arsitektur M1–M13 | 56 fitur | **41 fitur** | 15 fitur | **73,2%** |

> [!NOTE]
> **Status Tier A:** Seluruh fungsionalitas kode inti yang dijanjikan di Devpost (Tier A) telah **100% selesai dibangun**, memenuhi ambang batas cakupan pengujian (90,19% branch coverage, 280/280 tes lolos tanpa skip, 0 pelanggaran lint/guard), dan Landing Page publik `/` telah aktif dengan integrasi token murni.
>
> Hal yang belum selesai 100% di codebase terbagi menjadi dua kategori:
> 1. **Kesiapan Operasional Tier A**: Verifikasi akun PayPal Developer Sandbox riil (`real:preflight`) dan deployment ke hosting cPanel Passenger (`nh.jobenapp.cloud`) dengan basis data PostgreSQL TLS produksi (terkendala kredensial eksternal pemilik).
> 2. **Modul Tier B (Bonus)**: Fitur-fitur tambahan seperti Dispute Defense (M10), Manajemen Anggota (FR-106), Reset Password (FR-103), TOTP 2FA (FR-104), Ekspor CSV (FR-1206), dan Terjemahan Bahasa Indonesia (FR-1207).

---

## 2. Matriks Status Lengkap Modul Arsitektur (M1 – M13)

| Modul | Nama Modul | Cakupan PRD | Status Codebase | Catatan Kesenjangan / Belum Selesai |
|---|---|---|---|---|
| **M1** | Identitas & Multi-tenant | FR-101 s/d FR-106 | **80% Selesai** | FR-101 (Register), FR-102 (Login/Lockout), FR-105 (Org Tenant) **SELESAI**.<br>• *FR-103 (Reset Password)*: Belum ada UI/API.<br>• *FR-104 (TOTP 2FA)*: Belum ada.<br>• *FR-106 (Undang/Kelola Anggota)*: Halaman `/organization` & `/members` masih placeholder `ComingSoonPage`. |
| **M2** | Koneksi PayPal Sandbox | FR-201 s/d FR-204 | **100% Selesai** | Kredensial AES-256-GCM, uji koneksi, webhook token unik, rotasi/hapus kredensial teruji 100%. Tinggal eksekusi live via akun Sandbox nyata. |
| **M3** | Agen & Kunci API | FR-301 s/d FR-303 | **100% Selesai** | CRUD Agen, pembentukan API Key dengan SHA-256 HMAC & prefix, rotasi, revoke dengan step-up, isolasi tenant 100% teruji. |
| **M4** | Mandat Keuangan | FR-401 s/d FR-405 | **100% Selesai** | AI draft dari bahasa alami, editor skema Zod, versi immutable bertanda tangan Ed25519, pelacakan anggaran paralel atomik 100% selesai. |
| **M5** | Payee & Dokumen | FR-501 s/d FR-505 | **100% Selesai** | Payee HMAC + enkripsi, deteksi perubahan rekening, upload PDF/gambar dengan verifikasi magic bytes & SHA-256, ekstraksi AI asinkron, deteksi injeksi prompt heuristik + AI. |
| **M6** | Gerbang Keputusan | FR-601 s/d FR-607 | **85% Selesai** | Fungsionalitas **PAYOUT (Tier A)** 100% selesai (Rules A1-A13, B, Stage C fail-closed, reservasi atomik).<br>• *FR-601 (REFUND & ACCEPT_DISPUTE - Tier B)*: Masih stub 501 `NOT_IMPLEMENTED`. |
| **M7** | Persetujuan Manusia | FR-701 s/d FR-704 | **90% Selesai** | Inbox approval, detail request_hash binding, step-up di atas ambang batas, four-eyes, kedaluwarsa otomatis, in-app notification **SELESAI**.<br>• *FR-704 (Email Approval)*: Trigger email ke approver belum terhubung ke worker outbox. |
| **M8** | Eksekusi & Rekonsiliasi | FR-801 s/d FR-805 | **100% Selesai (Payout)** | Eksekusi idempoten (`PayPal-Request-Id` stabil), worker SKIP LOCKED dengan backoff & dead-letter, verifikasi tanda tangan webhook, rekonsiliasi RECONCILED/MISMATCH, recovery tanpa double payout teruji 100%. |
| **M9** | Ledger Berantai-Hash | FR-901 s/d FR-903 | **90% Selesai** | Hash-chain kanonik SHA-256, tanda tangan Ed25519, verifikasi integritas 7 org + deteksi 6 tamper classes, penjelajah virtualized ledger UI, ekspor JSON **SELESAI**.<br>• *FR-902/FR-1206*: Ekspor CSV belum didukung (ditolak jika bukan JSON). |
| **M10** | Dispute Defense | FR-1001 s/d FR-1004 | **0% (Tier B/C)** | *Belum dibangun*:<br>• Rute frontend `/disputes` berstatus `comingSoon: true`.<br>• Backend belum memiliki rute `/api/v1/disputes`, webhook `CUSTOMER.DISPUTE.*`, maupun AI synthesizer berkas sengketa. |
| **M11** | Gateway Agen & Simulator | FR-1101 s/d FR-1104 | **100% Selesai** | REST Agent API, Server MCP Streamable HTTP (3 tools: `propose_payout`, `get_request_status`, `get_budget_status`), Simulator dengan 6 paket skenario serangan + kasus valid, dokumentasi developer terintegrasi. |
| **M12** | Operasional & UI Dasar | FR-1201 s/d FR-1208 | **80% Selesai** | Dashboard ringkasan, Payment timeline, Kill switch org freeze / agent disable, audit log listing, seed sintetis, layout responsif **SELESAI**.<br>• *FR-1206*: Laporan CSV belum aktif.<br>• *FR-1207*: Terjemahan bahasa Indonesia (`id`) masih `{ translation: {} }`. |
| **M13** | Design Parity & Landing | FR-1301 s/d FR-1307 | **100% Selesai** | Token CSS murni, AppShell S1 parity, footer S2 parity, label SANDBOX permanen, rute dev `/__parity/s1` & `s2`, Landing Page publik `/` (Hero, 5 steps, 3 cards, 4 facts, try guide, honest limits, tombol login). |

---

## 3. Rincian Kesenjangan Sumber Daya (Source Code & Modul Belum Selesai)

### 3.1. Antarmuka Pengguna (Web Frontend)
1. **Halaman `/disputes` (M10)**:
   - Terdaftar di menu sidebar `AppShell.jsx` baris 61 dengan bendera `comingSoon: true`.
   - Mengarahkan ke komponen `ComingSoonPage` di `FeaturePages.jsx:504`.
   - *Kebutuhan*: Komponen `DisputesPage` & `DisputeDetailPage` (daftar sengketa, status sengketa, form telaah bukti AI, tombol *Accept Claim* / *Submit Evidence*).
2. **Halaman `/organization` dan `/members` (FR-106)**:
   - Terdaftar di menu sidebar `AppShell.jsx` baris 79–80, namun belum memiliki rute di `<Routes>` pada `App.jsx`, sehingga jatuh ke `ComingSoonPage`.
   - *Kebutuhan*: Komponen `OrganizationPage` (profil org, slug) dan `MembersPage` (daftar anggota, tombol undang anggota via email, modal ubah peran OWNER/ADMIN/APPROVER/OPERATOR/VIEWER, tombol cabut akses).
3. **Alur Reset Password (FR-103)**:
   - Halaman `/login` belum menyediakan tautan *"Forgot password?"*.
   - *Kebutuhan*: `ForgotPasswordPage.jsx` (form input email) dan `ResetPasswordPage.jsx` (form input token email + password baru).
4. **Pengaturan TOTP 2FA di `SecurityPage` (FR-104)**:
   - Saat ini `SecurityPage.jsx` hanya memuat kartu *Kill Switch* (Freeze/Unfreeze).
   - *Kebutuhan*: Kartu *Two-Factor Authentication* (tombol aktifkan, dialog pemindaian kode QR `otpauth://`, input kode 6-digit untuk verifikasi pertama, dan tombol nonaktifkan dengan step-up).
5. **Ekspor CSV pada `LedgerPage` (FR-1206)**:
   - Tombol ekspor di `LedgerPage.jsx` hanya mengunduh format JSON. Belum ada opsi ekspor CSV.
6. **Kamus Bahasa Indonesia di `web/src/i18n.js` (FR-1207)**:
   - Nilai untuk bahasa `id` adalah `{ translation: {} }`.
   - Item menu pemilihan bahasa di `AppShell.jsx:301` dinonaktifkan (`Indonesian – Coming soon`).

### 3.2. Layanan Backend & Rute API (Server)
1. **Rute & Modul Sengketa (M10)**:
   - Belum ada berkas repositori/servis `server/src/services/disputes.js`.
   - Belum ada rute Express `/api/v1/disputes`.
   - Belum ada penanganan event webhook PayPal `CUSTOMER.DISPUTE.CREATED`, `CUSTOMER.DISPUTE.RESOLVED`, `CUSTOMER.DISPUTE.UPDATED`.
2. **Rute Manajemen Anggota (FR-106)**:
   - Belum ada endpoint:
     - `GET /api/v1/org/members`: Daftar anggota dalam tenant aktif.
     - `POST /api/v1/org/members/invite`: Kirim undangan email token sekali pakai.
     - `PATCH /api/v1/org/members/:id/role`: Ubah peran anggota (khusus OWNER).
     - `DELETE /api/v1/org/members/:id`: Hapus anggota dari organisasi.
3. **Rute Reset Password (FR-103)**:
   - Belum ada endpoint:
     - `POST /api/v1/auth/forgot-password`: Menerbitkan token reset ke outbox email dengan anti-enumerasi (HTTP 202).
     - `POST /api/v1/auth/reset-password`: Memverifikasi token, memperbarui scrypt hash kata sandi, dan membatalkan semua sesi aktif pengguna.
4. **Layanan TOTP 2FA (FR-104)**:
   - Belum ada modul pembuatan TOTP secret berbasis RFC 6238 dan verifikasi token TOTP (saat ini step-up hanya menggunakan password pengguna).
5. **Dukungan REFUND & ACCEPT_DISPUTE di Decision Engine (FR-601)**:
   - Rute `/api/v1/agent/v1/refund-requests` dan `/api/v1/agent/v1/dispute-accept-requests` di `server/src/app.js:910-914` mengembalikan HTTP 501.
   - Evaluator aturan A1–A13 saat ini mengasumsikan tipe aksi `PAYOUT`.
6. **Ekspor CSV pada `/api/v1/ledger/export` (FR-1206)**:
   - Baris 696 `server/src/app.js` melempar `VALIDATION_FAILED` jika `req.query.format !== 'json'`.
   - Belum ada generator streaming CSV (format kolom kanonik: `seq, created_at, type, entry_hash, prev_hash, signature, payload_summary`).
7. **Pemicu Email Persetujuan pada Worker Outbox (FR-704)**:
   - Saat payment request masuk ke status `PENDING_APPROVAL`, sistem sudah mencatat notifikasi in-app, tetapi belum memanggil `enqueueEmail(...)` untuk mengirimkan ringkasan usulan ke alamat email pengguna dengan peran APPROVER/OWNER.

---

## 4. Rencana Pemenuhan Modul & Jadwal Eksekusi Sistematis

### FASE 1: Penyelesaian Kesiapan Operasional Tier A (Prioritas Mutlak)
1. **Uji Nyata Sandbox PayPal (`real:preflight`)**:
   - Dapatkan kredensial developer aktif (`PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`), jalankan `node server/scripts/real-preflight.js`, simpan bukti ekspor ter-redaksi.
2. **Deployment cPanel Passenger & Database Produksi**:
   - Pastikan Node 22 aktif, setup environment variables dengan `sslmode=require`, jalankan migrasi, dan verifikasi endpoint `/readyz`.

### FASE 2: Fungsionalitas Bonus Bernilai Cepat (Quick Wins Tier B)
1. **Lengkapkan Kamus Bahasa Indonesia (`web/src/i18n.js` - FR-1207)**: Aktifkan dwibahasa EN/ID penuh tanpa merusak token.
2. **Dukungan Ekspor CSV pada Ledger (`FR-1206` / `FR-902`)**: Tambahkan streaming CSV aman formula injection di backend & tombol ekspor di frontend.
3. **Pemicu Email Persetujuan (`FR-704`)**: Hubungkan event `PENDING_APPROVAL` ke antrean worker email SMTP.

### FASE 3: Penyempurnaan Manajemen Identitas & Anggota
1. **Reset Password via Email (FR-103)**: Rute API token reset + halaman `ForgotPasswordPage` & `ResetPasswordPage`.
2. **Manajemen Organisasi & Anggota (FR-106)**: Rute API anggota org + halaman `OrganizationPage` & `MembersPage`.
3. **TOTP Two-Factor Authentication (FR-104)**: Setup kode QR + verifikasi 6 digit RFC 6238.

### FASE 4: Pembelaan Sengketa (M10 Dispute Defense) & Aksi Tambahan
1. **Model Data & Webhook Sengketa**: Migrasi `disputes` & handler webhook PayPal.
2. **AI Dispute Synthesizer & Halaman UI**: `disputeDefense.js` & `DisputesPage.jsx`.
3. **Ekspansi Engine REFUND & ACCEPT_DISPUTE**: Rules A1-A13 untuk aksi non-payout.

