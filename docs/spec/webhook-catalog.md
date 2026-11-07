# KATALOG LENGKAP WEBHOOK PAYPAL & SPESIFIKASI VERIFIKASI

**Dokumen:** `docs/spec/webhook-catalog.md`  
**Status:** `DRAFT-UNTUK-PERSETUJUAN`  
**Referensi:** PRD 1.3 §7, AD-16  
**Prinsip:** Seluruh webhook event yang diterima divalidasi keaslian tanda tangannya, disimpan secara idempoten, dan memicu transisi status otomatis.

---

## 1. Mekanisme Verifikasi Tanda Tangan Webhook

Jobenpay mendukung dua mekanisme verifikasi tanda tangan:

### 1.1 Verifikasi Melalui PayPal Webhook API
Sistem mengirimkan payload verifikasi ke endpoint PayPal Sandbox:
- **Metode & Path:** `POST /v1/notifications/verify-webhook-signature`
- **Payload Request:**
```json
{
  "auth_algo": "<PAYPAL-AUTH-ALGO-HEADER>",
  "cert_url": "<PAYPAL-CERT-URL-HEADER>",
  "transmission_id": "<PAYPAL-TRANSMISSION-ID-HEADER>",
  "transmission_sig": "<PAYPAL-TRANSMISSION-SIG-HEADER>",
  "transmission_time": "<PAYPAL-TRANSMISSION-TIME-HEADER>",
  "webhook_id": "<CONFIGURED_WEBHOOK_ID>",
  "webhook_event": { ...raw_event_body... }
}
```
- **Kriteria Lulus:** Respons HTTP 200 dengan `verification_status: "SUCCESS"`.

### 1.2 Verifikasi Mandiri Tanpa Ketergantungan Luar (`node:crypto`)
Untuk efisiensi dan pengujian lokal (serta fallback offline saat jaringan PayPal terganggu):
1. **Validasi `cert_url`:** Wajib berawalan `https://api.paypal.com/` atau `https://api-m.sandbox.paypal.com/` untuk mencegah SSRF.
2. **Hitung CRC32:** Hitung CRC32 integer tanpa tanda tangan atas string mentah body webhook.
3. **Susun String Pesan:**
   `transmission_id + "|" + transmission_time + "|" + webhook_id + "|" + crc32`
4. **Verifikasi Asimetris:** Gunakan `crypto.createVerify('RSA-SHA256')` dengan sertifikat publik X.509 yang diunduh dari `cert_url`.

---

## 2. Tabel Pemetaan Katalog Event Webhook ke Mesin Status

| Webhook Event Name | Kategori Terkait | Aksi Handler / Transisi Status | Efek Samping Buku Besar |
|---|---|---|---|
| `PAYMENT.CAPTURE.COMPLETED` | `SALE`, `DOWN_PAYMENT`, `SPLIT.collect` | Transisi status intent → `COMPLETED` (atau `DP_PAID` untuk initial DP) | Menulis double-entry legs & membukukan pendapatan |
| `PAYMENT.CAPTURE.DENIED` | `SALE`, `DOWN_PAYMENT` | Transisi status intent → `FAILED` | Melepaskan hold / tidak ada ledger |
| `PAYMENT.CAPTURE.REFUNDED` | `REFUND`, `PARTIAL.refund` | Transisi status intent → `COMPLETED` | Menulis double-entry reversal legs |
| `PAYMENT.AUTHORIZATION.CREATED` | `DOWN_PAYMENT`, `PARTIAL.payment` | Status otorisasi aktif, simpan `authorization_id` | Mencatat batas waktu 29 hari |
| `PAYMENT.AUTHORIZATION.VOIDED` | `VOID.authorization`, `DOWN_PAYMENT.forfeit` | Transisi status intent → `VOIDED` | Melepaskan hold otorisasi |
| `PAYMENT.PAYOUTSBATCH.SUCCESS` | `PAYOUT`, `BULK`, `SPLIT.payout` | Header batch ditandai `SUCCESS` | Memeriksa kelengkapan item anak |
| `PAYMENT.PAYOUTS-ITEM.SUCCEEDED` | `PAYOUT`, `BULK`, `SPLIT.payout` | Status intent (atau item anak) → `COMPLETED` | Menulis double-entry payout legs |
| `PAYMENT.PAYOUTS-ITEM.FAILED` | `PAYOUT`, `BULK` | Status item → `FAILED` | Melepaskan reservasi anggaran secara atomik |
| `PAYMENT.PAYOUTS-ITEM.UNCLAIMED` | `PAYOUT` | Status item → `UNCLAIMED` (menunggu klaim 30 hari) | Anggaran tetap ditahan sementara |
| `INVOICING.INVOICE.PAID` | `INVOICE` | Transisi status `invoice_records` & intent → `PAID` | Menulis double-entry piutang lunas |
| `INVOICING.INVOICE.CANCELLED` | `INVOICE` | Transisi status faktur → `CANCELLED` | Membatalkan piutang buku |
| `INVOICING.INVOICE.UPDATED` | `INVOICE` | Jika payload `status == 'VIEWED'`, status → `VIEWED` | Update log aktivitas faktur |
| `BILLING.SUBSCRIPTION.ACTIVATED`| `RECURRING` | Transisi status jadwal → `ACTIVE` | Kontrak langganan mulai berlaku |
| `BILLING.SUBSCRIPTION.PAYMENT.COMPLETED` | `RECURRING` | Buat intent anak `RECURRING.charge` berstatus `COMPLETED` | Menulis posting iuran bulanan |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED` | `RECURRING` | Transisi status jadwal → `PAST_DUE` | Peringatan keterlambatan pembayaran |
| `BILLING.SUBSCRIPTION.CANCELLED`| `RECURRING` | Transisi status jadwal → `CANCELLED` | Penghentian penagihan masa depan |
| `CUSTOMER.DISPUTE.CREATED` | `DISPUTE` | Buat intent baru `DISPUTE` berstatus `OPEN` | Membekukan dana sengketa sementara |
| `CUSTOMER.DISPUTE.RESOLVED` | `DISPUTE` | Transisi status ke `WON`, `LOST`, atau `PARTIALLY_WON` | Eksekusi pembukuan sengketa (AD-17) |

---

## 3. Penanganan Event Tak Dikenal (`UNHANDLED`)

Event yang memiliki tanda tangan kriptografis valid namun tipenya tidak tercantum dalam tabel di atas:
1. Diterima dengan respons HTTP **200 OK** (mencegah PayPal mengirim ulang secara agresif).
2. Disimpan utuh di tabel `webhook_events` dengan kolom `processing_status = 'UNHANDLED'`.
3. Dicatat dalam log peringatan Pino: `logger.warn({ eventType, eventId }, 'Received unhandled valid webhook event')`.

