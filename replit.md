# replit.md — aturan tetap proyek JOBENPAY

Kamu membangun JOBENPAY persis sesuai docs/PRD.md (v1.2). PRD menang atas ingatan/asumsi kamu.
Dilarang menebak. Jika PRD tidak jelas → baca docs/DECISIONS.md; jika masih tidak ada → TULIS pertanyaan di docs/PROGRESS.md bagian "Blockers" dan BERHENTI.

## Cara kerja tiap sesi
1. Baca docs/PROGRESS.md, lalu docs/DECISIONS.md.
2. Baca HANYA bagian docs/ROADMAP.md untuk langkah yang diminta, dan HANYA bagian PRD yang dirujuk langkah itu (pakai docs/prd/NN-*.md atau grep). JANGAN membaca seluruh PRD.
3. Kerjakan hanya langkah itu. Tidak ada fitur, refactor, atau "perbaikan" di luar langkah.
4. Jalankan perintah kriteria-lulus langkah. Perbaiki sampai hijau.
5. STOP-LOSS: jika tes yang sama gagal 3 kali berturut-turut dengan penyebab tidak jelas, berhenti. Tulis gejala, dugaan, dan file terkait di PROGRESS.md "Blockers". Jangan terus mencoba.
6. Akhiri dengan: perbarui docs/PROGRESS.md, git commit (pesan Inggris: `feat(Sxx): ...`), git push.

## Batas keras (tidak boleh dilanggar)
- JavaScript ES2023 di Node 22. Tanpa TypeScript, tanpa transpiler server, tanpa dependensi native. Tidak ada file .ts/.tsx.
- Sandbox-only: base URL PayPal adalah konstanta https://api-m.sandbox.paypal.com. Host live PayPal tidak boleh muncul di source.
- Uang = bigint satuan minor + currency char(3). Tidak pernah float. pg bigint dikembalikan sebagai string → parse ke BigInt/Number aman (<2^53) di satu helper saja.
- Semua query tabel bertenant lewat repository yang MEWAJIBKAN orgId.
- Operasi uang (reservasi anggaran, ubah status + tulis ledger) dalam SATU transaksi (withTx).
- Fail-closed: AI gagal/timeout/JSON tidak valid → REQUIRE_APPROVAL, tidak pernah AUTO_APPROVE. AI hanya memperketat.
- Agen tidak pernah mengeksekusi; kredensial PayPal tidak pernah ke klien/LLM/log.
- Tidak ada nilai warna/ukuran literal di luar web/src/styles/tokens.css.
- Tidak ada logo/nama PayPal sebagai identitas UI. Hanya label faktual ("Connect PayPal Sandbox").
- Nama endpoint/field/event PayPal ditandai [VERIFY] di PRD: cocokkan dengan dokumentasi resmi, catat hasilnya di DECISIONS.md.
- Tes server pakai `node --test`. Tidak ada Jest/Vitest di server.
- Jangan commit rahasia. Jangan menambah dependensi tanpa mencatat nama + lisensi di THIRD_PARTY_NOTICES.md (hanya MIT/Apache-2.0/BSD/ISC/0BSD).

## Perintah standar
npm run dev | start | migrate | seed | setup | test | test:unit | lint | guard
