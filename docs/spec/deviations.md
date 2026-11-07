# Deviations from PRD-R to Actual Repository Structure

Dokumen ini mencatat perbedaan teknis (nama tabel, kolom, enum, rute) antara PRD-R dan implementasi aktual PRD v1.2 / brownfield di repositori.
Sesuai aturan kerja, nama aktual pada repositori adalah sumber kebenaran operasional, dan deviasi didokumentasikan di sini secara presisi.

| Ref | Komponen PRD-R | Implementasi Aktual Repo | Alasan & Justifikasi |
|---|---|---|---|
| DEV-01 | `payment_requests` table | `transaction_intents` table (dengan view `payment_requests` untuk backward compatibility v1.2) | Mempertahankan kompatibilitas penuh skema v1.2 sambil mendukung model universal PRD 1.3 |
| DEV-02 | `request_id` | `intent_id` (di codebase v1.3 universal) / `payment_request_id` (di view v1.2) | Kompatibilitas dua arah; `request_id` dipetakan ke `intent_id` di internal engine |
| DEV-03 | `request_evaluations` | `request_evaluations` (kolom `intent_id` dan `request_id`) | Konsistensi FK tenant isolation |
| DEV-04 | `executions` | `executions` (kolom `intent_id`, `step`, `provider_request_id`) | Idempotensi per langkah PayPal `jp_{intent_id}_{step}` |
| DEV-05 | `journal_entries` & `journal_lines` | `transaction_legs` (tabel ledger bukti double-entry berantai hash kanonik) | Diimplementasikan sebagai `transaction_legs` dengan trigger seimbang per mata uang `SUM(debit) = SUM(credit)` |
| DEV-06 | Migrasi PRD 1.4 (`020_vlei.sql`, `021_intent.sql`, `022_pact.sql`) | `037_vlei.sql`, `038_intent.sql`, `039_pact.sql` | Brownfield repositori telah memiliki migrasi 001 s/d 036. Nomor berurutan 037-039 menjamin forward-only execution tanpa bentrok dengan 020_s04, 021_f3, 022_payout. |
| DEV-07 | `REFERENCES organizations(org_id)` | `REFERENCES organizations(id)` | Kolom PK aktual tabel `organizations` di repositori adalah `id` (001_identity_tenant.sql). |
