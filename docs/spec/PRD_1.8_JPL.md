# PRD 1.8 — JobenPay Policy Language (JPL) Specification
## Standar Terbuka untuk Kebijakan Kontrol Agen AI yang Dapat Diaudit

**Versi:** 1.0 · **Status:** Standard Specification, Implementation-ready, Zero-Hallucination  
**Tanggal:** 7 November 2026  
**Basis:** PRD 1.2 §10.1 (policy schema) + PRD 1.3 (universal transaction) + PRD 1.6 (DIP)  
**Prinsip:** Setiap field, operator, dan test eksplisit. AI builder tidak perlu menebak. Tidak ada "disiratkan".  
**Filosofi:** Dokumen ini ditulis untuk dibaca 10 tahun dari sekarang, ketika model AI sudah berganti berkali-kali, tetapi aturan bisnis tetap sama.

---

## 0. ATURAN EMAS (NON-NEGOTIABLE)

1. **JPL adalah bahasa deklaratif, bukan bahasa pemrograman.** Tidak ada loop, tidak ada function, tidak ada side effect. Hanya aturan yang dapat dievaluasi secara deterministik.
2. **JPL tidak bergantung pada model AI.** Policy yang ditulis dalam JPL dapat dievaluasi oleh interpreter mana pun, tanpa memanggil LLM.
3. **JPL memiliki compiler dan verifier referensi.** Setiap implementasi JPL wajib lulus conformance test suite (20 vektor uji).
4. **JPL backward compatible minimal 10 tahun.** Versi lama tetap dapat dievaluasi oleh interpreter baru.
5. **JPL deterministik.** Evaluasi policy yang sama dengan input yang sama selalu menghasilkan output yang sama.
6. **JPL fail-closed.** Jika evaluasi tidak dapat diselesaikan (data hilang, tipe salah), hasilnya `DENY` — bukan `PERMIT`.
7. **Explicit deny precedence.** Jika ada rule dengan outcome `DENY` yang cocok, hasilnya selalu `DENY` — bahkan jika rule lain dengan priority lebih tinggi menghasilkan `PERMIT`.
8. **Coverage 100%** untuk `jpl_compiler.js`, `jpl_evaluator.js`, `jpl_verifier.js`. CI gagal jika < 100%.
9. **Setiap test case memiliki assertion eksplisit.** Tidak ada "test bahwa X berfungsi".

---

## 1. STRUKTUR DAN OPERATOR SPESIFIKASI

### 1.1 Struktur Dokumen Policy
```json
{
  "jpl_version": "1.0",
  "policy_id": "pol_01HX4Z8K9M2N3P4Q5R6S7T8V9W",
  "policy_name": "Standard Payout Policy",
  "metadata": {
    "description": "Allow payouts to trusted vendors",
    "author": "Security Team",
    "created_at": "2026-11-07T10:00:00Z"
  },
  "rules": [
    {
      "rule_id": "rule_deny_blocked_vendor",
      "priority": 1,
      "description": "Block vendors marked as BLOCKED",
      "conditions": [
        { "field": "counterparty.trust", "operator": "eq", "value": "BLOCKED" }
      ],
      "outcome": "DENY",
      "outcome_params": { "reason_code": "PAYEE_BLOCKED" }
    }
  ],
  "default_outcome": "DENY",
  "signature": {
    "alg": "Ed25519",
    "kid": "kid_01HX...",
    "sig": "base64:MEUCIQD..."
  }
}
```

### 1.2 18 Operator Semantik Eksplisit
| Operator | Tipe Field | Tipe Value | Semantik |
|---|---|---|---|
| `eq` | string/number/boolean | same | Sama dengan |
| `neq` | string/number/boolean | same | Tidak sama dengan |
| `gt` | number | number | Lebih besar dari |
| `gte` | number | number | Lebih besar atau sama dengan |
| `lt` | number | number | Lebih kecil dari |
| `lte` | number | number | Lebih kecil atau sama dengan |
| `in` | any | array | Field ada di array |
| `not_in` | any | array | Field tidak ada di array |
| `contains` | string/array | string/any | Field mengandung value |
| `not_contains` | string/array | string/any | Field tidak mengandung value |
| `matches` | string | regex | Field cocok dengan regex (RE2 syntax) |
| `not_matches` | string | regex | Field tidak cocok dengan regex |
| `exists` | any | — | Field ada (tidak null/undefined) |
| `not_exists` | any | — | Field tidak ada |
| `between` | number | [min, max] | Field antara min dan max (inklusif) |
| `not_between` | number | [min, max] | Field tidak antara min dan max |
| `subset_of` | array | array | Field adalah subset dari value |
| `superset_of` | array | array | Field adalah superset dari value |
| `intersects` | array | array | Field beririsan dengan value |
