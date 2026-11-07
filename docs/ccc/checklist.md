# Category Completeness Checklist (CCC) — 14 Butir Standar Kesiapan Kategori

Dokumen ini mendefinisikan **14 Butir Wajib** Kesiapan Kategori (*Category Completeness Checklist*) untuk setiap kategori transaksi (15 kategori / 28 pasangan sub-tipe) dalam JOBENPAY Universal Transaction Engine.

Setiap kategori transaksi yang diimplementasikan pada Fase F1 s/d F4 wajib memenuhi seluruh 14 butir ini tanpa kompromi sebelum dinyatakan selesai (*Definition of Done* per kategori). Kepatuhan diverifikasi secara otomatis menggunakan tool CLI:
```bash
node scripts/ccc-check.js <KATEGORI>
```

---

## 14 Butir Wajib Category Completeness Checklist (CCC)

### 1. Migrasi DB & Constraint Uji (Database Migration & Constraints)
- Tabel domain spesifik dan/atau ekstensi skema untuk kategori terdefinisi di migrasi PostgreSQL (`server/migrations/*`).
- Constraint eksplisit: `CHECK` untuk status valid, `FOREIGN KEY` dengan `org_id` isolasi tenant, `UNIQUE` untuk referensi unik provider/eksternal.
- Uji SQL valid dan invalid insert terdaftar dan lulus di `docs/spec/sql/*insert-tests.sql`.

### 2. Definisi Spesifikasi Shared (`shared/`)
- Definisi kategori, sub-tipe, status, dan transisi terdaftar di berkas spesifikasi `shared/` (`shared/categories.js`, `shared/state-machines.js`, `shared/policy-rules.js`, `shared/ledger-rules.js`).
- Tidak ada hardcode nama status atau transisi di luar `shared/`.

### 3. Tes Terbangkit dari Data (Data-Driven Test Generation)
- Test suite unit (`server/test/unit/*.test.js`) secara otomatis mengimpor matriks transisi dan policy dari `shared/` dan membangkitkan parameterized test cases untuk seluruh permutasi status dan transisi.
- CI guard `scripts/check-tests-from-data.js` memverifikasi bahwa tidak ada status atau transisi di `shared/` yang tidak teruji.

### 4. Aturan Ledger Berimbang & Property-Based Test (Balanced Ledger)
- Definisi kaki jurnal (*legs*) di `shared/ledger-rules.js` menjamin double-entry balanced:
  $$\sum \text{DEBIT} = \sum \text{CREDIT}$$
- Mata uang (*currency*) konsisten di seluruh kaki per entri.
- Teruji dengan property test / fuzzing acak pada satuan minor BigInt.
- Trigger database `trg_check_ledger_balanced` dan immutability trigger aktif.

### 5. Provider Adapter + Fake Server + Contract Test
- Modul adapter provider (`server/src/services/paypal/*`) memanggil endpoint resmi yang terdaftar di `paypal/endpoints.js`.
- Simulator `fake-paypal/server.js` mengimplementasikan rute terkait dan dapat memutar ulang rekaman cassette resmi.
- Contract test di `tests/contract/*` memvalidasi kesetaraan respons schema antara Fake PayPal dan PayPal Sandbox.

### 6. Webhook Handler + 4 Skenario Tes Wajib
Handler webhook untuk event kategori mengimplementasikan dan lulus 4 tes spesifik:
1. **Happy Path:** Pemrosesan event sukses, memperbarui status entitas dan mencatat log audit.
2. **Out-of-Order Delivery:** Menerima event dalam urutan terbalik tanpa merusak state machine (state machine menolak transisi mundur atau menyimpannya sebagai idempotensi).
3. **Duplicate Delivery:** Pengiriman event ganda diproses secara idempoten tanpa duplikasi pencatatan ledger atau mutasi state.
4. **Invalid Signature:** Penolakan tegas (HTTP 400/401) terhadap payload webhook dengan tanda tangan tidak valid atau dipalsukan.

### 7. Idempotensi Mutasi Teruji
- API mewajibkan header `Idempotency-Key` (unik per org).
- ID mutasi upstream diturunkan secara deterministik:
  - Default: `PayPal-Request-Id = jp_{intent_id}_{step}`
  - Payout: `sender_batch_id = jp_{intent_id}`
- Pengulangan request dengan kunci sama dan payload sama mengembalikan respons identik dari cache/DB.
- Pengulangan request dengan kunci sama tetapi payload berbeda wajib ditolak dengan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

### 8. Konkurensi & Row Locking (`withTx` + `SELECT FOR UPDATE`)
- Semua mutasi saldo atau perubahan state dijalankan di dalam blok transaksi terisolasi (`withTx`).
- Penguncian baris (`SELECT ... FOR UPDATE`) ditegakkan pada entitas induk dan saldo kumulatif sebelum evaluasi limit atau mutasi ledger.
- Uji konkurensi (20 request paralel serentak) membuktikan tidak ada over-spend (*double-spending*) atau race condition.

### 9. Skema SAR v1.1 (Suspicious Activity Report)
- Setiap transaksi mencatat audit log berformat SAR v1.1.
- Field wajib terisi: `category`, `sub_type`, `legs_summary`, dan `paypal_refs` (ID PayPal seperti `order_id`, `capture_id`, `payout_batch_id`).
- SAR dihitung dan disimpan secara atomik bersama penyegelan transaksi.

### 10. API RESTful + Validasi Zod + MCP Tool Exposure
- Rute Express terdefinisi dengan middleware autentikasi dan otorisasi per-org.
- Validasi payload request masuk menggunakan skema Zod ketat (`strict()`, tanpa float/number untuk nilai uang).
- MCP Tool terdaftar untuk agen AI eksternal:
  - Agen AI **hanya boleh mengusulkan** (*propose*) dan membaca (*read/get*).
  - Agen AI **dilarang keras** memiliki tool untuk approve, execute, atau cancel.

### 11. Visualisasi State UI & Tindakan Maker/Checker
- Komponen web frontend (`web/src/pages/*`) menampilkan badge status akurat dan riwayat audit transaksi.
- Kontrol aksi memisahkan peran Maker (pembuat/pengusul) dan Checker (penyetuju manusia).
- Desain responsif (Mobile dan Desktop) tanpa merusak layout.

### 12. Uji Serangan Adversarial AI-Eval (Minimal 2 Kasus)
- Minimal 2 kasus uji khusus mengevaluasi ketahanan Policy Engine terhadap upaya manipulasi AI:
  1. Upaya pemisahan transaksi (*smurfing/split payment*) untuk mem-bypass batas mandat harian.
  2. Upaya eskalasi persetujuan otomatis (prompt injection atau parameter tampering yang mencoba mengubah status langsung menjadi `APPROVED`).
- Seluruh serangan terbukti ditolak oleh Policy Engine Tahap A/B/C/D.

### 13. E2E Record & Rekonsiliasi Otomatis
- Siklus hidup transaksi lengkap teruji end-to-end:
  $$\text{Propose} \longrightarrow \text{Policy Eval} \longrightarrow \text{Human Approval} \longrightarrow \text{Provider Exec} \longrightarrow \text{Webhook Reconciliation} \longrightarrow \text{Ledger Seal}$$
- Job rekonsiliasi berkala memverifikasi kecocokan status lokal dengan status upstream provider.

### 14. Dokumentasi & Traceability Lengkap
- Entri untuk kategori terdaftar lengkap di `docs/traceability.csv` dengan status dan bukti uji.
- Spesifikasi teknis terdokumentasi di `docs/spec/` mencakup state diagram dan tabel ledger legs.

