# Spesifikasi Kategori Transaksi: FINANCING (Tier C)

**Kode Kategori:** `FINANCING`  
**Sub-Tipe Legal:** `po`, `invoice`  
**Status Implementasi:** `done` (14/14 CCC Terpenuhi)  
**Referensi:** PRD 1.3 §3, AD-17, `docs/spec/tier-c-and-thin-specs.md`

---

## 1. Ikhtisar & Deskripsi Bisnis
Fasilitas pembiayaan rantai pasok (*Supply Chain Financing*) berbasis aturan deterministik (*deterministic rule-based underwriting*) via **Partner Simulator Provider**:
- **PO Financing (`po`)**: Pembiayaan purchase order untuk modal kerja pengadaan barang/jasa vendor.
- **Invoice Financing (`invoice`)**: Pembiayaan faktur tagihan sebelum jatuh tempo untuk percepatan likuiditas arus kas.

Setiap transaksi pada kategori ini wajib melewati evaluasi underwriting murni matematis, selalu berstatus `REQUIRE_APPROVAL` (0 Auto-Approve), dan seluruh keluaran metadata menandai `provider: "simulated"`.

---

## 2. Aturan Underwriting Deterministik (Tanpa Improvisasi AI)
1. **Batas LTV (Loan-to-Value):**
   - PO Financing: Maksimal 70% (`7000 bps`) dari nilai purchase order valid.
   - Invoice Financing: Maksimal 80% (`8000 bps`) dari nilai invoice valid.
   - Pelanggaran memicu penolakan: `UNDERWRITING_LTV_EXCEEDED` (HTTP 422).
2. **Tenor Waktu:**
   - Minimum 14 hari, maksimum 180 hari (`tenor_months <= 6`).
   - Pelanggaran memicu: `TENOR_TOO_LONG` (HTTP 422).
3. **Rekam Jejak Pihak Lawan (Counterparty):**
   - Minimal 3 transaksi berhasil sebelumnya tanpa sengketa.
   - Pelanggaran memicu: `COUNTERPARTY_INSUFFICIENT_HISTORY` (HTTP 422).
4. **Biaya & Suku Bunga:**
   - Admin Fee: `admin_fee_minor = floor(principal_amount_minor * 150 / 10000)` (1.5% fixed).
   - Suku Bunga: `interest_bps` (contoh: 1200 bps = 12% p.a. pro-rata).
   - Total Kewajiban: $T = P + I + A$.

---

## 3. Jadwal Cicilan Eksak (Amortization Waterfall)
Untuk tenor $N$ bulan:
- Cicilan bulanan dasar: $M_{\text{base}} = \lfloor T / N \rfloor$
- Sisa pembulatan (residue): $R = T - (M_{\text{base}} \times N)$
- Bulan 1 s/d $(N-1)$: $M_i = M_{\text{base}}$
- Bulan terakhir ($N$): $M_N = M_{\text{base}} + R$
- **Urutan Alokasi Pembayaran:**
  1. Biaya Administrasi ($A$) hingga lunas.
  2. Bunga berjalan ($I$) hingga lunas.
  3. Pokok pinjaman ($P$).

---

## 4. Aturan Ledger Double-Entry Berimbang
1. **Pencairan Dana (`APPROVED → DISBURSED`):**
   - DEBIT `org:main`: $P - A$ (Kas bersih yang dicairkan)
   - DEBIT `loan:fee:{intent_id}`: $A$ (Biaya administrasi)
   - CREDIT `loan:principal:{intent_id}`: $P$ (Kewajiban pokok)
   *(SUM(DEBIT) = $P$, SUM(CREDIT) = $P$ — Selalu Seimbang 100%)*
2. **Pembayaran Cicilan (`REPAYING`):**
   - DEBIT `loan:principal:{intent_id}`: $P_i$
   - DEBIT `loan:interest:{intent_id}`: $I_i$
   - CREDIT `org:main`: $M_i$
   *(SUM(DEBIT) = $M_i$, SUM(CREDIT) = $M_i$ — Seimbang)*

---

## 5. State Machine & Aktor
```text
REQUESTED → UNDERWRITING → APPROVED → DISBURSED → REPAYING → SETTLED
    ↓            ↓             ↓                     ↓
REJECTED     REJECTED      CANCELLED             DEFAULTED
```
- Dual control Maker/Checker: Agen/Maker mengusulkan fasilitas, hanya Checker manusia yang dapat menyetujui pencairan.

---

## 6. Audit & Kepatuhan
- **SAR v1.1**: Mencatat ringkasan legs, `provider: "simulated"`, dan hash SHA-256 anti-tamper.
- **Idempotency**: Dilindungi `Idempotency-Key` per organisasi tenant, mencegah duplikasi mutasi.
- **Tabel Audit Relasional**: `financing_records` dan `financing_repayments`.

