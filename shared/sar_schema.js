// @ts-check
import { z } from 'zod';

export const sarSchema = z.object({
  sar_version: z.literal('1.0'),
  sar_id: z.string().regex(/^sar_[0-9A-HJKMNP-TV-Z]{26}$/),
  issuer: z.object({
    org_id: z.string().regex(/^org_[0-9A-HJKMNP-TV-Z]{26}$/),
    issuer_key_id: z.string().regex(/^kid_[0-9A-HJKMNP-TV-Z]{26}$/),
    display_name: z.string().max(200),
    legal_entity_lei: z.string().regex(/^[A-Z0-9]{20}$/).optional(),
  }),
  mandate: z.object({
    mandate_id: z.string().min(1),
    mandate_version: z.number().int().min(1),
    policy_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    valid_from: z.string().min(1),
    valid_to: z.string().min(1),
  }),
  request: z.object({
    request_id: z.string().min(1),
    request_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    category: z.enum([
      'SALE', 'DOWN_PAYMENT', 'INVOICE', 'PAYOUT', 'REFUND', 'VOID',
      'DISPUTE', 'PARTIAL', 'SCHEDULED', 'RECURRING', 'BULK', 'SPLIT',
      'TRANSFER', 'FINANCING', 'DEBIT',
    ]),
    sub_type: z.string().min(1),
    amount_minor: z.string().regex(/^[0-9]+$/),
    currency: z.string().regex(/^[A-Z]{3}$/),
    payee_id_hmac: z.string().regex(/^hmac:[a-f0-9]{64}$/),
    document_sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  }),
  decision: z.object({
    result: z.enum(['APPROVED', 'REJECTED', 'AUTO_APPROVE', 'REQUIRE_APPROVAL']),
    reason_codes: z.array(z.string()).max(50),
    policy_version: z.string().min(1),
    decided_at: z.string().min(1),
    approver_hmac: z.string().regex(/^hmac:[a-f0-9]{64}$/).optional(),
  }),
  ledger: z.object({
    org_id: z.string().min(1),
    seq: z.number().int().min(1),
    entry_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    prev_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }),
  signature: z.object({
    alg: z.literal('Ed25519'),
    kid: z.string().min(1),
    sig: z.string().regex(/^base64:[A-Za-z0-9+/=]+$/),
  }),
  composition_proof: z.object({
    lineage: z.array(z.any()).optional(),
    lineage_root_hash: z.string().optional(),
    threshold_signatures: z.array(z.any()).optional(),
  }).optional(),
}).strict();

export function validateSarSchema(sar) {
  const parsed = sarSchema.safeParse(sar);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  return { valid: true, data: parsed.data };
}

export default {
  sarSchema,
  validateSarSchema,
};
