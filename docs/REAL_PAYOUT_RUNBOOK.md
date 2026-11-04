# Real PayPal Sandbox Payout Runbook / Panduan Payout Nyata PayPal Sandbox

[English](#english-guide) | [Bahasa Indonesia](#panduan-bahasa-indonesia)

---

## English Guide

This runbook guides the organization Owner through running **ONE real payout** against PayPal Sandbox on a cPanel production environment (or local environment) via browser, and exporting the redacted cryptographic evidence to calibrate the S13 payout/webhook reconciliation handler.

> [!IMPORTANT]
> - Do not test with live money! Ensure the environment is in PayPal Sandbox mode (`api-m.sandbox.paypal.com`).
> - Keep test payout amounts small (e.g. `USD 1.00`).
> - Evidence JSON export automatically redacts personal identifiable information (PII) and strips authorization secrets.

### Step-by-Step Procedure

1. **Run Preflight Verification**
   - Log in as `OWNER` or `JUDGE`.
   - Navigate to `/settings/paypal` in the web browser.
   - Click the **"Run real-payout preflight"** button.
   - Verify that all checks (**PF-01** through **PF-12**) show `PASS` (or non-blocking `WARN` for queue backlog).
   - Alternatively, run via CLI:
     ```bash
     npm run real:preflight
     ```

2. **Configure Background Processor Cron (if PF-03 Fails)**
   - If the processor check is red (`PF-03` failed), set up a 1-minute cron job in cPanel:
     ```bash
     * * * * * cd /home/<user>/public_html/jobenpay && /home/<user>/nodevenv/public_html/jobenpay/22/bin/node --env-file-if-exists=.env server/src/jobs/tick.js >> storage/logs/cron.log 2>&1
     ```
   - Re-run Preflight; `PF-03` should turn green (`PASS`) within 1-2 minutes.

3. **Prepare Invoice Document (if Mandate Requires Invoice)**
   - If the active mandate policy has `requireInvoice: true`:
   - Navigate to `/documents` and upload a test invoice (PDF/image) matching the payee name.
   - Wait until document extraction status reaches `EXTRACTED` and payee/amount are recognized.

4. **Submit One Test Payment Request**
   - Submit a payment request via the agent API or the in-app Simulator (`/simulator`) using the legitimate payout flow.
   - Specify a nominal amount (e.g., `USD 1.00` = `100` minor units) to an allowlisted trusted payee email registered in PayPal Sandbox.

5. **Observe State Transitions**
   - Open `/requests/:id` in the dashboard.
   - Watch the state progress from `PENDING` &rarr; `EXECUTING` &rarr; `COMPLETED` (or `FAILED` if provider rejected).
   - If approvals are enabled for this threshold, approve the request at `/approvals/:id`.

6. **Download Redacted Evidence JSON**
   - On `/requests/:id`, click the **"Download evidence (JSON)"** button in the Actions panel.
   - Or export via CLI:
     ```bash
     npm run real:evidence -- --request <requestId> --out storage/evidence.json
     ```
   - The file will be named `evidence-<requestId>.json`.

7. **Capture Supporting Screenshots (Optional)**
   - Take screenshots of the sender sandbox dashboard and recipient sandbox wallet for audit trail completeness.

8. **Save Evidence for S13 Calibration**
   - Place the evidence JSON under `docs/sandbox-evidence/evidence-<requestId>.json`.
   - Use this real payload format to compare batch IDs, status transitions, and webhook event payloads with the S13 reconciliation logic.

9. **Special Failure Scenarios & Troubleshooting**
   - **(a) Webhook Arrives Late / Out of Order**:
     The system's `reconcile_request` job polls PayPal after timeouts, and `process_webhook` verifies idempotent idempotency deduplication. The ledger records `RECONCILED` once finalized.
   - **(b) Insufficient Sandbox Balance (`INSUFFICIENT_FUNDS`)**:
     PayPal returns `INSUFFICIENT_FUNDS`. The execution records the error code, the budget reservation is released, and the request transitions to `FAILED`. Top up the sandbox business account balance in PayPal Developer Portal.
   - **(c) Receiver Email Not Registered in Sandbox**:
     PayPal accepts the batch initially as `PENDING`/`UNCLAIMED`, then issues an `UNCLAIMED` webhook event if unregistered. The S13 reconciler monitors this and marks the payout accordingly without double-spending.

---

## Panduan Bahasa Indonesia

Panduan langkah-demi-langkah untuk pemilik organisasi (OWNER) menjalankan **SATU payout nyata** ke PayPal Sandbox di server hosting cPanel (hanya lewat browser, tanpa perlu akses shell), lalu mengunduh bukti ter-redaksi untuk mencocokkan implementasi S13 dengan perilaku PayPal Sandbox sesungguhnya.

> [!IMPORTANT]
> - Jangan menggunakan akun PayPal live/nyata. Pastikan selalu menggunakan PayPal Sandbox.
> - Gunakan nominal kecil (misalnya `USD 1.00`).
> - Ekspor bukti JSON secara otomatis menyamarkan data pribadi (email menjadi `a***@d***.tld`, nama, alamat, telepon) dan tidak memuat token/rahasia otentikasi.

### Langkah demi Langkah

1. **Jalankan Preflight (Pemeriksaan Kesiapan)**
   - Masuk sebagai `OWNER` atau `JUDGE`.
   - Buka menu `/settings/paypal` di browser.
   - Klik tombol **"Run real-payout preflight"**.
   - Pastikan seluruh pemeriksaan (**PF-01** sampai **PF-12**) berstatus `PASS` (hijau) atau `WARN` (kuning untuk antrean).
   - Jika melalui SSH/CLI:
     ```bash
     npm run real:preflight
     ```

2. **Pasang Cron Pemroses Latar Belakang (Bila PF-03 Gagal/Merah)**
   - Jika heartbeat pemroses merah (tidak aktif), buka menu Cron Jobs di cPanel dan tambahkan entri tiap 1 menit:
     ```bash
     * * * * * cd /home/<user>/public_html/jobenpay && /home/<user>/nodevenv/public_html/jobenpay/22/bin/node --env-file-if-exists=.env server/src/jobs/tick.js >> storage/logs/cron.log 2>&1
     ```
   - Klik ulang Preflight; dalam 1-2 menit `PF-03` akan berubah menjadi `PASS`.

3. **Siapkan Dokumen Invoice (Bila Mandat Mengharuskan Invoice)**
   - Jika kebijakan mandat aktif memiliki `requireInvoice: true`:
   - Buka menu `/documents`, unggah dokumen invoice sampel dengan nama payee dan nominal yang sesuai.
   - Tunggu hingga status dokumen menjadi `EXTRACTED`.

4. **Kirim 1 Permintaan Pembayaran Uji Coba**
   - Kirim permintaan payout melalui API agen atau melalui Simulator `/simulator` dengan nominal kecil (misal `USD 1.00` = `100` minor unit).
   - Tujukan ke email penerima sandbox yang telah terdaftar di allowlist mandat dan berstatus `TRUSTED`.

5. **Pantau Perubahan Status**
   - Buka detail request di `/requests/:id`.
   - Pantau alur status: `PENDING` &rarr; `EXECUTING` &rarr; `COMPLETED` (atau `FAILED` jika ditolak penyedia).
   - Bila memerlukan persetujuan approver, setujui di `/approvals/:id`.

6. **Unduh Evidence JSON Ter-redaksi**
   - Pada halaman `/requests/:id`, klik tombol **"Download evidence (JSON)"** di panel samping Actions.
   - Atau unduh melalui CLI:
     ```bash
     npm run real:evidence -- --request <requestId> --out storage/evidence.json
     ```
   - Berkas akan diunduh dengan nama `evidence-<requestId>.json`.

7. **Ambil Tangkapan Layar (Opsional)**
   - Ambil screenshot saldo & riwayat di dashboard akun sandbox pengirim dan penerima sebagai dokumentasi pembanding.

8. **Simpan Bukti untuk Kalibrasi S13**
   - Simpan berkas JSON ke `docs/sandbox-evidence/evidence-<requestId>.json` untuk dijadikan rujukan penyempurnaan struktur payload S13.

9. **Penanganan Skenario Khusus**
   - **(a) Webhook Terlambat Tiba**:
     Sistem memiliki pekerjaan rekonsiliasi berkala (`reconcile_request`) yang akan mengecek status ke PayPal jika webhook belum diterima setelah rentang waktu tertentu.
   - **(b) Saldo Sandbox Tidak Cukup (`INSUFFICIENT_FUNDS`)**:
     PayPal akan menolak transaksi. Sistem mencatat error, melepas reservasi anggaran, dan mengubah status ke `FAILED`. Tambah saldo sandbox business account di developer.paypal.com.
   - **(c) Email Penerima Belum Terdaftar di Sandbox**:
     PayPal dapat menahan payout dalam status `UNCLAIMED`. Rekonsiliator mendeteksi status ini dan mencegah terjadinya pembelanjaan ganda.

