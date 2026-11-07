// @ts-check
import { z } from 'zod';

export const RequiredAttributeSchema = z.object({
  key: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gte', 'lte', 'in', 'not_in', 'contains']),
  value: z.any(),
});

export const AmountRangeSchema = z.object({
  min: z.string().regex(/^[0-9]+$/, 'min amount must be numeric digits'),
  max: z.string().regex(/^[0-9]+$/, 'max amount must be numeric digits'),
});

export const IntentConstraintsSchema = z.object({
  amount_range: AmountRangeSchema,
  vendor_categories: z.array(z.string().min(1)).min(1).max(10),
  required_attributes: z.array(RequiredAttributeSchema).max(20).optional().default([]),
  allowed_brands: z.array(z.string().min(1)).max(10).optional().default([]),
  deadline: z.string().optional(),
});

export const IntentPurposeEnum = z.enum([
  'equipment_purchase',
  'software_subscription',
  'service_payment',
  'supplier_payout',
  'refund_issuance',
  'invoice_payment',
  'down_payment',
  'other',
]);

export const StructuredIntentV2Schema = z.object({
  purpose: IntentPurposeEnum,
  constraints: IntentConstraintsSchema,
});

export const IntentAnchorSchema = z.object({
  intent_id: z.string().min(1),
  org_id: z.string().min(1),
  principal_user_id: z.string().min(1),
  natural_language_input: z.string().max(2000),
  structured_intent: StructuredIntentV2Schema,
  intent_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  signature: z.string().min(1),
  signing_key_id: z.string().min(1),
  valid_from: z.string(),
  valid_to: z.string(),
  created_at: z.string().optional(),
});

export const ReasonItemSchema = z.object({
  claim: z.string().max(500),
  evidence_ref: z.string().regex(/^(doc|field|record):[a-zA-Z0-9_.-]+$/, 'Invalid evidence_ref format'),
  data_source: z.enum(['invoice', 'vendor_profile', 'request_metadata', 'intent_anchor']),
  extracted_attributes: z.record(z.any()).optional().default({}),
});

export const ReasoningTraceSchema = z.object({
  trace_id: z.string().optional(),
  request_id: z.string().min(1),
  reasons: z.array(ReasonItemSchema).min(3).max(5),
  created_at: z.string().optional(),
});
