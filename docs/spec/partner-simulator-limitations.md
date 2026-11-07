# Dokumentasi Keterbatasan Partner Simulator Provider (Tier C)

**Dokumen:** `docs/spec/partner-simulator-limitations.md`  
**Status:** `FINAL - TERVERIFIKASI`  
**Kategori Terkait:** `FINANCING` (PO & Invoice), `DEBIT` (Direct Debit)  
**Referensi:** PRD 1.3 §3, AD-17, B-F6 (Gerbang G6)

---

## 1. Latar Belakang & Tujuan
`PartnerSimulatorProvider` adalah adapter deterministik dalam-memori (*in-memory*) yang dirancang untuk menguji, memverifikasi, dan mensimulasikan fasilitas pembiayaan (supply chain financing) dan penarikan debit langsung (direct debit) tanpa melakukan panggilan jaringan eksternal ke institusi perbankan riil atau host produksi live.

Untuk menjaga integritas produk finansial dan transparansi audit, seluruh keluaran metadata dari simulator secara eksplisit menyertakan penanda:
```json
{
  "provider": "simulated"
}
```
Serta seluruh antarmuka pengguna (UI) menampilkan lencana visual **SIMULATED**.

---

## 2. Batasan & Keterbatasan Nyata (Limitations)

### 2.1 Ketiadaan Settlement Bank / ACH Riil
- **Keterbatasan:** Simulator tidak memindahkan uang fiat antar-bank secara nyata (tidak ada integrasi Federal Reserve Fedwire, NACHA ACH, atau SEPA).
- **Implikasi:** Keberhasilan penarikan debit (`DIRECT.DEBIT.COMPLETED`) atau pencairan pembiayaan (`DISBURSED`) pada simulator mencerminkan validitas kontrak dan konsistensi buku besar (*ledger consistency*), bukan mutasi kas perbankan eksternal.

### 2.2 Model Underwriting Deterministik vs Underwriting Kredit Komprehensif
- **Keterbatasan:** Underwriting simulator didasarkan pada aturan matematis deterministik terkunci (LTV PO <= 70%, LTV Invoice <= 80%, Tenor <= 6 bulan, riwayat counterparty >= 3 transaksi).
- **Implikasi:** Simulator tidak memeriksa skor biro kredit eksternal (FICO, D&B), tidak melakukan KYC/AML live, dan tidak memverifikasi keabsahan fisik invoice ke pihak ketiga.

### 2.3 Mekanisme Kegagalan Sintetik (Failure Injection)
- **Keterbatasan:** Kegagalan bank seperti `INSUFFICIENT_FUNDS`, `AUTH_REVOKED`, atau `ACCOUNT_CLOSED` disimulasikan melalui mekanisme injeksi (`simulator.inject({ category, step, failure })`).
- **Implikasi:** Simulator tidak mendeteksi dinamika saldo perbankan nyata secara asinkron selain dari skenario uji yang disuntikkan.

### 2.4 Ketiadaan Escrow Perbankan Nyata
- **Keterbatasan:** Sesuai Aturan Keras PRD 1.3 §0 dan Preamble A.5, akun `escrow` dan `loan` dalam JOBENPAY adalah akun buku internal (*internal ledger book accounts*), bukan rekening penampungan berlisensi bank (*licensed banking escrow*).

---

## 3. Independensi Adapter Terhadap State Machine & Ledger
Pemisahan arsitektur JOBENPAY menjamin bahwa:
1. **State Machine Terisolasi:** Transisi status (`REQUESTED -> UNDERWRITING -> APPROVED -> DISBURSED -> REPAYING -> SETTLED`) dievaluasi secara independen di layer domain (`shared/state-machines.js`).
2. **Ledger Terisolasi:** Aturan double-entry (`shared/ledger-rules.js`) dan penegakan trigger database `check_balanced` berlaku identik baik saat menggunakan `PartnerSimulatorProvider` maupun provider perbankan riil di masa depan.
3. Mengganti simulator dengan provider lain tidak mengubah satu pun hasil uji state machine atau keseimbangan ledger.

