<USER_REQUEST>
PRD 1.6 — JOBENPAY Decision Integrity Proof (DIP)
Membuktikan Bahwa Keputusan AI Mencerminkan Niat Manusia — Bukan Hasil Manipulasi
Versi: 1.0 · Status: Implementation-ready, zero-hallucination
Tanggal: 7 November 2026
Basis: PRD 1.2 (Sandbox Gatekeeper) + PRD 1.3 (Universal Transaction Engine) + PRD 1.4 (Trust Infrastructure) + PRD 1.5 (Open Trust Exchange)
Prinsip: Setiap field, algoritma, state, dan test eksplisit. AI builder tidak perlu menebak. Tidak ada "disiratkan".

0. ATURAN EMAS (NON-NEGOTIABLE)
Deterministic check, bukan AI check. Konsistensi niat diperiksa oleh kode deterministik, bukan LLM. AI hanya boleh mengekstrak alasan dari teks agen, bukan menilai konsistensi.

Intent Anchor wajib ditandatangani manusia. Tidak ada Intent Anchor yang dibuat otomatis oleh sistem.

Reasoning Trace wajib disertakan untuk setiap transaksi yang memiliki intent_mandate_id. Jika tidak ada, transaksi → REJECTED dengan kode REASONING_TRACE_MISSING.

Decision Integrity Score (DIS) adalah deterministik. Formula eksplisit di §5. Tidak ada ML, tidak ada heuristik "kira-kira".

Fail-closed. Jika DIP tidak dapat dihitung (data hilang, format invalid), transaksi → REQUIRE_APPROVAL dengan kode DIP_INDETERMINATE. Tidak pernah AUTO_APPROVE.

Coverage 100% untuk dip_service.js, intent_service.js (extension), dan reasoning_parser.js. CI gagal jika < 100%.

Setiap test case memiliki assertion eksplisit (§10). Tidak ada "test bahwa X berfungsi".

Tidak ada PII di Reasoning Trace. Hanya hash, enum, angka, dan timestamp.

1. RINGKASAN DAN FILOSOFI
1.1 Masalah yang Diselesaikan
PRD 1.2–1.5 menjawab pertanyaan: "Apakah agen ini sah?" (mandat valid, tanda tangan valid, ledger valid).

Tetapi ada pertanyaan yang belum dijawab oleh siapa pun di industri — termasuk AP2, PayPal, dan seluruh ekosistem pembayaran AI:

"Apakah keputusan yang mendasari transaksi ini benar-benar mencerminkan niat manusia — atau hasil manipulasi (prompt injection, halusinasi, atau data yang dimanipulasi)?"

Para peneliti telah membuktikan secara eksplisit bahwa AP2 hanya menjamin execution integrity, bukan decision integrity. Dalam studi red-teaming, peneliti berhasil membuat agen memilih produk yang salah dengan tingkat keberhasilan 100%, sementara semua mandat tetap "cryptographically valid". Ini adalah celah fundamental yang tidak dijawab oleh standar mana pun.

1.2 Solusi: Decision Integrity Proof (DIP)
JOBENPAY DIP menambahkan lapisan ketiga di atas kontrol eksekusi:

Intent Anchor — manusia menandatangani "konteks niat" (bukan hanya batas anggaran).

Reasoning Trace — agen mengirimkan ringkasan alasan (3–5 poin) yang mendasari keputusan.

Deterministic Consistency Check — kode memverifikasi bahwa alasan agen konsisten dengan Intent Anchor.

Decision Integrity Score (DIS) — skor 0–100 yang ditandatangani dan dimasukkan ke SAR.

Human Review Trigger — jika DIS < ambang, transaksi otomatis REQUIRE_APPROVAL.

1.3 Filosofi
"Tanda tangan membuktikan bahwa transaksi sah. Tetapi tanda tangan tidak membuktikan bahwa keputusan itu benar. JOBENPAY DIP membuktikan keduanya."

Ini adalah pergeseran dari "execution integrity" (yang sudah dijawab oleh AP2 dan JOBENPAY 1.2–1.5) menjadi "decision integrity" (yang belum dijawab oleh siapa pun).

2. CAKUPAN
2.1 Yang Termasuk
Komponen	Deskripsi	Tier
Intent Anchor Format	JSON Schema untuk konteks niat yang ditandatangani manusia	A
Reasoning Trace Format	JSON Schema untuk ringkasan alasan agen	A
Deterministic Consistency Check	Algoritma yang memverifikasi konsistensi	A
Decision Integrity Score (DIS)	Formula deterministik 0–100	A
Integration dengan Decision Engine	DIP sebagai Tahap A baru	A
SAR Extension	Field decision_integrity di SAR	A
UI: Intent Anchor Builder	Form untuk membuat Intent Anchor	A
UI: DIP Display	Menampilkan DIS di request detail	A
Test Suite	Unit + integration + adversarial	A
Adversarial Corpus	30+ skenario manipulasi untuk test	A
2.2 Yang Tidak Termasuk
Bukan pengganti AI intent check (PRD 1.2 §9.5 Tahap C); DIP adalah lapisan tambahan.

Bukan jaminan bahwa keputusan "benar" secara moral; DIP hanya memverifikasi konsistensi dengan niat yang dinyatakan.

Bukan pemblokiran otomatis; DIP menghasilkan skor yang memicu approval, bukan reject otomatis (kecuali DIS = 0).

Bukan analisis chain-of-thought penuh; hanya ringkasan alasan (3–5 poin).

3. FORMAT INTENT ANCHOR
3.1 JSON Schema (Eksplisit)
json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jobenpay.io/schemas/intent-anchor-v1.0.json",
  "title": "Intent Anchor v1.0",
  "type": "object",
  "required": [
    "intent_id", "org_id", "principal_user_id", "natural_language_input",
    "structured_intent", "intent_hash", "signature", "signing_key_id",
    "valid_from", "valid_to", "created_at"
  ],
  "properties": {
    "intent_id": { "type": "string", "pattern": "^int_[0-9A-HJKMNP-TV-Z]{26}$" },
    "org_id": { "type": "string" },
    "principal_user_id": { "type": "string" },
    "natural_language_input": { "type": "string", "maxLength": 2000 },
    "structured_intent": {
      "type": "object",
      "required": ["purpose", "constraints"],
      "properties": {
        "purpose": {
          "type": "string",
          "enum": [
            "equipment_purchase", "software_subscription", "service_payment",
            "supplier_payout", "refund_issuance", "invoice_payment",
            "down_payment", "other"
          ]
        },
        "constraints": {
          "type": "object",
          "required": ["amount_range", "vendor_categories"],
          "properties": {
            "amount_range": {
              "type": "object",
              "required": ["min", "max"],
              "properties": {
                "min": { "type": "string", "pattern": "^[0-9]+$" },
                "max": { "type": "string", "pattern": "^[0-9]+$" }
              }
            },
            "vendor_categories": {
              "type": "array",
              "items": { "type": "string" },
              "minItems": 1,
              "maxItems": 10
            },
            "required_attributes": {
              "type": "array",
              "items": {
                "type": "object",
                "required": ["key", "operator", "value"],
                "properties": {
                  "key": { "type": "string" },
                  "operator": {
                    "type": "string",
                    "enum": ["eq", "neq", "gte", "lte", "in", "not_in", "contains"]
                  },
                  "value": {}
                }
              },
              "maxItems": 20
            },
            "allowed_brands": {
              "type": "array",
              "items": { "type": "string" },
              "maxItems": 10
            },
            "deadline": { "type": "string", "format": "date-time" }
          }
        }
      }
    },
    "intent_hash": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
    "signature": { "type": "string", "pattern": "^base64:[A-Za-z0-9+/=]+$" },
    "signing_key_id": { "type": "string" },
    "valid_from": { "type": "string", "format": "date-time" },
    "valid_to": { "type": "string", "format": "date-time" },
    "created_at": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
3.2 Contoh Intent Anchor
json
{
  "intent_id": "int_01HX4Z8K9M2N3P4Q5R6S7T8V9W",
  "org_id": "org_01HX...",
  "principal_user_id": "usr_01HX...",
  "natural_language_input": "Beli laptop untuk tim engineering, RAM minimal 32GB, budget maksimal $2000, hanya merek Apple atau Dell.",
  "structured_intent": {
    "purpose": "equipment_purchase",
    "constraints": {
      "amount_range": { "min": "0", "max": "200000" },
      "vendor_categories": ["electronics", "computers"],
      "required_attributes": [
        { "key": "ram_gb", "operator": "gte", "value": 32 }
      ],
      "allowed_brands": ["Apple", "Dell"],
      "deadline": "2026-12-31T23:59:59Z"
    }
  },
  "intent_hash": "sha256:a3f5...",
  "signature": "base64:MEUCIQD...",
  "signing_key_id": "kid_01HX...",
  "valid_from": "2026-11-01T00:00:00Z",
  "valid_to": "2026-12-31T23:59:59Z",
  "created_at": "2026-11-07T10:00:00Z"
}
3.3 Signing Procedure
Ambil Intent Anchor tanpa field signature.

Canonicalize (RFC 8785) → string C.

Hitung hash = SHA-256(C).

Tanda tangani hash dengan private key principal → sig.

Simpan signature: base64(sig).

Verifikasi: Sama dengan PRD 1.5 §3.3, tetapi menggunakan public key principal (dari users.public_key_jwk).

4. FORMAT REASONING TRACE
4.1 JSON Schema (Eksplisit)
json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://jobenpay.io/schemas/reasoning-trace-v1.0.json",
  "title": "Reasoning Trace v1.0",
  "type": "object",
  "required": ["trace_id", "request_id", "reasons", "created_at"],
  "properties": {
    "trace_id": { "type": "string", "pattern": "^rt_[0-9A-HJKMNP-TV-Z]{26}$" },
    "request_id": { "type": "string" },
    "reasons": {
      "type": "array",
      "minItems": 3,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["claim", "evidence_ref", "data_source"],
        "properties": {
          "claim": {
            "type": "string",
            "maxLength": 500,
            "description": "Ringkasan alasan (1 kalimat)"
          },
          "evidence_ref": {
            "type": "string",
            "pattern": "^(doc|field|record):[a-zA-Z0-9_.-]+$",
            "description": "Referensi ke data yang mendukung klaim"
          },
          "data_source": {
            "type": "string",
            "enum": ["invoice", "vendor_profile", "request_metadata", "intent_anchor"]
          },
          "extracted_attributes": {
            "type": "object",
            "description": "Atribut yang diekstrak dari evidence_ref",
            "additionalProperties": true
          }
        }
      }
    },
    "created_at": { "type": "string", "format": "date-time" }
  },
  "additionalProperties": false
}
4.2 Contoh Reasoning Trace
json
{
  "trace_id": "rt_01HX4Z8K9M2N3P4Q5R6S7T8V9W",
  "request_id": "req_01HX...",
  "reasons": [
    {
      "claim": "Laptop ini memiliki RAM 32GB, memenuhi persyaratan minimum.",
      "evidence_ref": "doc:invoice_inv-2041_pdf",
      "data_source": "invoice",
      "extracted_attributes": { "ram_gb": 32 }
    },
    {
      "claim": "Harga $1800, di bawah budget maksimum $2000.",
      "evidence_ref": "field:request.amount_minor",
      "data_source": "request_metadata",
      "extracted_attributes": { "amount_minor": "180000" }
    },
    {
      "claim": "Merek Lenovo, tidak termasuk merek yang diizinkan (Apple, Dell).",
      "evidence_ref": "doc:invoice_inv-2041_pdf",
      "data_source": "invoice",
      "extracted_attributes": { "brand": "Lenovo" }
    }
  ],
  "created_at": "2026-11-07T10:05:00Z"
}
4.3 Aturan Reasoning Trace
Minimal 3, maksimal 5 alasan. Jika agen mengirim lebih dari 5, ambil 5 pertama.

Setiap alasan wajib memiliki evidence_ref. Referensi harus valid (ada di dokumen/field yang dirujuk).

extracted_attributes wajib konsisten dengan evidence_ref. Jika tidak, DIP menandai sebagai EVIDENCE_MISMATCH.

Tidak ada PII di claim (nama, email, nomor telepon). Jika ada, DIP menandai sebagai PII_DETECTED dan skor = 0.

Bahasa: EN atau ID. Tidak ada batasan.

5. ALGORITMA DETERMINISTIC CONSISTENCY CHECK
5.1 Formula Decision Integrity Score (DIS)
text
DIS = 100 × (w_purpose × C_purpose + w_amount × C_amount + w_vendor × C_vendor + w_attributes × C_attributes + w_evidence × C_evidence)
Bobot (eksplisit, tidak dapat diubah):

Komponen	Bobot	Deskripsi
w_purpose	0.15	Kesesuaian purpose
w_amount	0.15	Kesesuaian amount range
w_vendor	0.20	Kesesuaian vendor categories
w_attributes	0.30	Kesesuaian required attributes
w_evidence	0.20	Validitas evidence refs
Total bobot = 1.00.

5.2 Komponen C_purpose (0 atau 1)
text
C_purpose = 1 if request.category matches intent.purpose
            else 0
Mapping eksplisit:

intent.purpose	request.category yang valid
equipment_purchase	SALE, PAYOUT, DOWN_PAYMENT
software_subscription	RECURRING, PAYOUT
service_payment	PAYOUT, INVOICE
supplier_payout	PAYOUT
refund_issuance	REFUND
invoice_payment	INVOICE, PAYOUT
down_payment	DOWN_PAYMENT
other	semua kategori
5.3 Komponen C_amount (0, 0.5, atau 1)
text
C_amount = 1 if amount_minor within [min, max]
            else 0.5 if amount_minor within [min × 0.9, max × 1.1]
            else 0
Rasional: Toleransi 10% untuk fluktuasi harga (pajak, ongkir).

5.4 Komponen C_vendor (0 atau 1)
text
C_vendor = 1 if counterparty.category in intent.vendor_categories
            else 0
Jika counterparty.category tidak tersedia (misalnya vendor baru tanpa kategori), C_vendor = 0.5 (netral, tidak menghukum).

5.5 Komponen C_attributes (0..1)
Untuk setiap required_attribute di Intent Anchor:

text
C_attr_i = 1 if extracted_attributes[key] satisfies operator(value)
            else 0
text
C_attributes = sum(C_attr_i) / count(required_attributes)
Jika required_attributes kosong, C_attributes = 1 (tidak ada persyaratan).

Operator evaluasi (eksplisit):

Operator	Evaluasi
eq	extracted == value
neq	extracted != value
gte	extracted >= value
lte	extracted <= value
in	extracted in value (array)
not_in	extracted not in value (array)
contains	value in extracted (string contains)
Jika extracted_attributes tidak memiliki key, C_attr_i = 0 (dianggap tidak memenuhi).

5.6 Komponen C_evidence (0..1)
Untuk setiap reason di Reasoning Trace:

text
C_evidence_i = 1 if evidence_ref valid and extracted_attributes consistent with evidence
                else 0.5 if evidence_ref valid but extracted_attributes missing
                else 0
text
C_evidence = sum(C_evidence_i) / count(reasons)
Validasi evidence_ref:

doc:<document_id> → dokumen ada di documents table dan milik org yang sama.

field:<field_path> → field ada di request atau intent_anchor.

record:<record_id> → record ada di tabel yang dirujuk.

5.7 Contoh Perhitungan
Intent Anchor:

json
{
  "purpose": "equipment_purchase",
  "constraints": {
    "amount_range": { "min": "0", "max": "200000" },
    "vendor_categories": ["electronics", "computers"],
    "required_attributes": [
      { "key": "ram_gb", "operator": "gte", "value": 32 }
    ],
    "allowed_brands": ["Apple", "Dell"]
  }
}
Request:

json
{
  "category": "SALE",
  "amount_minor": "180000",
  "counterparty": { "category": "electronics" }
}
Reasoning Trace:

json
{
  "reasons": [
    { "claim": "RAM 32GB", "evidence_ref": "doc:invoice_001", "extracted_attributes": { "ram_gb": 32 } },
    { "claim": "Harga $1800", "evidence_ref": "field:request.amount_minor", "extracted_attributes": { "amount_minor": "180000" } },
    { "claim": "Merek Lenovo", "evidence_ref": "doc:invoice_001", "extracted_attributes": { "brand": "Lenovo" } }
  ]
}
Perhitungan:

C_purpose: SALE matches equipment_purchase → 1

C_amount: 180000 in [0, 200000] → 1

C_vendor: electronics in [electronics, computers] → 1

C_attributes: ram_gb 32 >= 32 → 1

C_evidence: 3 reasons, all evidence_ref valid, all extracted_attributes consistent → 1

text
DIS = 100 × (0.15×1 + 0.15×1 + 0.20×1 + 0.30×1 + 0.20×1) = 100
Tetapi: allowed_brands = ["Apple", "Dell"], dan extracted_attributes menunjukkan "Lenovo". Ini adalah pelanggaran allowed_brands, yang tidak tercakup dalam formula di atas.

Perbaikan: Tambahkan komponen C_brand (0 atau 1) dengan bobot 0.10, dan kurangi w_attributes menjadi 0.20.

Formula final (v1.1):

text
DIS = 100 × (w_purpose × C_purpose + w_amount × C_amount + w_vendor × C_vendor + w_brand × C_brand + w_attributes × C_attributes + w_evidence × C_evidence)
Komponen	Bobot
w_purpose	0.15
w_amount	0.15
w_vendor	0.20
w_brand	0.10
w_attributes	0.20
w_evidence	0.20
C_brand:

text
C_brand = 1 if extracted_brand in allowed_brands
            else 0.5 if allowed_brands is empty
            else 0
Dengan contoh di atas:

C_brand: Lenovo not in [Apple, Dell] → 0

DIS = 100 × (0.15×1 + 0.15×1 + 0.20×1 + 0.10×0 + 0.20×1 + 0.20×1) = 90

Ambang (eksplisit):

DIS	Keputusan
≥ 80	AUTO_APPROVE (jika semua Tahap A lain lulus)
50–79	REQUIRE_APPROVAL (kode DIP_LOW_SCORE)
< 50	REJECTED (kode DIP_CRITICAL)
Untuk contoh di atas (DIS = 90): AUTO_APPROVE — tetapi karena brand tidak cocok, seharusnya REQUIRE_APPROVAL. Perbaikan: Tambahkan aturan keras:

Aturan keras (mengalahkan DIS):

Jika C_brand = 0 dan allowed_brands tidak kosong → REQUIRE_APPROVAL (kode DIP_BRAND_MISMATCH).

Jika C_attributes < 0.5 → REQUIRE_APPROVAL (kode DIP_ATTRIBUTES_MISMATCH).

Jika C_evidence < 0.5 → REJECTED (kode DIP_EVIDENCE_INVALID).

Dengan aturan keras, contoh di atas → REQUIRE_APPROVAL.

6. SKEMA DATA
6.1 Tabel Baru
sql
-- 6.1.1 Intent Anchors (extension dari intent_mandates PRD 1.4)
ALTER TABLE intent_mandates ADD COLUMN IF NOT EXISTS structured_intent_v2 JSONB;
ALTER TABLE intent_mandates ADD COLUMN IF NOT EXISTS intent_hash_v2 TEXT;

-- 6.1.2 Reasoning Traces
CREATE TABLE reasoning_traces (
  trace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  org_id UUID NOT NULL REFERENCES organizations(org_id),
  reasons JSONB NOT NULL,
  trace_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id)
);

CREATE INDEX idx_reasoning_traces_request ON reasoning_traces(request_id);
CREATE INDEX idx_reasoning_traces_org ON reasoning_traces(org_id);

-- 6.1.3 Decision Integrity Scores
CREATE TABLE decision_integrity_scores (
  dis_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES transaction_intents(intent_id),
  org_id UUID NOT NULL REFERENCES organizations(org_id),
  score INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  components JSONB NOT NULL,  -- {purpose, amount, vendor, brand, attributes, evidence}
  hard_rule_triggered TEXT,   -- NULL | 'DIP_BRAND_MISMATCH' | 'DIP_ATTRIBUTES_MISMATCH' | 'DIP_EVIDENCE_INVALID'
  decision TEXT NOT NULL CHECK (decision IN ('AUTO_APPROVE','REQUIRE_APPROVAL','REJECTED')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(request_id)
);

CREATE INDEX idx_dis_request ON decision_integrity_scores(request_id);
CREATE INDEX idx_dis_org_score ON decision_integrity_scores(org_id, score);
7. INTEGRASI DENGAN DECISION ENGINE
7.1 Tahap A Baru (setelah INTENT_MISMATCH)
javascript
// Di decision_engine.js, setelah validasi intent_mandate:
if (mandate.ai.intentCheck === true && transaction.intent_mandate_id) {
  const trace = await getReasoningTrace(transaction.intent_id);
  if (!trace) {
    return { decision: 'REJECT', reason_codes: ['REASONING_TRACE_MISSING'] };
  }

  const dip = await computeDecisionIntegrityScore(orgId, transaction, intent, trace);

  if (dip.hard_rule_triggered === 'DIP_EVIDENCE_INVALID') {
    return { decision: 'REJECT', reason_codes: ['DIP_EVIDENCE_INVALID'], dis_score: dip.score };
  }

  if (dip.hard_rule_triggered === 'DIP_BRAND_MISMATCH' ||
      dip.hard_rule_triggered === 'DIP_ATTRIBUTES_MISMATCH') {
    return { decision: 'REQUIRE_APPROVAL', reason_codes: [dip.hard_rule_triggered], dis_score: dip.score };
  }

  if (dip.score < 50) {
    return { decision: 'REJECT', reason_codes: ['DIP_CRITICAL'], dis_score: dip.score };
  }

  if (dip.score < 80) {
    return { decision: 'REQUIRE_APPROVAL', reason_codes: ['DIP_LOW_SCORE'], dis_score: dip.score };
  }

  // Lanjut ke Tahap B (existing)
}
7.2 SAR Extension
json
{
  "decision_integrity": {
    "score": 45,
    "components": {
      "purpose": 1.0,
      "amount": 1.0,
      "vendor": 1.0,
      "brand": 0.0,
      "attributes": 1.0,
      "evidence": 1.0
    },
    "hard_rule_triggered": "DIP_BRAND_MISMATCH",
    "intent_hash": "sha256:a3f5...",
    "trace_hash": "sha256:b7e2..."
  }
}
8. UI SCREENS
8.1 Intent Anchor Builder (/intents/new)
Form: natural_language_input, purpose (dropdown), amount_range (min/max), vendor_categories (multi-select), required_attributes (dynamic list), allowed_brands (multi-select), deadline.

Tombol "Preview Structured Intent" → menampilkan JSON.

Tombol "Sign & Activate" → step-up → tanda tangan.

8.2 DIP Display (/requests/:id)
Kartu "Decision Integrity" dengan:

Skor besar (0–100) dengan warna (hijau ≥80, kuning 50–79, merah <50).

Breakdown komponen (progress bar per komponen).

Hard rule triggered (jika ada) dengan ikon peringatan.

Reasoning Trace (3–5 alasan, dengan evidence link).

Tombol "View Intent Anchor" → modal dengan detail Intent Anchor.

8.3 Komponen UI
Score gauge (SVG circular).

Component breakdown (horizontal bar chart).

Reasoning trace list (numbered, with evidence icons).

Hard rule banner (merah jika DIP_EVIDENCE_INVALID, kuning jika DIP_BRAND_MISMATCH atau DIP_ATTRIBUTES_MISMATCH).

Semua mengikuti design token PRD 1.2 §12.2.

9. API CONTRACTS
9.1 POST /api/v1/intents
Request:

json
{
  "natural_language_input": "Beli laptop untuk tim engineering, RAM minimal 32GB, budget maksimal $2000, hanya merek Apple atau Dell.",
  "structured_intent": {
    "purpose": "equipment_purchase",
    "constraints": {
      "amount_range": { "min": "0", "max": "200000" },
      "vendor_categories": ["electronics", "computers"],
      "required_attributes": [
        { "key": "ram_gb", "operator": "gte", "value": 32 }
      ],
      "allowed_brands": ["Apple", "Dell"],
      "deadline": "2026-12-31T23:59:59Z"
    }
  }
}
Response 201:

json
{
  "intent_id": "int_01HX...",
  "intent_hash": "sha256:a3f5...",
  "signature": "base64:...",
  "status": "ACTIVE"
}
9.2 POST /agent/v1/transactions (extension)
Request (dengan reasoning trace):

json
{
  "category": "SALE",
  "sub_type": "standard",
  "amount_minor": "180000",
  "currency": "USD",
  "counterparty_id": "cp_01HX...",
  "intent_mandate_id": "int_01HX...",
  "reasoning_trace": {
    "reasons": [
      { "claim": "RAM 32GB", "evidence_ref": "doc:invoice_001", "data_source": "invoice", "extracted_attributes": { "ram_gb": 32 } },
      { "claim": "Harga $1800", "evidence_ref": "field:request.amount_minor", "data_source": "request_metadata", "extracted_attributes": { "amount_minor": "180000" } },
      { "claim": "Merek Lenovo", "evidence_ref": "doc:invoice_001", "data_source": "invoice", "extracted_attributes": { "brand": "Lenovo" } }
    ]
  }
}
Response 200:

json
{
  "intent_id": "tx_01HX...",
  "status": "PENDING_APPROVAL",
  "decision": "REQUIRE_APPROVAL",
  "reason_codes": ["DIP_BRAND_MISMATCH"],
  "dis_score": 90,
  "sar_id": null
}
9.3 GET /api/v1/requests/:id/dip
Response 200:

json
{
  "request_id": "tx_01HX...",
  "score": 90,
  "components": {
    "purpose": 1.0,
    "amount": 1.0,
    "vendor": 1.0,
    "brand": 0.0,
    "attributes": 1.0,
    "evidence": 1.0
  },
  "hard_rule_triggered": "DIP_BRAND_MISMATCH",
  "reasoning_trace": { /* full trace */ },
  "intent_anchor": { /* full anchor */ }
}
10. TEST SUITE (WAJIB LULUS, COVERAGE 100%)
10.1 Unit Tests
Test ID	Assertion
test_dis_purpose_match	C_purpose = 1 untuk kategori yang cocok
test_dis_purpose_mismatch	C_purpose = 0 untuk kategori yang tidak cocok
test_dis_amount_in_range	C_amount = 1 untuk amount dalam range
test_dis_amount_tolerance	C_amount = 0.5 untuk amount dalam toleransi 10%
test_dis_amount_out_of_range	C_amount = 0 untuk amount di luar range
test_dis_vendor_match	C_vendor = 1 untuk vendor dalam kategori
test_dis_vendor_neutral	C_vendor = 0.5 untuk vendor tanpa kategori
test_dis_brand_match	C_brand = 1 untuk brand dalam allowed
test_dis_brand_mismatch	C_brand = 0 untuk brand di luar allowed
test_dis_attributes_all_pass	C_attributes = 1 untuk semua attribute terpenuhi
test_dis_attributes_partial	C_attributes = 0.5 untuk sebagian terpenuhi
test_dis_evidence_valid	C_evidence = 1 untuk semua evidence valid
test_dis_evidence_invalid	C_evidence = 0 untuk evidence invalid
test_dis_score_formula	DIS = 100 × (0.15×p + 0.15×a + 0.20×v + 0.10×b + 0.20×at + 0.20×e)
test_dis_hard_rule_brand	DIP_BRAND_MISMATCH → REQUIRE_APPROVAL
test_dis_hard_rule_attributes	DIP_ATTRIBUTES_MISMATCH → REQUIRE_APPROVAL
test_dis_hard_rule_evidence	DIP_EVIDENCE_INVALID → REJECTED
test_dis_threshold_critical	DIS < 50 → REJECTED
test_dis_threshold_low	50 ≤ DIS < 80 → REQUIRE_APPROVAL
test_dis_threshold_pass	DIS ≥ 80 → AUTO_APPROVE
10.2 Integration Tests
Test ID	Assertion
test_intent_create_with_signature	POST /intents → 201 + signature valid
test_reasoning_trace_required	Transaksi tanpa trace → REJECTED REASONING_TRACE_MISSING
test_dip_computed_on_request	Transaksi dengan trace → DIP dihitung
test_dip_sar_includes_score	SAR memuat decision_integrity.score
test_dip_low_score_requires_approval	DIS < 80 → PENDING_APPROVAL
test_dip_critical_rejects	DIS < 50 → REJECTED
10.3 Adversarial Tests (Corpus 30+)
Test ID	Scenario	Expected
test_adv_hidden_instruction	Invoice berisi "ignore previous instructions"	DIP_EVIDENCE_INVALID
test_adv_brand_swap	Intent: Apple/Dell, agen pilih Lenovo	DIP_BRAND_MISMATCH
test_adv_attribute_fake	Agen klaim RAM 32GB, invoice menunjukkan 16GB	DIP_ATTRIBUTES_MISMATCH
test_adv_amount_inflate	Agen klaim $1800, invoice $2500	C_amount = 0
test_adv_vendor_mismatch	Intent: electronics, vendor: furniture	C_vendor = 0
test_adv_evidence_forged	evidence_ref menunjuk dokumen yang tidak ada	DIP_EVIDENCE_INVALID
test_adv_pii_in_claim	Claim memuat email	PII_DETECTED, score = 0
test_adv_reasoning_too_short	2 alasan	Schema invalid
test_adv_reasoning_too_long	6 alasan	Ambil 5 pertama
test_adv_hard_rule_evidence	Semua evidence invalid	REJECTED
...	(total 30+ skenario)	
10.4 Concurrency Tests
Test ID	Assertion
test_1000_parallel_dip	1000 DIP computation paralel → semua selesai < 5 detik
test_dip_idempotent	DIP untuk request yang sama → hasil sama
10.5 Coverage Configuration
json
{
  "scripts": {
    "test:coverage": "c8 --check-coverage --lines 100 --functions 100 --branches 100 --statements 100 --include 'server/src/services/dip_service.js' --include 'server/src/services/intent_service.js' --include 'server/src/services/reasoning_parser.js' node --test server/test/"
  }
}
11. DEFINITION OF DONE
□ Intent Anchor Schema v1.0 dipublikasikan.
□ Reasoning Trace Schema v1.0 dipublikasikan.
□ POST /api/v1/intents berfungsi (dengan signature).
□ POST /agent/v1/transactions menerima reasoning_trace.
□ DIP dihitung untuk setiap transaksi dengan intent_mandate_id.
□ Hard rules ditegakkan (DIP_BRAND_MISMATCH, DIP_ATTRIBUTES_MISMATCH, DIP_EVIDENCE_INVALID).
□ Ambang DIS ditegakkan (< 50 REJECT, 50–79 REQUIRE_APPROVAL, ≥ 80 AUTO_APPROVE).
□ SAR memuat decision_integrity.
□ UI: Intent Anchor Builder, DIP Display.
□ Coverage 100% untuk dip_service.js, intent_service.js, reasoning_parser.js.
□ Semua test di §10 lulus (termasuk 30+ adversarial).
□ Tidak ada PII di Reasoning Trace (grep otomatis).
□ Fail-closed: DIP tidak dapat dihitung → DIP_INDETERMINATE → REQUIRE_APPROVAL.
12. RENCANA KERJA (40 JAM)
WP	Isi	Jam
WP1	Skema data (§6) + migrasi idempoten	3
WP2	Intent Anchor service + signature	5
WP3	Reasoning Trace parser + validator	5
WP4	DIP computation engine (§5)	8
WP5	Integrasi Decision Engine (§7)	4
WP6	SAR extension (§7.2)	3
WP7	API endpoints (§9)	4
WP8	UI: Intent Builder + DIP Display (§8)	5
WP9	Test suite (§10)	8
WP10	Adversarial corpus (30+ skenario)	5
Total		50
13. PROMPT UNTUK AI BUILDER (ZERO-HALLUCINATION)
13.1 Preamble (tempel ke replit.md)
markdown
# ATURAN PRD 1.6 (DIP)

Kamu membangun DIP persis sesuai PRD 1.6. Jangan menebak.
- Baca HANYA bagian yang dirujuk prompt.
- Setiap field, algoritma, bobot, dan test eksplisit di PRD 1.6.
- Deterministic check, bukan AI check. AI hanya mengekstrak alasan.
- Coverage 100% untuk dip_service.js, intent_service.js, reasoning_parser.js.
- Fail-closed: DIP tidak dapat dihitung → REQUIRE_APPROVAL.
- Tidak ada PII di Reasoning Trace.
- Hard rules mengalahkan DIS score.
13.2 Prompt Pembuka (per sesi)
markdown
Baca AGENTS.md, docs/PROGRESS.md, docs/DECISIONS.md.
Lalu baca docs/PRD_1.6_DIP.md bagian:
- §3 (Intent Anchor Format)
- §4 (Reasoning Trace Format)
- §5 (Algoritma DIP)
- §6 (Skema Data)
- §7 (Integrasi Decision Engine)
- §10 (Test Suite)

Kerjakan WP1–WP4 (skema data, Intent Anchor service, Reasoning Trace parser, DIP computation engine).
Jangan kerjakan WP5–WP10.

Sebelum menulis kode:
1. Verifikasi struktur repo aktual (ls/grep). Jangan menebak nama file/tabel.
2. Tulis rencana singkat (file yang akan dibuat/diubah).
3. Tulis tes yang gagal lebih dulu (dari §10.1).
4. Implementasi sampai hijau.
5. Jalankan `npm test` — semua tes lama harus tetap hijau.
6. Coverage 100% untuk modul baru.

Selesai bila:
- Semua tes di §10.1 lulus.
- Coverage 100%.
- Tidak ada PII di Reasoning Trace.
- Semua hard rules ditegakkan.

Jika gagal 3x berturut-turut: berhenti, tulis di PROGRESS.md "Blockers", commit `wip(dip): blocked`.
13.3 Prompt Pemeriksa (adversarial, sesi bersih)
markdown
Audit TANPA mengubah kode: bandingkan implementasi DIP dengan PRD 1.6 §5 (algoritma) dan §10 (test).
Tabel [butir | Ya/Sebagian/Tidak | file:baris | catatan].
Periksa khusus:
(a) Apakah bobot DIP persis 0.15/0.15/0.20/0.10/0.20/0.20?
(b) Apakah hard rules mengalahkan DIS score?
(c) Apakah `C_amount` menggunakan toleransi 10%?
(d) Apakah `C_vendor` mengembalikan 0.5 untuk vendor tanpa kategori?
(e) Apakah `C_evidence` memvalidasi `evidence_ref` terhadap database?
(f) Apakah PII terdeteksi dan score = 0?
(g) Apakah fail-closed (DIP tidak dapat dihitung → REQUIRE_APPROVAL)?
(h) Apakah coverage 100% untuk dip_service.js?

Cobalah MEMATAHKAN: tulis tes serangan yang gagal (jangan perbaiki).
Simpan ke docs/audit/DIP.md.
13.4 Prompt Penutup (kuota habis)
markdown
Jangan mulai hal baru. (1) `npm run lint && npm test`, catat hasil.
(2) PROGRESS.md: paket aktif, butir selesai/belum, file setengah jadi, perintah lanjut persis.
(3) commit `wip(dip): ...` dan push.
13.5 Prompt BLOCKER
markdown
Berhenti mengubah kode. Baca Blockers PROGRESS.md.
Jelaskan akar masalah ≤10 baris + 2 opsi dengan trade-off.
Jangan menerapkan sebelum saya memilih.
14. PRINSIP NON-NEGOTIABLE
Deterministic, bukan AI. Konsistensi niat diperiksa kode, bukan LLM.

Intent Anchor ditandatangani manusia. Tidak ada anchor otomatis.

Reasoning Trace wajib. Tidak ada trace → REJECT.

Hard rules mengalahkan DIS. Brand mismatch → REQUIRE_APPROVAL, meskipun DIS = 100.

Fail-closed. DIP tidak dapat dihitung → REQUIRE_APPROVAL.

Tidak ada PII. Hanya hash, enum, angka, timestamp.

Coverage 100%. CI gagal jika < 100%.

Zero ambiguity. Setiap field, bobot, test eksplisit.

Dokumen ini siap dieksekusi. AI builder membaca §3–§7 dan §10, mengimplementasikan tanpa menebak. Tidak ada field, algoritma, atau aturan yang "disiratkan" — semua eksplisit.

LAMPIRAN: CONTOH ALUR LENGKAP
A.1 Alur Normal (DIS ≥ 80)
text
1. Manusia membuat Intent Anchor: "Beli laptop, RAM ≥ 32GB, budget ≤ $2000, merek Apple/Dell."
2. Agen mengusulkan SALE: Apple MacBook Pro, $1900, RAM 32GB.
3. Reasoning Trace: 3 alasan valid (RAM, harga, merek).
4. DIP: C_purpose=1, C_amount=1, C_vendor=1, C_brand=1, C_attributes=1, C_evidence=1 → DIS=100.
5. Decision: AUTO_APPROVE.
6. SAR memuat decision_integrity.score = 100.
A.2 Alur Manipulasi (DIS < 50)
text
1. Manusia membuat Intent Anchor: sama.
2. Agen mengusulkan SALE: Lenovo ThinkPad, $2500, RAM 16GB.
3. Reasoning Trace: 3 alasan, tetapi evidence_ref menunjuk dokumen yang tidak ada.
4. DIP: C_purpose=1, C_amount=0, C_vendor=1, C_brand=0, C_attributes=0, C_evidence=0 → DIS=35.
5. Hard rule: DIP_EVIDENCE_INVALID → REJECTED.
6. SAR memuat decision_integrity.hard_rule_triggered = "DIP_EVIDENCE_INVALID".
A.3 Alur Brand Mismatch (DIS 90, tetapi hard rule)
text
1. Manusia membuat Intent Anchor: sama.
2. Agen mengusulkan SALE: Lenovo ThinkPad, $1800, RAM 32GB.
3. Reasoning Trace: 3 alasan valid (RAM, harga, merek Lenovo).
4. DIP: C_purpose=1, C_amount=1, C_vendor=1, C_brand=0, C_attributes=1, C_evidence=1 → DIS=90.
5. Hard rule: DIP_BRAND_MISMATCH → REQUIRE_APPROVAL.
6. Approver melihat: "Brand tidak cocok dengan intent (Lenovo vs Apple/Dell)."
7. Approver reject.

</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-08T04:32:58+07:00.

The user's current state is as follows:
Active Document: c:\laragon\www\JOBENPAY-1.0\scripts\conformance-runner.js (LANGUAGE_UNSPECIFIED)
Cursor is on line: 1
Other open documents:
- c:\laragon\www\JOBENPAY-1.0\server\src\app.js (LANGUAGE_UNSPECIFIED)
- c:\laragon\www\JOBENPAY-1.0\server\test\security\idor-routes.test.js (LANGUAGE_UNSPECIFIED)
</ADDITIONAL_METADATA>