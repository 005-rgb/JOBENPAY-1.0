# TEMPLATE WORK PACKET (PAKET KERJA)

Setiap paket kerja (WP) yang dikerjakan oleh builder wajib mengikuti template formal ini sebelum menulis implementasi.

---

## 1. Identitas & Tujuan
- **ID Paket Kerja:** `WP-<KODE>` (contoh: `WP-F1-SALE`)
- **Tujuan (Satu Kalimat Teruji):** [Tuliskan satu kalimat tunggal yang dapat diverifikasi oleh tes otomatis].

## 2. Rujukan Dokumen Spesifikasi
- **Pasal PRD 1.3:** [Contoh: §1.1, §3.1, §4.2, §8]
- **Pasal Blueprint v1.2:** [Contoh: §7 FR-101, §9.3]
- **Keputusan Addendum:** [Contoh: AD-01, AD-06, AD-12]
- **Katalog Webhook:** [Contoh: PAYMENT.CAPTURE.COMPLETED]

## 3. Batasan Berkas
- **Berkas yang Boleh Dibuat / Diubah:**
  - `...`
  - `...`
- **Berkas yang Dilarang Keras Disentuh:**
  - `docs/spec/*` (Read-only)
  - `server/src/config.js` (Kecuali ada AD baru)
  - Seluruh berkas di luar ruang lingkup WP ini.

## 4. Kontrak Teknis
- **Input (Payload DTO / Parameters):** [Skema JSON / Zod]
- **Output (Response Data):** [Format status & objek kembalian]
- **Kode Error (Upper Snake Case):** [Daftar kode error yang dilempar]
- **Event Webhook / Internal:** [Event yang dipancarkan atau diterima]

## 5. Tes yang Ditulis Lebih Dulu (Test-Driven Development)
Daftar nama tes yang wajib dibuat dan gagal (*red*) sebelum kode implementasi ditulis:
1. `test_<nama_skenario_sukses>`
2. `test_<nama_skenario_gagal_validasi>`
3. `test_<nama_skenario_idempoten>`
4. `test_<nama_skenario_ledger_seimbang>`

## 6. Larangan Khusus
- Dilarang menggunakan tipe float / Number untuk perhitungan nominal uang.
- Dilarang membuat endpoint yang mengeksekusi uang tanpa melalui status `APPROVED`.
- Dilarang menambah dependensi npm baru tanpa izin tertulis.
- Dilarang mengedit tes yang sudah ada tanpa alasan tertulis dan label `test-changed`.

## 7. Definition of Done (DoD)
- [ ] Tes yang ditulis lebih dulu telah lulus 100% (*green*).
- [ ] Seluruh rangkaian CI (`npm test`, `npm run guard`, `lint-no-float-money`) lulus hijau.
- [ ] Baris penelusuran di `docs/traceability.csv` telah diperbarui menjadi `done`.
- [ ] Laporan Akhir WP sesuai format Preamble A.8 telah diserahkan.

