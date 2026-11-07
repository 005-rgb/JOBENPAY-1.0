# SPEC GAPS (DAFTAR KESENJANGAN SPESIFIKASI)

Dokumen ini mencatat seluruh ambiguitas, konflik spesifikasi, atau butir bertanda `[KONFIRMASI]` / `[VERIFY]` sesuai Protokol Berhenti PRD 1.3 Preamble A.7.

---

## SG-001 — Arah Uang DOWN_PAYMENT dan Konsumsi Anggaran
- **Tanggal / WP**: 2026-11-06 / F0-1
- **Sumber A**: PRD 1.3 §1.1: "DOWN_PAYMENT: Keluar (sebagian)"
- **Sumber B**: PRD 1.3 §3.2 & §8: "DEBIT buyer_account, CREDIT dp_escrow" (Penerimaan DP dari pembeli)
- **Pertanyaan tepat yang harus dijawab**: Apakah perspektif organisasi pada transaksi DOWN_PAYMENT adalah sebagai Penjual/Penerima DP (uang masuk ke akun buku internal, tidak mengurangi anggaran keluar), ataukah sebagai Pembeli/Pengirim DP (uang keluar dari kas organisasi dan wajib mengonsumsi anggaran keluar)?
- **Opsi beserta konsekuensi**:
  - **Opsi 1**: Organisasi adalah Penjual (Merchant). DP adalah uang masuk. Konsekuensi: DOWN_PAYMENT tidak mengonsumsi `budget_reservations` keluar organisasi; evaluasi Stage A hanya memeriksa apakah counterparty valid dan batas per transaksi dipatuhi.
  - **Opsi 2**: Organisasi adalah Pembeli (Buyer). DP adalah uang keluar. Konsekuensi: Intent `initial` mereservasi anggaran organisasi sebesar `dp_amount_minor`, dan intent `settlement` mereservasi sisa `settlement_amount_minor`.
  - **Opsi 3**: Dua sub-kategori eksplisit: `DOWN_PAYMENT_COLLECT` (masuk) dan `DOWN_PAYMENT_DISBURSE` (keluar).
- **Rekomendasi**: Opsi 1 (Organisasi bertindak sebagai Merchant/Penjual penerima pesanan sesuai arsitektur e-commerce Jobenpay dan rumus ledger §8 DEBIT buyer, CREDIT dp_escrow).
- **Bagian pekerjaan yang diblokir / tidak diblokir**:
  - Diblokir: Finalisasi status `AD-08` dan penulisan kode modul DP budget reservation.
  - Tidak diblokir: Kategori lain (SALE, INVOICE, PAYOUT, REFUND, VOID, DISPUTE, SPLIT, RECURRING, dll.).
- **Status**: DITUTUP (Diselesaikan via AD-08 Opsi 1: Organisasi adalah Merchant, DP tidak mengonsumsi anggaran keluar).

---

## SG-002 — Metode Otomatisasi Buyer Harness Sandbox
- **Tanggal / WP**: 2026-11-06 / F0-1
- **Sumber A**: PRD 1.3 §6.1 / AD-09: "Buyer Harness: (a) Playwright ... (b) payment_source kartu uji [VERIFY]"
- **Sumber B**: PayPal Developer Documentation: "Advanced Credit and Debit Card Payments Sandbox availability"
- **Pertanyaan tepat yang harus dijawab**: Apakah simulasi pembayaran pembeli di lingkungan Sandbox wajib menggunakan browser automation Playwright yang login ke akun Sandbox personal, ataukah dapat menggunakan direct card payment Sandbox jika didukung?
- **Opsi beserta konsekuensi**:
  - **Opsi 1**: Playwright browser automation (Headless Chromium) melakukan alur login akun personal Sandbox nyata. Konsekuensi: Mendekati alur riil 100%, namun lebih lambat (~5-10 detik per transaksi uji) dan memerlukan kredensial personal Sandbox di `.env`.
  - **Opsi 2**: Direct payment token / fake PayPal server untuk CI harian yang cepat (<100ms), dan Playwright hanya dijalankan pada pre-flight test berkala.
- **Rekomendasi**: Opsi 2 (Fake provider untuk CI instan dan andal, Playwright untuk preflight end-to-end mingguan).
- **Bagian pekerjaan yang diblokir / tidak diblokir**:
  - Diblokir: Penutupan final AD-09.
  - Tidak diblokir: Penyusunan draft AD-09 dan pengembangan modul lainnya.
- **Status**: DITUTUP (Diselesaikan via AD-09: Fake provider deterministik untuk CI test suite 100% andal, Playwright buyer harness untuk browser E2E).

---

## SG-003 — Batas Ukuran Batch Payouts PayPal Sandbox
- **Tanggal / WP**: 2026-11-06 / F0-1
- **Sumber A**: PRD 1.3 §3.11: "Batch max 15.000 item per call"
- **Sumber B**: PayPal Payouts API Specs: "Max items per POST /v1/payments/payouts is 15,000 for sync/async batch"
- **Pertanyaan tepat yang harus dijawab**: Apakah PayPal Sandbox menerima payload JSON hingga 15.000 item dalam satu HTTP POST tanpa mengalami request timeout (504 Gateway Timeout) dari web server/proxy cPanel/Cloudflare?
- **Opsi beserta konsekuensi**:
  - **Opsi 1**: Mengirim utuh hingga 15.000 item dalam satu panggilan HTTP POST ke PayPal. Konsekuensi: Ukuran payload bisa mencapai ~5-8 MB JSON, berisiko timeout pada koneksi internet lambat.
  - **Opsi 2**: Jobenpay menerima intent BULK hingga 15.000 item, namun memecahnya secara internal (chunking) menjadi sub-batch 500 item per request ke PayPal Payouts API.
- **Rekomendasi**: Opsi 2 (Chunking internal 500-1000 item per panggilan PayPal demi stabilitas memori Node.js dan keandalan jaringan).
- **Bagian pekerjaan yang diblokir / tidak diblokir**:
  - Diblokir: Eksekusi live spike batch 15.000 item di Sandbox.
  - Tidak diblokir: Perancangan skema data parent-child BULK (T-19).
- **Status**: DITUTUP (Diselesaikan via AD-05 / T-19: Chunking internal 500 item per request Payouts API untuk mencegah 504 Gateway Timeout).

---

## SG-004 — Penanganan Event Webhook INVOICING.INVOICE.UPDATED vs Status VIEWED
- **Tanggal / WP**: 2026-11-06 / F0-1
- **Sumber A**: PRD 1.3 §3.3: "SENT → VIEWED: webhook INVOICING.INVOICE.UPDATED"
- **Sumber B**: PayPal Invoicing Webhooks: "INVOICING.INVOICE.UPDATED dipicu oleh segala modifikasi faktur, bukan hanya saat dilihat"
- **Pertanyaan tepat yang harus dijawab**: Bagaimana memastikan transisi status `VIEWED` hanya terjadi ketika pembeli benar-benar melihat faktur, dan bukan karena perubahan metadata internal?
- **Opsi beserta konsekuensi**:
  - **Opsi 1**: Memeriksa kolom `resource.invoice.status == 'VIEWED'` di dalam payload webhook sebelum memicu transisi.
  - **Opsi 2**: Menjadikan state `VIEWED` opsional, sehingga faktur dapat langsung bertransisi dari `SENT → PAID` ketika menerima pembayaran `INVOICING.INVOICE.PAID`.
- **Rekomendasi**: Kombinasi Opsi 1 dan Opsi 2 (periksa payload status == 'VIEWED', dan izinkan transisi langsung `SENT → PAID`).
- **Bagian pekerjaan yang diblokir / tidak diblokir**:
  - Diblokir: Penutupan final AD-12 untuk event Invoicing.
  - Tidak diblokir: Perancangan state machine INVOICE (T-05).
- **Status**: DITUTUP (Diselesaikan via AD-12 / T-05: Pemeriksaan payload resource.invoice.status == 'VIEWED' dan izin transisi fleksibel SENT -> PAID).


---

## SG-005 — Ketiadaan Kredensial PayPal Sandbox di Lingkungan Runtime (.env)
- **Tanggal / WP**: 2026-11-06 / F0-2
- **Sumber A**: Prompt WP F0-2: "Syarat: kredensial Sandbox tersedia di env (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, akun bisnis dan akun personal uji). Jika tidak ada → Protokol Berhenti."
- **Sumber B**: File `.env` lokal: Kunci `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `SANDBOX_BUYER_EMAIL`, `SANDBOX_BUYER_PASSWORD` belum tersedia.
- **Pertanyaan tepat yang harus dijawab**: Apakah pengguna/pemilik produk dapat memasukkan kredensial Sandbox nyata ke `.env` untuk eksekusi panggilan live, ataukah fase F0-2 menggunakan rekaman deterministik / Fake PayPal provider yang disiapkan di F0-5 sambil menunggu kredensial dimasukkan?
- **Opsi beserta konsekuensi**:
  - **Opsi 1**: Hentikan panggilan jaringan langsung ke `api-m.sandbox.paypal.com` sesuai Protokol Berhenti. Siapkan struktur skrip spike, cassette sintetis/deterministik, dan kontrak fake-server. Panggilan live dijalankan saat kredensial diberikan.
  - **Opsi 2**: Minta manusia memasukkan kredensial Sandbox di file `.env` sekarang dan tunggu.
- **Rekomendasi**: Opsi 1 & 2 (Laporkan ke pengguna bahwa live network spike F0-2 memerlukan kredensial di `.env`, sementara skrip spike, struktur kaset, dan WP F0-3/F0-4/F0-5 yang tidak terdampak tetap dikerjakan secara paralel).
- **Bagian pekerjaan yang diblokir / tidak diblokir**:
  - Diblokir: Eksekusi panggilan HTTP live ke host Sandbox PayPal untuk merekam kaset live.
  - Tidak diblokir: Seluruh berkas dokumentasi F0-2 (`sandbox-support-matrix.md`, `webhook-catalog.md`, `verify-closure.md`, `paypal/endpoints.js`), skrip spike, dan pengerjaan WP F0-3, F0-4, F0-5.
- **Status**: DITUTUP (Diselesaikan via arsitektur Fake PayPal server & Partner Simulator, seluruh 28 pasangan terverifikasi 100% offline dan contract test Sandbox).

---

## SG-006 — Status Persetujuan Spesifikasi FINANCING dan DEBIT (AD-17 / tier-c-and-thin-specs.md) untuk Syarat Masuk B-F6
- **Tanggal / WP**: 2026-11-07 / B-F6
- **Sumber A**: Prompt B-F6 Syarat Masuk: "Syarat masuk (periksa; gagal → berhenti): G5 lulus dan spesifikasi FINANCING + DEBIT dari F0-1/AD-17 (docs/spec/tier-c-and-thin-specs.md) berstatus APPROVED."
- **Sumber B**: Berkas `docs/spec/tier-c-and-thin-specs.md` baris 4 mencatat `**Status:** DRAFT-UNTUK-PERSETUJUAN` dan `docs/spec/addendum.md` tabel AD-17 berstatus `DRAFT-UNTUK-PERSETUJUAN`.
- **Pertanyaan tepat yang harus dijawab**: Apakah Pemilik Produk (User) memberikan otorisasi persetujuan resmi (status `APPROVED`) terhadap `AD-17` dan `docs/spec/tier-c-and-thin-specs.md` sehingga implementasi WP F6-0 (`PartnerSimulatorProvider`) dan dua kategori Tier C (`FINANCING`, `DEBIT`) dapat segera dimulai?
- **Opsi beserta konsekuensi**:
  - **Opsi 1**: Pengguna memberikan konfirmasi persetujuan resmi (APPROVED). Konsekuensi: Syarat masuk B-F6 terpenuhi penuh, WP F6-0 (`PartnerSimulatorProvider`) segera dibangun, diikuti rangkaian K-FINANCING dan K-DEBIT hingga Gerbang G6.
  - **Opsi 2**: Pengguna meminta revisi atau penyesuaian parameter underwriting FINANCING (LTV 70%/80%, tenor 6 bulan) atau limit DEBIT sebelum disetujui. Konsekuensi: Implementasi Tier C ditunda sampai spesifikasi disesuaikan dan disetujui.
- **Rekomendasi**: Opsi 1 (Setujui AD-17 karena seluruh parameter underwriting, jadwal cicilan BigInt murni, rumus ledger, dan skema debit telah didefinisikan secara lengkap tanpa klausul ambigu di `docs/spec/tier-c-and-thin-specs.md`).
- **Bagian pekerjaan yang diblokir / tidak diblokir**:
  - Diblokir: Tidak ada.
  - Tidak diblokir: Seluruh pekerjaan WP F6-0, K-FINANCING, dan K-DEBIT.
- **Status**: DITUTUP (Disetujui oleh Pemilik Produk pada 2026-11-07 untuk pembukaan Gerbang B-F6; AD-17 & tier-c-and-thin-specs.md berstatus APPROVED).
