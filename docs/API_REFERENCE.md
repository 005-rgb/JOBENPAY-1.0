# JOBENPAY Universal Transaction Engine — Referensi API (Otomatis dari Skema Zod)

> Dokumen ini dibangkitkan secara deterministik dari skema validasi Zod di `shared/`.
> Kepatuhan: PRD 1.3 §5, §10, dan Work Packet F9-3. Dilarang mengubah dokumen ini secara manual.

---

## 1. Daftar 15 Kategori & 28 Pasangan Kategori/Sub-tipe

| No | Kategori | Sub-tipe | Mode Provider | Arah Uang | Mengonsumsi Anggaran |
|---|---|---|---|---|---|
| 1 | **PAYOUT** | `standard` | `SANDBOX` | OUT | YA |
| 2 | **SALE** | `standard` | `SANDBOX` | IN | TIDAK |
| 3 | **REFUND** | `full` | `SANDBOX` | OUT (pengembalian) | TIDAK |
| 4 | **REFUND** | `partial` | `SANDBOX` | OUT (pengembalian) | TIDAK |
| 5 | **VOID** | `authorization` | `SANDBOX` | INTERNAL | TIDAK (melepas reservasi) |
| 6 | **VOID** | `order` | `SANDBOX` | INTERNAL | TIDAK (melepas reservasi) |
| 7 | **PARTIAL** | `payment` | `SANDBOX` | OUT | YA |
| 8 | **PARTIAL** | `refund` | `SANDBOX` | OUT | YA |
| 9 | **DOWN_PAYMENT** | `initial` | `SANDBOX` | IN | TIDAK |
| 10 | **DOWN_PAYMENT** | `settlement` | `SANDBOX` | IN | TIDAK |
| 11 | **DOWN_PAYMENT** | `forfeit` | `SANDBOX` | INTERNAL | TIDAK |
| 12 | **INVOICE** | `standard` | `SANDBOX` | IN | TIDAK |
| 13 | **DISPUTE** | `chargeback` | `SANDBOX` | OUT | YA |
| 14 | **DISPUTE** | `inquiry` | `SANDBOX` | OUT | YA |
| 15 | **SCHEDULED** | `payout` | `SANDBOX` | OUT | YA |
| 16 | **SCHEDULED** | `charge` | `SANDBOX` | OUT | YA |
| 17 | **RECURRING** | `init` | `SANDBOX` | OUT | YA |
| 18 | **RECURRING** | `charge` | `SANDBOX` | OUT | YA |
| 19 | **RECURRING** | `cancel` | `SANDBOX` | OUT | YA |
| 20 | **BULK** | `payout` | `SANDBOX` | OUT | YA |
| 21 | **SPLIT** | `collect` | `SANDBOX` | IN | TIDAK |
| 22 | **SPLIT** | `split` | `SANDBOX` | OUT | YA |
| 23 | **SPLIT** | `hold` | `SANDBOX` | OUT | YA |
| 24 | **SPLIT** | `payout` | `SANDBOX` | OUT | YA |
| 25 | **TRANSFER** | `p2p` | `SANDBOX` | OUT | YA |
| 26 | **FINANCING** | `po` | `SIMULATED` | OUT | YA (limit fasilitas) |
| 27 | **FINANCING** | `invoice` | `SIMULATED` | OUT | YA (limit fasilitas) |
| 28 | **DEBIT** | `direct` | `SIMULATED` | IN | TIDAK |

---

## 2. Universal Transaction Endpoint: `POST /api/v1/transactions`

Semua 15 kategori dapat dibuat melalui satu endpoint terpadu yang aman.

### Headers Wajib
- `Idempotency-Key: <UUID>` (Wajib untuk semua mutasi uang, unik per organisasi).
- `Authorization: Bearer <AGENT_API_KEY>` atau Cookie Sesi Browser Aktif.
- `Content-Type: application/json`

### Skema Parameter (`createTransactionSchema`)

| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `category` | enum [`"PAYOUT"`, `"SALE"`, `"REFUND"`, `"VOID"`, `"PARTIAL"`, `"DOWN_PAYMENT"`, `"INVOICE"`, `"DISPUTE"`, `"SCHEDULED"`, `"RECURRING"`, `"BULK"`, `"SPLIT"`, `"TRANSFER"`, `"FINANCING"`, `"DEBIT"`] | Yes | - |
| `subType` | string | Yes | - |
| `amountMinor` | number | string | Yes | - |
| `currency` | string | Yes | - |
| `counterpartyId` | string (optional) | No | - |
| `parentIntentId` | string (optional) | No | - |
| `metadata` | record<string, unknown> (default: `{}`) | No | - |
| `agentReason` | string (optional) | No | - |


### Contoh Permintaan Universal (cURL)
```bash
curl -X POST https://api.jobenpay.cloud/api/v1/transactions \
  -H "Authorization: Bearer jp_live_..." \
  -H "Idempotency-Key: a4c8d327-89e4-411a-bc0d-7db0714b9c10" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "PAYOUT",
    "subType": "standard",
    "amountMinor": "15000",
    "currency": "USD",
    "counterpartyId": "0e90c885-3cf7-4a07-8e68-ffaeef121bb7",
    "agentReason": "Monthly supplier disbursement"
  }'
```

---

## 3. Skema Parameter Spesifik Kategori

### 3.1 BULK (`shared/bulk.js`)
Digunakan untuk batch payout hingga 15.000 penerima dengan chunking otomatis 500 item.

#### Proposal (`bulkProposalSchema`)
| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `currency` | string | Yes | - |
| `subType` | enum [`"payout"`] (default: `"payout"`) | No | - |
| `items` | array<any> | Yes | - |
| `idempotencyKey` | string | Yes | - |
| `metadata` | record<string, unknown> (optional) | No | - |


#### Item Skema (`bulkItemSchema`)
| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `amountMinor` | bigint (minor currency unit) | number | string | Yes | - |
| `counterpartyId` | string (optional) | No | - |
| `recipientEmail` | string (optional) | No | - |
| `note` | string (optional) | No | - |


### 3.2 FINANCING (`shared/financing.js`) — [SIMULATED]
Fasilitas supply chain financing (Purchase Order & Invoice financing) dengan underwriting otomatis.

| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `facilityType` | enum [`"po"`, `"invoice"`, `"PO"`, `"INVOICE"`] | Yes | - |
| `principalAmountMinor` | string | Yes | - |
| `collateralValueMinor` | string | Yes | - |
| `currency` | string (default: `"USD"`) | No | - |
| `tenorMonths` | number | Yes | - |
| `counterpartyId` | string | Yes | - |
| `counterpartyHistoryCount` | number (default: `3`) | No | - |
| `interestBps` | number (default: `1200`) | No | - |
| `documentRef` | string (optional) | No | - |


### 3.3 DEBIT (`shared/debit.js`) — [SIMULATED]
Penarikan debit langsung terotorisasi.

#### Penarikan Debit (`debitProposalSchema`)
| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `authId` | string | Yes | - |
| `amountMinor` | number | string | Yes | - |
| `currency` | string (default: `"USD"`) | No | - |
| `counterpartyId` | string | Yes | - |
| `description` | string (optional) | No | - |


#### Otorisasi Mandat Debit (`debitAuthorizationSchema`)
| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `counterpartyId` | string | Yes | - |
| `maxAmountMinor` | number | string | Yes | - |
| `currency` | string (default: `"USD"`) | No | - |
| `frequencyLimit` | enum [`"ONCE"`, `"WEEKLY"`, `"MONTHLY"`, `"UNLIMITED"`] (default: `"MONTHLY"`) | No | - |
| `validUntil` | string | Yes | - |
| `mandateRef` | string | Yes | - |


### 3.4 DOWN_PAYMENT (`shared/down_payment.js`)
Uang muka bertahap (initial capture -> settlement capture / forfeit void).

| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `amountMinor` | bigint (minor currency unit) | number | Yes | - |
| `currency` | string | Yes | - |
| `subType` | enum [`"initial"`, `"settlement"`, `"forfeit"`] (default: `"initial"`) | No | - |
| `totalAmountMinor` | bigint (minor currency unit) | number (optional) | No | - |
| `authorizationId` | string (optional) | No | - |
| `initialIntentId` | string (optional) | No | - |
| `counterpartyId` | string (optional) | No | - |
| `description` | string (optional) | No | - |
| `idempotencyKey` | string | Yes | - |


---

## 4. Skema Mandat Kebijakan (`shared/policy.schema.js`)
Mandat immutable versioning untuk pembatasan wewenang AI dan agen.

| Parameter | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `schemaVersion` | literal `undefined` | Yes | - |
| `purpose` | string | Yes | - |
| `allowedActions` | array<any> | Yes | - |
| `currency` | string | Yes | - |
| `perTransactionCapMinor` | number | Yes | - |
| `budget` | object | Yes | - |
| `autoApproveBelowMinor` | number | Yes | - |
| `payees` | object | Yes | - |
| `allowNewPayees` | boolean | Yes | - |
| `schedule` | object | Yes | - |
| `velocity` | object | Yes | - |
| `duplicateWindowHours` | number | Yes | - |
| `requireInvoice` | boolean | Yes | - |
| `invoiceAmountToleranceMinor` | number | Yes | - |
| `ai` | object | Yes | - |
| `stepUpApprovalAboveMinor` | number | Yes | - |
| `fourEyesAboveMinor` | number | Yes | - |
| `approvalTtlHours` | number | Yes | - |
| `validFrom` | string | Yes | - |
| `validTo` | string | Yes | - |


---

## 5. Respon & Penanganan Error

| Kode HTTP | Error Code | Deskripsi |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Format body JSON tidak sesuai skema Zod |
| 401 | `UNAUTHORIZED` | API key tidak valid atau sesi login berakhir |
| 403 | `FORBIDDEN` | Akses peran (RBAC) tidak memadai atau tenant terisolasi |
| 404 | `NOT_FOUND` | Sumber daya tidak ditemukan |
| 409 | `ILLEGAL_TRANSITION` | Mutasi melanggar aturan state machine kategori |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Idempotency-Key sama digunakan dengan payload berbeda |
| 422 | `INSUFFICIENT_BUDGET` | Anggaran bulanan organisasi tidak mencukupi |
| 422 | `CAP_EXCEEDED` | Jumlah transaksi melebihi batas mandat per transaksi |
| 429 | `RATE_LIMITED` | Batas kecepatan request terlampaui |
| 500 | `INTERNAL` | Kesalahan internal server (detail SQL/stack disamarkan) |
