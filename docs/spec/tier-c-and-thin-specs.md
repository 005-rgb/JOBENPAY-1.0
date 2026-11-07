# Spesifikasi Lengkap Kategori Tipis & Tier C (PRD 1.3 §3–§8 Parity)

**Dokumen:** `docs/spec/tier-c-and-thin-specs.md`  
**Status:** `DRAFT-UNTUK-PERSETUJUAN`  
**Referensi:** PRD 1.3 §1–§8, AD-17  
**Prinsip:** Spesifikasi eksplisit tanpa ada "akan ditentukan nanti". Semua nilai moneter menggunakan `BigInt` minor units melalui `money.js`.

---

## 1. FINANCING (Tier C — PO & Invoice Financing)

### 1.1 Deskripsi Bisnis & Akun Buku
Fasilitas pembiayaan rantai pasok (Purchase Order Financing dan Invoice Financing) berbasis aturan deterministik (*deterministic rule-based underwriting*).
- **Akun Buku Internal:**
  - `org:main`: Kas utama organisasi peminjam/pemberi pinjaman.
  - `counterparty:{cp}`: Akun pihak lawan (supplier atau pembeli).
  - `loan:principal:{intent}`: Pokok pinjaman yang belum dilunasi.
  - `loan:interest:{intent}`: Pendapatan/beban bunga berjalan.
  - `loan:fee:{intent}`: Biaya provisi/administrasi pembiayaan.

### 1.2 Parameter Underwriting Berbasis Aturan (Deterministik)
Evaluasi underwriting dilakukan secara murni matematis tanpa improvisasi AI:
1. **LTV (Loan-to-Value) Maksimum:**
   - PO Financing (`sub_type: po`): Maksimal 70% (`7000 bps`) dari nilai purchase order valid.
   - Invoice Financing (`sub_type: invoice`): Maksimal 80% (`8000 bps`) dari nilai invoice valid yang belum jatuh tempo.
2. **Kriteria Kelayakan:**
   - Rekam jejak counterparty: minimal 3 transaksi sukses sebelumnya tanpa dispute.
   - Jatuh tempo fasilitas: minimum 14 hari, maksimum 180 hari (`tenor_months <= 6`).
   - Suku bunga tetap: `interest_bps` (contoh: `1200 bps` = 12% per tahun pro-rata).
   - Biaya administrasi: `admin_fee_minor = floor(principal_amount_minor * 150 / 10000)` (1.5%).
3. **Keputusan Deterministik:**
   - LTV <= Cap AND Tenor <= 6 AND Rekam Jejak Terpenuhi → `APPROVED`.
   - LTV > Cap ATAU Tenor > 6 → `REJECTED` (Kode: `UNDERWRITING_LTV_EXCEEDED` / `TENOR_TOO_LONG`).

### 1.3 State Machine Eksplisit & Aktor
```text
REQUESTED → UNDERWRITING → APPROVED → DISBURSED → REPAYING → SETTLED
    ↓            ↓             ↓                     ↓
REJECTED     REJECTED      CANCELLED             DEFAULTED
```

| Dari Status | Ke Status | Aktor | Guard / Syarat | Efek Samping |
|---|---|---|---|---|
| `DRAFT` | `REQUESTED` | `agent` / `human_operator` | Dokumen PO/Invoice valid dilampirkan | Buat entitas `financing_records` |
| `REQUESTED` | `UNDERWRITING` | `worker` / `system` | Format data lengkap | Jalankan fungsi verifikasi underwriting |
| `UNDERWRITING` | `APPROVED` | `system` | Lolos parameter underwriting | Tetapkan jadwal cicilan (`schedule`) |
| `UNDERWRITING` | `REJECTED` | `system` | Gagal batas LTV / tenor | Catat kode alasan penolakan |
| `APPROVED` | `DISBURSED` | `worker` | Persetujuan manusia (dual-approval jika > cap) | Catat posting pencairan dana (DEBIT `org:main`, CREDIT `loan:principal`) |
| `DISBURSED` | `REPAYING` | `system` / `worker` | Waktu cicilan berjalan | Pantau jadwal pembayaran |
| `REPAYING` | `SETTLED` | `worker` / `webhook` | `repaid_amount_minor == total_obligation` | Fasilitas lunas, lepas semua hold |
| `REPAYING` | `DEFAULTED` | `job` | Lewat jatuh tempo > 90 hari | Catat status gagal bayar, picu alarm audit |

### 1.4 Rumus Jadwal Cicilan Eksak (BigInt Murni)
Jika pokok pinjaman $P$ (`principal_amount_minor`), bunga total $I = \lfloor P \times \text{interest\_bps} \times \text{tenor\_months} / (10000 \times 12) \rfloor$, biaya admin $A = \text{admin\_fee\_minor}$, maka total kewajiban adalah:
$$T = P + I + A$$
Untuk $N$ bulan tenor (`tenor_months`):
- Cicilan bulanan dasar: $M_{\text{base}} = \lfloor T / N \rfloor$
- Sisa pembulatan (residue): $R = T - (M_{\text{base}} \times N)$
- Cicilan bulan ke-$1$ sampai ke-$(N-1)$: $M_i = M_{\text{base}}$
- Cicilan bulan terakhir (ke-$N$): $M_N = M_{\text{base}} + R$
- **Urutan Alokasi Pembayaran:** Setiap pembayaran cicilan dialokasikan berurutan:
  1. Biaya administrasi ($A$) hingga lunas.
  2. Bunga berjalan ($I$) hingga lunas.
  3. Pokok pinjaman ($P$).

### 1.5 Aturan Ledger (Double-Entry Balanced)
1. **Pencairan (`APPROVED → DISBURSED`):**
   - DEBIT `org:main` : $P - A$
   - DEBIT `loan:fee:{intent}` : $A$
   - CREDIT `loan:principal:{intent}` : $P$
   *(Total Debit = $P$, Total Credit = $P$ — Seimbang)*
2. **Pembayaran Cicilan (`REPAYING`):**
   - DEBIT `loan:principal:{intent}` : Bagian pokok ($P_i$)
   - DEBIT `loan:interest:{intent}` : Bagian bunga ($I_i$)
   - CREDIT `org:main` : Total bayar ($M_i$)
   *(Total Debit = $M_i$, Total Credit = $M_i$ — Seimbang)*

---

## 2. DEBIT (Tier C — Direct Debit / Penarikan Langsung)

### 2.1 Deskripsi Bisnis & Otorisasi
Penarikan dana langsung dari rekening pihak lawan (counterparty) berdasarkan otorisasi formal yang telah ditandatangani sebelumnya (`debit_authorizations`).

### 2.2 Skema Data Otorisasi Debit
Setiap transaksi debit **wajib** merujuk pada otorisasi aktif:
```sql
CREATE TABLE debit_authorizations (
  auth_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  counterparty_id UUID NOT NULL,
  max_amount_minor BIGINT NOT NULL CHECK (max_amount_minor > 0),
  currency CHAR(3) NOT NULL,
  frequency_limit TEXT NOT NULL CHECK (frequency_limit IN ('ONCE','WEEKLY','MONTHLY','UNLIMITED')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
  valid_until TIMESTAMPTZ NOT NULL,
  mandate_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.3 State Machine Eksplisit & Aktor
```text
DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED
                         ↓           ↓           ↓
                     REJECTED    CANCELLED     FAILED
```

| Dari Status | Ke Status | Aktor | Guard / Syarat | Efek Samping |
|---|---|---|---|---|
| `DRAFT` | `SUBMITTED` | `agent` / `system` | Memuat `auth_id` yang valid | Verifikasi idempotency key |
| `SUBMITTED` | `EVALUATING` | `worker` | Sistem aktif, org tidak beku | Evaluasi aturan policy Tahap A/B |
| `EVALUATING` | `APPROVED` | `worker` / `approver` | `amount <= max_amount_minor`, otorisasi `ACTIVE`, belum kedaluwarsa | Masuk antrean eksekusi |
| `EVALUATING` | `REJECTED` | `worker` | Otorisasi `REVOKED`, kadaluwarsa, atau nominal melampaui batas | Lempar `DEBIT_AUTH_INVALID` / `CAP_EXCEEDED` |
| `APPROVED` | `EXECUTING` | `worker` | Adapter simulator siap | Kirim instruksi debit ke Partner Simulator |
| `EXECUTING` | `COMPLETED` | `webhook` / `worker` | Partner mengonfirmasi penarikan berhasil | Tulis double-entry ledger |
| `EXECUTING` | `FAILED` | `webhook` / `worker` | Saldo counterparty tidak cukup / bank menolak | Catat kegagalan, tidak ada ledger |

### 2.4 Alasan Penolakan Simulator & Alur Pencabutan
- **Simulasi Penolakan:**
  - `INSUFFICIENT_FUNDS`: Saldo rekening pihak lawan tidak mencukupi.
  - `AUTH_REVOKED`: Pihak lawan mencabut otorisasi penarikan.
  - `ACCOUNT_CLOSED`: Rekening bank pihak lawan ditutup.
- **Alur Pencabutan Otorisasi (`Revocation`):**
  - Endpoint `POST /api/v1/debit-authorizations/{id}/revoke` oleh manusia atau webhook mitra mengubah status menjadi `REVOKED`. Transaksi debit yang sedang dalam status `EVALUATING` otomatis dibatalkan (`REJECTED`).

### 2.5 Aturan Ledger (Double-Entry Balanced)
Saat `COMPLETED`:
- DEBIT `org:main` : `amount_minor`
- CREDIT `counterparty:debit:{cp}` : `amount_minor`
*(SUM(DEBIT) = SUM(CREDIT) — Seimbang)*

---

## 3. BULK (Tier B — Mass Payouts)

### 3.1 Model Intent Induk–Anak
Transaksi massal menggunakan model hirarki:
1. **Intent Induk:**
   - `category = 'BULK'`, `sub_type = 'payout'`
   - Memuat daftar hingga 15.000 item payout.
   - `amount_minor` = Total akumulasi seluruh item.
2. **Intent Anak:**
   - `category = 'PAYOUT'`, `sub_type = 'standard'`
   - `parent_intent_id = intent_id_induk`
   - `amount_minor` = Nilai masing-masing penerima.

### 3.2 State Machine Induk
```text
DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED | PARTIALLY_COMPLETED | FAILED
```
- **Aturan Transisi Status Induk:**
  - `COMPLETED`: 100% item anak berhasil dieksekusi (`status == 'COMPLETED'`).
  - `PARTIALLY_COMPLETED`: Sebagian item anak berhasil, sebagian gagal (`FAILED`).
  - `FAILED`: Seluruh item gagal atau proses batch ditolak oleh PayPal.

### 3.3 Reservasi & Pelepasan Anggaran
- Saat `SUBMITTED`, anggaran organisasi direservasi sekaligus sebesar **total nilai batch**.
- Jika ada item anak yang gagal (`FAILED`), porsi anggaran untuk item yang gagal tersebut **segera dilepas** kembali ke organisasi secara atomik.

### 3.4 Aturan Ledger
Setiap item anak yang berhasil menulis double-entry leg sendiri:
- DEBIT `org:main` : `item.amount_minor`
- CREDIT `payee:{cp}` : `item.amount_minor`
Leg ditulis per item sehingga audit rekonsiliasi per transaksi tetap presisi 1:1.

---

## 4. TRANSFER (Tier B — Peer-to-Peer Internal & External)

### 4.1 Deskripsi & Perbedaan dengan PAYOUT
- `PAYOUT`: Pembayaran dari organisasi ke vendor/payee eksternal atas tagihan barang/jasa.
- `TRANSFER`: Perpindahan dana antar pihak lawan (`sender` ke `receiver`) yang dicatat dalam buku besar organisasi atau diproses melalui jalur transfer p2p.

### 4.2 State Machine
```text
DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED
                         ↓           ↓           ↓
                     REJECTED    REJECTED      FAILED
```

### 4.3 Aturan Ledger
- DEBIT `sender:{cp}` (atau `buyer:{cp}`) : `amount_minor`
- CREDIT `receiver:{cp}` (atau `payee:{cp}`) : `amount_minor`
Jika ada biaya transfer platform:
- DEBIT `sender:{cp}` : `amount_minor + fee`
- CREDIT `receiver:{cp}` : `amount_minor`
- CREDIT `platform_fee` : `fee`
*(Total Debit = Total Credit — Seimbang)*

---

## 5. SPLIT (Tier B — Bagi Hasil & Marketplace Multi-Leg)

### 5.1 Siklus 4 Sub-Tipe & Relasi
1. `collect`: Menerima pembayaran penuh dari pembeli ke penampung internal platform (`platform_escrow`).
2. `split`: Membagi dana menjadi bagian platform (`platform_fee`) dan bagian penjual (`payee_escrow`).
3. `hold`: Menahan bagian penjual selama periode penahanan (`hold_period_hours` dari `split_rules`).
4. `payout`: Mentransfer dana bersih dari `payee_escrow` ke rekening rekening payee riil setelah periode hold berakhir.

### 5.2 State Machine
```text
COLLECTED → SPLIT_CALCULATED → HELD → RELEASED → PAID_OUT
```

### 5.3 Perhitungan Fee Platform & Penjual
Sesuai aturan BigInt presisi tinggi:
$$\text{fee} = \lfloor \text{total} \times \text{platform\_fee\_bps} / 10000 \rfloor$$
$$\text{payee\_share} = \text{total} - \text{fee}$$
*(Jumlah persis seimbang tanpa selisih)*

### 5.4 Aturan Ledger Lengkap (3 Pasang Terpisah & Seimbang)
1. **Saat `collect` (Penerimaan):**
   - DEBIT `buyer:{cp}` : `total`
   - CREDIT `platform_escrow` : `total`
2. **Saat `split` (Pembagian Buku Besar):**
   - DEBIT `platform_escrow` : `total`
   - CREDIT `platform_fee` : `fee`
   - CREDIT `payee_escrow:{cp}` : `payee_share`
3. **Saat `payout` (Pencairan):**
   - DEBIT `payee_escrow:{cp}` : `payee_share`
   - CREDIT `payee:{cp}` : `payee_share`
Setiap tahap menghasilkan double-entry yang seimbang dan mencatat hash legs berantai.

---

## 6. DISPUTE (Tier A — Chargeback & Inquiry Ledger)

### 6.1 State Machine Eksplisit & Aktor
```text
OPEN → EVIDENCE_REQUIRED → UNDER_REVIEW → WON | LOST | PARTIALLY_WON → CLOSED
```
- **Aktor:**
  - `webhook`: Menerima event `CUSTOMER.DISPUTE.CREATED` dan membuat intent `DISPUTE`.
  - `human_operator`: Menyerahkan bukti (*provide-evidence*) atau menerima klaim (*accept-claim*). **Agen dilarang menerima klaim secara otonom.**
  - `system`: Memperbarui status hasil akhir berdasarkan webhook `CUSTOMER.DISPUTE.RESOLVED`.

### 6.2 Aturan Ledger Berdasarkan Hasil
1. **Hasil `LOST` (Penjual Kalah):**
   Dana sengketa dipotong dari akun penjual dan dikembalikan ke pembeli:
   - DEBIT `seller:org` : `disputed_amount_minor`
   - CREDIT `buyer:{cp}` : `disputed_amount_minor`
   *(Jika ada biaya denda sengketa dari PayPal, dicatat sebagai leg tambahan DEBIT `paypal:fees` dan CREDIT `org:main`)*
2. **Hasil `PARTIALLY_WON` (Kalah Sebagian):**
   Hanya porsi kekalahan yang dipotong:
   - DEBIT `seller:org` : `lost_amount_minor`
   - CREDIT `buyer:{cp}` : `lost_amount_minor`
   *(SUM(DEBIT) = SUM(CREDIT) — Seimbang)*
3. **Hasil `WON` (Penjual Menang):**
   Tidak ada pergerakan dana baru. Jika sebelumnya dana sempat dibekukan dalam akun penampung sengketa (`dispute_hold`), maka saldo dikembalikan:
   - DEBIT `dispute_hold` : `disputed_amount_minor`
   - CREDIT `seller:org` : `disputed_amount_minor`
4. **Sub-tipe `inquiry`:**
   Hanya merupakan permintaan informasi awal; tidak menghasilkan mutasi ledger finansial apa pun hingga eskalasi ke chargeback.

