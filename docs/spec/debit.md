# Spesifikasi Kategori Transaksi: DEBIT (Tier C)

**Kode Kategori:** `DEBIT`  
**Sub-Tipe Legal:** `direct`  
**Status Implementasi:** `done` (14/14 CCC Terpenuhi)  
**Referensi:** PRD 1.3 §3, AD-17, `docs/spec/tier-c-and-thin-specs.md`

---

## 1. Ikhtisar & Deskripsi Bisnis
Penarikan dana langsung (*Direct Debit* / ACH Debit / Bank Pull) dari rekening pihak lawan (counterparty) berdasarkan otorisasi mandat formal yang telah ditandatangani sebelumnya (`debit_authorizations`) via **Partner Simulator Provider**.

Setiap penarikan debit:
- Wajib merujuk pada `auth_id` otorisasi aktif.
- Selalu dievaluasi berstatus `REQUIRE_APPROVAL` (0 Auto-Approve).
- Membawa penanda metadata `provider: "simulated"`.
- Menghasilkan double-entry ledger seimbang pada saat penyelesaian (`COMPLETED`).

---

## 2. Skema & Validasi Otorisasi Debit
Setiap transaksi debit wajib mematuhi parameter otorisasi:
1. **Status Mandat:** Wajib `ACTIVE`. Bila `REVOKED` atau `EXPIRED`, penarikan ditolak dengan `DEBIT_AUTH_INVALID` (HTTP 422).
2. **Jendela Masa Berlaku:** `now <= valid_until`. Bila kedaluwarsa, ditolak dengan `MANDATE_EXPIRED` (HTTP 410).
3. **Plafon Penarikan (Cap Limit):** `amount_minor <= max_amount_minor`. Bila melampaui, ditolak dengan `CAP_EXCEEDED` (HTTP 422).

---

## 3. Alasan Penolakan Simulator & Alur Pencabutan
- **Simulasi Penolakan:**
  - `INSUFFICIENT_FUNDS`: Saldo rekening pihak lawan tidak mencukupi.
  - `AUTH_REVOKED`: Pihak lawan mencabut otorisasi penarikan.
  - `ACCOUNT_CLOSED`: Rekening bank pihak lawan ditutup.
- **Alur Pencabutan (Revocation):**
  - Endpoint `POST /api/v1/debit/authorizations/{id}/revoke` mengubah status menjadi `REVOKED`. Transaksi debit yang sedang dalam status `EVALUATING` otomatis dibatalkan (`REJECTED`).

---

## 4. Aturan Ledger Double-Entry Berimbang
Saat penarikan berhasil (`COMPLETED`):
- DEBIT `org:main`: `amount_minor` (Kas organisasi bertambah)
- CREDIT `counterparty:debit:{counterparty_id}`: `amount_minor` (Kewajiban pihak lawan berkurang)
*(SUM(DEBIT) = SUM(CREDIT) — Selalu Seimbang 100%)*

---

## 5. State Machine & Aktor
```text
DRAFT → SUBMITTED → EVALUATING → APPROVED → EXECUTING → COMPLETED
                         ↓           ↓           ↓
                     REJECTED    CANCELLED     FAILED
```
- Dual control Maker/Checker: Agen/Maker mengajukan instruksi penarikan debit, hanya Checker manusia yang dapat menyetujui eksekusi.

---

## 6. Audit & Kepatuhan
- **SAR v1.1**: Mencatat ringkasan legs, `provider: "simulated"`, dan hash SHA-256 anti-tamper.
- **Idempotency**: Dilindungi `Idempotency-Key` per organisasi tenant, mencegah duplikasi penarikan.
- **Tabel Audit Relasional**: `debit_authorizations` dan `debit_execution_records`.

