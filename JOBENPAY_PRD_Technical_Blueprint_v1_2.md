# JOBENPAY — PRD & Technical Blueprint v1.2

**Produk:** JOBENPAY — gerbang mandat untuk aksi uang keluar oleh agen AI di PayPal Sandbox
**Nama aplikasi:** JOBENPAY (final) · **Tanggal:** 30 Oktober 2026 · **Status:** baseline implementasi v1.2 (menggantikan v1.0 (nama kerja "MandateGuard") dan v1.1) · **Skor mandiri dokumen: 96/100 (Bagian 20)**
**Target lomba:** PayPal AI Hackathon — submit paling lambat 12 Nov 2026, 12:00 PST (= 13 Nov 2026, 03:00 WIB); **target internal submit 11 Nov 2026, 21:00 WIB**. Aturan resmi dibaca langsung pada 30 Okt 2026: paypalaihackathon.devpost.com/rules
**Stack:** **JavaScript (ES2023) di Node.js 22 LTS** + PostgreSQL 13+ · Frontend React 18 + Vite (JavaScript/JSX) · **UI memakai pola dan metrik PayPal Business, profil parity P1 (Bagian 12)** · **Deploy:** cPanel (Setup Node.js App + PostgreSQL Databases)

---

## 0. Cara membaca dokumen dan batasan kejujuran

- Dokumen ini adalah **spesifikasi lengkap** (produk, arsitektur, data, API, keamanan, pengujian, deployment, acceptance criteria). Ia bukan kode jadi. Kode dibangun per paket kerja dan gerbang (Bagian 16); sebuah gerbang dianggap lulus hanya jika seluruh kriterianya terpenuhi.
- **Hanya PayPal Sandbox.** Tidak ada uang asli dan tidak ada kredensial live. Larangan ini ditegakkan di kode (Bagian 9.10) dan diuji di CI.
- Nama endpoint, event webhook, dan field PayPal di dokumen ini ditulis dari pengetahuan umum tentang PayPal REST API dan **wajib dicocokkan dengan dokumentasi resmi saat implementasi**. Ditandai **\[VERIFY\]**; daftar lengkap ada di Bagian 17.2.
- «Mandat» di produk ini terinspirasi pola Intent/Payment Mandate pada AP2, tetapi **bukan implementasi AP2** dan tidak boleh diklaim compliant kecuali spesifikasinya benar-benar diimplementasikan.
- Persetujuan (aktivasi mandat dan approval) ditandatangani oleh **server** setelah step-up (password/TOTP). Itu bukti terikat-akun, bukan tanda tangan kriptografi yang dipegang klien. Penandatanganan sisi klien (WebAuthn) di luar MVP.
- Tidak ada klaim pasar, statistik kerugian, atau angka performa sebelum diukur. Semua angka adalah **target uji**, bukan hasil.
- Semua data demo sintetis dan diberi label.
- **Perubahan v1.2 (ringkas):** (1) cakupan dibagi **Tier A (wajib selesai, 100 jam)**, Tier B (bonus), Tier C (roadmap), lengkap dengan anggaran jam, gerbang harian, dan tangga pemangkasan (Bagian 4.4, 16); (2) **kepatuhan aturan resmi lomba** dipetakan satu-satu dengan pemilik dan tanggal (Bagian 19); (3) UI memakai **profil parity P1**: metrik dan pola PayPal Business sama, identitas merek berbeda (Bagian 12.1); (4) **bukti masalah bersumber** dan posisi terhadap AP2 (Bagian 1.1); (5) koreksi teknis: CSP, protokol uji parity, spike kemampuan Sandbox di jam pertama (Bagian 13.2, 12.11, 16); (6) akses juri, kontrol biaya AI, dan hosting sampai masa penjurian (Bagian 9.11, 15.11); (7) rubrik skor mandiri berbukti (Bagian 20). Jejak lengkap: Bagian 18.
- **Perubahan v1.1:** nama JOBENPAY, runtime JavaScript di Node.js 22, design system Bagian 12, dan Bagian 10–18 yang dirujuk v1.0 tetapi belum ditulis.
- **Batas parity UI (jujur):** kesamaan dikejar pada tata letak, ukuran, warna fungsional, tipografi, bentuk komponen, state, dan interaksi, dan diuji otomatis. Logo/nama PayPal, font berlisensi PayPal Sans, ikon dan teks bermerek **tidak** disalin (Bagian 12.1) karena aturan lomba mewajibkan submission tidak melanggar hak merek pihak lain. Acuan visual saat ini dua tangkapan layar (Lampiran A); area lain bertanda **INFERRED** sampai ada tangkapan tambahan (Bagian 12.12).

## 1. Ringkasan produk

**Masalah.** Agen AI mulai diberi akses pembayaran, dan aksesnya biasanya all-or-nothing: token yang bisa membaca transaksi juga bisa mengirim uang. Kegagalan yang harus dicegah: agen dibujuk lewat instruksi tersembunyi di dokumen (prompt injection), salah membaca nominal atau penerima, membayar invoice yang sama dua kali, atau membayar rekening yang diganti penipu (pola invoice fraud). Tanpa jejak bukti, bisnis juga sulit membela diri saat terjadi sengketa.

**Solusi.** JOBENPAY adalah lapisan kontrol di antara agen AI mana pun dan akun bisnis PayPal. Agen hanya boleh **mengusulkan** aksi uang keluar (payout, refund, menerima klaim sengketa). Setiap usulan melewati:

1. **Mandat** bertanda tangan yang ditetapkan manusia (anggaran, batas, payee, jadwal);
2. **Gerbang aturan deterministik** (keputusan akhir ada di kode, bukan di LLM);
3. **Pemeriksaan niat dan anomali oleh AI** yang hanya boleh memperketat;
4. **Persetujuan manusia** bila diperlukan;
5. **Eksekusi idempoten** ke PayPal Sandbox;
6. **Rekonsiliasi** lewat webhook (niat vs hasil);
7. **Ledger berantai-hash** yang dapat diverifikasi, dipakai juga untuk menyusun bukti sengketa.

**Diferensiasi.** Bukan agen belanja atau dashboard transaksi lain. Ini lapisan kepercayaan yang model-agnostik dan protokol-agnostik: agen apa pun (klien MCP atau REST) dapat memakainya, dan nilainya tetap ada apa pun model atau standar pembayaran agen yang akhirnya dominan.

### 1.1 Bukti masalah dan posisi terhadap solusi yang ada (diakses 30 Okt 2026)

| Fakta | Nilai | Sumber |
| --- | --- | --- |
| Kerugian business email compromise (BEC) yang dilaporkan ke FBI IC3 pada 2025 | US$3.046.598.558 dari 24.768 aduan; kategori kerugian terbesar kedua setelah investment fraud (US$8,65 miliar) | Laporan Tahunan IC3 2025 (dirilis 6 Apr 2026); ringkasan: dmarcian.com/fbi-internet-crime-report-2025, startbusinessbystate.com/?p=21813, alstonprivacy.com |
| Modus BEC | Peniru bos/vendor/staf mengalihkan pembayaran lewat email dan faktur palsu; sebagian besar kerugian BEC mengalir lewat transfer kawat | paubox.com (ringkasan IC3 2025), cyberscoop.com (laporan IC3) |
| Aduan IC3 2025 yang menyebut AI | ±22.000 aduan, ±US$893 juta; hanya mencakup korban yang tahu atau menduga AI dipakai | therecord.media, startbusinessbystate.com |
| AP2 (Agent Payments Protocol) | Diumumkan Google 16 Sep 2025 bersama 60+ mitra termasuk PayPal; memakai Mandate bertanda tangan (Intent, Cart, Payment) untuk transaksi yang dipimpin agen | eco.com/support/en/articles/15192002, docs.connect.worldline-solutions.com |

**Wajib [VERIFY primer]:** angka IC3 di atas diambil dari ringkasan sekunder; sebelum dipakai di video atau deskripsi Devpost, cocokkan dengan PDF resmi IC3 2025 di ic3.gov dan catat halamannya.

**Disiplin klaim (P9).** Angka BEC adalah penipuan yang menargetkan manusia, **bukan** statistik kegagalan agen AI. Argumen JOBENPAY adalah ekstrapolasi yang masuk akal: agen yang membaca faktur dan memegang akses pembayaran menghadapi taktik pengalihan rekening yang sama, ditambah prompt injection lewat dokumen. Tidak ada angka kerugian agen yang diklaim.

**Posisi terhadap AP2.** AP2 menstandarkan otorisasi pembelian yang dilakukan agen lintas ekosistem pembayaran. JOBENPAY melengkapi, bukan bersaing: ia menegakkan batas pada **uang keluar dari akun bisnis** (payout, refund, penerimaan klaim sengketa) di PayPal Sandbox lewat gerbang deterministik, pemeriksaan niat AI yang hanya boleh memperketat, persetujuan manusia, dan ledger yang bisa diverifikasi. Seperti ditegaskan di Bagian 0, ia terinspirasi pola mandat tetapi bukan implementasi AP2.

## 2. Prinsip desain (tidak boleh dilanggar)

| # | Prinsip | Konsekuensi implementasi |
| --- | --- | --- |
| P1 | Gerbang deterministik adalah keputusan akhir; AI hanya memperketat | AI tidak pernah mengubah REJECT/REQUIRE\_APPROVAL menjadi AUTO\_APPROVE |
| P2 | Fail-closed | AI timeout, JSON tidak valid, atau PayPal tidak terjangkau → minta persetujuan manusia atau tolak, tidak pernah auto-approve |
| P3 | Sandbox-only by construction | Base URL PayPal berupa konstanta; konfigurasi non-sandbox membuat aplikasi gagal start |
| P4 | Setiap keputusan berbukti | Tiap perubahan status penting menulis entri ledger berantai-hash |
| P5 | Least privilege | Agen mengusulkan, tidak pernah mengeksekusi; kredensial PayPal tidak pernah terlihat oleh agen maupun LLM |
| P6 | Otoritas manusia | Aktivasi mandat dan approval nominal besar membutuhkan step-up |
| P7 | Uang bergerak idempoten dan terekonsiliasi | Idempotency key + status terdurabel + webhook reconcile; tidak ada double payout setelah crash |
| P8 | Semua input eksternal tidak tepercaya | Dokumen, teks agen, dan respons PayPal diperlakukan sebagai data, bukan instruksi |
| P9 | Klaim jujur | Tidak ada klaim kepatuhan, pasar, atau akurasi tanpa pengukuran |

## 3. Persona dan peran

- **Maya — pemilik keuangan agensi kecil (OWNER/ADMIN).** Ingin mendelegasikan pembayaran rutin ke agen AI tanpa kehilangan kendali.
- **Dani — developer integrator (OPERATOR).** Menghubungkan agen buatannya (MCP/REST) dan butuh kontrak API yang jelas serta pesan penolakan yang bisa diperbaiki.
- **Rina — akuntan/approver (APPROVER).** Menyetujui pembayaran berisiko; butuh konteks lengkap dalam satu layar.
- **Auditor (VIEWER).** Hanya membaca ledger, audit, dan laporan.

| Peran | Ringkasan hak |
| --- | --- |
| OWNER | Semua hak, termasuk hapus organisasi, kredensial PayPal, kill switch |
| ADMIN | Kelola anggota, agen, mandat, payee, kill switch; tidak bisa hapus organisasi |
| APPROVER | Memutuskan approval; lihat semua data operasional |
| OPERATOR | Kelola agen, dokumen, payee (draft), jalankan simulator; tidak bisa approve atau aktivasi mandat |
| VIEWER | Baca saja |

Matriks izin rinci: Bagian 13.3.

## 4. Ruang lingkup MVP

### 4.1 Modul dalam arsitektur (M1–M13; yang wajib selesai ditentukan Tier pada 4.4)

| Modul | Isi |
| --- | --- |
| M1 | Identitas, organisasi (tenant), anggota, peran, 2FA TOTP |
| M2 | Koneksi PayPal Sandbox (kredensial terenkripsi, tes koneksi, webhook) |
| M3 | Agen dan API key |
| M4 | Mandat: NL→policy, versioning immutable, tanda tangan, anggaran |
| M5 | Payee dan dokumen (upload, ekstraksi invoice, deteksi injeksi) |
| M6 | Gerbang keputusan (aturan + AI) |
| M7 | Persetujuan manusia |
| M8 | Eksekusi, webhook, rekonsiliasi |
| M9 | Ledger bukti berantai-hash |
| M10 | Dispute defense |
| M11 | Gateway agen (REST + MCP) dan Agent Simulator |
| M12 | Dashboard, notifikasi, laporan, audit, kill switch |
| M13 | Design system dan UI parity PayPal Business (Bagian 12) |

### 4.2 Di luar cakupan

PayPal live atau uang asli; KYC/AML; konversi FX; checkout sisi pembeli; aplikasi mobile; SSO/SAML; penagihan/billing produk; tanda tangan WebAuthn sisi klien; kepatuhan penuh AP2; klaim «anti-fraud lengkap».

### 4.3 Asumsi dan batasan lingkungan

- cPanel menjalankan Node.js lewat Passenger: proses bisa di-idle atau di-restart, WebSocket tidak dapat diandalkan, tidak ada Redis, dan batas memori/proses ketat. Konsekuensinya: antrean di PostgreSQL, polling alih-alih WebSocket, tanpa dependensi native.
- PostgreSQL ≥ 13 (butuh `gen_random_uuid()` bawaan). Jika host tidak menyediakan PostgreSQL, gunakan PostgreSQL terkelola eksternal dengan TLS (Bagian 15.9).
- **Node.js 22** harus dipilih pada Setup Node.js App (CloudLinux Node.js Selector). Jika versi 22 tidak tersedia di host, proyek **tidak diturunkan ke versi lama**; gunakan host/VPS yang menyediakan Node 22 (Bagian 15.2).
- Sandbox PayPal punya batas perilaku (mis. simulasi dispute, penundaan reporting); fitur terkait punya fallback di Bagian 17.

### 4.4 Tier cakupan, kapasitas, dan definisi "selesai"

**Prinsip.** Arsitektur penuh (M1–M13) dipertahankan agar desain tidak berubah, tetapi **hanya Tier A yang wajib selesai dan dijanjikan kepada juri**. Tier B hanya dikerjakan bila gerbang G3 tercapai ≥ 6 jam lebih cepat dari rencana. Tier C tidak dikerjakan pada siklus lomba dan ditulis sebagai roadmap di README.

| Tier | Isi (ID requirement Bagian 7) | Status |
| --- | --- | --- |
| **A — wajib (100 jam)** | FR-102 (login, sesi, lockout; akun seed, tanpa registrasi publik) · FR-105 (satu organisasi demo + tenant model) · FR-201–203 · FR-301–303 · FR-401–405 · FR-501–505 · FR-601 (**PAYOUT saja**) · FR-602–607 · FR-701–703 (approve/reject, step-up password) · FR-801–805 (payout) · FR-901–903 · FR-1101–1104 (REST + MCP 3 tool: `propose_payout`, `get_request_status`, `get_budget_status`) · FR-1201–1204 (dashboard, request, kill switch, audit minimal) · FR-1207 (EN + responsif) · FR-1208 · FR-1301–1307 | Dijanjikan di Devpost |
| B — bonus | FR-101, 103, 104 (registrasi, reset, TOTP) · FR-106, 204 · FR-601 REFUND/ACCEPT\_DISPUTE · FR-704 (email) · FR-1001–1003 (dispute sinkron + draft kasus AI) · FR-1206 (CSV) · i18n ID · ledger memakai AG Grid bertema (kandidat hadiah sponsor, Bagian 19) · korpus AI-eval 30 + 30 · tool MCP tambahan | Hanya bila ahead ≥ 6 jam di G3; dibekukan di G4 |
| C — roadmap | FR-1004 (pengingat), FR-1205 (outbox email penuh), four-eyes, hapus organisasi, peran ADMIN/OPERATOR penuh di UI, WebAuthn | Ditulis di README sebagai "What's next" |

Aturan Bagian 9.5 yang bergantung target PayPal untuk REFUND/ACCEPT\_DISPUTE (rule 8) aktif di Tier B. Peran Tier A: OWNER, APPROVER, VIEWER, dan preset JUDGE (Bagian 13.3); skema data tetap mendukung lima peran.

**Definisi "real work".** Setiap eksekusi uang yang ditampilkan di demo dan video adalah **panggilan nyata ke PayPal Sandbox**, bukan mock. Mode `replay` AI hanya untuk CI dan evaluasi offline, selalu diberi banner permanen "REPLAY MODE" di UI.

**Definisi "completed".** Bagian 16.7 (Definition of Done Tier A).

**Kapasitas.** Asumsi: 1 pengembang dengan asisten pengodean AI, ±10 jam/hari termasuk akhir pekan. Kapasitas 30 Okt–11 Nov ≈ 123 jam; Tier A dianggarkan 100 jam (±81%); sisa ≈ 23 jam sebagai penyangga. Estimasi jam adalah target yang dikalibrasi ulang di G1 (Bagian 16.6), bukan hasil ukur.

## 5. Metrik keberhasilan (target uji)

| # | Metrik | Target Tier A | Target Tier B | Cara ukur |
| --- | --- | --- | --- | --- |
| 1 | Korpus serangan (injeksi dokumen, rekening diganti, nominal digelembungkan, payee mirip, duplikat, instruksi tersembunyi) | ≥ 12 kasus, 2 per jenis; 0 AUTO\_APPROVE | ≥ 30 kasus; 0 AUTO\_APPROVE | Suite AI-eval + rules |
| 2 | Korpus sah dalam mandat | ≥ 12 kasus; ≥ 11 AUTO\_APPROVE (≥ 90%) | ≥ 30 kasus; ≥ 90% | Suite AI-eval |
| 3 | Double payout | 0 pada 100 permintaan duplikat paralel + 1 crash worker | 0 pada 200 | Uji konkurensi |
| 4 | Budget overshoot | 0 pada 50 permintaan paralel | sama | Uji konkurensi |
| 5 | Ledger | 100% valid setelah seluruh suite; tamper 100% terdeteksi | sama | Uji integrasi |
| 6 | Webhook → RECONCILED/MISMATCH | 100% pada event uji; 1 alur Sandbox nyata end-to-end terekam | sama | Uji integrasi + rekaman |
| 7 | Latensi keputusan tanpa AI | p95 < 300 ms | sama | Uji beban ringan |
| 8 | Setup dari repo bersih sampai demo berjalan | ≤ 10 menit (`docker compose` + mode replay) | sama | Uji dokumentasi |
| 9 | Kesiapan juri | Login akun juri → skenario simulator end-to-end ≤ 5 menit; `judge-smoke` hijau | sama | Skrip smoke (14.10) |
| 10 | Ketersediaan demo hosting | Smoke sukses ≥ 99% pemeriksaan 9 Nov–15 Des (target uji) | sama | Pemantau + smoke |
| 11 | Cold start | p95 ≤ 3 detik berkat keep-alive | sama | Uji harian |
| 12 | UI parity | Geometri 100% dalam toleransi pada S1/S2; selisih struktur piksel ≤ 3% (teks, logo, avatar, ikon dimask) | sama | Playwright terkunci (12.11) |
| 13 | Responsif dan aksesibilitas | 0 overflow horizontal; layar Tier A lulus visual 1366/1024/390; axe 0 pelanggaran serius | sama | Playwright + axe |
| 14 | Runtime dan lisensi | Boot gagal bila bukan Node 22; 0 file `.ts`; LICENSE terdeteksi GitHub; lisensi dependensi dalam allowlist; secret scan 0 temuan | sama | CI (14.8) |
| 15 | Biaya AI | ≤ batas harian (default US$5/hari); 0 kebocoran kunci | sama | Pemantau (9.11) |
| 16 | Video | < 3:00 (target 2:45), publik di YouTube, tanpa merek pihak ketiga atau musik berhak cipta | sama | Checklist 19.5 |
| 17 | Submission | Draft Devpost ≤ 5 Nov; final ≤ 11 Nov 21:00 WIB | sama | Checklist 19.1 |

## 6. User journey

**J1 — Onboarding dan koneksi PayPal.** Daftar → verifikasi email → buat organisasi → (opsional) aktifkan TOTP → masukkan Client ID/Secret Sandbox → tes koneksi → salin URL webhook ke dashboard developer PayPal dan simpan Webhook ID → status koneksi «Terhubung».

**J2 — Membuat mandat.** Buat agen dan API key (tampil sekali) → tulis tujuan dalam bahasa alami («bayar supplier tercatat maks $500 per transaksi, anggaran $3.000 per bulan, invoice wajib») → AI menghasilkan draft policy → pengguna meninjau diff dan mengedit → aktivasi dengan step-up → mandat ACTIVE bertanda tangan, entri ledger dibuat.

**J3 — Pembayaran otomatis.** Agen mengunggah/menautkan invoice → mengusulkan payout → gerbang: aturan lulus, payee TRUSTED, nominal di bawah ambang auto-approve, AI risiko rendah → AUTO\_APPROVE → worker mengeksekusi di sandbox → webhook sukses → RECONCILED. Seluruh langkah tampil di timeline.

**J4 — Persetujuan manusia.** Usulan lebih besar atau payee baru → PENDING\_APPROVAL → Rina menerima notifikasi (in-app + email) → membuka layar tunggal berisi usulan, dokumen, hasil evaluasi, riwayat payee → approve (dengan step-up bila di atas ambang) atau reject → eksekusi atau penutupan; approval hanya berlaku untuk request\_hash yang ia lihat.

**J5 — Serangan diblokir.** Invoice berisi instruksi tersembunyi dan rekening berbeda → ekstraksi menandai injeksi → agen tetap mengusulkan pembayaran → gerbang menolak/menahan dengan alasan yang terbaca manusia dan kode alasan untuk developer → ledger mencatat percobaan.

**J6 — Rekonsiliasi dan verifikasi.** Webhook masuk (tanda tangan diverifikasi) → dicocokkan dengan niat → RECONCILED atau MISMATCH (notifikasi + opsi freeze) → auditor menjalankan «Verifikasi ledger» dan mengekspor JSON/CSV.

**J7 — Pembelaan sengketa.** Dispute masuk lewat webhook atau sinkronisasi manual → AI menyusun kasus (rekomendasi ACCEPT/CONTEST/NEED\_INFO, rationale, paket bukti dari ledger + dokumen + data transaksi) → manusia mengedit dan meminta approval → submit evidence atau terima klaim → status dispute disinkronkan.

**J8 — Kontrol darurat.** Owner menekan kill switch → semua usulan baru ditolak dengan ORG\_FROZEN, request yang belum dieksekusi dibatalkan, key agen tetap ada → unfreeze dengan step-up. Rotasi API key agen dari halaman agen.

**J9 — Integrasi developer.** Dani menyalin konfigurasi MCP (URL + Bearer key) ke klien agennya → memanggil tool `propose_payout` → menerima keputusan terstruktur dengan reason codes → memperbaiki agen berdasarkan kode alasan.

## 7. Daftar fitur

Kolom tier tidak ditampilkan per baris; pemetaan Tier A/B/C ada di Bagian 4.4. Journey J1 pada Tier A memakai akun seed (OWNER, APPROVER, JUDGE) tanpa registrasi publik; J7 (dispute) adalah Tier B; J2–J6, J8, J9 adalah Tier A.

| ID | Requirement |
| --- | --- |
| **M1 Identitas** |  |
| FR-101 | Registrasi email+password (scrypt) dan verifikasi email |
| FR-102 | Login/logout, sesi server-side, cookie aman, lockout dan rate limit |
| FR-103 | Reset password via token email sekali pakai |
| FR-104 | TOTP 2FA opsional; step-up TOTP wajib bagi aksi sensitif jika TOTP aktif |
| FR-105 | Organisasi (tenant) dengan slug; satu user dapat menjadi anggota beberapa organisasi |
| FR-106 | Undang anggota via email; ubah peran; hapus anggota |
| **M2 PayPal** |  |
| FR-201 | Simpan kredensial Sandbox terenkripsi; tolak apa pun yang bukan sandbox |
| FR-202 | Tes koneksi (OAuth client credentials) dan tampilkan status |
| FR-203 | URL webhook unik per koneksi, simpan Webhook ID |
| FR-204 | Rotasi dan hapus kredensial |
| **M3 Agen** |  |
| FR-301 | CRUD agen; status ACTIVE/DISABLED |
| FR-302 | API key per agen: tampil sekali, hash disimpan, prefix, rotasi, revoke, last\_used |
| FR-303 | Agen hanya mengakses resource miliknya |
| **M4 Mandat** |  |
| FR-401 | Bahasa alami → draft policy terstruktur (AI) dengan validasi skema dan pratinjau diff |
| FR-402 | Editor policy manual dengan validasi |
| FR-403 | Versi immutable; aktivasi dengan step-up; tanda tangan Ed25519 server atas canonical policy |
| FR-404 | Suspend, revoke, expire; satu mandat ACTIVE per agen |
| FR-405 | Penggunaan anggaran real-time (reserved, spent, sisa) per periode |
| **M5 Payee dan dokumen** |  |
| FR-501 | CRUD payee; identifier terenkripsi + HMAC; trust PENDING\_REVIEW/TRUSTED/BLOCKED |
| FR-502 | Riwayat perubahan detail payee (deteksi rekening/email diganti) |
| FR-503 | Upload PDF/PNG/JPG/TXT ≤ 10 MB; validasi magic bytes; simpan di luar web root; SHA-256 |
| FR-504 | Ekstraksi invoice terstruktur (payee, nomor, jumlah, mata uang, jatuh tempo, item, catatan), async, divalidasi skema |
| FR-505 | Deteksi injeksi pada dokumen (heuristik + AI) → injection\_flags |
| **M6 Gerbang keputusan** |  |
| FR-601 | Propose untuk PAYOUT, REFUND, ACCEPT\_DISPUTE |
| FR-602 | Evaluasi deterministik dengan reason codes (Bagian 9.5) |
| FR-603 | Reservasi anggaran atomik |
| FR-604 | Deteksi duplikat (nomor invoice + payee + jumlah dalam jendela waktu) |
| FR-605 | Pemeriksaan niat dan anomali oleh AI terhadap tujuan mandat, invoice, dan riwayat |
| FR-606 | AI hanya memperketat; fail-closed |
| FR-607 | Keputusan AUTO\_APPROVE/REQUIRE\_APPROVAL/REJECT dengan penjelasan bahasa manusia |
| **M7 Persetujuan** |  |
| FR-701 | Inbox approval dan layar detail lengkap |
| FR-702 | Approve/reject + komentar; step-up di atas ambang; four-eyes opsional |
| FR-703 | Approval terikat request\_hash; kedaluwarsa otomatis; pembatalan |
| FR-704 | Notifikasi in-app dan email |
| **M8 Eksekusi** |  |
| FR-801 | Eksekusi Payout, Refund, Accept dispute dengan idempotency header dan ID batch deterministik |
| FR-802 | Retry terbatas dengan backoff; dead-letter |
| FR-803 | Receiver webhook: verifikasi tanda tangan, dedup event, proses async |
| FR-804 | Rekonsiliasi → RECONCILED/MISMATCH; polling fallback |
| FR-805 | Pemulihan crash tanpa double payout |
| **M9 Ledger** |  |
| FR-901 | Ledger append-only, berantai-hash, bertanda tangan Ed25519 |
| FR-902 | Verifikasi rantai (API + CLI) dan ekspor JSON/CSV |
| FR-903 | Tampilan ledger dengan filter/sort/cari (tabel virtual bergaya Activity PayPal, Bagian 12.4) |
| **M10 Dispute** |  |
| FR-1001 | Sinkronisasi dispute (webhook + manual) |
| FR-1002 | Draft kasus: rekomendasi, rationale, paket bukti |
| FR-1003 | Edit, approval, submit evidence atau accept claim |
| FR-1004 | Tenggat dispute dan pengingat |
| **M11 Gateway agen** |  |
| FR-1101 | REST agent API |
| FR-1102 | MCP server (Streamable HTTP, stateless) dengan tool terbatas |
| FR-1103 | Agent Simulator (agen internal lewat gerbang yang sama) + paket skenario serangan |
| FR-1104 | Contoh klien Node dan dokumentasi integrasi |
| **M12 Operasional** |  |
| FR-1201 | Dashboard ringkasan |
| FR-1202 | Daftar dan detail payment request dengan timeline |
| FR-1203 | Kill switch organisasi dan disable agen |
| FR-1204 | Audit events keamanan/admin |
| FR-1205 | Outbox email dan notifikasi in-app |
| FR-1206 | Laporan CSV (pembayaran, keputusan, ledger) |
| FR-1207 | UI dwibahasa EN/ID (default EN agar sama dengan acuan), responsif 360–1440 px, aksesibilitas dasar |
| FR-1208 | Seed demo idempoten, berlabel sintetis |
| **M13 Design system dan UI parity** |  |
| FR-1301 | Seluruh UI memakai design token Bagian 12.2; nilai literal warna/ukuran di luar token dilarang (lint) |
| FR-1302 | App shell mengikuti metrik acuan S1 (profil P1): sidebar 240 px, tombol Create, nav dengan chevron, header 72 px, ikon developer, lonceng berbadge, avatar inisial, tab Feedback |
| FR-1303 | Komponen inti (tombol pil, link bergaris bawah, input label-mengambang, select, kartu, Quick Access, tabel, status pill, modal, toast) memenuhi spesifikasi Bagian 12.4 pada semua state |
| FR-1304 | Footer identik dengan acuan S2 (baris tautan, pemilih negara/bahasa, hak cipta, baris legal) dengan teks JOBENPAY |
| FR-1305 | Label **SANDBOX** permanen di header dan pernyataan "bukan produk PayPal" di footer |
| FR-1306 | Rute dev-only `/__parity/s1` dan `/__parity/s2` merender ulang layar acuan untuk uji piksel; tidak ikut build produksi |
| FR-1307 | Tes geometri dan visual regression lulus di CI sebelum fase mana pun dinyatakan selesai |

## 8. Non-functional requirements

- **Keamanan:** Bagian 13. Tanpa dependensi native (scrypt, AES-GCM, Ed25519 dari modul `crypto` Node) agar aman di cPanel.
- **Performa (target uji):** endpoint baca p95 < 500 ms pada resource cPanel; keputusan tanpa AI p95 < 300 ms; polling UI 3–5 detik.
- **Keandalan:** semua state penting di PostgreSQL; job bisa dilanjutkan setelah restart; tidak ada pekerjaan yang hanya hidup di memori.
- **Observabilitas:** log JSON terstruktur (pino) dengan request ID dan redaksi; endpoint `/healthz` dan `/readyz`; metrik antrean di dashboard admin.
- **Aksesibilitas:** navigasi keyboard, label form, kontras WCAG AA, status tidak hanya lewat warna.
- **i18n:** ID dan EN; angka dan mata uang diformat per locale.
- **Kompatibilitas browser:** dua versi stabil terakhir Chrome, Firefox, Safari, Edge.
- **Retensi:** ledger dan audit tidak dihapus; dokumen dapat dihapus oleh Owner (hash tetap di ledger).

## 9. Arsitektur

### 9.1 Gambaran

```text
 Browser (React SPA) ──HTTPS──┐
 Agen / klien MCP ──Bearer────┤       cPanel (Apache/LiteSpeed + Passenger)
 PayPal webhook ──────────────┤
                              ▼
             ┌────────────────────────────────────────┐
             │ Node.js 22 · Express 5 · JavaScript    │
             │  HTTP: auth · CSRF · rate limit · Zod  │
             │  Services:                             │
             │   Mandate · Payee · Document           │
             │   Decision Engine (rules + AI)         │
             │   Approval · Execution · Reconcile     │
             │   Ledger (hash chain, Ed25519)         │
             │   Dispute Defense · MCP Gateway        │
             │  AI adapter  ·  PayPal client (sandbox)│
             │  Job worker (loop di proses yang sama) │
             └───────┬──────────────────┬─────────────┘
                     ▼                  ▼
               PostgreSQL 13+     Penyimpanan file privat
          (data, jobs, locks)     (di luar public_html)

 cPanel Cron tiap menit ──► node src/jobs/tick.js  (menguras antrean saat app idle)
```

### 9.2 Frontend

- **Stack:** React 18, Vite, **JavaScript (JSX), tanpa TypeScript**, React Router 6, TanStack Query 5, react-hook-form + Zod (skema dibagi dengan server lewat paket `shared/`), **CSS Modules + CSS custom properties** (design token Bagian 12.2), primitif headless Radix (Dialog, DropdownMenu, Popover, Tabs, Tooltip) yang di-skin penuh, `@tanstack/react-table` + `@tanstack/react-virtual` untuk tabel, Recharts/SVG kustom untuk grafik kartu performa, i18next, ikon outline SVG (24 px, stroke 1.5).
- **Keputusan v1.1:** Tailwind dan AG Grid dihapus dari v1.0 karena tampilan bawaan keduanya tidak dapat disamakan piksel-per-piksel dengan acuan PayPal tanpa menimpa hampir semuanya; token CSS + komponen sendiri memberi kendali penuh.
- **Rute:** `/login`, `/register`, `/onboarding`, `/dashboard` (= Home), `/agents`, `/agents/:id`, `/mandates`, `/mandates/new`, `/mandates/:id`, `/payees`, `/documents`, `/requests`, `/requests/:id`, `/approvals`, `/ledger`, `/disputes`, `/disputes/:id`, `/simulator`, `/settings/org`, `/settings/members`, `/settings/paypal`, `/settings/security`, `/audit`, `/developer` (ikon `</>`), dev-only: `/__parity/s1`, `/__parity/s2`.
- **State:** server state di TanStack Query; token CSRF dari `/auth/me`; tanpa token di localStorage (sesi memakai cookie HttpOnly).
- **Real-time:** polling terkontrol (approvals dan request aktif 3 detik, lainnya 15 detik, berhenti saat tab tersembunyi). SSE tidak dipakai karena buffering proxy cPanel tidak dapat diandalkan.
- **Build:** `vite build` → `web/dist` (dibuat di mesin lokal/CI lalu diunggah; build di cPanel tidak disyaratkan), disajikan oleh Express dengan cache panjang untuk aset ber-hash dan fallback SPA. Tidak ada inline script (kompatibel CSP ketat).
- **Layar kunci:** Mandate builder (NL + diff), Request detail (timeline + evaluasi + approval + eksekusi + ledger), Approval workbench, Ledger grid + tombol Verifikasi, Dispute workbench, Simulator dengan paket serangan. **Semua layar mengikuti Bagian 12.**

### 9.3 Backend

- **Runtime:** **Node.js 22 LTS (≥ 22.13), JavaScript ES2023 murni; tanpa TypeScript dan tanpa transpiler.** `package.json`: `"type": "module"`, `"engines": {"node": ">=22.13 <23"}`, `.nvmrc` = `22`. Passenger memuat `app.cjs` (bootstrap CommonJS satu baris) yang memanggil `import('./src/server.js')`, sehingga seluruh kode sumber ESM dan tidak ada langkah build server.
- **Tipe:** JSDoc + `// @ts-check` pada modul inti (hanya untuk editor, tidak dijalankan di CI produksi); Zod adalah sumber kebenaran tipe di runtime. Lint: ESLint + Prettier.
- **Fitur Node 22 yang dipakai:** `fetch` dan `AbortSignal.timeout` bawaan (tanpa axios/node-fetch), `node:test` (tanpa Jest/Vitest di server), `node:crypto` (scrypt, AES-256-GCM, Ed25519, HMAC), `node:util.parseArgs` (CLI), `import.meta.dirname`, `--env-file` dan `--watch` (hanya dev).
- **Framework:** Express 5; lapisan: `routes → controllers (Zod) → services → repositories (pg)`. Akses DB hanya lewat repository yang **mewajibkan `orgId`** sebagai argumen.
- **Transaksi:** helper `withTx(fn)`; operasi uang (reservasi anggaran, perubahan status + ledger) selalu dalam satu transaksi.
- **Error:** hierarki `AppError` dengan kode stabil; handler terpusat menghasilkan format error baku; tidak pernah membocorkan stack trace.
- **Logging:** pino JSON, `requestId`, redaksi (`authorization`, `cookie`, `client_secret`, `api_key`, `password`, `*_enc`).
- **Job worker:** Bagian 9.9.

### 9.4 Siklus hidup request dan state machine

```text
RECEIVED → EVALUATING ─┬→ REJECTED
                       ├→ PENDING_APPROVAL ─┬→ APPROVED
                       │                    ├→ REJECTED
                       │                    ├→ EXPIRED
                       │                    └→ CANCELLED
                       └→ APPROVED → EXECUTING ─┬→ EXECUTED ─┬→ RECONCILED
                                                │            └→ MISMATCH
                                                └→ FAILED
```

Aturan transisi ditegakkan di satu fungsi `transition(request, to, actor)` yang menolak transisi ilegal, menulis entri ledger, dan memperbarui reservasi anggaran dalam transaksi yang sama.

### 9.5 Decision Engine

**Masukan:** request, agen, organisasi, versi mandat, payee, ekstraksi dokumen, riwayat. **Sumber niat tepercaya:** teks tujuan mandat (ditulis manusia) dan invoice yang diunggah atau disahkan manusia. Instruksi dan alasan yang dibawa agen hanya dicatat sebagai **klaim tidak tepercaya**.

**Tahap A — gerbang keras (gagal → REJECT, tanpa panggilan AI):**

1. Organisasi tidak dibekukan (`ORG_FROZEN`).
2. Agen ACTIVE (`AGENT_DISABLED`).
3. Mandat ACTIVE, dalam masa berlaku, milik agen (`MANDATE_INACTIVE`, `MANDATE_EXPIRED`).
4. Aksi ada di `allowedActions` (`ACTION_NOT_ALLOWED`).
5. Mata uang diizinkan dan sama dengan mata uang anggaran (`CURRENCY_NOT_ALLOWED`).
6. Jumlah > 0 dan ≤ batas per transaksi (`CAP_EXCEEDED`).
7. Payee ada dan bukan BLOCKED (`PAYEE_BLOCKED`).
8. Target valid: REFUND → capture ada dan jumlah ≤ yang masih dapat di-refund; ACCEPT\_DISPUTE → dispute ada, status terbuka, jumlah cocok (`TARGET_INVALID`). Jika PayPal tidak terjangkau: coba ulang 3×, lalu REQUIRE\_APPROVAL dengan `PREFLIGHT_UNAVAILABLE`.
9. Dalam jendela jadwal (`OUTSIDE_TIME_WINDOW`).
10. Velocity: maksimum permintaan per jam dan payout per payee per hari (`VELOCITY_EXCEEDED`).
11. Bukan duplikat dalam jendela waktu (`DUPLICATE_SUSPECTED`).
12. Invoice: bila mandat mewajibkan, dokumen harus ada (`INVOICE_REQUIRED`); jumlah atau mata uang request berbeda dari ekstraksi → `INVOICE_MISMATCH_AMOUNT`.
13. Reservasi anggaran atomik (`BUDGET_EXCEEDED`).

**Tahap B — penanda yang memaksa persetujuan:** payee baru atau PENDING\_REVIEW (`PAYEE_NEW`); detail payee berubah dalam 30 hari (`PAYEE_CHANGED`); nama payee pada invoice berbeda (`INVOICE_PAYEE_MISMATCH`); jumlah ≥ `autoApproveBelowMinor` (`AMOUNT_REQUIRES_APPROVAL`); dokumen punya `injection_flags` (`DOC_INJECTION_SUSPECTED`).

**Tahap C — AI (bila `ai.intentCheck` aktif):** keluaran terstruktur `{riskScore 0–100, intentMatch MATCH|PARTIAL|MISMATCH, anomalies[], injectionSuspected, explanation}`.

- `riskScore ≥ blockOnRiskAtOrAbove` → REJECT (`AI_HIGH_RISK`).
- `riskScore ≥ escalateOnRiskAtOrAbove`, `intentMatch ≠ MATCH`, atau `injectionSuspected` → REQUIRE\_APPROVAL (`AI_INTENT_MISMATCH`, `AI_INJECTION_SUSPECTED`, `AI_ANOMALY`).
- AI gagal atau keluaran tidak valid → REQUIRE\_APPROVAL (`AI_UNAVAILABLE`). **Tidak pernah** auto-approve.

**Tahap D — keputusan:** REJECT jika ada kegagalan A atau AI blokir; REQUIRE\_APPROVAL jika ada penanda B/C; selain itu AUTO\_APPROVE. Saat REJECT, reservasi anggaran dilepas. Penjelasan manusia dibuat dari kode alasan (template deterministik); AI hanya menambah narasi opsional.

### 9.6 Eksekusi dan rekonsiliasi

- Job `execute_request` mengambil request APPROVED, memverifikasi `request_hash` masih sama, lalu menandai EXECUTING dalam transaksi.
- Payout: `POST /v1/payments/payouts` dengan header `PayPal-Request-Id` = ID request dan `sender_batch_id` = `jp_<requestId>`. Refund: `POST /v2/payments/captures/{id}/refund`. Accept dispute: `POST /v1/customer/disputes/{id}/accept-claim`. **\[VERIFY\]**
- Retry hanya untuk 429, 5xx, dan galat jaringan, dengan exponential backoff + jitter, maksimum 5 percobaan, memakai ID idempotensi yang sama. Setelah itu job DEAD dan request FAILED dengan notifikasi.
- **Pemulihan crash:** sebelum panggilan PayPal, baris `executions` dibuat (status STARTED) bersama ID idempotensi. Setelah restart, job yang sama memakai ulang ID itu sehingga PayPal mengembalikan hasil sebelumnya, bukan membuat payout kedua. Jika respons tidak pernah tersimpan, worker menanyakan status batch ke PayPal sebelum mencoba lagi.
- Webhook `PAYMENT.PAYOUTSBATCH.*`, `PAYMENT.PAYOUTS-ITEM.*`, `PAYMENT.CAPTURE.REFUNDED`, `CUSTOMER.DISPUTE.*` **\[VERIFY\]** → job `process_webhook` mencocokkan jumlah, mata uang, dan penerima dengan request. Cocok → RECONCILED; tidak cocok → MISMATCH + notifikasi + saran freeze. Bila webhook tidak datang dalam 3 menit, job `reconcile_request` melakukan polling.

### 9.7 Ledger

- Tabel `ledger_entries` per organisasi dengan `seq` berurutan. `entry_hash = SHA-256(prev_hash ‖ canonical_json(payload) ‖ seq ‖ org_id ‖ type ‖ created_at)`. Entri ditandatangani Ed25519 (kunci server, `kid` tersimpan agar rotasi kunci dapat diverifikasi).
- Penulisan: kunci baris `ledger_heads(org_id)` `FOR UPDATE`, hitung entri berikutnya, insert, update head, semuanya dalam transaksi pemanggil sehingga ledger tidak pernah berbeda dari state bisnis.
- Trigger menolak UPDATE/DELETE. Verifikasi menghitung ulang seluruh rantai dan tanda tangan; hasil: `valid`, `checkedEntries`, atau `firstBrokenSeq`.
- Jujur soal batasan: ledger membuktikan **integritas internal dan urutan**, bukan bahwa operator tidak pernah membuat ulang seluruh rantai. Mitigasi: ekspor berkala dan publikasi hash head terbaru (di luar MVP: anchoring eksternal).

### 9.8 Lapisan AI

- Antarmuka `generateStructured({task, schema, input})` dengan adapter OpenAI-compatible dan Anthropic (memakai `fetch` bawaan Node 22); model, base URL, dan kunci dari env. Temperatur 0, timeout 20 detik, satu retry, keluaran divalidasi Zod; gagal → error terklasifikasi.
- Empat tugas: (1) parser mandat NL→policy, (2) ekstraksi invoice, (3) penilaian niat dan anomali, (4) penyusun kasus dispute. Prompt diberi versi (`prompt_version`) dan disimpan pada setiap evaluasi.
- **Penanganan konten tidak tepercaya:** dokumen dan teks agen dibungkus delimiter data, system prompt melarang mengikuti instruksi di dalamnya, model **tidak punya akses tool apa pun**, dan keluarannya hanya skema. Teks dipotong (20.000 karakter), PII diminimalkan (identifier payee dimasking), rahasia tidak pernah dikirim.
- **Harness evaluasi:** korpus berlabel di `server/test/ai-eval/` dijalankan dengan rekaman respons (deterministik di CI) dan opsional dengan model live.

### 9.9 Antrean dan worker di cPanel

- Tabel `jobs` dengan klaim `SELECT ... FOR UPDATE SKIP LOCKED`, `run_at`, `attempts`, `locked_until`, `dedupe_key`.
- Worker loop di proses web (`WORKER_ENABLED=1`): poll 2 detik (jitter), konkurensi 2, heartbeat memperpanjang `locked_until`; job tanpa heartbeat 60 detik dianggap macet dan diklaim ulang.
- Cron cPanel menjalankan `tick.js` tiap menit selama ≤ 55 detik untuk menguras antrean saat app di-idle Passenger; `SKIP LOCKED` menjamin tidak ada klaim ganda.
- Jenis job: `extract_document`, `evaluate_request` (penyapu untuk request macet), `execute_request`, `reconcile_request`, `process_webhook`, `sync_disputes`, `draft_dispute_case`, `submit_dispute_action`, `send_email`, `expire_approvals`, `cleanup`.

### 9.10 Konfigurasi dan pengaman sandbox

- Konfigurasi divalidasi Zod saat boot; nilai tidak valid → proses berhenti dengan pesan jelas. Boot juga gagal bila `process.versions.node` bukan mayor 22.
- `PAYPAL_API_BASE` bukan env: konstanta `https://api-m.sandbox.paypal.com`. Tes CI menggagalkan build bila string host live PayPal muncul di source. Koneksi PayPal ditolak bila Client ID tidak lolos tes OAuth sandbox.
- Kunci aplikasi (`JOBENPAY_ENC_KEY` 32 byte base64, `JOBENPAY_LEDGER_SIGNING_KEY` Ed25519 PKCS8 base64, `JOBENPAY_HMAC_PEPPER`) hanya dari env; tidak ada nilai default.

### 9.11 Pengendalian biaya AI dan penyalahgunaan demo publik

- **Batas biaya:** `AI_DAILY_BUDGET_USD` (default 5) dihitung dari penggunaan token. Bila terlampaui, panggilan AI berhenti dan keputusan jatuh ke `AI_UNAVAILABLE` → REQUIRE\_APPROVAL (fail-closed, P2); demo tetap aman dan tetap berfungsi.
- **Kuota akun juri:** 100 panggilan AI/hari/organisasi demo, 30 usulan/jam/organisasi, 60 permintaan/menit/API key.
- **Registrasi publik dimatikan** pada Tier A (`REGISTRATION_ENABLED=0`); akun dibuat lewat seed dan dicantumkan di instruksi uji.
- **Batas uang sandbox:** mandat demo dibatasi anggaran US$50 dan US$15 per transaksi (uang sandbox).
- **Reset demo:** terjadwal harian 03:00 WIB dan lewat tombol "Reset demo data". Reset **membuat organisasi demo baru** dan mengarsipkan yang lama (read-only); ledger lama tidak pernah dihapus.
- **Kill switch** (FR-1203) tersedia bila terjadi penyalahgunaan; ia menolak usulan baru dengan `ORG_FROZEN`.
- **Mode replay:** `AI_PROVIDER=replay` memutar respons terekam untuk CI dan evaluasi lokal tanpa kunci AI; UI menampilkan banner permanen "REPLAY MODE".

## 10. Model data (PostgreSQL 13+)

**Konvensi.** `id uuid primary key default gen_random_uuid()`; `created_at timestamptz not null default now()`; uang selalu `bigint` satuan minor + `currency char(3)` (tidak pernah float); semua tabel bertenant memiliki `org_id uuid not null` dan indeks yang diawali `org_id`; email dinormalisasi `lower()` dengan unique index (tanpa ekstensi `citext` karena belum tentu tersedia di cPanel). Migrasi: file SQL berurut `server/migrations/NNN_nama.sql`, dijalankan `node scripts/migrate.js` (advisory lock, tabel `schema_migrations`, hanya maju).

| Kelompok | Tabel dan kolom kunci |
| --- | --- |
| Identitas | `users` (email, password\_hash, email\_verified\_at, display\_name, locale, totp\_secret\_enc, totp\_enabled, failed\_login\_count, locked\_until) · `sessions` (id\_hash, user\_id, current\_org\_id, csrf\_secret, last\_seen\_at, expires\_at) · `email_tokens` (kind VERIFY/RESET/INVITE, token\_hash, expires\_at, used\_at) · `step_up_grants` (user\_id, session\_id, purpose, expires\_at ≤ 5 menit, consumed\_at) |
| Tenant | `organizations` (name, slug unique, frozen\_at, frozen\_by) · `memberships` (org\_id, user\_id, role OWNER/ADMIN/APPROVER/OPERATOR/VIEWER) · `invitations` (email, role, token\_hash, expires\_at) |
| PayPal | `paypal_connections` (org\_id unique, client\_id\_enc, client\_secret\_enc, webhook\_id, webhook\_token unik untuk URL, status, last\_tested\_at, last\_error\_code) |
| Agen | `agents` (name, description, status ACTIVE/DISABLED) · `agent_api_keys` (agent\_id, prefix, key\_hash, last\_used\_at, revoked\_at) |
| Mandat | `mandates` (agent\_id, name, status DRAFT/ACTIVE/SUSPENDED/REVOKED/EXPIRED, current\_version\_id; unique parsial: satu ACTIVE per agent) · `mandate_versions` (mandate\_id, version, purpose\_text, policy jsonb, policy\_canonical, policy\_hash, signature, signing\_kid, activated\_by, activated\_at, valid\_from, valid\_to, prompt\_version; **immutable via trigger**) · `mandate_budget_periods` (version\_id, period\_start, period\_end, limit\_minor, reserved\_minor, spent\_minor; `CHECK (reserved_minor + spent_minor <= limit_minor)`) |
| Payee | `payees` (display\_name, kind EMAIL/PAYPAL\_ID/PHONE, identifier\_enc, identifier\_hmac, identifier\_masked, trust PENDING\_REVIEW/TRUSTED/BLOCKED) · `payee_revisions` (payee\_id, field, old\_hmac, new\_hmac, changed\_by) |
| Dokumen | `documents` (uploader\_kind USER/AGENT, uploader\_id, filename, mime, size, sha256, storage\_key, status, injection\_flags jsonb) · `document_extractions` (document\_id, payee\_name, invoice\_number, amount\_minor, currency, due\_date, items jsonb, notes, confidence, prompt\_version) |
| Request | `payment_requests` (agent\_id, mandate\_version\_id, action, status, amount\_minor, currency, payee\_id, target\_ref, document\_id, agent\_reason **tidak tepercaya**, agent\_idempotency\_key, request\_hash, decision, reason\_codes text[], risk\_score, explanation; unique `(agent_id, agent_idempotency_key)`) · `request_evaluations` (request\_id, stage A/B/C/D, result jsonb, ai\_model, prompt\_version, latency\_ms) |
| Approval | `approvals` (request\_id, status, step\_up\_required, request\_hash, expires\_at) · `approval_decisions` (approval\_id, decided\_by, decision, comment, step\_up\_grant\_id) |
| Eksekusi | `executions` (request\_id, idempotency\_id, kind, status STARTED/SENT/SUCCEEDED/FAILED, paypal\_ref, http\_status, response\_redacted jsonb, attempts) · `webhook_events` (org\_id, paypal\_event\_id **unique**, event\_type, payload jsonb, verified, status, received\_at, processed\_at) |
| Ledger | `ledger_entries` (PK `(org_id, seq)`, type, subject\_type, subject\_id, payload jsonb, prev\_hash, entry\_hash, signature, kid; trigger tolak UPDATE/DELETE) · `ledger_heads` (org\_id PK, last\_seq, last\_hash) |
| Dispute | `disputes` (paypal\_dispute\_id, status, reason, amount\_minor, currency, respond\_by, raw jsonb) · `dispute_cases` (dispute\_id, recommendation ACCEPT/CONTEST/NEED\_INFO, rationale, evidence\_package jsonb, status DRAFT/PENDING\_APPROVAL/SUBMITTED) |
| Operasional | `notifications` · `email_outbox` · `audit_events` · `jobs` (type, payload, run\_at, attempts, locked\_until, dedupe\_key, status) · `rate_limit_buckets` |

### 10.1 Skema policy mandat (disimpan di `mandate_versions.policy`)

```json
{
  "schemaVersion": 1,
  "purpose": "Pay registered suppliers max $500 per transaction, $3,000 per month, invoice required",
  "allowedActions": ["PAYOUT"],
  "currency": "USD",
  "perTransactionCapMinor": 50000,
  "budget": { "period": "MONTH", "limitMinor": 300000 },
  "autoApproveBelowMinor": 20000,
  "payees": { "mode": "ALLOWLIST", "ids": ["<payee-uuid>"] },
  "allowNewPayees": false,
  "schedule": { "timezone": "Asia/Jakarta", "days": [1,2,3,4,5], "startHour": 8, "endHour": 18 },
  "velocity": { "maxRequestsPerHour": 10, "maxPayoutPerPayeePerDay": 2 },
  "duplicateWindowHours": 72,
  "requireInvoice": true,
  "invoiceAmountToleranceMinor": 0,
  "ai": { "intentCheck": true, "escalateOnRiskAtOrAbove": 40, "blockOnRiskAtOrAbove": 80 },
  "stepUpApprovalAboveMinor": 100000,
  "fourEyesAboveMinor": 250000,
  "approvalTtlHours": 24,
  "validFrom": "2026-11-01T00:00:00Z",
  "validTo": "2026-12-01T00:00:00Z"
}
```

`policy_canonical` = JSON kanonik (kunci terurut, tanpa spasi). `policy_hash` = SHA-256 dari canonical. `signature` = Ed25519 server atas `policy_hash`.

### 10.2 Definisi `request_hash`

`SHA-256(canonical_json({orgId, agentId, mandateVersionId, action, amountMinor, currency, payeeId | targetRef, documentSha256}))`. Approval dan eksekusi hanya valid bila hash yang dihitung ulang sama.

## 11. API dan gateway agen

**Umum.** Basis `/api/v1`, JSON UTF-8. Sesi manusia: cookie HttpOnly `jp_sid` + header `X-CSRF-Token` untuk metode mutasi. Agen: `Authorization: Bearer jp_sbx_<prefix>_<secret>`. Semua mutasi agen mewajibkan header `Idempotency-Key`. Waktu ISO-8601 UTC. Paginasi kursor `?limit=&cursor=`.

**Format error baku:** `{ "error": { "code": "CAP_EXCEEDED", "message": "...", "requestId": "...", "details": {} } }`. Kode stabil didefinisikan di `shared/error-codes.js`.

### 11.1 Endpoint sesi manusia

| Area | Endpoint |
| --- | --- |
| Auth | `POST /auth/register` · `/auth/verify-email` · `/auth/login` · `/auth/logout` · `/auth/forgot` · `/auth/reset` · `GET /auth/me` · `POST /auth/totp/setup` · `/auth/totp/enable` · `/auth/step-up` |
| Org | `GET/PATCH /org` · `GET/POST /org/members` · `PATCH/DELETE /org/members/:id` · `POST /org/invitations` · `POST /org/freeze` · `POST /org/unfreeze` |
| PayPal | `GET/PUT/DELETE /paypal/connection` · `POST /paypal/connection/test` |
| Agen | `GET/POST /agents` · `GET/PATCH /agents/:id` · `POST /agents/:id/keys` · `POST /agents/:id/keys/:keyId/revoke` |
| Mandat | `POST /mandates/draft-from-text` · `GET/POST /mandates` · `GET /mandates/:id` · `POST /mandates/:id/versions` · `POST /mandates/:id/activate` (step-up) · `POST /mandates/:id/suspend` · `/revoke` · `GET /mandates/:id/budget` |
| Payee | `GET/POST /payees` · `PATCH /payees/:id` · `POST /payees/:id/trust` (step-up) |
| Dokumen | `POST /documents` (multipart) · `GET /documents` · `GET /documents/:id` · `GET /documents/:id/file` · `DELETE /documents/:id` (OWNER) |
| Request | `GET /requests` · `GET /requests/:id` (timeline lengkap) · `POST /requests/:id/cancel` |
| Approval | `GET /approvals` · `GET /approvals/:id` · `POST /approvals/:id/decision` |
| Ledger | `GET /ledger` · `GET /ledger/verify` · `GET /ledger/export?format=json\|csv` |
| Dispute | `GET /disputes` · `POST /disputes/sync` · `GET /disputes/:id` · `POST /disputes/:id/case/draft` · `PATCH /disputes/:id/case` · `POST /disputes/:id/case/request-approval` · `POST /disputes/:id/case/submit` |
| Simulator | `GET /simulator/scenarios` · `POST /simulator/run` |
| Ops | `GET /dashboard/summary` · `GET /notifications` · `POST /notifications/:id/read` · `GET /audit` · `GET /reports/:kind.csv` · `GET /healthz` · `GET /readyz` |
| Webhook | `POST /webhooks/paypal/:webhookToken` (publik, tanpa sesi; verifikasi tanda tangan PayPal **\[VERIFY\]**) |

### 11.2 REST agent API (Bearer)

`POST /agent/v1/payout-requests` · `POST /agent/v1/refund-requests` · `POST /agent/v1/dispute-accept-requests` · `GET /agent/v1/requests/:id` · `GET /agent/v1/budget` · `POST /agent/v1/documents`.

Contoh usulan dan keputusan:

```json
POST /agent/v1/payout-requests
Idempotency-Key: 6f1c...
{ "payeeId": "…", "amountMinor": 45000, "currency": "USD",
  "documentId": "…", "reason": "Invoice INV-2041 September" }

200 → { "requestId": "…", "status": "PENDING_APPROVAL",
        "decision": "REQUIRE_APPROVAL",
        "reasonCodes": ["PAYEE_CHANGED"],
        "message": "Payee details changed in the last 30 days; a human must approve.",
        "budget": { "limitMinor": 300000, "reservedMinor": 45000, "spentMinor": 0 } }
```

`reason` dari agen disimpan sebagai klaim tidak tepercaya dan tidak pernah mengubah keputusan deterministik. Rate limit: 60 permintaan/menit per API key.

### 11.3 MCP server

Endpoint `POST /mcp` (Streamable HTTP, stateless, Bearer API key agen). Versi spesifikasi MCP dicocokkan saat implementasi **\[VERIFY\]**. Tool: `propose_payout`, `propose_refund`, `propose_accept_dispute`, `get_request_status`, `get_budget_status`, `submit_document` (base64 ≤ 3 MB). **Tidak ada tool eksekusi, approve, atau baca kredensial.** Setiap respons memuat `decision`, `reasonCodes`, `message`.

## 12. Design system dan UI parity PayPal Business

### 12.1 Kebijakan parity dan batas legal (profil P1)

**Target (P1 — parity pola dan metrik).** JOBENPAY mengikuti pola dashboard PayPal Business: tata letak, grid, ukuran, jarak, skala tipografi, geometri komponen, state, perilaku navigasi/formulir/tabel, responsif, dan gerak. Kesetaraan **diuji otomatis** (12.11), bukan hanya dinilai mata. Warna fungsional (netral, biru tautan, hitam tombol) mengikuti nilai terukur karena warna antarmuka bukan identitas merek.

**Identitas yang selalu berbeda (tidak ditawar):**

| Elemen | Perlakuan di JOBENPAY |
| --- | --- |
| Logo dan wordmark PayPal | Wordmark **JOBENPAY** buatan sendiri (kapital tebal), ukuran dan posisi sama dengan slot wordmark acuan |
| Nama "PayPal" sebagai identitas | Tidak dipakai di judul tab, favicon, nama aplikasi, atau domain; hanya penyebutan faktual ("Connect PayPal Sandbox") |
| Font PayPal Sans (berlisensi) | Tidak dikirim; stack Arial/Helvetica (12.2) |
| Ikon | Set outline sendiri (basis `lucide-react`), bukan aset PayPal |
| Teks antarmuka dan legal | Ditulis sendiri; tidak menyalin teks PayPal; footer memuat "JOBENPAY is not a PayPal product. Connected to PayPal Sandbox only." |
| Ilustrasi, gambar, favicon | Buatan sendiri |
| Penanda keselamatan | Chip **SANDBOX** permanen di header; halaman login menyatakan JOBENPAY tidak berafiliasi dengan PayPal |
| Kode dan aset situs PayPal | Dilarang; token diukur dari tangkapan layar dan ditulis ulang |

**Dasar kebijakan.** Aturan resmi mewajibkan submission tidak melanggar hak merek atau hak lain pihak ketiga, membatasi penggunaan IP sponsor sebatas yang diizinkan aturan, dan melarang video memuat merek dagang pihak ketiga tanpa izin (Official Rules, bagian Intellectual Property, 11.8, dan persyaratan video).

**Jalur klarifikasi.** Email klarifikasi tertulis dikirim paling lambat 31 Okt (template di 19.2). Jika jawaban tertulis membolehkan UI bergaya PayPal dan footage dashboard PayPal, area INFERRED boleh dirapatkan dan footage boleh dipakai. Jika tidak ada jawaban sampai 6 Nov atau jawabannya negatif, P1 tetap berlaku dan video tidak memuat footage UI PayPal. **v1.2 tidak bergantung pada jawaban tersebut.**

### 12.2 Design token

Nilai diukur dari tangkapan layar S1 dan S2 pada 1366 × 768, zoom 100%, DPR 1. Warna adalah **estimasi dari piksel layar**: nilai final harus dikunci dengan color-picker pada tangkapan referensi sebelum gerbang G1 (2 Nov), lalu dimasukkan ke `web/src/styles/tokens.css` dan `design-spec.json` (sumber tunggal untuk tes geometri). Tidak ada nilai warna/ukuran literal di luar token (FR-1301, lint `stylelint`).

**Warna**

| Token | Nilai awal | Pemakaian |
| --- | --- | --- |
| `--jp-surface` | `#FFFFFF` | Latar halaman utama, kartu, header |
| `--jp-surface-sidebar` | `#F5F7FA` | Latar sidebar (putih kebiruan sangat muda) |
| `--jp-nav-active-bg` | `#B3CDFB` | Item nav aktif (biru muda) |
| `--jp-nav-active-text` | `#001435` | Teks dan ikon item aktif |
| `--jp-nav-hover-bg` | `#E4ECF7` | Hover item nav (INFERRED) |
| `--jp-text` | `#2C2E2F` | Teks utama, judul |
| `--jp-text-muted` | `#6C7378` | Caption, "Available balance", subjudul |
| `--jp-black` | `#000000` | Tombol Create, tab Feedback |
| `--jp-link` | `#0551B5` | Tautan biru bergaris bawah ("Add…", "View more", "Customize") |
| `--jp-blue` | `#0070E0` | Aksen interaktif, fokus, info |
| `--jp-blue-dark` | `#003087` | Hover/active biru, judul penekanan (INFERRED) |
| `--jp-border` | `#CBD2D9` | Border kartu dan pemisah |
| `--jp-border-input` | `#9DA3A6` | Border input dan select |
| `--jp-icon-circle` | `#F0F2F5` | Latar lingkaran ikon Quick Access |
| `--jp-badge-red` | `#C5192D` | Badge lonceng |
| `--jp-success` / `--jp-warning` / `--jp-error` | `#118C4F` / `#FFC439` / `#C5192D` | Status (INFERRED; selalu disertai ikon dan teks) |
| `--jp-overlay` | `rgba(0,0,0,.5)` | Latar modal (INFERRED) |

**Tipografi** (`font-family: Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif`; CI memakai Liberation Sans yang metriknya setara Arial)

| Peran | Ukuran / tinggi baris | Berat | Contoh di acuan |
| --- | --- | --- | --- |
| Judul halaman | 24 / 32 | 700 | "David Guntoro" |
| Judul seksi | 16 / 24 | 700 | "Quick Access", "Business Performance" |
| Teks tombol md | 14 / 20 | 700 | "Manage money", "Create" |
| Teks tombol lg | 16 / 24 | 700 | "Build It" |
| Item nav | 15 / 20 | 500 | "Home", "Activity" |
| Link kartu | 15 / 20 | 400 | "Add PayPal Checkout" (bergaris bawah) |
| Isi kartu | 13 / 16 | 400 | "Let customers pay with PayPal…" |
| Caption | 13 / 20 | 400 | "Available balance", "All comparisons to previous 30 days" |
| Label Quick Access | 11 / 16 | 400 | "Invoicing", "PayPal.Me" |
| Label input mengambang | 13 / 16 | 400 | "Currency" (saat terisi) |
| Nilai input | 16 / 24 | 400 | "USD" |
| Footer tautan | 15 / 20 | 500 | "Help", "Contact" |
| Footer legal | 14 / 20 | 400 | "Copyright © …", "Privacy" |

**Spasi dan bentuk:** skala 4 px (`4, 8, 12, 16, 24, 32, 48`). Radius: kartu 8, input/select 8, tombol dan status pill 999, item nav aktif 12, modal 16 (INFERRED). Kartu **datar**: border 1 px `--jp-border`, tanpa bayangan. Bayangan hanya untuk popover/dropdown `0 4px 16px rgba(0,0,0,.12)` dan modal `0 8px 32px rgba(0,0,0,.2)` (INFERRED). Transisi 150 ms ease-out.

### 12.3 App shell (ukuran terukur dari S1, toleransi ± 2 px)

| Elemen | Spesifikasi |
| --- | --- |
| Sidebar | Lebar **240**, tinggi penuh, tetap (fixed), latar `--jp-surface-sidebar`, kolom isi 224 (padding horizontal 8) |
| Wordmark | Terpusat horizontal di kolom (pusat x = 120), tinggi ± 36, pusat vertikal y = 158 dari tepi atas viewport halaman |
| Tombol **+ Create** | Pil hitam `--jp-black`, **96 × 32**, ikon plus 16 + teks "Create" putih 14/700, terpusat (x 72–168), top y = 211 (± 2). Membuka menu dropdown (lihat bawah) |
| Daftar nav | Mulai y = 275; tiap item **tinggi 52**, lebar 224, tanpa jarak antar item; urutan: Home, Activity, Pay & Get Paid, Agents & Mandates, Business Tools |
| Isi item nav | Padding kiri 8, ikon 18, jarak ikon–teks 10 (teks mulai x ≈ 44), chevron kanan 16 px dengan padding kanan 16; grup ber-submenu menampilkan chevron-right yang berputar 90° saat terbuka |
| Item aktif (Home) | Latar `--jp-nav-active-bg`, radius 12, teks/ikon `--jp-nav-active-text`, berat 500 |
| Submenu | Indentasi teks 44 px, tinggi 44, tanpa ikon; item aktif memakai gaya aktif yang sama |
| Header | Tinggi **72**, putih, sticky, padding kiri 16 (judul mulai x = 256) dan kanan 20; **judul halaman** 24/700; di bawah judul baris sekunder `--jp-text-muted` (organisasi · peran) |
| Sisi kanan header | Urut kiri→kanan: chip **SANDBOX**, ikon `</>` 24 px, lonceng 24 px dengan **badge merah** (16 px, angka putih 11/700, offset −4/−4, menampilkan angka termasuk 0 agar sama dengan acuan), pemisah vertikal 1 × 24 `--jp-border`, avatar lingkaran **32** `--jp-text` berinisial putih 14/500. Jarak antar-ikon ± 40 |
| Konten | Padding horizontal **32** (kartu mulai x = 272), kanan 32; fluid sampai 1440 lalu terpusat |
| Tab **Feedback** | Fixed di kanan, 28 × 86, hitam, teks "Feedback" putih 14/700 diputar 90°, radius 14, terpusat vertikal viewport, right 2 px; membuka modal masukan |
| Footer | Bagian 12.4 (komponen Footer) |
| Scrollbar | Native browser (tidak di-skin) |

**Menu Create (INFERRED):** New agent · New mandate · New payee · Upload document · Propose payout (Simulator) · Verify ledger.
**Popover lonceng:** daftar notifikasi, tautan "View all". **Menu avatar:** nama + email, organisasi aktif (pengalih), Security, Language (EN/ID), Log out.
**Ikon `</>`** menuju `/developer` (URL MCP, contoh klien, dokumentasi API).
**Penamaan nav (padanan pola PayPal):**

| Item | Submenu |
| --- | --- |
| Home | — (`/dashboard`) |
| Activity | Requests · Approvals · Ledger · Audit |
| Pay & Get Paid | Payees · Documents · Disputes |
| Agents & Mandates | Agents · Mandates · Simulator |
| Business Tools | Organization · Members · PayPal Sandbox · Security |

### 12.4 Komponen

| Komponen | Spesifikasi |
| --- | --- |
| **Button primary** | Pil, latar `--jp-black`, teks putih 14/700, tinggi 32 (md) / 48 (lg), padding horizontal 16 / 32. Hover `#2C2E2F`; fokus ring 2 px `--jp-blue` offset 2; disabled opasitas .4; loading: spinner 16 px menggantikan ikon, lebar tetap |
| **Button secondary (outline)** | Pil, latar transparan, border 1 px `--jp-text`, teks `--jp-text` 14/700 (md **145 × 32** untuk "Manage money" dengan chevron-down 16 jarak 8) atau 16/700 (lg **107 × 48** untuk "Build It"). Hover latar `#F5F7FA` |
| **Link** | `--jp-link`, **garis bawah selalu terlihat**, 15–16 px; hover `--jp-blue-dark`; tidak pernah berupa tombol tanpa garis bawah di dalam teks |
| **Input teks (label mengambang)** | Tinggi **64**, radius 8, border 1 px `--jp-border-input`, padding 16; label 16 `--jp-text-muted` di tengah-vertikal, saat fokus/terisi mengecil ke 13 di atas dan nilai 16 di bawah; fokus: border 2 px `--jp-blue`; error: border 2 px `--jp-error` + pesan 13 di bawah dengan ikon |
| **Select** | Sama dengan input; nilai terpilih 16, label kecil 13 di atas, chevron-down 20 px di kanan (x ≈ −32 dari tepi) |
| **Baris dua kolom formulir** | Dua field sama lebar, jarak **24**, jarak vertikal antar-baris 16; teks bantuan 14/20 `--jp-text` di bawah field (jarak 16) |
| **Checkbox / Radio / Toggle** | 20 px, border 1.5 px `--jp-border-input`, terpilih `--jp-text` (hitam) dengan centang putih; toggle 40 × 24 (INFERRED) |
| **Kartu** | Border 1 px `--jp-border`, radius 8, latar putih, padding 16 (kartu tile) atau 24 (kartu formulir/seksi). **Kartu tile setup:** min-lebar 337, tinggi 146; ikon 24 di kiri-atas, menu kebab (tiga titik vertikal, 24 px) di kanan-atas, link judul, isi 13/16; grid `repeat(auto-fill, minmax(337px, 1fr))` jarak 24 (INFERRED) |
| **Quick Access** | Baris item, tiap item lebar **112**, lingkaran **48** `--jp-icon-circle` berisi ikon 24 hitam, label 11/16 terpusat (boleh 2 baris), jarak ikon–label 8; judul seksi disertai ikon pensil 16 (edit susunan) berjarak 8; hover lingkaran `#E4E8EC`; bisa digulir horizontal di mobile |
| **Kartu performa** | Kartu dengan judul 13/700, angka besar 24/700, delta 13 (↑/↓ + teks, bukan hanya warna), sparkline SVG 1.5 px `--jp-blue`; seksi diberi judul 16/700, caption 13 `--jp-text-muted`, dan link "View more" rata kanan |
| **Tabel (pola Activity)** | Tanpa border vertikal; header 13/500 `--jp-text-muted`; tinggi baris 72 dengan pemisah 1 px `--jp-border`; hover latar `#F5F7FA`; kolom nominal rata kanan 15/700; kolom status berisi **Status pill**; pagination di bawah ("1–25 of N", tombol sebelumnya/berikutnya bulat 32); virtualisasi untuk > 200 baris (INFERRED untuk ukuran baris) |
| **Status pill** | Tinggi 24, radius 999, padding 0 12, 12/500, ikon 12 + teks. Pemetaan: EXECUTED/RECONCILED/APPROVED = success; PENDING\_APPROVAL/EXECUTING = warning; REJECTED/FAILED/MISMATCH = error; lainnya netral |
| **Banner/Alert** | Radius 8, border 1 px warna status, ikon + judul 14/700 + isi 14; tombol tutup opsional. Banner **Kill switch aktif** merah, tetap di atas konten |
| **Modal** | Lebar 480 (md) / 640 (lg), radius 16, padding 32, judul 24/700, tombol di bawah rata kanan (secondary lalu primary), ESC dan klik overlay menutup kecuali aksi destruktif; fokus terkurung |
| **Dialog step-up** | Modal md berisi input password/TOTP, teks alasan aksi, tombol primary "Confirm" |
| **Toast** | Kiri-bawah, lebar 360, hitam `--jp-text` teks putih, radius 8, hilang 5 dtk (error 8 dtk, tidak hilang bila ada aksi) |
| **Tooltip** | Latar `--jp-text`, teks putih 13, radius 4, tunda 300 ms |
| **Tabs** | Teks 15/500, garis bawah 2 px `--jp-text` pada tab aktif, jarak 24 |
| **Stepper onboarding** | Lingkaran 32 bernomor, garis penghubung 1 px; langkah aktif hitam |
| **Blok kode (API key, URL)** | Latar `#F5F7FA`, radius 8, font mono 13, tombol salin ikon; kunci API tampil sekali dengan banner peringatan |
| **Empty state** | Ikon lingkaran 48 + judul 16/700 + teks 14 + tombol primary |
| **Skeleton** | Blok `#E4E8EC` dengan pulsa 1.2 dtk; tidak ada spinner layar penuh |
| **Footer** | Dua baris: (1) tautan kiri **Help · Contact · Sitemap · Fees · Security · About · Developers · Partners** (15/500, jarak 24) dan kanan pemilih **negara "Indonesia" (400) + bahasa "English" (700)**, jarak 24; pemisah 1 px; (2) kanan: "Copyright © 2026 JOBENPAY. All rights reserved." + pemisah vertikal + **Privacy · Legal · Policy updates** (14/400); (3) baris legal kiri 14: "JOBENPAY is not a PayPal product. Connected to PayPal Sandbox only." Posisi terukur S2: baris 1 pusat y ≈ 543, pemisah y ≈ 569, hak cipta y ≈ 596, legal y ≈ 648 (relatif dasar kartu ± 2 px) |

**Matriks state wajib** (diuji): default, hover, focus-visible, active, disabled, loading, error, kosong, memuat (skeleton).

### 12.5 Pola halaman (padanan layar)

| Rute | Pola PayPal yang ditiru | Isi JOBENPAY |
| --- | --- | --- |
| `/dashboard` (Home) | S1 persis: judul nama pengguna, baris "Available balance" muted + tombol outline **Manage money ⌄** → di JOBENPAY: caption "Remaining mandate budget" + nilai + **Manage mandates ⌄**; kartu tile "Add PayPal Checkout" → **"Connect PayPal Sandbox"** (ikon, kebab, link biru, deskripsi) dan tile setup lain (Create an agent, Activate a mandate); **Quick Access** 7 item: Agents, Mandates, Propose payout, Approvals, Payees, Ledger, Verify ledger; **Business Performance** → "Agent Performance" (caption "All comparisons to previous 30 days", link "View more") berisi kartu: Requests, Auto-approved, Held for approval, Blocked, Reconciled, Budget used |
| `/agents/:id`, `/mandates/new`, `/payees` (form) | S2: kartu formulir padding 24, input label mengambang, baris dua kolom, teks bantuan 14, tombol outline lg + link "Customize" |
| `/requests`, `/approvals`, `/ledger`, `/audit`, `/documents`, `/disputes` | Tabel pola Activity + filter pil di atas + pencarian + ekspor |
| `/requests/:id`, `/approvals/:id`, `/disputes/:id` | Halaman detail dua kolom: kiri ringkasan + timeline vertikal, kanan kartu aksi; semua kartu bergaya 12.4 |
| `/settings/*` | Daftar kartu bagian dengan tombol outline "Edit"; modal untuk perubahan |
| `/login`, `/register`, `/onboarding` | Kartu pusat lebar 440 pada latar putih, wordmark di atas, input label mengambang, tombol primary lg penuh-lebar, tautan biru bergaris bawah; (INFERRED sampai ada tangkapan login) |
| `/developer` | Kartu blok kode: URL MCP, contoh Node 22 `fetch`, daftar tool |

### 12.6 Ikonografi

Outline, 24 px (nav 18), stroke 1.5, sudut membulat, warna `currentColor`. Basis `lucide-react` dengan `strokeWidth=1.5`. Ikon wajib ada: home, activity, pay (dompet/uang), agents, mandate (dokumen+centang), business-tools (grid), plus, chevron-down/right, kebab, pensil, bell, code `</>`, cart/plug (kartu setup), invoice, request-money, send-money, link, ledger, shield-check, search, filter, download, copy, warning, success, error, info, close.

### 12.7 Responsif

| Lebar | Perilaku |
| --- | --- |
| ≥ 1200 | Layout S1 penuh (sidebar tetap 240) |
| 768–1199 | Sidebar menjadi laci (drawer) lewat tombol hamburger 24 di kiri header; wordmark pindah ke header; kartu grid menyesuaikan |
| 360–767 | Header 56: hamburger, wordmark, lonceng, avatar; chip SANDBOX ke baris di bawah header; Quick Access gulir horizontal; tabel menjadi daftar kartu; modal menjadi bottom-sheet penuh lebar; tab Feedback tetap |

Breakpoint dan perilaku < 1200 bertanda INFERRED sampai ada tangkapan layar mobile (12.12).

### 12.8 Gerak dan umpan balik

Transisi 150 ms ease-out (warna, bayangan); chevron nav berputar 150 ms; popover/dropdown muncul fade+translateY 4 px 150 ms; `prefers-reduced-motion` mematikan semua gerak non-esensial. Tidak ada animasi dekoratif. Pembaruan polling tidak mengubah posisi gulir.

### 12.9 Aturan teks antarmuka

Bahasa default **EN** (sama dengan acuan), pengalih ID di footer dan menu avatar. Gaya EN: Title Case untuk nav, tombol, dan judul seksi ("Pay & Get Paid", "Quick Access"); sentence case untuk deskripsi dan bantuan. Pesan penolakan gerbang: kalimat manusia + kode alasan kecil di bawahnya. Angka/mata uang diformat per locale; nominal selalu disertai kode mata uang.

### 12.10 Aksesibilitas yang harus tetap lolos

Kontras teks WCAG AA terhadap token di 12.2 (nilai yang gagal AA disesuaikan **minimal** dan dicatat di `design-spec.json`, mis. `--jp-text-muted`); fokus terlihat 2 px; semua kontrol dapat dioperasikan keyboard; status tidak hanya warna; ukuran target sentuh ≥ 32 (Quick Access 112 × 80); `aria-live` untuk toast dan perubahan status; label formulir terhubung walau memakai label mengambang.

### 12.11 Protokol verifikasi parity (otomatis dan manual)

1. **Aset acuan** di `docs/ui-reference/`: `s1-dashboard-1366x768.png`, `s2-paymentlinks-footer-1366x768.png`, ditambah tangkapan tambahan (12.12). Berkas dengan data pribadi dikaburkan sebelum di-commit; bila ragu, simpan di luar repo publik dan hanya `design-spec.json` yang di-commit.
2. **`design-spec.json`**: seluruh token dan geometri 12.2–12.4 dalam bentuk mesin-baca (`selector`, `property`, `expected`, `tolerance`).
3. **Lingkungan terkunci**: image Playwright dengan versi dipin, Chromium 1366 × 768, DPR 1, hanya font Liberation Sans lewat fontconfig, animasi dimatikan, data fixture tetap. Tanpa ini hasil piksel tidak deterministik.
4. **Tes geometri (otoritatif)**: memuat `/__parity/s1` dan `/__parity/s2`, membaca `getBoundingClientRect` dan `getComputedStyle`, menegaskan setiap entri `design-spec.json` (posisi/ukuran ± 2 px, warna ΔE ≤ 3, font-size/weight/line-height persis).
5. **Tes struktur piksel**: fixture dibandingkan dengan acuan memakai `pixelmatch` (threshold 0.1) **setelah seluruh teks, wordmark, avatar, badge, dan ikon dimask**, sehingga yang dibandingkan adalah garis, kotak, radius, jarak, dan blok warna. **Lulus bila ≤ 3% piksel berbeda.** Teks tidak dibandingkan piksel karena font acuan berlisensi dan tidak boleh dipakai.
6. **Visual regression** semua layar Tier A pada 1366 × 768, 1024 × 768, 390 × 844; golden baru hanya disetujui lewat review.
7. **Overlay manual** (`scripts/ui-overlay.js`, opasitas 50%) sebelum tiap gerbang.
8. **Checklist parity per layar** (100% sebelum merge): ukuran sidebar/header; pitch nav; skala font dan berat; token warna; radius; border; jarak kartu; kapitalisasi; link bergaris bawah; state hover/fokus/disabled; ukuran dan stroke ikon; footer; responsif; **tidak ada elemen bermerek PayPal** (grep otomatis atas "PayPal" di aset UI selain label faktual).

### 12.12 Tangkapan layar tambahan yang dibutuhkan (agar tidak ada INFERRED)

Menu Create terbuka · item nav dengan submenu terbuka · popover lonceng · menu avatar · halaman Activity (tabel, filter, pagination) · detail transaksi · modal/dialog · form dengan error validasi · toast/banner · empty state · tampilan mobile (390 px) dan tablet · halaman login/2FA · halaman settings · hover/fokus tombol dan input. Setiap tangkapan baru memperbarui `design-spec.json` dan menggantikan entri INFERRED terkait.

## 13. Keamanan

### 13.1 Model ancaman

| Ancaman | Kontrol utama |
| --- | --- |
| Prompt injection lewat dokumen/teks agen | P8: konten dibungkus delimiter data, LLM tanpa tool, keluaran hanya skema, injection\_flags memaksa persetujuan, keputusan akhir di gerbang deterministik |
| Agen berbuat di luar mandat | Gerbang Tahap A, reservasi anggaran atomik, agen tidak bisa mengeksekusi |
| Rekening/payee diganti (invoice fraud) | `payee_revisions`, `PAYEE_CHANGED`, `INVOICE_PAYEE_MISMATCH` |
| Double payout | Idempotency key agen + `PayPal-Request-Id` + `sender_batch_id` + `executions` terdurabel |
| Pembobolan tenant | `orgId` wajib di repository; tes isolasi lintas tenant |
| Pencurian kredensial PayPal | AES-256-GCM, kunci dari env, redaksi log, tidak pernah dikirim ke klien atau LLM |
| Pemalsuan webhook | Verifikasi tanda tangan PayPal **\[VERIFY\]** + dedup `paypal_event_id` + token URL acak |
| Manipulasi ledger | Rantai hash + Ed25519 + trigger anti UPDATE/DELETE + ekspor berkala |
| Pengguna tertipu karena UI mirip PayPal | Label SANDBOX permanen, footer "bukan produk PayPal", tanpa logo/nama PayPal sebagai identitas (12.1) |
| Brute force / credential stuffing | Rate limit, lockout, scrypt |
| Penyalahgunaan demo publik / lonjakan biaya AI | Registrasi dimatikan, kuota, batas biaya harian fail-closed, reset demo, kill switch (9.11) |
| Unggahan berbahaya | Validasi magic bytes, batas 10 MB, simpan di luar web root, nama acak, tanpa eksekusi |

### 13.2 Kontrol

- **Password:** scrypt (N = 2^15, r = 8, p = 1, salt 16 byte), perbandingan `timingSafeEqual`; minimal 12 karakter; lockout 5 gagal → 15 menit.
- **Sesi:** token acak 32 byte, hash disimpan; cookie `jp_sid` (`HttpOnly; Secure; SameSite=Lax`), idle 30 menit, absolut 12 jam; rotasi saat login dan step-up. CSRF: token sinkron per sesi pada metode mutasi.
- **Step-up:** password atau TOTP, grant ≤ 5 menit, sekali pakai per tujuan (`ACTIVATE_MANDATE`, `APPROVE_ABOVE_THRESHOLD`, `FREEZE_TOGGLE`, `TRUST_PAYEE`, `ROTATE_CREDENTIALS`).
- **TOTP:** RFC 6238 (SHA-1, 30 dtk, 6 digit) lewat `node:crypto`; secret terenkripsi; cadangan 10 kode sekali pakai (hash).
- **API key agen:** format `jp_sbx_<prefix8>_<secret32>`; disimpan `HMAC-SHA256(pepper, key)`; tampil sekali; revoke dan rotasi; `last_used_at`.
- **Enkripsi data sensitif:** AES-256-GCM, IV acak 12 byte, AAD = `table:column:orgId`; kunci dari `JOBENPAY_ENC_KEY`.
- **Header HTTP:** `helmet` + CSP ketat (`default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`), HSTS, `Referrer-Policy: same-origin`, `X-Content-Type-Options: nosniff`. CSS Modules dibangun sebagai berkas statis, jadi elemen `<style>` inline tidak dipakai; atribut `style` inline yang diberikan Radix/Popper diizinkan hanya lewat `style-src-attr`, sedangkan `script-src` tetap tanpa inline (dikoreksi dari v1.1 yang akan memblokir popover dan dropdown).
- **Rate limit** (tabel `rate_limit_buckets`): login 10/mnt/IP, agen 60/mnt/key, webhook 120/mnt/token, umum 300/mnt/sesi.
- **SSRF:** server tidak mengambil URL yang diberikan pengguna/agen; satu-satunya egress: PayPal Sandbox, penyedia AI, SMTP.
- **Privasi:** identifier payee terenkripsi + dimasking di UI/log/prompt AI; dokumen dapat dihapus oleh OWNER; ledger menyimpan hash, bukan isi dokumen.

### 13.3 Matriks izin

| Aksi | OWNER | ADMIN | APPROVER | OPERATOR | VIEWER |
| --- | :-: | :-: | :-: | :-: | :-: |
| Lihat dashboard, request, ledger, audit | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ekspor laporan | ✓ | ✓ | ✓ | – | ✓ |
| Kelola anggota dan peran | ✓ | ✓ | – | – | – |
| Kredensial PayPal (simpan/rotasi/hapus) | ✓ | – | – | – | – |
| Buat/ubah agen, API key | ✓ | ✓ | – | ✓ | – |
| Draft mandat | ✓ | ✓ | – | ✓ | – |
| **Aktivasi/suspend/revoke mandat** (step-up) | ✓ | ✓ | – | – | – |
| Payee: buat/ubah (draft) | ✓ | ✓ | – | ✓ | – |
| Payee: ubah trust ke TRUSTED/BLOCKED (step-up) | ✓ | ✓ | – | – | – |
| Unggah dokumen, jalankan simulator | ✓ | ✓ | – | ✓ | – |
| **Approve/reject request** | ✓ | ✓ | ✓ | – | – |
| Dispute: sinkron, draft kasus | ✓ | ✓ | ✓ | ✓ | – |
| Dispute: setujui dan submit | ✓ | ✓ | ✓ | – | – |
| Kill switch (freeze/unfreeze, step-up) | ✓ | ✓ | – | – | – |
| Hapus dokumen | ✓ | – | – | – | – |
| Hapus organisasi | ✓ | – | – | – | – |

**Preset JUDGE** (hanya tenant demo): hak OWNER kecuali kredensial PayPal, manajemen anggota, dan hapus organisasi; kuota AI 100 panggilan/hari; boleh memakai "Reset demo data".

Four-eyes: bila `fourEyesAboveMinor` terlewati, pemohon (jika manusia) tidak boleh menjadi approver, dan dibutuhkan dua approver berbeda.

## 14. Strategi pengujian

Semua tes server memakai **`node --test`** (Node 22) tanpa kerangka pihak ketiga; PostgreSQL uji berupa database terpisah yang direset per suite.

| # | Jenis | Cakupan |
| --- | --- | --- |
| 14.1 | Unit | Kanonikalisasi JSON, hash ledger, kalkulasi anggaran, tiap aturan Tahap A/B, state machine, enkripsi, TOTP, parser policy |
| 14.2 | Integrasi API | Semua endpoint 11.1–11.3 dengan PayPal Sandbox palsu (server uji lokal) dan satu suite opsional ke Sandbox asli |
| 14.3 | Konkurensi | 200 usulan duplikat paralel + crash worker → 0 double payout; 50 usulan paralel → 0 overshoot anggaran |
| 14.4 | Ledger | Verifikasi penuh setelah semua suite; uji tamper (ubah byte, hapus entri, tukar urutan) terdeteksi 100% |
| 14.5 | AI-eval | Tier A: ≥ 12 serangan dan ≥ 12 sah; Tier B: ≥ 30 dan ≥ 30. Rekaman respons (deterministik di CI) dan mode live opsional; ambang di Bagian 5 |
| 14.6 | Keamanan | Isolasi lintas tenant, IDOR, CSRF, rate limit, unggahan berbahaya, webhook palsu, sandbox-only (string host live) |
| 14.7 | UI | Tes geometri, tes struktur piksel S1/S2 (teks dimask), visual regression 3 viewport, a11y (axe), grep merek — Bagian 12.11 |
| 14.8 | Pagar CI | Gagal bila: bukan Node 22 (`engines` + `process.versions`); ada file `.ts`/`.tsx`; `LICENSE` (MIT) tidak ada atau tidak terdeteksi; lisensi dependensi di luar allowlist atau ada GPL/AGPL; secret scan menemukan sesuatu; host live PayPal muncul di source; warna/ukuran literal di luar token; dependensi native; `npm audit` high/critical pada dependensi produksi; `docker compose` lokal gagal naik; README tanpa bagian wajib (19.4); coverage modul keputusan/ledger/eksekusi < 90% |
| 14.9 | E2E | Playwright: J2–J6, J8, J9 (Tier A) pada Chromium dengan Sandbox palsu; satu alur nyata terhadap Sandbox direkam |
| 14.10 | Kesiapan juri | `scripts/judge-smoke.js`: login akun juri → jalankan skenario simulator end-to-end terhadap Sandbox → verifikasi ledger; dijalankan terhadap URL produksi tiap 6 jam dari 9 Nov sampai 21 Des |

## 15. Deployment cPanel

### 15.1 Struktur repo

```text
jobenpay/
├─ app.cjs                 # bootstrap Passenger: import('./src/server.js')
├─ package.json            # "type":"module", engines node >=22.13 <23
├─ .nvmrc                  # 22
├─ server/ (src/, migrations/, scripts/, test/)
├─ shared/                 # skema Zod + kode error (ESM)
├─ web/ (src/, dist/)      # React + Vite (JSX)
├─ docs/ui-reference/      # tangkapan acuan + design-spec.json
└─ scripts/                # migrate.js, seed.js, verify-ledger.js, ui-overlay.js
```

### 15.2 Prasyarat dan Node 22

Setup Node.js App → pilih **Node.js 22.x** (≥ 22.13). Jika selector hanya menampilkan versi lebih rendah, hentikan dan minta host menambah Node 22 atau pindah ke host lain; jangan menurunkan versi. Verifikasi dengan `node -v` di terminal virtualenv aplikasi. **Plan B (diputuskan di G0 bila Node 22 atau Passenger gagal):** host terkelola yang menyediakan Node 22 dan PostgreSQL (mis. Render, sponsor lomba; ketersediaan Node 22, harga, dan perilaku idle **[VERIFY]**). Kode tidak berubah karena hanya bergantung pada `DATABASE_URL`, env, dan `npm start`.

### 15.3 Langkah

1. Buat database dan user lewat **PostgreSQL Databases** (cPanel); catat host, nama, user, password.
2. **Setup Node.js App:** Application root `jobenpay`, startup file `app.cjs`, mode Production, URL aplikasi (subdomain HTTPS).
3. Unggah kode (Git Version Control atau arsip). `web/dist` **dibangun lokal/CI** lalu diunggah.
4. Env var di panel: `NODE_ENV=production`, `DATABASE_URL`, `JOBENPAY_ENC_KEY`, `JOBENPAY_LEDGER_SIGNING_KEY`, `JOBENPAY_HMAC_PEPPER`, `PUBLIC_BASE_URL`, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `SMTP_*`, `WORKER_ENABLED=1`, `UPLOAD_DIR` (di luar `public_html`).
5. **Run NPM Install** (`npm ci --omit=dev`), lalu `node scripts/migrate.js`, lalu `node scripts/seed.js` (demo, berlabel sintetis).
6. **Cron** tiap menit: `cd ~/jobenpay && node src/jobs/tick.js` (maks 55 dtk).
7. Restart: `touch tmp/restart.txt`.
8. Daftarkan URL webhook dari halaman Settings → PayPal Sandbox ke dashboard developer PayPal, simpan Webhook ID.
9. Cek `/healthz`, `/readyz`, jalankan Simulator, jalankan **Verify ledger**.

### 15.4 Backup dan pemulihan

`pg_dump` terjadwal lewat cron harian (retensi 7 hari) di luar `public_html`; ekspor ledger JSON mingguan beserta hash head dipublikasikan di catatan rilis (mitigasi 9.7).

### 15.5 Pemantauan

`/readyz` memeriksa DB + migrasi + worker heartbeat; dashboard admin menampilkan kedalaman antrean, job DEAD, umur webhook terlama.

### 15.6–15.8 Rilis, rollback, rotasi kunci

Rilis: unggah → install → migrate → restart → smoke test. Rollback: kode versi sebelumnya + migrasi hanya-maju (tidak ada migrasi destruktif tanpa langkah dua-rilis). Rotasi `JOBENPAY_LEDGER_SIGNING_KEY`: tambah `kid` baru; entri lama tetap diverifikasi dengan kunci lama (publik disimpan).

### 15.9 PostgreSQL eksternal

Bila cPanel tidak menyediakan PostgreSQL: gunakan layanan terkelola dengan TLS wajib (`sslmode=verify-full`), IP allowlist ke host cPanel, pool maks 5 koneksi, timeout statement 10 detik.

### 15.10 Batas sumber daya

Pool `pg` maks 5; worker konkurensi 2; hindari modul native; unggahan di-stream (tanpa buffer penuh); heap Node dibatasi sesuai kuota (`--max-old-space-size` lewat env bila diperlukan).

### 15.11 Hosting dan akses juri

Aturan lomba: demo harus tersedia gratis dan tanpa pembatasan untuk pengujian sampai masa penjurian selesai (15 Des 2026, 08:00 PT); bila situs privat, kredensial login harus ada di instruksi uji. Rencana: tersedia **30 Okt–21 Des 2026** (sampai pengumuman pemenang).

| Aspek | Keputusan |
| --- | --- |
| Dua jalur akses | (1) **URL hosting** dengan akun juri; (2) **jalankan sendiri** lewat `docker compose up` (PostgreSQL) + `cp .env.example .env` + `npm ci && npm run setup && npm start` dengan mode `replay` (tanpa kunci AI) atau kredensial sandbox milik juri |
| Tenant demo | Organisasi "JOBENPAY Demo" sudah terhubung ke aplikasi Sandbox milik pengembang, dengan akun bisnis dan penerima sandbox sintetis; juri tidak perlu konfigurasi webhook |
| Akun | `judge@…` (preset JUDGE), `approver@…` (APPROVER), `viewer@…` (VIEWER); kata sandi ada di README dan kolom "Testing instructions" Devpost |
| Anti-idle | Cron cPanel `tick.js` tiap menit memanggil `/healthz`; pemantau eksternal gratis tiap 5 menit; target cold start p95 ≤ 3 detik |
| Pemantauan | `judge-smoke` (14.10) tiap 6 jam; kegagalan → notifikasi email ke pengembang |
| Cadangan | `pg_dump` harian + ekspor ledger mingguan (15.4); salinan kode sebagai rilis GitHub bertag |
| Kegagalan hosting | Video demo (publik di YouTube) menjadi bukti independen; README memuat jalur jalankan-sendiri |

## 16. Rencana pembangunan Tier A: anggaran jam, gerbang, dan pemangkasan

Hari ini **Jumat 30 Okt 2026**. Tenggat resmi **Kamis 12 Nov 2026 12:00 PT = Jumat 13 Nov 03:00 WIB**. Target internal submit **Rabu 11 Nov 21:00 WIB** (± 30 jam sebelum tenggat); 12 Nov dicadangkan hanya untuk keadaan darurat.

### 16.1 Asumsi kapasitas

1 pengembang + asisten pengodean AI, ±10 jam/hari. Kapasitas: Jum 30 Okt malam 3 jam, 31 Okt–11 Nov 12 hari × ±10 jam ≈ 123 jam. Anggaran Tier A 100 jam ⇒ utilisasi ±81%, penyangga ±23 jam. Jika kapasitas nyata < 7 jam/hari di G1, langsung terapkan tangga pemangkasan 16.4 sebelum menunggu terlambat.

### 16.2 Paket kerja Tier A

| WP | Isi | Jam | Hasil yang bisa didemokan (acceptance) |
| --- | --- | :-: | --- |
| WP0 | **Spike kemampuan** (Payouts Sandbox dari host cPanel, webhook publik + verifikasi, Node 22 + Passenger `import()`, panggilan AI berskema ≤ 20 dtk) 3 jam; repo, LICENSE MIT, CI + pagar, kerangka deploy 3 jam | 6 | Laporan go/no-go; CI hijau; `/healthz` hidup di host |
| WP1 | Migrasi tabel Tier A, config Zod, `withTx` | 3 | `migrate` dari DB kosong sukses |
| WP2 | Login/logout, sesi, CSRF, lockout, bootstrap organisasi, RBAC 3 peran + JUDGE, step-up password | 6 | Tes isolasi lintas tenant lulus |
| WP3 | Koneksi PayPal terenkripsi, tes OAuth, penerima webhook (verifikasi, dedup) | 5 | Koneksi "Connected"; webhook uji diterima |
| WP4 | Agen + API key (tampil sekali) | 2 | Key dapat dipakai, direvoke |
| WP5 | Payee + riwayat perubahan | 2 | Perubahan rekening terdeteksi |
| WP6 | Upload (magic bytes, SHA-256), ekstraksi invoice (TXT/PDF teks), deteksi injeksi (heuristik + AI) | 5 | Invoice berinjeksi memiliki `injection_flags` |
| WP7 | Mandat: NL→policy, editor, versi immutable, tanda tangan, anggaran | 6 | Aktivasi menghasilkan entri ledger |
| WP8 | Decision engine Tahap A–D, adapter AI, kode alasan, penjelasan | 8 | Semua aturan A/B memiliki tes; AI fail-closed |
| WP9 | Approval (inbox, detail, approve/reject, terikat `request_hash`) | 3 | Approval hash lain ditolak |
| WP10 | Antrean job, eksekusi payout idempoten, retry, pemulihan crash, rekonsiliasi (webhook + polling) | 8 | 0 double payout pada uji konkurensi |
| WP11 | Ledger berantai-hash + Ed25519, verifikasi, ekspor JSON, trigger anti-ubah | 4 | Tamper terdeteksi 100% |
| WP12 | REST agent API + MCP 3 tool | 4 | Klien contoh Node 22 berhasil memanggil |
| WP13 | Simulator + paket serangan (12 serangan + 12 sah) | 4 | Paket berjalan satu klik |
| WP14 | Token + app shell (4 jam) dan 8 layar: Home, Agents, Mandates, Payees/Documents, Requests (+detail), Approvals, Ledger (+verifikasi), Settings (PayPal, kill switch) + Login; responsif; a11y | 16 | Geometri dan struktur piksel S1/S2 lulus; 3 viewport lulus |
| WP15 | Tes inti: aturan, konkurensi, ledger tamper, geometri, `judge-smoke` | 6 | CI hijau; coverage inti ≥ 90% |
| WP16 | Hardening (CSP, rate limit, batas biaya AI), seed demo, akun juri, keep-alive, pemantau | 4 | `judge-smoke` hijau di produksi |
| WP17 | README EN, diagram arsitektur, deskripsi Devpost, rekam/edit/unggah video, instruksi uji, QA akhir, submit | 8 | Checklist 19.1 100% |
| | **Total** | **100** | |

### 16.3 Kalender dan gerbang

| Hari | Tanggal | Pekerjaan (jam) | Gerbang (kriteria lulus) |
| --- | --- | --- | --- |
| D0 | Jum 30 Okt | WP0 spike (3) | **G0:** laporan spike: (a) payout Sandbox sukses atau aksi pengganti ditetapkan, (b) webhook publik + verifikasi berfungsi, (c) Node 22 + `app.cjs` jalan di Passenger atau Plan B dipilih, (d) AI mengembalikan JSON valid. Registrasi Devpost dan email klarifikasi dikirim paling lambat 31 Okt |
| D1 | Sab 31 Okt | WP0 (3), WP1 (3), WP2 (3) | |
| D2 | Min 1 Nov | WP2 (3), WP14 shell (4), WP3 (2) | |
| D3 | Sen 2 Nov | WP3 (3), WP4 (2), WP5 (2), WP14 (2) | **G1:** login di URL hosting; koneksi PayPal; buat agen, key, payee lewat UI; CI hijau; geometri S1 lulus; kalibrasi jam (16.6) |
| D4 | Sel 3 Nov | WP6 (5), WP7 (4) | |
| D5 | Rab 4 Nov | WP7 (2), WP8 (7) | |
| D6 | Kam 5 Nov | WP8 (1), WP9 (3), WP10 (5) | **G2:** usulan REST → keputusan + kode alasan → approval di UI; ≥ 6 kasus serangan berjalan; **draft Devpost tersimpan** (judul, ringkasan, repo, lisensi) |
| D7 | Jum 6 Nov | WP10 (3), WP11 (4), WP12 (2) | Batas jawaban klarifikasi |
| D8 | Sab 7 Nov | WP12 (2), WP13 (4), WP14 (4) | **G3:** alur nyata Sandbox: usulan → approve → payout → webhook → RECONCILED → ledger valid; paket simulator 12/12; selisih jam kumulatif ≤ +10 jam, jika tidak terapkan 16.4. Bila ahead ≥ 6 jam, aktifkan Tier B |
| D9 | Min 8 Nov | WP14 (6), WP15 (3) | |
| D10 | Sen 9 Nov | WP15 (3), WP16 (4) | **G4 (21:00 WIB): feature freeze.** Semua Definition of Done Tier A hijau kecuali paket submission |
| D11 | Sel 10 Nov | WP17 (8) | **G5:** README, video publik di YouTube, kolom Devpost lengkap (belum dikirim), `judge-smoke` hijau di produksi |
| D12 | Rab 11 Nov | QA akhir, penyangga | **G6 (21:00 WIB): submit**, tangkapan konfirmasi, uji ulang dari peramban bersih |
| D13 | Kam 12 Nov | Cadangan darurat | Tenggat 12 Nov 12:00 PT (13 Nov 03:00 WIB). Setelah tenggat submission tidak dapat diubah |

### 16.4 Tangga pemangkasan

Dipicu bila gerbang meleset > 1 hari atau selisih jam kumulatif > +10 jam. Urutan dari yang pertama dipotong:

| Urutan | Pemangkasan | Hemat |
| --- | --- | :-: |
| L1 | Tes struktur piksel dihentikan; cukup tes geometri + overlay manual | 3 jam |
| L2 | Simulator 8 serangan + 8 sah | 3 jam |
| L3 | Rekonsiliasi hanya via webhook (tanpa polling) | 2 jam |
| L4 | NL→policy diganti editor form (AI tetap untuk ekstraksi dan cek niat) | 2 jam |
| L5 | Ekstraksi invoice hanya TXT (PDF ditunda) | 2 jam |
| L6 | MCP dibuang, REST saja | 3 jam |
| L7 | Layar Settings disederhanakan (PayPal + kill switch dalam satu halaman) | 2 jam |

Total ≈ 17 jam di atas penyangga 23 jam. **Tidak boleh dipotong:** gerbang deterministik, idempotensi, eksekusi Sandbox nyata, ledger + verifikasi, label SANDBOX, responsif, LICENSE, README, video, akun juri.

### 16.5 Tier B (aktif hanya bila ahead ≥ 6 jam di G3, dibekukan di G4)

Urutan prioritas: (1) ledger dengan AG Grid bertema, 4 jam (kandidat hadiah sponsor; syarat edisi dan ketentuan sponsor **[VERIFY]**); (2) aksi REFUND, 4 jam; (3) korpus 30 + 30, 4 jam; (4) dispute sinkron + draft kasus AI, 8 jam; (5) TOTP, 3 jam; (6) CSV dan i18n ID, 5 jam.

### 16.6 Aturan stop/go

- Di **G1** hitung jam aktual WP0–WP5 terhadap rencana (24 jam). Jika aktual > 1,3× rencana, skala sisa estimasi dengan rasio itu dan terapkan tangga 16.4 seperlunya sebelum G2.
- Setiap gerbang diakhiri **deploy ke hosting**: `main` selalu dapat dijalankan dan didemokan (always-shippable).
- Tidak ada fitur baru setelah G4. Hanya perbaikan bug, dokumentasi, dan video.

### 16.7 Definition of Done Tier A ("completed")

1. Alur nyata end-to-end di Sandbox: usulan → keputusan → approval → payout → webhook → RECONCILED → verifikasi ledger, terekam.
2. Metrik Bagian 5 kolom Tier A semuanya terpenuhi.
3. Delapan layar Tier A responsif di 1366/1024/390 tanpa overflow; axe 0 pelanggaran serius.
4. `judge-smoke` hijau di URL produksi; jalur jalankan-sendiri berhasil dari repo bersih ≤ 10 menit.
5. Repo publik, LICENSE terdeteksi di bagian About, README EN lengkap, tanpa rahasia.
6. Video < 3 menit publik di YouTube; kolom Devpost lengkap; submit sebelum G6.

## 17. Risiko dan item verifikasi

### 17.1 Risiko

| Risiko | Dampak | Mitigasi | Pemicu |
| --- | --- | --- | --- |
| Payouts Sandbox tidak tersedia untuk akun developer | Aksi inti tidak bisa didemokan | Spike di G0; aksi pengganti nyata (REFUND atas capture sandbox) atau akun developer lain; keputusan dicatat | Hasil spike |
| Node 22 atau Passenger bermasalah di cPanel | Tidak bisa deploy | Plan B host (15.2) diputuskan di G0 | Hasil spike |
| Kapasitas lebih kecil dari asumsi | Tier A tidak selesai | Kalibrasi di G1, tangga 16.4, gerbang harian | Selisih > +10 jam |
| UI mirip PayPal dianggap melanggar merek | Diskualifikasi atau penolakan | Profil P1, identitas berbeda, email klarifikasi, video tanpa footage UI PayPal | Jawaban penyelenggara |
| Biaya AI melonjak karena demo publik | Demo mati atau tagihan | Batas harian, kuota, registrasi ditutup, fail-closed | 80% anggaran harian |
| Hosting mati saat penjurian | Juri tidak bisa menguji | Keep-alive, smoke 6 jam, jalur jalankan-sendiri, video | Smoke gagal |
| Angka IC3 salah kutip | Kehilangan kredibilitas | Cocokkan dengan PDF resmi sebelum dipakai (1.1) | Sebelum G5 |
| Perilaku Sandbox (dispute, reporting) berbeda | Fitur Tier B tidak bisa didemokan | Tier B opsional; tidak dijanjikan di Devpost | Hasil spike |
| LLM lambat atau tidak tersedia | Keputusan tertahan | Fail-closed ke persetujuan manusia (P2) | Timeout AI |
| Aturan lomba berubah | Kepatuhan | Cek halaman Rules di G2, G4, G6; aturan resmi mengalahkan materi lain | Perubahan di halaman Rules |

### 17.2 Daftar **\[VERIFY\]** (dicocokkan dengan dokumentasi resmi; item 1–4 ditutup oleh spike G0)

1. OAuth client credentials Sandbox (`/v1/oauth2/token`).
2. Payouts: `POST /v1/payments/payouts`, header `PayPal-Request-Id`, `sender_batch_id`, status batch/item, dan apakah akun Sandbox perlu mengaktifkan Payouts.
3. Verifikasi tanda tangan webhook (`/v1/notifications/verify-webhook-signature`) dan nama event (`PAYMENT.PAYOUTSBATCH.*`, `PAYMENT.PAYOUTS-ITEM.*`).
4. Ketersediaan Node 22.x dan perilaku Passenger memuat `app.cjs` dengan `import()` dinamis.
5. Refund capture (`POST /v2/payments/captures/{id}/refund`), dispute `accept-claim`/`provide-evidence`, dan simulasi dispute (Tier B).
6. Spesifikasi MCP (versi, transport Streamable HTTP, bentuk respons tool).
7. Angka IC3 2025 terhadap PDF primer ic3.gov (1.1).
8. Ketentuan hadiah sponsor AG Grid/Render bila dipakai (16.5).
9. Jawaban tertulis penyelenggara atas pertanyaan di 19.2.

## 18. Jejak perubahan

### 18.1 v1.1 → v1.2 (perbaikan skor)

| Kelemahan v1.1 (skor penilaian) | Perbaikan v1.2 | Lokasi |
| --- | --- | --- |
| Kelayakan jadwal 3/10: 13 modul, ±100 FR dalam 13 hari | Tier A/B/C, 100 jam dianggarkan dari kapasitas 123 jam, kalender harian, 7 gerbang, tangga pemangkasan 17 jam, aturan stop/go, DoD | 4.4, 16 |
| Kepatuhan aturan 4/10: tanpa lisensi repo, akses juri, bahasa Inggris, hosting sampai penjurian | Matriks kepatuhan, LICENSE MIT, akun juri, tenant demo, jalur jalankan-sendiri, hosting sampai 21 Des, materi EN | 15.11, 19 |
| Legal 4/10: UI identik, merek di video | Profil P1 (metrik sama, identitas berbeda), email klarifikasi, aturan footage, audit lisensi, secret scan | 12.1, 19.2, 19.3 |
| Dampak 6/10: tanpa bukti | Bukti bersumber (FBI IC3 2025, AP2) dengan disiplin klaim | 1.1 |
| Presentasi 4/10: tanpa paket | README, deskripsi Devpost, naskah video 2:45, instruksi uji | 19.4–19.6 |
| Teknis: CSP memblokir Radix; ambang piksel tidak deterministik; Payouts belum terverifikasi | `style-src-attr`; uji geometri otoritatif + struktur piksel dengan teks dimask di lingkungan terkunci; spike G0 | 13.2, 12.11, 16 |
| Risiko biaya/penyalahgunaan demo publik | Batas biaya AI, kuota, registrasi ditutup, reset demo | 9.11 |
| AG Grid dihapus di v1.1 | Dikembalikan sebagai kandidat Tier B untuk hadiah sponsor | 4.4, 16.5 |

### 18.2 v1.0 → v1.1

Nama JOBENPAY; JavaScript di Node.js 22 (tanpa TypeScript); design system PayPal Business (Bagian 12); Bagian 10–18 yang dirujuk v1.0 ditulis.

## 19. Paket submission dan kepatuhan lomba

Sumber: Official Rules paypalaihackathon.devpost.com/rules, dibaca 30 Okt 2026. **Aturan resmi mengalahkan dokumen ini**; cek ulang di G2, G4, G6.

### 19.1 Matriks kepatuhan

| # | Persyaratan resmi | Pemenuhan di JOBENPAY | Pemilik | Tanggal |
| --- | --- | --- | --- | --- |
| 1 | Usia dewasa di negara tinggal; bukan warga/domisili negara yang dikecualikan; bukan karyawan/keluarga PayPal, Devpost, atau juri | Cek mandiri oleh pendaftar (Indonesia tidak tercantum pada daftar pengecualian) | Pendaftar | 31 Okt |
| 2 | Daftar lewat "Join Hackathon" di Devpost | Daftar dan buat draf | Pendaftar | 31 Okt |
| 3 | Proyek mengintegrasikan platform developer PayPal (Sandbox) dan AI; PayPal sentral | Payouts, webhook, OAuth (inti); AI untuk ekstraksi, cek niat, parser mandat | WP3, WP6, WP8, WP10 | G3 |
| 4 | Baru dibuat atau diperbarui signifikan dalam masa submission (mulai 1 Okt) | Proyek baru; README bagian "Built during the submission period" dengan tanggal commit pertama 30 Okt | WP17 | G5 |
| 5 | Deskripsi teks fitur dan fungsi | Outline 19.4 | WP17 | G5 |
| 6 | Demo fungsional yang bisa dijalankan juri (URL hosting atau instruksi lengkap); bukan mockup | Dua jalur (15.11) | WP16 | G4 |
| 7 | URL repo publik (GitHub) berisi seluruh kode, aset, instruksi; **lisensi open source terdeteksi dan terlihat di About** | LICENSE MIT di root; verifikasi tampilan About di G0 dan G5 | WP0, WP17 | G0 |
| 8 | Video < 3 menit, publik di YouTube, footage di perangkat target, tanpa merek pihak ketiga atau musik berhak cipta | Naskah 19.5 | WP17 | G5 |
| 9 | Akses uji gratis tanpa pembatasan sampai penjurian selesai; kredensial bila privat | Akun juri, hosting sampai 21 Des | WP16 | G4 |
| 10 | Seluruh materi berbahasa Inggris atau disertai terjemahan | UI default EN; README, deskripsi, video, instruksi uji dalam EN | WP17 | G5 |
| 11 | Karya orisinal, milik sendiri, tidak melanggar hak merek/hak lain | Profil P1, audit lisensi (19.3), tanpa aset PayPal | WP14, WP15 | G4 |
| 12 | Izin pemakaian SDK/API pihak ketiga sesuai syaratnya | Tinjau syarat developer PayPal dan penyedia AI; catat di `THIRD_PARTY_NOTICES.md` | WP17 | G5 |
| 13 | Pertanyaan ambigu diajukan tertulis sebelum tenggat | Email 19.2 | Pendaftar | 31 Okt |
| 14 | Draf dapat disimpan; setelah tenggat tidak bisa diubah | Draf 5 Nov, final 11 Nov 21:00 WIB | Pendaftar | 5 dan 11 Nov |
| 15 | Hadiah sponsor mensyaratkan memakai tool sponsor dan syarat khusus | Hanya bila Tier B AG Grid/Render dipakai; baca syarat bagian Prizes | Pendaftar | G3 |

### 19.2 Email klarifikasi (kirim ke alamat kontak pada halaman Rules atau lewat forum Discussions)

> **Subject:** Clarification request: UI patterns and trademarks in a submission (PayPal AI Hackathon)
>
> Hello, we are preparing a sandbox-only submission named JOBENPAY (a control layer for AI-agent payouts built on the PayPal sandbox). We would like to confirm three points before the deadline:
> 1. Is it acceptable for our UI to follow the layout and interaction patterns of the PayPal Business dashboard (navigation structure, spacing, component shapes), provided we use our own name, wordmark, icons, and copy, and no PayPal logos?
> 2. May our demo video show screens of the PayPal sandbox or developer dashboard (including PayPal logos), or should those be omitted or blurred?
> 3. May the app and video mention "PayPal" in factual labels such as "Connect PayPal Sandbox"?
>
> Thank you.

Aturan keputusan: jawaban tertulis diterima sampai 6 Nov; tanpa jawaban atau jawaban negatif ⇒ P1 + video tanpa footage UI PayPal (12.1).

### 19.3 Lisensi dan pihak ketiga

- **Lisensi proyek:** MIT (`LICENSE` di root, `"license": "MIT"` di `package.json`, tampil di About GitHub).
- **Dependensi:** allowlist MIT, Apache-2.0, BSD-2/3, ISC, 0BSD; GPL/AGPL ditolak oleh CI; `THIRD_PARTY_NOTICES.md` dihasilkan otomatis.
- **Rahasia:** repo hanya memuat `.env.example`; pemindai rahasia di CI dan pre-commit.
- **Syarat layanan:** syarat developer PayPal dan syarat API penyedia AI ditinjau di WP17; data demo sintetis.
- **Merek:** grep CI atas "PayPal" pada aset UI selain label faktual; video mengikuti 19.5.

### 19.4 README (EN, bagian wajib dicek CI) dan deskripsi Devpost

README: (1) What it is and the problem (dengan angka IC3 yang telah diverifikasi); (2) Demo: hosted URL + judge credentials; (3) Run it yourself: `docker compose up` → `.env` → `npm ci && npm run setup && npm start`, mode replay; (4) How PayPal is used (Payouts, webhooks, OAuth) and how AI is used (extraction, intent check, mandate parser; AI can only tighten); (5) Architecture diagram; (6) Security model and honest limits; (7) Built during the submission period (tanggal commit); (8) Testing instructions; (9) What's next (Tier C); (10) License.

Deskripsi Devpost: problem → who it is for → what it does → how it is built → challenges → what's next, ≤ 500 kata, memuat tautan repo, hosting, dan video.

### 19.5 Naskah video (target 2:45)

| Waktu | Isi |
| --- | --- |
| 0:00–0:15 | Masalah: pengalihan rekening pada faktur menimbulkan kerugian miliaran dolar (angka IC3 terverifikasi); agen AI yang memegang akses pembayaran menghadapi taktik yang sama |
| 0:15–0:35 | Konsep: mandat → gerbang deterministik → cek AI yang hanya memperketat → approval → eksekusi → ledger |
| 0:35–1:05 | **Aksi 1, faktur sah:** AUTO\_APPROVE → payout Sandbox nyata → webhook → RECONCILED (tampilkan batch ID) |
| 1:05–1:40 | **Aksi 2, serangan:** faktur berisi instruksi tersembunyi dan rekening diganti → ditahan/ditolak dengan kode alasan |
| 1:40–2:05 | **Aksi 3, approval manusia** dan eksekusi |
| 2:05–2:30 | Ledger: Verify valid → ubah satu byte → Verify gagal di seq N |
| 2:30–2:45 | Penutup: Node.js 22 + JavaScript, PostgreSQL, PayPal Payouts + webhook, AI, MCP; dampak; tautan |

Aturan footage: rekaman layar desktop (perangkat target); tanpa logo atau UI PayPal sampai ada izin tertulis (hanya UI JOBENPAY dan respons API); audio sendiri atau musik berlisensi bebas; subtitle EN; tampilkan URL repo dan lisensi di akhir.

### 19.6 Instruksi uji (kolom "Testing instructions", EN)

Hosted: URL + tiga akun + langkah 1–5 (login → Simulator → "Run legit invoice" → "Run attack pack" → Ledger → "Verify"). Local: langkah `docker compose` di README. Catatan: sandbox only; demo data synthetic; replay mode label.

## 20. Rubrik skor mandiri v1.2

Ini penilaian mandiri atas **kualitas dan kesiapan dokumen**, memakai dimensi dan bobot yang sama dengan penilaian sebelumnya (60/100). Ia **bukan jaminan** hasil lomba atau bahwa implementasi selesai; ia dihitung ulang di G3 dengan jam aktual.

| Dimensi | Bobot | v1.1 | v1.2 → tertimbang | Bukti di dokumen | Pengurang yang tersisa |
| --- | :-: | :-: | :-: | --- | --- |
| Kejelasan masalah, solusi, persona | 10% | 9 | **10,0** → 10,0 | 1, 1.1 (bukti bersumber, disiplin klaim, posisi vs AP2), 3 | — |
| Kedalaman dan kebenaran teknis | 20% | 8 | **9,5** → 19,0 | 9, 10, 11; koreksi CSP; uji parity deterministik; spike G0 | −1,0: Payouts Sandbox dan Passenger belum terbukti sampai G0 |
| Keamanan dan integritas dana | 10% | 9 | **9,5** → 9,5 | 13, 9.11 (biaya/penyalahgunaan), fail-closed, ledger | −0,5: tanpa audit keamanan eksternal |
| Kelayakan jadwal dan cakupan | 20% | 3 | **9,5** → 19,0 | 4.4, 16 (100 jam vs 123 jam, gerbang harian, tangga 17 jam, DoD) | −1,0: estimasi jam belum dikalibrasi dengan pengukuran |
| Kepatuhan aturan lomba dan kesiapan submission | 15% | 4 | **10,0** → 15,0 | 15.11, 19 (15 persyaratan dengan pemilik dan tanggal, templat, naskah) | — |
| Legal, IP, merek | 10% | 4 | **9,5** → 9,5 | 12.1 (P1), 19.2, 19.3 | −0,5: menunggu jawaban tertulis penyelenggara |
| UI dan responsif | 10% | 6 | **9,0** → 9,0 | 12 (token terukur, uji otomatis), 12.7, metrik 12–13 | −1,0: area INFERRED sampai ada tangkapan tambahan (12.12) |
| Keterukuran dan pengujian | 5% | 8 | **10,0** → 5,0 | 5 (17 metrik per tier), 14 (10 jenis uji) | — |
| **Total** | 100% | **60** | | | **96 / 100** |

Syarat agar skor ini bermakna: gerbang G0 lulus (Payouts Sandbox dan hosting terbukti), klarifikasi diajukan sebelum 31 Okt, dan angka IC3 dicocokkan dengan PDF primer sebelum dipakai.

## Lampiran A — Acuan visual

| Kode | Berkas | Isi |
| --- | --- | --- |
| S1 | `1793342629430_image.png` | Home/dashboard: sidebar, tombol Create, nav, header (nama, `</>`, lonceng, avatar), kartu tile, Quick Access, judul Business Performance |
| S2 | `1793342650593_image.png` | Kartu formulir (Price + Currency, teks bantuan, tombol "Build It", link "Customize") dan footer penuh |
