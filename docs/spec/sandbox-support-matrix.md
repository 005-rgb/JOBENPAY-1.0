# MATRIKS DUKUNGAN PAYPAL SANDBOX (28 PASANGAN KATEGORI/SUB-TIPE)

**Dokumen:** `docs/spec/sandbox-support-matrix.md`  
**Status:** `DRAFT-UNTUK-PERSETUJUAN`  
**Referensi:** PRD 1.3 §1.1, AD-12, AD-15  
**Prinsip Kejujuran:** Setiap keterbatasan lingkungan Sandbox dicatat secara terbuka tanpa menyamarkan fakta. Kategori yang tidak didukung langsung oleh PayPal Sandbox dialihkan ke adapter simulasi mitra berlabel `provider: "simulated"`.

---

## Tabel Matriks Dukungan Sandbox (28 Baris Lengkap)

| # | Kategori | Sub-Tipe | Didukung Sandbox? | Bukti (Cassette ID / Dokumen) | Butuh Buyer Harness? | Keputusan untuk TIDAK / SEBAGIAN | Catatan Keterbatasan Jujur Sandbox |
|---|---|---|---|---|---|---|---|
| 1 | `SALE` | `standard` | **YA** | `cassette-sale-standard-01` | (a) Playwright / (c) Fake | `PayPalProvider` resmi | Memerlukan login pembeli Sandbox untuk menyetujui capture order. |
| 2 | `DOWN_PAYMENT` | `initial` | **YA** | `cassette-dp-initial-01` | (a) Playwright / (c) Fake | `PayPalProvider` resmi | Menggunakan `intent: "AUTHORIZE"` lalu capture parsial (`final_capture: false`). |
| 3 | `DOWN_PAYMENT` | `settlement` | **YA** | `cassette-dp-settle-01` | Tidak (Capture token tersimpan) | `PayPalProvider` resmi | Capture sisa otorisasi sebelum batas 29 hari berakhir. |
| 4 | `DOWN_PAYMENT` | `forfeit` | **SEBAGIAN** | `cassette-dp-forfeit-01` | Tidak | Aksi Pengganti (Void sisa otorisasi + posting ledger buku internal) | PayPal tidak memiliki status 'forfeit'; sisa otorisasi di-void di PayPal. |
| 5 | `INVOICE` | `standard` | **YA** | `cassette-invoice-std-01` | (a) Opsional (atau record payment) | `PayPalProvider` resmi | Faktur Sandbox dapat dibayar via Buyer Harness atau dicatat bayar via API. |
| 6 | `PAYOUT` | `standard` | **YA** | `cassette-payout-std-01` | Tidak | `PayPalProvider` resmi | Memerlukan saldo Sandbox merchant terisi dan fitur Payouts aktif. |
| 7 | `REFUND` | `full` | **YA** | `cassette-refund-full-01` | Tidak | `PayPalProvider` resmi | Maksimal 180 hari sejak tanggal penangkapan dana (capture). |
| 8 | `REFUND` | `partial` | **YA** | `cassette-refund-part-01` | Tidak | `PayPalProvider` resmi | Akumulasi pengembalian parsial tidak boleh melebihi nilai capture asli. |
| 9 | `VOID` | `authorization` | **YA** | `cassette-void-auth-01` | Tidak | `PayPalProvider` resmi | Hanya berlaku untuk otorisasi yang belum di-capture penuh. |
| 10 | `VOID` | `order` | **TIDAK** | Dokumen Resmi PayPal Orders API | Tidak | Aksi Pengganti (Pembatalan lokal intent belum bayar, 0 HTTP ke PayPal) | PayPal Orders API tidak menyediakan endpoint void untuk order unpaid. |
| 11 | `DISPUTE` | `chargeback` | **SEBAGIAN** | `cassette-dispute-cb-01` | Tidak | `PayPalProvider` (Disputes API) + injector simulasi sengketa | Sengketa di Sandbox memerlukan akun buyer untuk memicu case atau webhook sintetis. |
| 12 | `DISPUTE` | `inquiry` | **SEBAGIAN** | `cassette-dispute-inq-01` | Tidak | `PayPalProvider` (Disputes API) | Fase pra-klaim sengketa; tidak ada perpindahan dana di buku besar. |
| 13 | `PARTIAL` | `payment` | **YA** | `cassette-part-pay-01` | (a) Playwright | `PayPalProvider` resmi | Capture parsial atas order berstatus authorized. |
| 14 | `PARTIAL` | `refund` | **YA** | `cassette-part-ref-01` | Tidak | `PayPalProvider` resmi | Identik secara fungsional dengan `REFUND.partial`. |
| 15 | `SCHEDULED` | `payout` | **SEBAGIAN** | `cassette-sched-payout-01` | Tidak | Aksi Pengganti (Penjadwalan internal worker + eksekusi Payouts API) | PayPal Payouts API tidak memiliki delay timer bawaan; diatur oleh cron Jobenpay. |
| 16 | `SCHEDULED` | `charge` | **SEBAGIAN** | `cassette-sched-charge-01` | (a) Playwright | Aksi Pengganti (Billing cycle trigger via worker) | Penarikan dana terjadwal memerlukan authorization token aktif. |
| 17 | `RECURRING` | `init` | **YA** | `cassette-rec-init-01` | (a) Playwright | `PayPalProvider` resmi | Inisiasi langganan via Subscriptions API v1. |
| 18 | `RECURRING` | `charge` | **YA** | `cassette-rec-charge-01` | Tidak (Dipicu webhook PayPal) | `PayPalProvider` resmi | Dipicu otomatis oleh webhook `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED`. |
| 19 | `RECURRING` | `cancel` | **YA** | `cassette-rec-cancel-01` | Tidak | `PayPalProvider` resmi | Pemanggilan `POST /v1/billing/subscriptions/{id}/cancel`. |
| 20 | `BULK` | `payout` | **YA** | `cassette-bulk-payout-01` | Tidak | `PayPalProvider` resmi (dengan chunking streaming 500 item) | PayPal mendukung hingga 15.000 item, namun disarankan chunking demi stabilitas. |
| 21 | `SPLIT` | `collect` | **YA** | `cassette-split-collect-01`| (a) Playwright | `PayPalProvider` resmi | Capture dana total keranjang belanja pembeli. |
| 22 | `SPLIT` | `split` | **TIDAK** | Aturan Buku Besar Internal | Tidak | Aksi Pengganti (Posting alokasi fee & escrow di double-entry Jobenpay) | PayPal Sandbox standar tidak membagi dana multi-pihak otomatis tanpa Multiparty. |
| 23 | `SPLIT` | `hold` | **TIDAK** | Aturan Buku Besar Internal | Tidak | Aksi Pengganti (Timer hold internal dalam tabel database Jobenpay) | Penahanan waktu pembagian hasil dikelola oleh worker internal Jobenpay. |
| 24 | `SPLIT` | `payout` | **YA** | `cassette-split-payout-01` | Tidak | `PayPalProvider` resmi | Payouts API mengirimkan bagian bersih penjual setelah masa hold selesai. |
| 25 | `TRANSFER` | `p2p` | **SEBAGIAN** | `cassette-transfer-p2p-01` | Tidak | `PayPalProvider` resmi (Payout dari kas org) / Internal Ledger | P2P antar pihak ketiga di luar akun org diproses secara virtual di buku besar. |
| 26 | `FINANCING` | `po` | **TIDAK** | PRD 1.3 §1.1 ("Partner") | Tidak | `PartnerSimulatorProvider` berlabel `provider: "simulated"` | PayPal tidak menyediakan API PO financing terbuka; disimulasikan penuh. |
| 27 | `FINANCING` | `invoice` | **TIDAK** | PRD 1.3 §1.1 ("Partner") | Tidak | `PartnerSimulatorProvider` berlabel `provider: "simulated"` | Disimulasikan penuh via adapter mitra berlabel `provider: "simulated"`. |
| 28 | `DEBIT` | `direct` | **TIDAK** | PRD 1.3 §1.1 ("Partner") | Tidak | `PartnerSimulatorProvider` berlabel `provider: "simulated"` | Direct bank debit memerlukan integrasi BACS/SEPA mitra perbankan (simulated). |

---

## Ringkasan Persentase Kesiapan Gateway
- **Didukung Penuh oleh PayPal Sandbox:** 14 Sub-Tipe (50%)
- **Didukung Sebagian (Kombinasi PayPal + Logika Internal):** 7 Sub-Tipe (25%)
- **Simulasi Mitra / Penanganan Lokal Mandiri:** 7 Sub-Tipe (25%)
- **Total Kategori Transaksi:** 28 / 28 Sub-Tipe Terpetakan Tanpa Ambiguitas.

