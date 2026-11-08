// @ts-check
import { z } from 'zod';

export const JplOperatorSchema = z.enum([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'not_in', 'contains', 'not_contains',
  'matches', 'not_matches',
  'exists', 'not_exists',
  'between', 'not_between',
  'subset_of', 'superset_of', 'intersects',
]);

export const JplOutcomeSchema = z.enum(['PERMIT', 'DENY', 'REQUIRE_APPROVAL', 'ESCALATE']);
export const JplDefaultOutcomeSchema = z.enum(['PERMIT', 'DENY', 'REQUIRE_APPROVAL']);

export const JplConditionSchema = z.object({
  field: z.string().regex(/^[a-z][a-z0-9_.]*$/, 'Invalid field path pattern'),
  operator: JplOperatorSchema,
  value: z.any().optional(),
  case_sensitive: z.boolean().default(true),
});

export const JplOutcomeParamsSchema = z.object({
  approver_role: z.string().optional(),
  escalation_target: z.string().optional(),
  reason_code: z.string().optional(),
}).optional();

export const JplRuleSchema = z.object({
  rule_id: z.string().regex(/^rule_[a-zA-Z0-9_]{1,50}$/, 'Invalid rule_id pattern'),
  priority: z.number().int().min(1).max(1000),
  description: z.string().max(500).optional(),
  conditions: z.array(JplConditionSchema).min(1).max(20),
  outcome: JplOutcomeSchema,
  outcome_params: JplOutcomeParamsSchema,
});

export const JplMetadataSchema = z.object({
  description: z.string().max(2000).optional(),
  author: z.string().max(200).optional(),
  created_at: z.string().optional(),
  valid_from: z.string().optional(),
  valid_to: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).optional();

export const JplSignatureSchema = z.object({
  alg: z.string(),
  kid: z.string(),
  sig: z.string().regex(/^base64:[A-Za-z0-9+/=]+$/, 'Invalid signature base64 format'),
});

export const JplPolicySchema = z.object({
  jpl_version: z.string().min(1),
  policy_id: z.string().regex(/^pol_[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid policy_id format'),
  policy_name: z.string().max(200),
  metadata: JplMetadataSchema,
  rules: z.array(JplRuleSchema).min(1).max(100),
  default_outcome: JplDefaultOutcomeSchema,
  signature: JplSignatureSchema.optional(),
});

/**
 * Validates a policy object against the JPL v1.0 schema (PRD 2.0 §5.3 F2-1).
 * @param {any} policy
 * @returns {{ valid: boolean, errors?: any[], policy?: any }}
 */
export function validateJplPolicy(policy) {
  const result = JplPolicySchema.safeParse(policy);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues,
    };
  }
  return {
    valid: true,
    policy: result.data,
  };
}
