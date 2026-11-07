const TEMPLATES = Object.freeze({
  ORG_FROZEN: 'The organization is frozen.',
  AGENT_DISABLED: 'The payment agent is disabled.',
  MANDATE_INACTIVE: 'No active mandate applies to this agent.',
  MANDATE_EXPIRED: 'The mandate is outside its validity period.',
  VLEI_INACTIVE: 'The organization legal identity (vLEI) is inactive or expired.',
  INTENT_MANDATE_MISSING: 'Transaction requires an active intent mandate.',
  INTENT_MANDATE_EXPIRED: 'The intent mandate is inactive or expired.',
  INTENT_MISMATCH: 'The transaction purpose does not match the intent mandate.',
  INTENT_AMOUNT_EXCEEDED: 'The transaction amount exceeds the intent mandate maximum amount.',
  INTENT_VENDOR_MISMATCH: 'The transaction vendor is not allowed by the intent mandate.',
  ACTION_NOT_ALLOWED: 'This action is not allowed by the mandate.',
  CURRENCY_NOT_ALLOWED: 'The request currency does not match the mandate.',
  VALIDATION_FAILED: 'The payment amount is invalid.',
  CAP_EXCEEDED: 'The amount exceeds the mandate cap.',
  NOT_FOUND: 'The payee was not found in this organization.',
  PAYEE_BLOCKED: 'The payee is blocked.',
  PAYEE_NOT_ALLOWED: 'The payee is outside the mandate allowlist.',
  OUTSIDE_TIME_WINDOW: 'The request is outside the permitted schedule.',
  VELOCITY_EXCEEDED: 'A mandate velocity limit was exceeded.',
  DUPLICATE_SUSPECTED: 'A similar request was recently submitted.',
  INVOICE_REQUIRED: 'An extracted invoice is required.',
  INVOICE_MISMATCH_AMOUNT: 'The invoice amount or currency does not match.',
  BUDGET_EXCEEDED: 'The mandate budget is exhausted.',
  PAYEE_NEW: 'The payee needs approval because it is not trusted.',
  PAYEE_CHANGED: 'The payee changed recently and needs approval.',
  INVOICE_PAYEE_MISMATCH: 'The invoice payee does not match the registered payee.',
  AMOUNT_REQUIRES_APPROVAL: 'The amount requires approval.',
  DOC_INJECTION_SUSPECTED: 'The document needs review for suspicious instructions.',
  AI_HIGH_RISK: 'AI identified a high-risk request.',
  AI_INTENT_MISMATCH: 'AI found that the request does not clearly match the mandate intent.',
  AI_INJECTION_SUSPECTED: 'AI detected possible instruction injection.',
  AI_ANOMALY: 'AI identified an unusual request pattern.',
  AI_UNAVAILABLE: 'AI review was unavailable; human approval is required.',
  TIER_C_REQUIRES_APPROVAL: 'Tier C transactions (FINANCING, DEBIT) always require human approval.',
});

const PRIORITY = [
  'ORG_FROZEN', 'AGENT_DISABLED', 'MANDATE_INACTIVE', 'MANDATE_EXPIRED', 'VLEI_INACTIVE',
  'INTENT_MANDATE_MISSING', 'INTENT_MANDATE_EXPIRED', 'INTENT_MISMATCH', 'INTENT_AMOUNT_EXCEEDED', 'INTENT_VENDOR_MISMATCH',
  'ACTION_NOT_ALLOWED',
  'CURRENCY_NOT_ALLOWED', 'VALIDATION_FAILED', 'CAP_EXCEEDED', 'NOT_FOUND', 'PAYEE_BLOCKED',
  'PAYEE_NOT_ALLOWED', 'TARGET_INVALID', 'OUTSIDE_TIME_WINDOW', 'VELOCITY_EXCEEDED',
  'DUPLICATE_SUSPECTED', 'INVOICE_REQUIRED', 'INVOICE_MISMATCH_AMOUNT', 'BUDGET_EXCEEDED',
  'PAYEE_NEW', 'PAYEE_CHANGED', 'INVOICE_PAYEE_MISMATCH', 'AMOUNT_REQUIRES_APPROVAL',
  'DOC_INJECTION_SUSPECTED', 'AI_HIGH_RISK', 'AI_INTENT_MISMATCH', 'AI_INJECTION_SUSPECTED',
  'AI_ANOMALY', 'AI_UNAVAILABLE', 'TIER_C_REQUIRES_APPROVAL',
];

export function explainReasonCodes(reasonCodes = [], aiNote = null) {
  const unique = [...new Set(reasonCodes)].sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b));
  const safeNote = typeof aiNote === 'string' ? aiNote.trim().slice(0, 400) : '';
  const deterministicMessage = unique.length
    ? unique.map((code) => TEMPLATES[code] || `Request requires review (${code}).`).join(' ')
    : 'Request meets the mandate rules.';
  return {
    message: safeNote ? `${deterministicMessage}\nAI note: ${safeNote}` : deterministicMessage,
    reasonCodes: unique,
  };
}

export const reasonTemplate = TEMPLATES;

export const TEMPLATES_ID = Object.freeze({
  ORG_FROZEN: 'Organisasi dibekukan.',
  AGENT_DISABLED: 'Agen pembayaran dinonaktifkan.',
  MANDATE_INACTIVE: 'Tidak ada mandat aktif untuk agen ini.',
  MANDATE_EXPIRED: 'Mandat berada di luar masa berlaku.',
  VLEI_INACTIVE: 'Identitas hukum organisasi (vLEI) tidak aktif atau telah kedaluwarsa.',
  INTENT_MANDATE_MISSING: 'Transaksi mewajibkan mandat niat (intent mandate) yang aktif.',
  INTENT_MANDATE_EXPIRED: 'Mandat niat tidak aktif atau telah kedaluwarsa.',
  INTENT_MISMATCH: 'Tujuan transaksi tidak sesuai dengan mandat niat.',
  INTENT_AMOUNT_EXCEEDED: 'Jumlah transaksi melebihi batas mandat niat.',
  INTENT_VENDOR_MISMATCH: 'Vendor transaksi tidak sesuai dengan kategori vendor pada mandat niat.',
  ACTION_NOT_ALLOWED: 'Aksi ini tidak diizinkan oleh mandat.',
  CURRENCY_NOT_ALLOWED: 'Mata uang permintaan tidak sesuai dengan mandat.',
  VALIDATION_FAILED: 'Jumlah pembayaran tidak valid.',
  CAP_EXCEEDED: 'Jumlah melebihi batas mandat.',
  NOT_FOUND: 'Penerima tidak ditemukan pada organisasi ini.',
  PAYEE_BLOCKED: 'Penerima diblokir.',
  PAYEE_NOT_ALLOWED: 'Penerima di luar daftar yang diizinkan mandat.',
  OUTSIDE_TIME_WINDOW: 'Permintaan di luar jadwal yang diizinkan.',
  VELOCITY_EXCEEDED: 'Batas kecepatan/frekuensi mandat terlampaui.',
  DUPLICATE_SUSPECTED: 'Permintaan serupa baru saja diajukan.',
  INVOICE_REQUIRED: 'Faktur yang diekstrak wajib dilampirkan.',
  INVOICE_MISMATCH_AMOUNT: 'Jumlah atau mata uang faktur tidak cocok.',
  BUDGET_EXCEEDED: 'Anggaran mandat telah habis.',
  PAYEE_NEW: 'Penerima membutuhkan persetujuan karena belum tepercaya.',
  PAYEE_CHANGED: 'Data penerima baru saja diubah dan membutuhkan persetujuan.',
  INVOICE_PAYEE_MISMATCH: 'Penerima faktur tidak sesuai dengan penerima terdaftar.',
  AMOUNT_REQUIRES_APPROVAL: 'Jumlah pembayaran memerlukan persetujuan manual.',
  DOC_INJECTION_SUSPECTED: 'Dokumen memerlukan tinjauan untuk instruksi mencurigakan.',
  AI_HIGH_RISK: 'AI mendeteksi risiko tinggi pada transaksi ini.',
  AI_INTENT_MISMATCH: 'AI menemukan ketidaksesuaian maksud dengan mandat.',
  AI_INJECTION_SUSPECTED: 'AI mendeteksi kemungkinan injeksi instruksi (prompt injection).',
  AI_ANOMALY: 'AI mengidentifikasi pola transaksi tidak biasa.',
  AI_UNAVAILABLE: 'Pemeriksaan AI tidak tersedia; persetujuan manusia diwajibkan.',
  TIER_C_REQUIRES_APPROVAL: 'Transaksi Tier C (FINANCING, DEBIT) wajib persetujuan manusia.',
});

