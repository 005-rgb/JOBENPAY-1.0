import { z } from 'zod';

const SAFE_MINOR = z.number().int().positive().refine(Number.isSafeInteger, {
  message: 'Money must be a positive safe integer minor value.',
});
const UUID = z.string().uuid();
const UTC_ISO = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString() === (value.includes('.') ? value : value.replace(/Z$/, '.000Z'));
}, 'Timestamp must be an ISO-8601 UTC timestamp.');

const timezone = z.string().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}, 'Timezone must be a valid IANA timezone.');

const basePolicyFields = {
  purpose: z.string().trim().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Currency must be three uppercase letters.'),
  perTransactionCapMinor: SAFE_MINOR,
  budget: z.object({
    period: z.literal('MONTH'),
    limitMinor: SAFE_MINOR,
  }).strict(),
  autoApproveBelowMinor: SAFE_MINOR,
  payees: z.object({
    mode: z.literal('ALLOWLIST'),
    ids: z.array(UUID),
  }).strict(),
  allowNewPayees: z.boolean(),
  schedule: z.object({
    timezone,
    days: z.array(z.number().int().min(1).max(7)).min(1)
      .refine((values) => new Set(values).size === values.length, 'Schedule days must be unique.'),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
  }).strict().superRefine((value, ctx) => {
    if (value.startHour >= value.endHour) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endHour'], message: 'endHour must be greater than startHour.' });
    }
  }),
  velocity: z.object({
    maxRequestsPerHour: SAFE_MINOR,
    maxPayoutPerPayeePerDay: SAFE_MINOR,
  }).strict(),
  duplicateWindowHours: SAFE_MINOR,
  requireInvoice: z.boolean(),
  invoiceAmountToleranceMinor: z.number().int().nonnegative().refine(Number.isSafeInteger, {
    message: 'Money must be a safe integer minor value.',
  }),
  ai: z.object({
    intentCheck: z.boolean(),
    escalateOnRiskAtOrAbove: z.number().int().min(0).max(100),
    blockOnRiskAtOrAbove: z.number().int().min(0).max(100),
  }).strict().superRefine((value, ctx) => {
    if (value.escalateOnRiskAtOrAbove >= value.blockOnRiskAtOrAbove) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blockOnRiskAtOrAbove'], message: 'Escalation threshold must be lower than block threshold.' });
    }
  }),
  stepUpApprovalAboveMinor: SAFE_MINOR,
  fourEyesAboveMinor: SAFE_MINOR,
  approvalTtlHours: SAFE_MINOR,
  validFrom: UTC_ISO,
  validTo: UTC_ISO,
};

const policyV1Shape = z.object({
  schemaVersion: z.literal(1),
  allowedActions: z.array(z.enum(['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'])).min(1)
    .refine((values) => new Set(values).size === values.length, 'allowedActions must be unique.'),
  ...basePolicyFields,
}).strict();

const ALL_CATEGORIES = [
  'SALE', 'DOWN_PAYMENT', 'INVOICE', 'PAYOUT', 'REFUND', 'VOID',
  'DISPUTE', 'PARTIAL', 'SCHEDULED', 'RECURRING', 'BULK', 'SPLIT',
  'TRANSFER', 'FINANCING', 'DEBIT',
];

const policyV2Shape = z.object({
  schemaVersion: z.literal(2),
  allowedCategories: z.array(z.enum(ALL_CATEGORIES)).min(1)
    .refine((values) => new Set(values).size === values.length, 'allowedCategories must be unique.'),
  allowedActions: z.array(z.enum(['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'])).optional(),
  ...basePolicyFields,
}).strict();

const validatePolicySuperRefine = (policy, ctx) => {
  if (policy.autoApproveBelowMinor > policy.perTransactionCapMinor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['autoApproveBelowMinor'], message: 'autoApproveBelowMinor cannot exceed perTransactionCapMinor.' });
  }
  if (policy.perTransactionCapMinor > policy.budget.limitMinor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['perTransactionCapMinor'], message: 'perTransactionCapMinor cannot exceed budget.limitMinor.' });
  }
  if (policy.stepUpApprovalAboveMinor < policy.autoApproveBelowMinor) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stepUpApprovalAboveMinor'], message: 'stepUpApprovalAboveMinor must be at least autoApproveBelowMinor.' });
  }
  if (Date.parse(policy.validFrom) >= Date.parse(policy.validTo)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'validTo must be after validFrom.' });
  }
};

export const policyV1Schema = policyV1Shape.superRefine(validatePolicySuperRefine);
export const policyV2Schema = policyV2Shape.superRefine(validatePolicySuperRefine);

export const policySchema = z.union([policyV1Schema, policyV2Schema]);

export function adaptMandatePolicyV1ToV2(policy) {
  if (!policy) return null;
  if (policy.schemaVersion === 2 && Array.isArray(policy.allowedCategories)) {
    return policy;
  }
  // V1 adapter: PRD-R §3.8
  const allowedCategories = [];
  for (const action of policy.allowedActions || []) {
    if (action === 'PAYOUT' && !allowedCategories.includes('PAYOUT')) allowedCategories.push('PAYOUT');
    if (action === 'REFUND' && !allowedCategories.includes('REFUND')) allowedCategories.push('REFUND');
    if (action === 'ACCEPT_DISPUTE' && !allowedCategories.includes('DISPUTE')) allowedCategories.push('DISPUTE');
  }
  return {
    ...policy,
    schemaVersion: 2,
    allowedCategories,
    _adaptedFromV1: true,
  };
}

export function parsePolicy(value) {
  return policySchema.parse(value);
}

export function safePolicy(value) {
  return policySchema.safeParse(value);
}

export function policyMoneyToBigInt(policy) {
  return {
    perTransactionCapMinor: BigInt(policy.perTransactionCapMinor),
    budgetLimitMinor: BigInt(policy.budget.limitMinor),
    autoApproveBelowMinor: BigInt(policy.autoApproveBelowMinor),
    stepUpApprovalAboveMinor: BigInt(policy.stepUpApprovalAboveMinor),
    fourEyesAboveMinor: BigInt(policy.fourEyesAboveMinor),
    invoiceAmountToleranceMinor: BigInt(policy.invoiceAmountToleranceMinor),
  };
}
