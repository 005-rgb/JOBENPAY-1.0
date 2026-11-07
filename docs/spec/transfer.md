# SPESIFIKASI DOMAIN KATEGORI: TRANSFER (K-TRANSFER)

**Dokumen:** `docs/spec/transfer.md`  
**Kategori:** `TRANSFER`  
**Sub-Tipe:** `p2p`  
**Arah Dana:** INTERNAL (Transfer peer-to-peer antar pihak internal / mitra)  
**Konsumsi Anggaran:** YA (Mengkonsumsi anggaran pengirim)  
**Provider Gateway:** Internal Ledger + PayPal Payouts API (`/v1/payments/payouts`) jika pencairan keluar  
**Status:** `IMPLEMENTED`

---

## 1. Alur Bisnis & Siklus Hidup (PIPE)
Siklus hidup transaksi transfer peer-to-peer:
1. `DRAFT` → `SUBMITTED` (diusulkan dengan `senderCounterpartyId` dan `receiverCounterpartyId`)
2. `SUBMITTED` → `EVALUATING` (evaluasi: `sender != receiver`, pengecekan saldo/budget pengirim, verifikasi counterparty)
3. `EVALUATING` → `APPROVED` (disetujui otomatis jika memenuhi batas per-transaksi dan allowlist)
4. `EVALUATING` → `NEEDS_APPROVAL` (eskalasi jika counterparty baru `< 30 hari` atau nominal di atas batas auto-approve)
5. `EVALUATING` → `REJECTED` (jika pengirim = penerima `SENDER_EQUALS_RECEIVER` atau saldo/anggaran tidak cukup)
6. `NEEDS_APPROVAL` → `APPROVED` (disetujui oleh manusia / Approver)
7. `NEEDS_APPROVAL` → `REJECTED` (ditolak oleh manusia / Approver)
8. `APPROVED` → `EXECUTING` (eksekusi mutasi buku besar dan/atau gateway payout)
9. `EXECUTING` → `COMPLETED` (mutasi ledger selesai dan seimbang)
10. `EXECUTING` → `FAILED` (gagal eksekusi; rollback reservasi dana)

---

## 2. Catatan Entitas & Integritas Data (AD-17, T-18)
- **Tabel Entitas:** `transfer_records (id, org_id, intent_id, sender_counterparty_id, receiver_counterparty_id, amount_minor, currency, status, paypal_payout_id)`.
- **Constraint DB:**
  - `amount_minor > 0`
  - `CHECK (sender_counterparty_id != receiver_counterparty_id)`: Mencegah self-transfer atau manipulasi pembukuan sirkular.

---

## 3. Aturan Pembukuan Buku Besar (Double-Entry Ledger)
Setiap mutasi transfer wajib menghasilkan sepasang entri buku besar berimbang (`RULE_TRANSFER_P2P`):
- **DEBIT:** `payee:{sender_counterparty_id}` (mengurangi saldo/kewajiban pengirim)
- **CREDIT:** `payee:{receiver_counterparty_id}` (menambah saldo/hak penerima)
- **Kondisi Saldo:** `SUM(DEBIT) = SUM(CREDIT) = nominal transfer`.
- Trigger DB menolak setiap transaksi yang tidak seimbang.

---

## 4. Idempotensi & Identifikasi Eksekusi
- **Klien ke Engine:** Header HTTP `Idempotency-Key` (unik per organisasi).
- **Engine ke PayPal:** `PayPal-Request-Id = "jp_{intent_id}_transfer_payout"`.
- Replay dengan payload identik mengembalikan respons HTTP 200 dengan `replayed: true`.
- Kunci sama dengan payload berbeda menghasilkan HTTP 422 `IDEMPOTENCY_KEY_REUSED`.

