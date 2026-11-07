# TABEL PENUTUPAN BUTIR VERIFIKASI [VERIFY]

**Dokumen:** `docs/spec/verify-closure.md`  
**Status:** `DRAFT-UNTUK-PERSETUJUAN`  
**Referensi:** PRD 1.3, Blueprint v1.2, AD-01 s/d AD-37  

---

| # | Butir / Pertanyaan `[VERIFY]` | Jawaban Terverifikasi | Bukti (Cassette / Dokumentasi Resmi) | Dampak ke Addendum (AD) |
|---|---|---|---|---|
| **V-01** | Apakah PayPal Sandbox mendukung `payment_source` kartu kredit uji langsung tanpa alur redirect Playwright? | **SEBAGIAN.** Sandbox mendukung kartu uji hanya jika akun merchant diaktifkan fitur ACDC (*Advanced Credit and Debit Cards*). Akun standar tetap mewajibkan redirect checkout. | [PayPal Orders v2 Schema](https://developer.paypal.com/docs/api/orders/v2/#orders_create) & Spike F0-2 | **AD-09:** Playwright dipertahankan sebagai harness utama yang universal; kartu uji jadi opsi sekunder. |
| **V-02** | Apakah webhook `INVOICING.INVOICE.UPDATED` terpicu secara andal saat faktur dilihat oleh pembeli? | **TIDAK ANDAL.** Event tersebut terpicu oleh setiap perubahan faktur (termasuk penambahan catatan atau sunting draft). Status `VIEWED` harus dipastikan lewat payload `resource.invoice.status == 'VIEWED'`. | [PayPal Invoicing Webhooks](https://developer.paypal.com/docs/api/invoicing/v2/#invoices_get) | **AD-12 & AD-22 (T-05):** State `VIEWED` dibuat opsional; faktur diizinkan langsung melompat dari `SENT → PAID`. |
| **V-03** | Apakah PayPal Payouts API Sandbox mengizinkan hingga 15.000 item dalam satu panggilan HTTP POST tunggal? | **DIBATASI SECARA PRAKTIS.** Dokumen resmi mengizinkan hingga 15.000 item secara asinkron, namun di lingkungan Sandbox muatan HTTP besar rentan timeout jaringan (>30s) dan memory spikes. | [PayPal Payouts API Reference](https://developer.paypal.com/docs/api/payments.payouts-batch/v1/) | **AD-36 (T-19):** Jobenpay menerapkan chunking internal 500 item per request ke PayPal. |
| **V-04** | Manakah path Disputes API yang benar antara `/v1/customer-disputes` dan `/v1/customer/disputes`? | **`/v1/customer-disputes`** (menggunakan tanda hubung) adalah path kanonik resmi pada PayPal REST API v1. Path dengan garis miring `/customer/disputes` adalah kesalahan ketik dokumentasi legacy. | [PayPal Customer Disputes API](https://developer.paypal.com/docs/api/customer-disputes/v1/) | **AD-12:** Dikunci secara tegas dalam `paypal/endpoints.js` menjadi `/v1/customer-disputes/{id}`. |
| **V-05** | Bagaimana perilaku honor period vs masa berlaku 29 hari pada Authorizations API di Sandbox? | **VALID 29 HARI.** Dana diotorisasi selama tepat 29 hari kalender. Honor period (jaminan ketersediaan dana 100%) berlaku 3 hari pertama. Setelah 3 hari, capture tetap dapat dilakukan namun disarankan re-authorize jika dana belum di-capture. | [PayPal Payments Authorizations API](https://developer.paypal.com/docs/api/payments/v2/#authorizations_get) | **AD-10:** `authorization_expires_at` diset `created_at + 29 days`; job re-authorize berjalan pada hari ke-3 jika diperlukan. |
| **V-06** | Apakah ketersediaan Node 22 dan PostgreSQL terbukti di cPanel hosting produksi? | **TERBUKTI.** Node 22.23.2 dan PostgreSQL 18.6 terbukti berjalan aktif dan stabil di lingkungan server cPanel CloudLinux aplikasi saat ini. | Uji koneksi runtime dan test suite 280/280 lulus di server. | **AD-04:** Stack terkunci pada Node 22 + PostgreSQL 13+ tanpa kompromi. |

