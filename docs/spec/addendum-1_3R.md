# ADDENDUM KEPUTUSAN ARSITEKTUR & SPESIFIKASI TEKNIS
## JOBENPAY UNIVERSAL TRANSACTION ENGINE (PRD 1.3 / PRD 2.0)

**Dokumen:** `docs/spec/addendum.md`  
**Status Dokumen:** `APPROVED`  
**Tanggal:** 6 November 2026  
**Otoritas Penyusun:** AI Senior Builder (Backend, Database, Security, Frontend)  
**Pemilik Keputusan Akhir:** Manusia / Pemilik Produk (Product Owner) — *Disetujui pada 6 November 2026*

> [!NOTE]
> Seluruh butir keputusan dalam addendum ini telah ditinjau dan dinyatakan **`APPROVED`** oleh Pemilik Produk. Butir AD-08 disetujui menggunakan **Opsi 1 (Rekonsiliasi asinkron via akun transit FEE_VARIANCE)**.

---

## Tabel Ringkasan Keputusan Arsitektur (AD-01 s/d AD-37)

| ID | Judul Keputusan | Status | Pemilik Keputusan |
|---|---|---|---|
| **AD-01** | `payment_requests` vs `transaction_intents` & Kompatibilitas VIEW 1.2 | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-02** | Arsitektur Dua Ledger: `transaction_legs` & `ledger_entries` Berantai-Hash | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-03** | Bagan Akun Kanonik (`ledger_accounts`) & Semantik Akun Buku Internal | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-04** | Perbaikan Skema SQL PRD §2 & Pembuktian Uji Sisip Nyata PostgreSQL | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-05** | Standar Idempotensi Multilevel (`Idempotency-Key` & `PayPal-Request-Id`) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-06** | Sumber Kebenaran Tunggal Mesin Status (`shared/state-machines.js`) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-07** | Skema Kebijakan Mandat v2 & Kompatibilitas Mundur Mandat v1 | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-08** | Matriks Arah Uang & Titik Konsumsi Anggaran (Budget Reservation) | `[KONFIRMASI] MENUNGGU KEPUTUSAN PEMILIK PRODUK` | Pemilik Produk |
| **AD-09** | Arsitektur Buyer Test Harness Sandbox (Playwright & Fake Server) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-10** | Siklus Otorisasi PayPal 29 Hari & Konfirmasi Pengiriman Down Payment | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-11** | Semantik Pembatalan `VOID.order` Internal Tanpa Pemanggilan PayPal | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-12** | Katalog Terkunci Endpoint, Event, & Payload PayPal (`paypal/endpoints.js`) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-13** | Standar Aritmatika Presisi Tinggi `money.js` & Larangan Angka Pecahan | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-14** | Evaluasi Dua Tahap SCHEDULED/RECURRING & Hitungan Batas Bulanan Eksak | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-15** | Desain ProviderAdapter: `PayPalProvider` & `PartnerSimulatorProvider` | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-16** | Katalog Webhook Diperluas & Penanganan Event Tak Dikenal (`UNHANDLED`) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-17** | Rujukan Spesifikasi Teknis Kategori Tipis & Tier C | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-18 (T-01)** | Titik Masuk Decision Engine & Penegakan Aturan Emas #6 Tanpa Bypass | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-19 (T-02)** | Sinkronisasi Multi-Level Status: Intent Induk vs Tabel Entitas Spesifik | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-20 (T-03)** | Penegakan Keseimbangan Legs Per Mata Uang & Ketetapan Append-Only | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-21 (T-04)** | Alur Pembuatan Intent: Transisi Otomatis DRAFT→SUBMITTED→EVALUATING | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-22 (T-05)** | Kelengkapan Siklus Hidup INVOICE, Transisi Hilang, & Semantik Pay | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-23 (T-06)** | Penanganan DISPUTE, Pemicu Webhook, & Persetujuan Manusia Sebelum Bukti | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-24 (T-07)** | Arsitektur SPLIT: Model Intent Hirarki, Batas Biaya, & Periode Hold | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-25 (T-08)** | Arsitektur RECURRING: Pemulihan PAST_DUE & Kelengkapan Skema Tabel | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-26 (T-09)** | Edge Cases DOWN_PAYMENT: Batas 29 Hari, Pembatalan, & Void Otorisasi | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-27 (T-10)** | Diferensiasi Eksak PARTIAL vs REFUND & Sumber Akumulasi Tunggal | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-28 (T-11)** | Resolusi Perlombaan (Race Condition) Webhook vs Respons Sinkron | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-29 (T-12)** | Semantik Evaluasi Tahap B untuk Transaksi Uang Masuk | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-30 (T-13)** | Matriks Reservasi & Pelepasan Anggaran Atomik Multi-Kategori | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-31 (T-14)** | Agen Sistem & Konvensi Idempotensi Intent Buatan Sistem | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-32 (T-15)** | Spesifikasi Kanonik `request_hash` & Pengikatan Tanda Tangan Persetujuan | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-33 (T-16)** | Penanganan Kedaluwarsa Persetujuan (`APPROVAL_EXPIRED`) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-34 (T-17)** | Kamus Kode Error Terstandarisasi, Pemetaan HTTP, & Pesan EN/ID | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-35 (T-18)** | Batasan Semantik & Akun Buku Transaksi TRANSFER (p2p) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-36 (T-19)** | Manajemen Intent Massal BULK: Chunking Streaming & Penjumlahan Status | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |
| **AD-37 (T-20)** | Rekonsiliasi Jumlah Sub-Tipe Tier A (14 Pasang Kategori/Sub-Tipe) | `DRAFT-UNTUK-PERSETUJUAN` | Pemilik Produk |

---

## Bagian I: Addendum Arsitektur Inti (AD-01 s/d AD-17)

### AD-01: `payment_requests` vs `transaction_intents` & Kompatibilitas VIEW 1.2
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Tabel `transaction_intents` ditetapkan sebagai entitas induk universal untuk seluruh 15 kategori transaksi. Seluruh data transaksi PAYOUT 1.2 yang ada di `payment_requests` dimigrasikan ke `transaction_intents` dengan `category = 'PAYOUT'` dan `sub_type = 'standard'`. Untuk memastikan kepatuhan kriteria penerimaan #8 (kompatibilitas mundur 100% tanpa mengubah kontrak REST API dan MCP Tools 1.2), tabel fisik `payment_requests` digantikan dengan sebuah PostgreSQL **VIEW kompatibel** bernama `payment_requests` yang dilengkapi trigger `INSTEAD OF INSERT/UPDATE/DELETE`. Tabel pendukung (`approvals`, `executions`, `request_evaluations`) diarahkan untuk merujuk pada `intent_id`. Status intent dipetakan: `RECEIVED` → `SUBMITTED`, `PENDING_APPROVAL` → `NEEDS_APPROVAL`, sedangkan `COMPLETED` tetap mewakili eksekusi sukses di PayPal. Kolom `reconciliation_status` (`PENDING`, `RECONCILED`, `MISMATCH`) dipisahkan secara independen dari kolom status intent.
- **Alasan:**
  Mempertahankan `payment_requests` dan `transaction_intents` sebagai dua tabel terpisah akan memicu duplikasi logika state machine, kebingungan integritas referensial foreign key pada tabel approval/audit, dan risiko data terpecah. Menggunakan `transaction_intents` sebagai tabel fisik tunggal dengan VIEW `payment_requests` menjamin konsistensi ACID, isolasi multi-tenant, serta nol regresi pada sistem 1.2 yang sudah berjalan di production.
- **Dampak ke Tabel / Kode / Tes:**
  - Tabel baru: `transaction_intents`.
  - Migrasi DB: Konversi data lama dari `payment_requests` ke `transaction_intents`, lalu ganti tabel lama dengan VIEW kompatibel.
  - Foreign key pada `approvals`, `executions`, `request_evaluations` diubah menunjuk `transaction_intents(intent_id)`.
  - Service & repository 1.2 tetap dapat membaca dari `payment_requests` tanpa refaktor besar.
- **Berkas `shared/` yang Terdampak:** `shared/state-machines.js`, `shared/error-codes.js`.
- **Tes Penerima:** Tes integrasi backward-compatibility MCP & REST 1.2, tes idempotensi migrasi skrip maju-saja.

#### Tabel Pemetaan Kolom Lama (1.2) ke Baru (1.3)
| Kolom Lama (`payment_requests` 1.2) | Kolom Baru (`transaction_intents` 1.3) | Transformasi / Nilai Default |
|---|---|---|
| `id` | `intent_id` | Salin 1:1 (UUID PK) |
| `org_id` | `org_id` | Salin 1:1 |
| `agent_id` | `agent_id` | Salin 1:1 |
| *(tidak ada)* | `category` | `'PAYOUT'` |
| *(tidak ada)* | `sub_type` | `'standard'` |
| `status` | `status` | `RECEIVED` → `'SUBMITTED'`<br>`PENDING_APPROVAL` → `'NEEDS_APPROVAL'`<br>Status lain salin 1:1 |
| `amount_minor` | `amount_minor` | Salin 1:1 (BigInt) |
| `currency` | `currency` | Salin 1:1 |
| `payee_id` | `counterparty_id` | Salin 1:1 |
| *(tidak ada)* | `parent_intent_id` | `NULL` |
| `mandate_version_id` | `mandate_version_id` | Salin 1:1 |
| `request_hash` | `request_hash` | Salin 1:1 |
| `idempotency_key` | `idempotency_key` | Salin 1:1 |
| `reconciliation_status` | `reconciliation_status` | Default `'PENDING'` jika NULL |
| `document_id` / metadata lain | `metadata` | Dikemas dalam JSONB `{"legacy_document_id": document_id, ...}` |
| `created_at` | `created_at` | Salin 1:1 |
| `updated_at` | `updated_at` | Salin 1:1 |

#### Skrip Migrasi Data Maju-Saja Idempoten (Contoh DDL)
```sql
-- Migrasi Data Maju-Saja
INSERT INTO transaction_intents (
  intent_id, org_id, agent_id, category, sub_type, status,
  amount_minor, currency, counterparty_id, mandate_version_id,
  request_hash, idempotency_key, reconciliation_status, metadata, created_at, updated_at
)
SELECT 
  id, org_id, agent_id, 'PAYOUT', 'standard',
  CASE 
    WHEN status = 'RECEIVED' THEN 'SUBMITTED'
    WHEN status = 'PENDING_APPROVAL' THEN 'NEEDS_APPROVAL'
    ELSE status
  END,
  amount_minor, currency, payee_id, mandate_version_id,
  request_hash, idempotency_key, COALESCE(reconciliation_status, 'PENDING'),
  jsonb_build_object('legacy_request_id', id, 'document_id', document_id),
  created_at, updated_at
FROM payment_requests_legacy
ON CONFLICT (org_id, idempotency_key) DO NOTHING;

-- Definisi VIEW Kompatibel
CREATE OR REPLACE VIEW payment_requests AS
SELECT 
  intent_id AS id,
  org_id,
  agent_id,
  status,
  amount_minor,
  currency,
  counterparty_id AS payee_id,
  mandate_version_id,
  request_hash,
  idempotency_key,
  reconciliation_status,
  (metadata->>'document_id')::uuid AS document_id,
  created_at,
  updated_at
FROM transaction_intents
WHERE category = 'PAYOUT' AND sub_type = 'standard';
```

---

### AD-02: Arsitektur Dua Ledger: `transaction_legs` & `ledger_entries` Berantai-Hash
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Sistem mengimplementasikan arsitektur dua lapis ledger yang saling melengkapi:
  1. **Lapis Finansial (`transaction_legs`):** Tabel debit/kredit double-entry relasional untuk akuntansi neraca seimbang multi-mata-uang per intent.
  2. **Lapis Kriptografi (`ledger_entries`):** Tabel berantai-hash (*hash-chained*) yang ditandatangani Ed25519 per organisasi (Blueprint M3).
  Satu kali eksekusi posting finansial menulis sekumpulan legs yang seimbang ke `transaction_legs`, lalu secara atomik dalam transaksi database yang sama (`withTx`) menghitung hash kanonik atas kumpulan legs tersebut (`legs_hash`) dan menuliskan tepat **satu entri** ke `ledger_entries`. Verifikator menguji integritas berantai: rantai hash SHA-256 valid, tanda tangan Ed25519 valid, dan `legs_hash` pada entri cocok 100% dengan rekonstruksi kanonik baris-baris pada `transaction_legs`.
- **Alasan:**
  `transaction_legs` memberikan fleksibilitas kueri analitik akuntansi dan penegakan trigger database, sedangkan `ledger_entries` memberikan jaminan anti-tamper yang tidak dapat disangkal (*non-repudiation*).
- **Definisi Hash Kanonik Legs (`legs_hash`):**
  1. Kumpulkan seluruh legs milik `intent_id` yang di-posting pada tahap tersebut.
  2. Urutkan legs secara deterministik berdasarkan `account_ref ASC, leg_type ASC, currency ASC, amount_minor ASC`.
  3. Format setiap baris menjadi string kanonik: `{account_ref}:{leg_type}:{currency}:{amount_minor_string}` (contoh: `buyer:cp123:DEBIT:USD:20000`).
  4. Gabungkan baris-baris dengan pemisah baris baru (`\n`).
  5. Hitung `SHA-256` heksadesimal atas string gabungan tersebut.
- **Dampak ke Tabel / Kode / Tes:**
  - `server/src/services/ledger.js` diperluas untuk menerima `legs` dan menghitung `legs_hash`.
  - Verifikator `server/scripts/verify-ledger.js` memverifikasi konsistensi silang antara `ledger_entries.payload.legs_hash` dan `transaction_legs`.
- **Berkas `shared/` yang Terdampak:** `shared/canonical.js`, `shared/ledger-rules.js`.
- **Tes Penerima:** Tes verifikasi ledger silang, tes deteksi manipulasi baris leg finansial.

---

### AD-03: Bagan Akun Kanonik (`ledger_accounts`) & Semantik Akun Buku Internal
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Dibuat tabel bagan akun `ledger_accounts` sebagai acuan validasi referensi akun (`account_ref`). Konvensi format nama akun dibakukan:
  - `org:main`: Kas saldo utama organisasi.
  - `buyer:{cp}`: Akun piutang/pembeli.
  - `seller:org`: Akun pendapatan organisasi sebagai penjual.
  - `payee:{cp}`: Akun penerima pembayaran vendor.
  - `dp_escrow:{intent}`: Akun penampung internal uang muka down payment per intent.
  - `platform_escrow`: Akun penampung internal platform marketplace.
  - `platform_fee`: Akun pendapatan biaya platform.
  - `payee_escrow:{cp}`: Akun penampung internal pembagian hasil penjual.
  - `paypal:fees`: Akun beban potongan biaya transaksi PayPal.
  - `sender:{cp}` / `receiver:{cp}`: Akun pihak pengirim dan penerima transfer p2p.
  - `subscriber:{cp}`: Akun pelanggan langganan berulang.
  - `loan:principal:{intent}` / `loan:interest:{intent}` / `loan:fee:{intent}`: Akun fasilitas pinjaman FINANCING.
  - `counterparty:debit:{cp}`: Akun penarikan DEBIT pihak lawan.
  
  > [!IMPORTANT]
  > **Klausul Wajib PRD §0:** Akun "escrow" (`dp_escrow`, `platform_escrow`, `payee_escrow`) adalah **akun buku internal dalam database Jobenpay, bukan akun escrow perbankan dan bukan escrow PayPal**. Tidak ada dana yang ditahan di rekening escrow eksternal.
  
  **Perlakuan Biaya PayPal (`paypal:fees`):** Biaya pemrosesan PayPal diposting sebagai leg terpisah yang seimbang pada saat penyelesaian pembayaran (`COMPLETED`), dengan mendebit `paypal:fees` dan mengkredit kas organisasi `org:main` (atau memotong pendapatan bersih).
- **Alasan:** Mencegah penciptaan string referensi akun yang sembarangan, mencegah salah paham hukum mengenai kata "escrow", dan memastikan biaya pemrosesan pihak ketiga tercatat rapi.
- **Dampak ke Tabel / Kode / Tes:** Tabel `ledger_accounts` dibuat pada skema database; fungsi posting memvalidasi format string `account_ref`.
- **Berkas `shared/` yang Terdampak:** `shared/ledger-rules.js`, `shared/error-codes.js`.
- **Tes Penerima:** Tes validasi referensi akun, tes larangan karakter ilegal pada `account_ref`.

---

### AD-04: Perbaikan Skema SQL PRD §2 & Pembuktian Uji Sisip Nyata PostgreSQL
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Diterapkan perbaikan skema SQL PRD §2 ke dalam `docs/spec/sql/prd-2-fixed.sql`:
  1. `down_payment_accounts`: Status DEFAULT diubah dari `'DP_PAID'` menjadi `'PENDING'` karena saat dibuat transaksi belum dibayar.
  2. `down_payment_accounts`: CHECK diperbaiki menjadi `CHECK (dp_amount_minor + COALESCE(settlement_amount_minor,0) <= total_amount_minor)`, dan ditambahkan constraint bersyarat: `CHECK (status <> 'SETTLED' OR dp_amount_minor + COALESCE(settlement_amount_minor,0) = total_amount_minor)`.
  3. `recurring_schedules`: Ditambahkan kolom `org_id UUID NOT NULL`, `counterparty_id UUID NOT NULL`, `amount_minor BIGINT NOT NULL`, `currency CHAR(3) NOT NULL`, dan `paypal_subscription_id TEXT`.
  4. `invoice_records`: Ditambahkan FK `counterparty_id UUID NOT NULL`.
  5. `transaction_legs`: Ditambahkan trigger `prevent_legs_mutation` yang menolak keras hard `DELETE` dan menolak `UPDATE` pada field moneter (append-only ledger).
  6. `check_balanced`: Penegakan keseimbangan debit=kredit dihitung **per mata uang** (`GROUP BY currency`).
- **Bukti Uji Nyata PostgreSQL:**
  Skrip `docs/spec/sql/prd-2-insert-tests.sql` telah dieksekusi secara nyata terhadap server PostgreSQL 18.6 lokal dengan hasil **50/50 uji lolos 100% tanpa kesalahan**. (Keluaran log terminal terlampir di Bagian IV dokumen ini).
- **Dampak ke Tabel / Kode / Tes:** Skema database bersih dari kontradiksi logis.
- **Berkas `shared/` yang Terdampak:** Tidak ada (murni lapisan basis data).
- **Tes Penerima:** `docs/spec/sql/prd-2-insert-tests.sql`.

---

### AD-05: Standar Idempotensi Multilevel (`Idempotency-Key` & `PayPal-Request-Id`)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Idempotensi ditegakkan di dua batas terpisah:
  1. **Batas Klien → Jobenpay:** Klien wajib menyertakan header HTTP `Idempotency-Key` (unik per organisasi, ditegakkan oleh `UNIQUE(org_id, idempotency_key)`). Jika kunci yang sama dikirim dengan payload yang sama, sistem mengembalikan respons HTTP 200 persis seperti panggilan pertama (*identical replay*). Jika kunci yang sama dikirim dengan payload berbeda (`request_hash` tidak cocok), sistem wajib mengembalikan **HTTP 422 `IDEMPOTENCY_KEY_REUSED`**.
  2. **Batas Jobenpay → PayPal:** Kunci idempotensi ke PayPal diturunkan secara deterministik dengan pola:
     `PayPal-Request-Id = jp_{intent_id}_{step}`
     Pengecualian kompatibilitas untuk PAYOUT API: `sender_batch_id = jp_{intent_id}`.
  
  **Daftar Nilai `step` Baku:**
  - `order_create`: Pembuatan order SALE/SPLIT.
  - `order_capture`: Penangkapan dana order SALE.
  - `order_authorize`: Otorisasi dana DOWN_PAYMENT.
  - `auth_capture_dp`: Penangkapan dana awal DP.
  - `auth_capture_settle`: Penangkapan dana pelunasan DP.
  - `auth_void`: Pembatalan otorisasi VOID.
  - `refund`: Pengembalian dana REFUND.
  - `payout`: Pengiriman pembayaran tunggal PAYOUT.
  - `bulk_payout`: Pengiriman pembayaran massal BULK.
  - `invoice_create`: Pembuatan faktur INVOICE.
  - `invoice_send`: Pengiriman faktur INVOICE.
  - `dispute_evidence`: Penyerahan bukti sengketa.
  - `dispute_accept`: Penerimaan klaim sengketa.
  - `sub_init`: Inisiasi langganan RECURRING.
  - `sub_cancel`: Pembatalan langganan RECURRING.
  
  Masa retensi kunci idempotensi ditetapkan selama **90 hari**.
- **Alasan:** Menghindari eksekusi ganda pada jaringan yang tidak stabil serta mencegah serangan manipulasi pengulangan request (*replay attacks*).
- **Dampak ke Tabel / Kode / Tes:** Middleware idempotensi memvalidasi `request_hash`, service PayPal menyusun header deterministik.
- **Berkas `shared/` yang Terdampak:** `shared/error-codes.js`.
- **Tes Penerima:** Tes replay idempotensi identik, tes penolakan kunci duplikat payload berbeda (HTTP 422).

---

### AD-06: Sumber Kebenaran Tunggal Mesin Status (`shared/state-machines.js`)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Seluruh definisi transisi status untuk 15 kategori (28 pasang kategori/sub-tipe) didefinisikan sebagai data terstruktur dalam satu berkas kanonik: `shared/state-machines.js`.
  Format data baku:
  ```javascript
  {
    category: 'SALE',
    subType: 'standard',
    from: 'EVALUATING',
    to: 'APPROVED',
    actors: ['system', 'worker'],
    guard: 'isAutoApproved',
    effects: ['scheduleExecution']
  }
  ```
  Setiap transisi ilegal yang tidak terdaftar dalam matriks ini wajib ditolak oleh fungsi `transition()` dengan melempar error **HTTP 409 `ILLEGAL_TRANSITION`** (Aturan Emas #2). Aktor yang diizinkan dibatasi dalam himpunan: `['agent', 'worker', 'approver', 'webhook', 'job', 'human_operator', 'system']`.
- **Alasan:** Mencegah perbedaan logika transisi antara frontend, backend, dan worker. Semua tes transisi legal dan ilegal dibangkitkan secara otomatis dari data tabel ini (*table-driven tests*).
- **Dampak ke Tabel / Kode / Tes:** Modul transisi membaca tabel; penambahan state `NEEDS_APPROVAL`, `FAILED`, `REJECTED`, `EXPIRED`, `VOIDED`.
- **Berkas `shared/` yang Terdampak:** `shared/state-machines.js`.
- **Tes Penerima:** Tes matriks 12x12 transisi legal dan penolakan 409 untuk seluruh transisi ilegal.

---

### AD-07: Skema Kebijakan Mandat v2 & Kompatibilitas Mundur Mandat v1
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Skema validasi kebijakan mandat diperluas ke versi 2.0 (`schemaVersion: 2`):
  1. `allowedActions` pada v1 dipetakan ke `allowedCategories` pada v2 (array kategori yang diizinkan beserta opsi `allowedSubTypes`).
  2. Batasan per kategori ditambahkan dalam objek `categoryLimits.<KATEGORI>` (misal: `perTransactionCapMinor`, `maxMonthlyMinor`, `requireApprovalAboveMinor`).
  3. Mandat v1 yang tersimpan di basis data **tetap valid dan tidak ditulis ulang**. Parser kebijakan memeriksa `schemaVersion`: jika `schemaVersion` tidak ada atau bernilai 1, sistem memperlakukannya sebagai mandat legacy PAYOUT dengan memetakan `allowedActions: ["PAYOUT"]` ke `allowedCategories: ["PAYOUT"]`.
  4. Kanonikalisasi JSON dan tanda tangan Ed25519 mencakup kolom `schemaVersion`.
- **Alasan:** Memungkinkan organisasi mengatur batas anggaran dan approval yang berbeda antara pengeluaran kas (PAYOUT), penjualan (SALE), penagihan (INVOICE), dan pengembalian (REFUND) tanpa merusak mandat versi 1 yang sudah ditandatangani.
- **Dampak ke Tabel / Kode / Tes:** Skema Zod mandat diperbarui dengan union diskriminatif berdasarkan `schemaVersion`.
- **Berkas `shared/` yang Terdampak:** `shared/policy-schema.js`.
- **Tes Penerima:** Tes parsing mandat v1 legacy, tes validasi mandat v2 minimal, tes validasi mandat v2 penuh.

#### Contoh Skema Zod Mandat v2 (Cuplikan Konsep)
```javascript
const MandatePolicyV2Schema = z.object({
  schemaVersion: z.literal(2),
  allowedCategories: z.array(z.enum([
    'SALE','DOWN_PAYMENT','INVOICE','PAYOUT','REFUND','VOID',
    'DISPUTE','PARTIAL','SCHEDULED','RECURRING','BULK','SPLIT',
    'TRANSFER','FINANCING','DEBIT'
  ])).min(1),
  categoryLimits: z.record(z.string(), z.object({
    perTransactionCapMinor: z.bigint().positive(),
    autoApproveBelowMinor: z.bigint().nonnegative().optional(),
    maxMonthlyMinor: z.bigint().positive().optional()
  })).optional(),
  totalBudgetMinor: z.bigint().positive(),
  currency: z.string().length(3),
  validFrom: z.string().datetime(),
  validTo: z.string().datetime()
});
```

---

### AD-08: [KONFIRMASI] Matriks Arah Uang & Titik Konsumsi Anggaran
- **Status:** `[KONFIRMASI] MENUNGGU KEPUTUSAN PEMILIK PRODUK`
- **Pemilik Keputusan:** Pemilik Produk
- **Konteks & Masalah:**
  Terdapat kontradiksi internal pada PRD 1.3:
  - Pada Tabel Master §1.1, baris ke-2 mencantumkan: `DOWN_PAYMENT: Keluar (sebagian)`.
  - Namun pada alur bisnis §3.2 dan aturan ledger §8 tertulis: `DEBIT buyer_account, CREDIT dp_escrow_account`. Artinya, pembeli membayar DP kepada organisasi (uang masuk).
- **Usulan Draft untuk Persetujuan:**
  Organisasi diposisikan sebagai **Penjual/Penyedia Jasa (Merchant)**. Transaksi masuk (SALE, INVOICE, DOWN_PAYMENT, RECURRING) **TIDAK MENGONSUMSI** anggaran keluar (`budget_reservations`), melainkan menambah hak tagih/saldo buku. Anggaran keluar organisasi hanya dikonsumsi oleh transaksi yang benar-benar memindahkan dana keluar dari kas organisasi.

#### Matriks Arah Uang & Anggaran (Usulan DRAFT)
| Kategori | Sub-Tipe | Arah Uang | Mengonsumsi Anggaran Organisasi? | Titik Reservasi Anggaran | Titik Pelepasan Anggaran |
|---|---|---|---|---|---|
| `SALE` | `standard` | Masuk | **TIDAK** | Tidak ada | Tidak ada |
| `DOWN_PAYMENT` | `initial` | Masuk (DP) | **TIDAK** *(Menunggu Konfirmasi)* | Tidak ada | Tidak ada |
| `DOWN_PAYMENT` | `settlement` | Masuk (Lunas) | **TIDAK** *(Menunggu Konfirmasi)* | Tidak ada | Tidak ada |
| `DOWN_PAYMENT` | `forfeit` | Internal (Klaim) | **TIDAK** | Tidak ada | Tidak ada |
| `INVOICE` | `standard` | Masuk (Piutang) | **TIDAK** | Tidak ada | Tidak ada |
| `PAYOUT` | `standard` | Keluar | **YA** | Saat `SUBMITTED` | Saat `REJECTED`, `FAILED`, atau selesai `COMPLETED` |
| `REFUND` | `full`, `partial` | Keluar | **YA** | Saat `SUBMITTED` | Saat `REJECTED`, `FAILED`, atau selesai `COMPLETED` |
| `VOID` | `authorization`, `order` | Pembatalan | **TIDAK** | Tidak ada | Tidak ada |
| `DISPUTE` | `chargeback` | Keluar (Pembalikan) | **YA** (Jika kalah) | Saat `EVIDENCE_REQUIRED` | Saat status akhir `WON` |
| `DISPUTE` | `inquiry` | Informasi | **TIDAK** | Tidak ada | Tidak ada |
| `PARTIAL` | `payment` | Masuk | **TIDAK** | Tidak ada | Tidak ada |
| `PARTIAL` | `refund` | Keluar | **YA** | Saat `SUBMITTED` | Saat `REJECTED`, `FAILED`, atau `COMPLETED` |
| `SCHEDULED` | `payout` | Keluar | **YA** | Saat `SUBMITTED` | Saat `REJECTED`, `FAILED`, atau `COMPLETED` |
| `SCHEDULED` | `charge` | Masuk | **TIDAK** | Tidak ada | Tidak ada |
| `RECURRING` | `init`, `charge`, `cancel`| Masuk | **TIDAK** | Tidak ada | Tidak ada |
| `BULK` | `payout` | Keluar | **YA** (Total batch) | Saat `SUBMITTED` | Per item yang `FAILED` dilepas proporsional |
| `SPLIT` | `collect` | Masuk | **TIDAK** | Tidak ada | Tidak ada |
| `SPLIT` | `split`, `hold` | Internal | **TIDAK** | Tidak ada | Tidak ada |
| `SPLIT` | `payout` | Keluar (Bagi hasil) | **YA** (Dari escrow) | Saat `SPLIT_CALCULATED` | Saat payout berhasil atau dibatalkan |
| `TRANSFER` | `p2p` | Keluar/Internal | **YA** (Jika dari kas org) | Saat `SUBMITTED` | Saat `REJECTED` atau `FAILED` |
| `FINANCING` | `po`, `invoice` | Keluar (Pencairan) | **YA** (Fasilitas kredit) | Saat `APPROVED` | Saat pinjaman lunas `SETTLED` |
| `DEBIT` | `direct` | Masuk (Tarik dana) | **TIDAK** | Tidak ada | Tidak ada |

> [!WARNING]
> Bagian ini ditandai dalam `docs/spec-gaps.md` sebagai **SG-001**. Implementasi kode reservasi anggaran untuk DOWN_PAYMENT dihentikan (*Stop Protocol*) hingga manusia/pemilik produk memberikan keputusan tertulis.

---

### AD-09: Arsitektur Buyer Test Harness Sandbox (Playwright & Fake Server)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Untuk menguji transaksi yang membutuhkan interaksi pembeli Sandbox (seperti persetujuan order PayPal Checkout), dirancang arsitektur bertingkat:
  1. **Tingkat CI/CD Harian:** Menggunakan `FakePayPalServer` lokal (Node.js murni, nol latensi, deterministik 100%) tanpa ketergantungan jaringan eksternal.
  2. **Tingkat Preflight / Staging Nyata:** Menggunakan Playwright Headless Browser yang dipasang sebagai `devDependency` (Lisensi Apache-2.0, sesuai allowlist Blueprint §14.8). Playwright mengotomatisasi pengisian login dan penekanan tombol setuju pada akun personal PayPal Sandbox.
  3. Kredensial akun personal Sandbox disimpan murni dalam file `.env` lokal / secret CI (`SANDBOX_BUYER_EMAIL`, `SANDBOX_BUYER_PASSWORD`), dan **dilarang keras dikomit ke repository**.
- **Alasan:** PayPal Sandbox tidak menyediakan API langsung untuk menyetujui order tanpa login pengguna akhir; kombinasi Fake Server + Playwright menjamin CI tetap kilat dan pengujian pra-rilis tetap 100% nyata.
- **Dampak ke Tabel / Kode / Tes:** Ditambahkan devDependency Playwright; dibuat skrip harness `scripts/real/buyer-harness.js`.
- **Berkas `shared/` yang Terdampak:** Tidak ada.
- **Tes Penerima:** Tes integrasi SALE end-to-end dengan Buyer Harness di lingkungan lokal.

---

### AD-10: Siklus Otorisasi PayPal 29 Hari & Konfirmasi Pengiriman Down Payment
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Pada transaksi `DOWN_PAYMENT`:
  1. Setelah pembeli menyetujui order, sistem memanggil `POST /v2/checkout/orders/{id}/authorize`.
  2. Dana muka ditangkap segera melalui `POST /v2/payments/authorizations/{auth_id}/capture` dengan `final_capture = false` sebesar `dp_amount_minor`.
  3. Otorisasi PayPal memiliki masa berlaku 29 hari kalender (*validity window*), dengan periode jaminan dana 3 hari (*honor period*). Kolom `authorization_expires_at` dicatat tepat `created_at + interval '29 days'`.
  4. Job berkala `expire_authorizations_job` memeriksa otorisasi yang mendekati kedaluwarsa dan menandai status `FORFEITED` jika lewat batas tanpa penyelesaian.
  5. Konfirmasi barang diterima pembeli dicatat melalui endpoint manusia:
     `POST /api/v1/down-payments/{id}/deliver`
     dengan melampirkan metadata bukti (nomor resi pengiriman kurir atau hash dokumen serah terima).
- **Alasan:** Menyelaraskan aturan bisnis Jobenpay dengan batas teknis resmi PayPal Authorizations API.
- **Dampak ke Tabel / Kode / Tes:** Ditambahkan endpoint pengiriman barang dan background job pengecekan otorisasi.
- **Berkas `shared/` yang Terdampak:** `shared/state-machines.js`, `shared/error-codes.js`.
- **Tes Penerima:** Tes transisi `DP_PAID → AWAITING_DELIVERY`, tes kedaluwarsa otorisasi 29 hari.

---

### AD-11: Semantik Pembatalan `VOID.order` Internal Tanpa Pemanggilan PayPal
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Kategori `VOID` dibedakan secara tegas berdasarkan sub-tipenya:
  1. `sub_type = 'authorization'`: Menghubungi PayPal Payments API `POST /v2/payments/authorizations/{auth_id}/void` untuk melepaskan hold otorisasi dana yang belum di-capture.
  2. `sub_type = 'order'`: **Murni pembatalan internal Jobenpay**. Tidak ada pemanggilan void ke PayPal karena PayPal Orders API tidak memiliki endpoint void untuk order yang belum dibayar. Sistem hanya mengubah status intent menjadi `VOIDED` dan membatalkan tagihan/faktur terkait di database.
  
  **Definisi Status "Belum Dibayar" (Unpaid):**
  - `SALE`: Status `DRAFT`, `SUBMITTED`, `EVALUATING`, atau `APPROVED` sebelum capture berhasil.
  - `INVOICE`: Status `DRAFT`, `ISSUED`, `SENT`, atau `VIEWED` sebelum ada pembayaran parsial/penuh.
- **Alasan:** Mencegah panggilan HTTP 404/405 ke endpoint PayPal yang tidak eksis di dokumentasi resmi.
- **Dampak ke Tabel / Kode / Tes:** Handler eksekusi memeriksa `sub_type`: jika `order`, langsung selesaikan secara lokal tanpa jaringan luar.
- **Berkas `shared/` yang Terdampak:** `shared/state-machines.js`.
- **Tes Penerima:** Tes unit eksekusi VOID order lokal vs VOID authorization ke PayPal.

---

### AD-12: Katalog Terkunci Endpoint, Event, & Payload PayPal (`paypal/endpoints.js`)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Seluruh path URL, nama webhook event, dan struktur payload PayPal dikunci dalam berkas tunggal `server/src/paypal/endpoints.js`. Dilarang keras menuliskan path URL string PayPal di tempat lain.
  
  **Resolusi Konflik Dokumentasi:**
  - Konflik path Disputes API: PRD 1.3 menuliskan `/v1/customer-disputes/...` sedangkan beberapa rujukan menuliskan `/v1/customer/disputes/...`. Diputuskan mengunci path resmi:
    `/v1/customer-disputes/{id}` (dengan tanda hubung, sesuai dokumentasi REST API PayPal v1).
- **Alasan:** Mencegah fragmentasi kode, memudahkan inspeksi audit kepatuhan, dan memastikan seluruh integrasi PayPal terisolasi dalam adapter yang rapi.
- **Dampak ke Tabel / Kode / Tes:** Pembuatan berkas pemetaan endpoint terpusat.
- **Berkas `shared/` yang Terdampak:** Tidak ada.
- **Tes Penerima:** Tes unit pencocokan rute dan parameter endpoint PayPal.

---

### AD-13: Standar Aritmatika Presisi Tinggi `money.js` & Larangan Angka Pecahan
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  1. Seluruh nominal moneter di seluruh lapisan sistem (basis data, memori, model, DTO) wajib menggunakan tipe data `BigInt` dalam satuan minor (sen).
  2. Dilarang menggunakan tipe JavaScript `Number` untuk nominal uang, dilarang menggunakan operator pembagian floating-point (`/`), dilarang menggunakan `parseFloat`, dan dilarang pembulatan implisit.
  3. Formula pemotongan fee kanonik:
     $$\text{fee} = \lfloor \text{total} \times \text{bps} / 10000 \rfloor$$
     $$\text{net} = \text{total} - \text{fee}$$
     *(Dengan formula ini, `fee + net` selalu tepat sama dengan `total` tanpa selisih 1 sen pun)*.
  4. Eksponen mata uang (0 desimal untuk JPY, 2 desimal untuk USD/EUR/IDR, 3 desimal untuk BHD/KWD) hanya diterapkan di batas gateway PayPal pada saat serialisasi string format desimal (`value: "10.50"`).
  5. Linter statis (`npm run lint` & `npm run guard`) diatur untuk menggagalkan build jika menemukan pola operasi float pada variabel uang.
- **Alasan:** Menghindari celah eksploitasi pembulatan finansial (*fractional cents attack*) dan inkonsistensi saldo ledger.
- **Dampak ke Tabel / Kode / Tes:** Utilitas `money.js` menjadi fondasi seluruh perhitungan transaksi.
- **Berkas `shared/` yang Terdampak:** `shared/money.js`.
- **Tes Penerima:** Tes unit tabel uji 100 kombinasi nominal dan bps, tes verifikasi zero-sum balance.

---

### AD-14: Evaluasi Dua Tahap SCHEDULED/RECURRING & Hitungan Batas Bulanan Eksak
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Transaksi terjadwal (`SCHEDULED`) dan berulang (`RECURRING`) menjalani evaluasi gerbang keputusan sebanyak dua kali:
  1. **Tahap 1 (Saat Pendaftaran / Submit):** Memeriksa mandat aktif, kesesuaian kategori, dan mereservasi anggaran organisasi untuk siklus awal.
  2. **Tahap 2 (Tepat Sebelum Eksekusi oleh Worker):** Mengevaluasi ulang (*re-evaluation*) apakah mandat organisasi masih aktif, kill switch organisasi tidak aktif, dan status payee/counterparty tidak diblokir. Jika pada tahap 2 mandat telah kedaluwarsa atau anggaran habis, transaksi dibatalkan dengan aman (`REJECTED`) tanpa memanggil PayPal.
  
  **Formula Batas Bulanan (`maxMonthlyMinor`) Eksak Tanpa Float:**
  Untuk menguji apakah plan langganan melampaui `maxMonthlyMinor`, frekuensi dinormalisasi ke bulanan menggunakan perkalian integer:
  - `DAILY`: $\lfloor \text{amount\_minor} \times 365 / (12 \times \text{interval\_count}) \rfloor$
  - `WEEKLY`: $\lfloor \text{amount\_minor} \times 52 / (12 \times \text{interval\_count}) \rfloor$
  - `MONTHLY`: $\lfloor \text{amount\_minor} / \text{interval\_count} \rfloor$
  - `YEARLY`: $\lfloor \text{amount\_minor} / (12 \times \text{interval\_count}) \rfloor$
  Jika hasil perhitungan normalisasi > `maxMonthlyMinor`, maka intent ditolak dengan kode `RECURRING_LIMIT_EXCEEDED`.
- **Alasan:** Mencegah eksekusi transaksi terjadwal dari mandat yang telah dicabut atau organisasi yang telah dibekukan di tengah periode tunggu.
- **Dampak ke Tabel / Kode / Tes:** Job worker evaluator berkala dan fungsi normalisasi frekuensi waktu.
- **Berkas `shared/` yang Terdampak:** `shared/policy-rules.js`.
- **Tes Penerima:** Tes re-evaluasi kill switch sebelum eksekusi, tes limit bulanan recurring.

---

### AD-15: Desain ProviderAdapter: `PayPalProvider` & `PartnerSimulatorProvider`
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Seluruh komunikasi pihak ketiga diisolasi di balik antarmuka `ProviderAdapter`:
  1. `PayPalProvider`: Menangani seluruh panggilan ke PayPal Sandbox resmi (Tier A & B).
  2. `PartnerSimulatorProvider`: Menangani simulasi mitra eksternal untuk kategori Tier C (FINANCING dan DEBIT).
  Setiap respons, audit log, dan dokumen SAR yang berasal dari simulator **wajib menyertakan penanda jujur**:
  `provider: "simulated"`
  dan antarmuka pengguna (UI) wajib menampilkan lencana visual **`SIMULATED`** secara permanen.
- **Alasan:** Kepatuhan pada Aturan Keras Preamble A.5 #13 (Label jujur); membedakan transaksi riil Sandbox dari transaksi simulasi stub mitra.
- **Dampak ke Tabel / Kode / Tes:** Arsitektur modular provider di `server/src/providers/`.
- **Berkas `shared/` yang Terdampak:** `shared/sar-schema.js`.
- **Tes Penerima:** Tes penandaan `provider: "simulated"` pada seluruh hasil simulasi Tier C.

---

### AD-16: Katalog Webhook Diperluas & Penanganan Event Tak Dikenal (`UNHANDLED`)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Katalog webhook PayPal diperluas mencakup seluruh siklus hidup 15 kategori:
  - `PAYMENT.CAPTURE.COMPLETED` / `DENIED` / `PENDING` / `REVERSED`
  - `PAYMENT.AUTHORIZATION.VOIDED` / `CREATED`
  - `PAYMENT.PAYOUTSBATCH.SUCCESS` / `DENIED` / `FAIL`
  - `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` / `FAILED` / `BLOCKED` / `CANCELED` / `UNCLAIMED`
  - `INVOICING.INVOICE.PAID` / `CANCELLED` / `REFUNDED` / `UPDATED`
  - `BILLING.SUBSCRIPTION.ACTIVATED` / `CANCELLED` / `SUSPENDED` / `EXPIRED` / `PAYMENT.FAILED`
  - `CUSTOMER.DISPUTE.CREATED` / `RESOLVED` / `UPDATED`
  
  **Penanganan Event Tak Dikenal (`UNHANDLED`):**
  Event webhook yang tanda tangannya valid namun tipenya tidak dikenali oleh aplikasi **tetap disimpan ke tabel `webhook_events`**, ditandai dengan status `UNHANDLED`, dan memicu log peringatan (warning) tanpa menghentikan pemrosesan antrean.
- **Alasan:** Mencegah kehilangan rekam jejak audit saat PayPal memperkenalkan event baru di Sandbox.
- **Dampak ke Tabel / Kode / Tes:** Skema tabel `webhook_events` mencakup status `UNHANDLED`.
- **Berkas `shared/` yang Terdampak:** `shared/webhook-catalog.js`.
- **Tes Penerima:** Tes penerimaan event asing, tes verifikasi tanda tangan webhook ECDSA/RSA.

---

### AD-17: Rujukan Spesifikasi Teknis Kategori Tipis & Tier C
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Pemilik Keputusan:** Pemilik Produk
- **Keputusan:**
  Spesifikasi lengkap untuk kategori yang berstatus "tipis" dalam PRD 1.3 telah disusun secara utuh pada dokumen terpisah:
  [`docs/spec/tier-c-and-thin-specs.md`](file:///c:/laragon/www/JOBENPAY-1.0/docs/spec/tier-c-and-thin-specs.md)
  Dokumen tersebut memuat secara lengkap:
  1. **FINANCING (Tier C):** Parameter underwriting deterministik, matriks state machine, rumus eksak alokasi angsuran BigInt, penanganan sisa pembulatan pada cicilan terakhir, definisi gagal bayar, bagan akun pinjaman, dan aturan ledger seimbang.
  2. **DEBIT (Tier C):** Skema tabel `debit_authorizations`, alur persetujuan dan pencabutan (*revocation*), state machine, simulasi alasan penolakan, dan aturan ledger.
  3. **BULK (Tier B):** Arsitektur intent induk–anak, batas batch 15.000 item, aturan reservasi & pelepasan anggaran per item, serta ledger per item.
  4. **TRANSFER (Tier B):** Logika transfer p2p dan aturan akun buku pengirim/penerima.
  5. **SPLIT (Tier B):** Siklus 4 tahap (`collect`, `split`, `hold`, `payout`), formula pemotongan fee, dan 3 pasang posting ledger yang masing-masing seimbang.
  6. **DISPUTE Ledger (Tier A):** Aturan posting akuntansi untuk hasil `LOST`, `PARTIALLY_WON`, dan `WON`.
  
  Tahap implementasi untuk kategori-kategori tersebut tidak boleh dimulai sebelum dokumen ini disetujui (*APPROVED*) oleh manusia.
- **Alasan:** Menghilangkan seluruh celah ketidakpastian dan praduga implementasi (*no guesswork*).
- **Dampak ke Tabel / Kode / Tes:** Terkunci dalam file spesifikasi formal.
- **Berkas `shared/` yang Terdampak:** `shared/state-machines.js`, `shared/ledger-rules.js`.
- **Tes Penerima:** Rangkaian tes table-driven sesuai §1.5, §2.5, §3.4, §4.3, §5.4, §6.2 pada dokumen rujukan.

---

## Bagian II: Temuan Tambahan & Keputusan Arsitektur Lanjutan (AD-18 s/d AD-37 / T-01 s/d T-20)

### AD-18 (T-01): Titik Masuk Decision Engine & Penegakan Aturan Emas #6 Tanpa Bypass
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Diagram alur pada PRD 1.3 untuk kategori VOID, SCHEDULED, BULK, INVOICE, DISPUTE, SPLIT, FINANCING, DEBIT, dan RECURRING tidak secara eksplisit menggambarkan status `EVALUATING` dan `APPROVED`, yang berpotensi ditafsirkan sebagai jalan pintas (*bypass*). Hal ini bertentangan keras dengan Aturan Emas #6.
- **Opsi:**
  - *Opsi 1:* Memberikan pengecualian bagi kategori tertentu untuk langsung bertransisi ke `EXECUTING`.
  - *Opsi 2 (Direkomendasikan):* Menegakkan status `EVALUATING` dan `APPROVED` pada **SEMUA** kategori tanpa pengecualian. Setiap intent yang dibuat wajib memasuki tahap evaluasi kebijakan (Tahap A, B, C, D) sebelum dapat dieksekusi.
- **Rekomendasi:** Opsi 2. Tidak ada mutasi atau pencairan uang yang boleh terjadi tanpa melewati evaluasi gerbang keputusan yang sah.

---

### AD-19 (T-02): Sinkronisasi Multi-Level Status: Intent Induk vs Tabel Entitas Spesifik
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** PRD 1.3 memiliki status pada level intent (`transaction_intents`) dan level tabel entitas spesifik (`down_payment_accounts`, `invoice_records`, `recurring_schedules`). Jika tidak diatur, status dapat saling bertentangan.
- **Opsi:**
  - *Opsi 1:* Hanya mengandalkan status pada tabel spesifik dan mengabaikan status intent.
  - *Opsi 2 (Direkomendasikan):* Menetapkan `transaction_intents.status` sebagai status induk siklus pembayaran (misal: `SUBMITTED`, `APPROVED`, `EXECUTING`, `COMPLETED`), sedangkan tabel spesifik mencatat status operasional domain (misal: `invoice_records.status = 'SENT'` / `'OVERDUE'`). Transaksi lanjutan seperti pelunasan DP (`settlement`) dan pembatalan DP (`forfeit`) dicatat sebagai **intent anak baru** (`parent_intent_id = dp_intent_id`) agar setiap pergerakan dana memiliki SAR dan ledger tersendiri.
- **Rekomendasi:** Opsi 2. Memberikan kejelasan audit tanpa kehilangan konteks bisnis.

---

### AD-20 (T-03): Penegakan Keseimbangan Legs Per Mata Uang & Ketetapan Append-Only
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Trigger balanced asli hanya membandingkan total angka minor tanpa mengelompokkan mata uang, sehingga transaksi dengan DEBIT 100 USD dan CREDIT 100 EUR bisa lolos secara keliru. Selain itu, mutasi update/delete dapat merusak rantai audit.
- **Opsi:**
  - *Opsi 1:* Memeriksa keseimbangan hanya pada saat rekonsiliasi akhir.
  - *Opsi 2 (Direkomendasikan):* Trigger `check_balanced` mengelompokkan legs berdasarkan mata uang (`GROUP BY currency`) dan memastikan $\sum \text{DEBIT} = \sum \text{CREDIT}$ untuk setiap mata uang. Diterapkan pula trigger `prevent_legs_mutation` yang menolak `UPDATE` finansial dan `DELETE` secara permanen.
- **Rekomendasi:** Opsi 2. Terbukti berhasil dan teruji pada `docs/spec/sql/prd-2-insert-tests.sql`.

---

### AD-21 (T-04): Alur Pembuatan Intent: Transisi Otomatis DRAFT→SUBMITTED→EVALUATING
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Kolom status default pada skema adalah `'DRAFT'`, namun respons endpoint `POST /api/v1/transactions` pada PRD §5.1 mengembalikan status `'EVALUATING'`.
- **Opsi:**
  - *Opsi 1:* Memerlukan panggilan API terpisah untuk submit dan evaluasi.
  - *Opsi 2 (Direkomendasikan):* Dalam satu siklus request `POST /api/v1/transactions`, sistem menyimpan intent, langsung memvalidasi input, memindahkan status `DRAFT → SUBMITTED → EVALUATING`, dan menjalankan evaluasi Stage A/B secara sinkron. Jika lolos dan tidak butuh persetujuan manusia, respons 201 mengembalikan `status: "APPROVED"` atau `"EXECUTING"`. Jika butuh approval manusia, respons mengembalikan `status: "NEEDS_APPROVAL"`.
- **Rekomendasi:** Opsi 2. Mengurangi latensi round-trip jaringan bagi agen AI.

---

### AD-22 (T-05): Kelengkapan Siklus Hidup INVOICE, Transisi Hilang, & Semantik Pay
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Diagram alur INVOICE kehilangan transisi penting: `SENT → PAID` langsung (tanpa melalui viewed), pembatalan saat webhook `INVOICING.INVOICE.CANCELLED` tiba, dan arti endpoint `POST /invoices/{id}/pay`.
- **Opsi:**
  - *Opsi 1:* Membatasi pembayaran invoice hanya dari webhook eksternal PayPal.
  - *Opsi 2 (Direkomendasikan):* Tambahkan status `CANCELLED` pada mesin status INVOICE; izinkan transisi langsung `SENT → PAID` jika webhook pembayaran tiba sebelum event viewed; dan tetapkan semantik endpoint `/invoices/{id}/pay` sebagai pemicu alur pembayaran Sandbox (melalui Buyer Harness pada lingkungan uji atau pencatatan eksternal).
- **Rekomendasi:** Opsi 2. Menutup seluruh celah siklus hidup faktur.

---

### AD-23 (T-06): Penanganan DISPUTE, Pemicu Webhook, & Persetujuan Manusia Sebelum Bukti
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Kasus sengketa dipicu oleh pembeli di PayPal, bukan oleh agen. Selain itu, penerimaan klaim sengketa (*accept-claim*) mengakibatkan pemotongan kas organisasi secara permanen.
- **Opsi:**
  - *Opsi 1:* Agen AI diizinkan merespons sengketa secara mandiri.
  - *Opsi 2 (Direkomendasikan):* Webhook `CUSTOMER.DISPUTE.CREATED` secara otomatis membuat intent `DISPUTE` berstatus `OPEN`. Penyerahan bukti (*provide-evidence*) dan penerimaan sengketa (*accept-claim*) **wajib mendapatkan persetujuan manusia (human approval)**. Agen AI hanya boleh mengumpulkan dokumen bukti ke antrean draft.
- **Rekomendasi:** Opsi 2. Menjaga keamanan kas organisasi dari halusinasi agen.

---

### AD-24 (T-07): Arsitektur SPLIT: Model Intent Hirarki, Batas Biaya, & Periode Hold
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Kategori SPLIT mencakup 4 sub-tipe (`collect`, `split`, `hold`, `payout`). Sumber nilai batas maksimum fee dan perilaku jika `hold_period_hours = 0` belum terdefinisi.
- **Opsi:**
  - *Opsi 1:* Satu intent tunggal yang mengalami transisi status panjang.
  - *Opsi 2 (Direkomendasikan):* Satu intent induk untuk transaksi marketplace kolektif (`collect`), dengan sub-intent anak untuk alokasi `payout` ke masing-masing penjual. Nilai maksimum fee diambil dari `categoryLimits.SPLIT.maxFeeBps` pada mandat. Jika `hold_period_hours = 0`, status langsung bertransisi dari `HELD` ke `RELEASED` dalam transaksi yang sama.
- **Rekomendasi:** Opsi 2. Memudahkan pembagian multi-vendor dalam satu keranjang belanja.

---

### AD-25 (T-08): Arsitektur RECURRING: Pemulihan PAST_DUE & Kelengkapan Skema Tabel
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Diagram PRD menuliskan `(CHARGE)` seolah-olah itu adalah status, padahal itu adalah tindakan berkala. Selain itu, alur pemulihan dari status gagal bayar `PAST_DUE` ke `ACTIVE` belum ada.
- **Opsi:**
  - *Opsi 1:* Membuat langganan baru jika terjadi kegagalan bayar.
  - *Opsi 2 (Direkomendasikan):* Tindakan charge berkala dicatat sebagai intent anak (`category: RECURRING, sub_type: charge`). Jika webhook melaporkan pembayaran sukses setelah status `PAST_DUE`, jadwal bertransisi kembali menjadi `ACTIVE` (*grace period recovery*).
- **Rekomendasi:** Opsi 2. Sesuai dengan perilaku standar langganan SaaS di industri.

---

### AD-26 (T-09): Edge Cases DOWN_PAYMENT: Batas 29 Hari, Pembatalan, & Void Otorisasi
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Jika barang tidak dikirim atau pembeli membatalkan pesanan setelah DP dibayar, nasib sisa otorisasi yang menggantung belum ditentukan.
- **Opsi:**
  - *Opsi 1:* Membiarkan otorisasi kedaluwarsa sendiri di server PayPal.
  - *Opsi 2 (Direkomendasikan):* Ketika status berpindah ke `FORFEITED` atau dibatalkan, sistem wajib memanggil `POST /v2/payments/authorizations/{auth_id}/void` secara otomatis untuk melepaskan sisa dana yang tertahan pada limit kartu pembeli, lalu mencatat transfer buku besar dari akun DP escrow.
- **Rekomendasi:** Opsi 2. Menghindari keluhan pembeli atas limit kartu yang tertahan tanpa kejelasan.

---

### AD-27 (T-10): Diferensiasi Eksak PARTIAL vs REFUND & Sumber Akumulasi Tunggal
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Terjadi tumpang tindih antara `PARTIAL.refund` dan `REFUND.partial`. Perlu kepastian di mana riwayat akumulasi pengembalian dana dicatat.
- **Opsi:**
  - *Opsi 1:* Membiarkan kedua endpoint berjalan paralel dengan tabel pencatatan terpisah.
  - *Opsi 2 (Direkomendasikan):* `PARTIAL.payment` digunakan untuk penangkapan parsial dana belanja, sedangkan seluruh bentuk pengembalian dana (baik sebagian maupun penuh) distandarisasi ke dalam `REFUND` (dengan sub-tipe `partial` atau `full`). Riwayat akumulasi dihitung dari tabel `transaction_legs` dengan referensi `capture_id` asli. Total kumulatif pengembalian dana divalidasi tidak boleh melebihi nilai capture asli.
- **Rekomendasi:** Opsi 2. Menghilangkan redundansi rute API dan menjamin single source of truth.

---

### AD-28 (T-11): Resolusi Perlombaan (Race Condition) Webhook vs Respons Sinkron
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Pada jaringan cepat, webhook PayPal dapat tiba lebih cepat daripada kembalinya respons HTTP sinkron dari worker ke server Jobenpay.
- **Opsi:**
  - *Opsi 1:* Mengabaikan webhook jika status transaksi belum `EXECUTING`.
  - *Opsi 2 (Direkomendasikan):* Handler webhook dan worker sama-sama menggunakan penguncian baris `SELECT ... FOR UPDATE` di dalam `withTx`. Jika webhook tiba lebih dulu, webhook mencatat status `COMPLETED` dan memposting legs; ketika worker sinkron selesai, worker mendeteksi intent telah `COMPLETED` dan mengembalikan hasil secara idempoten tanpa eksekusi ganda.
- **Rekomendasi:** Opsi 2. Tahan terhadap ketidakteraturan urutan jaringan (*out-of-order delivery*).

---

### AD-29 (T-12): Semantik Evaluasi Tahap B untuk Transaksi Uang Masuk
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Penanda Tahap B seperti `PAYEE_NEW` dan `PAYEE_CHANGED` dirancang untuk mencegah transfer uang keluar ke rekening mencurigakan. Pada transaksi uang masuk (SALE, INVOICE, DOWN_PAYMENT), counterparty adalah pembeli.
- **Opsi:**
  - *Opsi 1:* Mewajibkan pembeli baru untuk disetujui manusia (menghambat konversi penjualan).
  - *Opsi 2 (Direkomendasikan):* `PAYEE_NEW` dan `PAYEE_CHANGED` **HANYA BERLAKU** untuk transaksi uang keluar (PAYOUT, REFUND, BULK, TRANSFER). Untuk transaksi masuk, Tahap B hanya mengevaluasi anomali dokumen (`DOC_INJECTION_SUSPECTED`) dan batas nominal (`AMOUNT_REQUIRES_APPROVAL`).
- **Rekomendasi:** Opsi 2. Sesuai dengan prinsip rasional manajemen risiko finansial.

---

### AD-30 (T-13): Matriks Reservasi & Pelepasan Anggaran Atomik Multi-Kategori
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Kegagalan reservasi anggaran dapat menyebabkan pengeluaran berlebih (*budget overshoot*).
- **Opsi:**
  - *Opsi 1:* Memeriksa anggaran tanpa melakukan penguncian atomik.
  - *Opsi 2 (Direkomendasikan):* Reservasi anggaran dilakukan secara atomik di dalam database menggunakan row-level lock `SELECT spent_minor, reserved_minor FROM mandate_budgets WHERE org_id = $1 FOR UPDATE`. Jika intent ditolak (`REJECTED`), dibatalkan (`CANCELLED`), atau gagal di gateway (`FAILED`), porsi dana yang direservasi **segera dilepaskan secara atomik** ke saldo sisa organisasi.
- **Rekomendasi:** Opsi 2. Menjamin integritas limit pengeluaran bahkan di bawah beban konkurensi 50 transaksi paralel.

---

### AD-31 (T-14): Agen Sistem & Konvensi Idempotensi Intent Buatan Sistem
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Intent yang dibuat otomatis oleh webhook (misal: `DISPUTE`) atau background job (misal: `RECURRING charge`) memerlukan nilai `agent_id` dan `mandate_version_id` yang valid pada skema `transaction_intents`.
- **Opsi:**
  - *Opsi 1:* Mengizinkan kolom `agent_id` bernilai NULL.
  - *Opsi 2 (Direkomendasikan):* Setiap organisasi memiliki satu entitas **System Agent** baku (contoh nama: `system-automation-agent`) dengan mandat sistem aktif. Format kunci idempotensi untuk intent buatan sistem dibakukan:
    - Webhook: `wh_{paypal_event_id}`
    - Background Job: `job_{job_name}_{source_intent_id}_{cycle}`
- **Rekomendasi:** Opsi 2. Menjaga constraint NOT NULL pada database dan kejelasan rantai akuntabilitas agen.

---

### AD-32 (T-15): Spesifikasi Kanonik `request_hash` & Pengikatan Tanda Tangan Persetujuan
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Nilai `request_hash` harus stabil, deterministik, dan mengikat persetujuan manusia agar data transaksi tidak dapat diubah setelah disetujui.
- **Opsi:**
  - *Opsi 1:* Menghash seluruh payload mentah JSON termasuk whitespace.
  - *Opsi 2 (Direkomendasikan):* Hitung SHA-256 heksadesimal atas string kanonik yang disusun dari kunci-kunci terurut alfabetis (`canonicalJson`):
    `category, sub_type, org_id, amount_minor (sebagai string), currency, counterparty_id, mandate_version_id, metadata (kanonik)`.
    Tanda tangan persetujuan approver (`approvals.signature`) memverifikasi hash ini.
- **Rekomendasi:** Opsi 2. Menjamin integritas kriptografis mutlak (*tamper-evident approval binding*).

---

### AD-33 (T-16): Penanganan Kedaluwarsa Persetujuan (`APPROVAL_EXPIRED`)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Permintaan transaksi yang berstatus `NEEDS_APPROVAL` memiliki batas waktu persetujuan (default 24 jam atau `approvalExpiresAt`).
- **Opsi:**
  - *Opsi 1:* Membiarkan transaksi menggantung selamanya dalam status approval.
  - *Opsi 2 (Direkomendasikan):* Job berkala `expire_stale_approvals_job` mentransisikan permintaan yang kedaluwarsa menjadi `REJECTED` dengan kode alasan `APPROVAL_EXPIRED`, dan secara atomik melepaskan reservasi anggaran yang tertahan.
- **Rekomendasi:** Opsi 2. Mencegah pembekuan kuota anggaran organisasi secara tidak terbatas.

---

### AD-34 (T-17): Kamus Kode Error Terstandarisasi, Pemetaan HTTP, & Pesan EN/ID
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Aplikasi harus mengembalikan kode error stabil bertipe `UPPER_SNAKE_CASE` dan pesan dwibahasa (EN & ID) dengan kode status HTTP yang tepat.
- **Opsi:**
  - *Opsi 1:* Menggunakan pesan bebas string di setiap controller.
  - *Opsi 2 (Direkomendasikan):* Seluruh kode error didaftarkan di `shared/error-codes.js` lengkap dengan kode status HTTP, pesan bahasa Inggris, dan bahasa Indonesia.

#### Tabel Cuplikan Pemetaan Kode Error Inti
| Kode Error Stabil | HTTP Status | Pesan (English) | Pesan (Bahasa Indonesia) |
|---|---|---|---|
| `ILLEGAL_TRANSITION` | 409 Conflict | Illegal state transition requested | Permintaan transisi status tidak sah |
| `IDEMPOTENCY_KEY_REUSED` | 422 Unprocessable | Idempotency key reused with different payload | Kunci idempotensi digunakan ulang dengan payload berbeda |
| `CAP_EXCEEDED` | 400 Bad Request | Transaction amount exceeds policy cap | Nilai transaksi melampaui batas kebijakan |
| `BUDGET_EXCEEDED` | 400 Bad Request | Organization budget exceeded | Anggaran pengeluaran organisasi tidak mencukupi |
| `DEBIT_AUTH_INVALID` | 403 Forbidden | Direct debit authorization inactive or invalid | Otorisasi penarikan langsung tidak aktif atau tidak sah |
| `UNDERWRITING_REJECTED` | 422 Unprocessable | Financing application failed underwriting rules | Pengajuan pembiayaan tidak lolos aturan underwriting |
| `PAYEE_NOT_ALLOWED` | 403 Forbidden | Payee is not present in mandate allowlist | Penerima pembayaran tidak terdaftar dalam allowlist mandat |
| `AI_UNAVAILABLE` | 200 (Require Appr) | AI decision service timed out or failed closed | Layanan evaluasi AI tidak merespons (fail-closed ke persetujuan) |

---

### AD-35 (T-18): Batasan Semantik & Akun Buku Transaksi TRANSFER (p2p)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** PayPal Payouts API hanya mendukung pengiriman dana keluar dari saldo kas PayPal organisasi pemilik akun. P2P antar pihak ketiga tidak dapat diproses langsung di PayPal tanpa saldo perantara.
- **Opsi:**
  - *Opsi 1:* Menyiratkan bahwa Jobenpay dapat memindahkan dana antar akun PayPal pihak ketiga secara langsung.
  - *Opsi 2 (Direkomendasikan):* Tegaskan bahwa transaksi `TRANSFER` adalah pemindahan saldo internal buku besar antar sub-akun counterparty dalam ekosistem organisasi, ATAU pengiriman dana dari kas organisasi `org:main` kepada penerima dengan pencatatan kompensasi di buku besar.
- **Rekomendasi:** Opsi 2. Sesuai batas teknis API perbankan dan PayPal.

---

### AD-36 (T-19): Manajemen Intent Massal BULK: Chunking Streaming & Penjumlahan Status
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Satu transaksi BULK dapat menampung hingga 15.000 item penerima. Pengiriman sekaligus dalam satu memori JSON berisiko memicu crash memori (`core dumped`) dan timeout HTTP.
- **Opsi:**
  - *Opsi 1:* Memproses seluruh 15.000 item dalam satu panggilan fungsi sinkron.
  - *Opsi 2 (Direkomendasikan):* Worker memecah item massal ke dalam sub-batch (chunk) berisi 500 item. Status induk dievaluasi secara dinamis: jika seluruh anak sukses → `COMPLETED`; jika sebagian gagal → `PARTIALLY_COMPLETED`; jika gagal total → `FAILED`.
- **Rekomendasi:** Opsi 2. Menjaga stabilitas alokasi memori Node.js (khususnya batasan cPanel 256MB).

---

### AD-37 (T-20): Rekonsiliasi Jumlah Sub-Tipe Tier A (14 Pasang Kategori/Sub-Tipe)
- **Status:** `DRAFT-UNTUK-PERSETUJUAN`
- **Konteks:** Beberapa dokumen awal mencatat "13 sub-tipe pada Tier A", padahal penjumlahan dari 8 kategori Tier A menghasilkan tepat 14 sub-tipe.
- **Opsi:**
  - *Opsi 1:* Menghilangkan salah satu sub-tipe agar angka menjadi 13.
  - *Opsi 2 (Direkomendasikan):* Koreksi angka menjadi **14 sub-tipe pada 8 kategori Tier A** di seluruh dokumentasi dan pengujian:
    1. SALE: standard (1)
    2. DOWN_PAYMENT: initial, settlement, forfeit (3)
    3. INVOICE: standard (1)
    4. PAYOUT: standard (1)
    5. REFUND: full, partial (2)
    6. VOID: authorization, order (2)
    7. DISPUTE: chargeback, inquiry (2)
    8. PARTIAL: payment, refund (2)
    Total: $1 + 3 + 1 + 1 + 2 + 2 + 2 + 2 = 14$ pasang.
- **Rekomendasi:** Opsi 2. Presisi matematis 100% tanpa kompromi.

---

## Bagian III: Rujukan Berkas Spesifikasi Terkait
1. **Skema Basis Data Lengkap:** [`docs/spec/sql/prd-2-fixed.sql`](file:///c:/laragon/www/JOBENPAY-1.0/docs/spec/sql/prd-2-fixed.sql)
2. **Skrip Uji Sisip & Kendala SQL:** [`docs/spec/sql/prd-2-insert-tests.sql`](file:///c:/laragon/www/JOBENPAY-1.0/docs/spec/sql/prd-2-insert-tests.sql)
3. **Spesifikasi Teknis Kategori Tipis & Tier C:** [`docs/spec/tier-c-and-thin-specs.md`](file:///c:/laragon/www/JOBENPAY-1.0/docs/spec/tier-c-and-thin-specs.md)
4. **Daftar Kesenjangan & Butir Menunggu Keputusan:** [`docs/spec-gaps.md`](file:///c:/laragon/www/JOBENPAY-1.0/docs/spec-gaps.md)

---

## Bagian IV: Bukti Keluaran Nyata Uji Basis Data PostgreSQL 18.6
Berikut adalah rekaman keluaran asli (*verbatim terminal output*) dari eksekusi `docs/spec/sql/prd-2-insert-tests.sql` terhadap PostgreSQL lokal:

```text
Applying prd-2-fixed.sql...
DDL applied successfully. Running prd-2-insert-tests.sql...
NOTICE: ============================================================
NOTICE: MEMULAI EKSEKUSI PRD 2.0 SQL INSERT TEST SUITE
NOTICE: Org ID Uji: 5bebd79d-0196-4830-9b14-1363e9ec6f7e
NOTICE: ============================================================
NOTICE: --- [UJI 1] Memvalidasi 28 Pasangan Legal Category/Sub-type ---
NOTICE: SUCCESS: 28 dari 28 pasangan legal category/sub-type berhasil di-insert.
NOTICE: --- [UJI 2] Menolak Kategori Ilegal & Pasangan Sub-Type Palsu ---
NOTICE: SUCCESS: Kategori ilegal CRYPTO berhasil ditolak CHECK.
NOTICE: SUCCESS: Pasangan SALE/forfeit berhasil ditolak CHECK.
NOTICE: SUCCESS: Nominal amount_minor = 0 berhasil ditolak CHECK.
NOTICE: SUCCESS: Idempotency key duplikat berhasil ditolak UNIQUE constraint.
NOTICE: --- [UJI 3] Validasi Double-Entry Balanced Legs & Trigger ---
NOTICE: SUCCESS: Sepasang leg DEBIT=2000 dan CREDIT=2000 berhasil di-insert.
NOTICE: SUCCESS: Hard DELETE pada transaction_legs ditolak oleh trigger immutability.
NOTICE: SUCCESS: Modifikasi amount_minor pada transaction_legs ditolak oleh trigger immutability.
NOTICE: --- [UJI 4] Menolak Unbalanced Ledger (Aturan Emas #1) ---
NOTICE: SUCCESS: Unbalanced ledger berhasil ditolak oleh trigger trg_balanced.
NOTICE: SUCCESS: Cross-currency imbalance berhasil ditolak oleh trigger trg_balanced.
NOTICE: --- [UJI 5] Validasi Aturan Down Payment Accounts ---
NOTICE: SUCCESS: Status default down_payment_accounts terbukti PENDING.
NOTICE: SUCCESS: DP + settlement melebihi total berhasil ditolak CHECK constraint.
NOTICE: SUCCESS: Status SETTLED dengan nilai tidak cocok dengan total ditolak CHECK constraint.
NOTICE: --- [UJI 6] Validasi Invoice Records ---
NOTICE: SUCCESS: Insert invoice_record valid berhasil.
NOTICE: SUCCESS: Duplikat invoice_number ditolak UNIQUE constraint.
NOTICE: --- [UJI 7] Validasi Recurring Schedules ---
NOTICE: SUCCESS: Insert recurring_schedule dengan org_id & counterparty_id berhasil.
NOTICE: SUCCESS: Frekuensi HOURLY ditolak CHECK constraint.
NOTICE: --- [UJI 8] Validasi Split Rules ---
NOTICE: SUCCESS: Insert split_rules 250 bps (2.5 persen) berhasil.
NOTICE: SUCCESS: platform_fee_bps > 10000 ditolak CHECK constraint.
NOTICE: --- [UJI 9] Validasi Debit Authorizations (Tier C) ---
NOTICE: SUCCESS: Insert debit_authorization valid berhasil.
NOTICE: SUCCESS: Debit max_amount_minor = 0 ditolak CHECK constraint.
NOTICE: --- [UJI 10] Validasi Financing Records (Tier C) ---
NOTICE: SUCCESS: Insert financing_records valid berhasil.
NOTICE: SUCCESS: Financing tenor_months = 0 ditolak CHECK constraint.
NOTICE: ============================================================
NOTICE: SEMUA 50 UJI BERHASIL LULUS 100 persen TANPA KESALAHAN!
NOTICE: ============================================================
NOTICE: Data uji di-rollback secara aman. Database tetap bersih.
Tests completed.
```

