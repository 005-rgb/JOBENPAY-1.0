// @ts-check
import { z } from 'zod';

export const HashStringSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/, 'Must be sha256:<64-hex>');
export const Base64SignatureSchema = z.string().regex(/^base64:[A-Za-z0-9+/=]+$/, 'Must be base64:<string>');

export const ModelParamsSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'google', 'local']),
  model_id: z.string().min(1).max(100),
  model_version: z.string().min(1).max(50),
  temperature: z.number().min(0).max(2),
  top_p: z.number().min(0).max(1).optional().default(1),
  seed: z.number().int().describe('Seed for reproducibility'),
  max_tokens: z.number().int().min(1).optional(),
  system_prompt_hash: HashStringSchema.optional(),
});

export const ToolCallHashSchema = z.object({
  tool_name: z.string().min(1),
  input_hash: HashStringSchema,
  output_hash: HashStringSchema,
});

export const SnapshotInputsSchema = z.object({
  user_prompt_hash: HashStringSchema,
  context_hash: HashStringSchema,
  document_hashes: z.array(HashStringSchema).max(20).default([]),
  retrieval_context_hash: HashStringSchema.optional(),
  tool_calls: z.array(ToolCallHashSchema).max(20).optional().default([]),
});

export const SnapshotOutputsSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'REQUIRE_APPROVAL']),
  reasoning_trace_hash: HashStringSchema,
  raw_output_hash: HashStringSchema,
  decision_integrity_score: z.number().int().min(0).max(100).optional(),
});

export const SnapshotEnvironmentSchema = z.object({
  api_version: z.string().optional(),
  sdk_version: z.string().optional(),
  timestamp: z.string().optional(),
  region: z.string().optional(),
}).optional();

export const CognitiveSnapshotSchema = z.object({
  snapshot_id: z.string().regex(/^snap_[0-9A-HJKMNP-TV-Z]{26}$/, 'Invalid snapshot_id format'),
  request_id: z.string().min(1),
  org_id: z.string().min(1),
  model: ModelParamsSchema,
  inputs: SnapshotInputsSchema,
  outputs: SnapshotOutputsSchema,
  environment: SnapshotEnvironmentSchema,
  snapshot_hash: HashStringSchema,
  signature: Base64SignatureSchema.or(z.string().min(1)),
  created_at: z.string(),
});

export const ReplayResultSchema = z.object({
  replay_id: z.string().min(1),
  snapshot_id: z.string().min(1),
  org_id: z.string().min(1),
  replay_model: ModelParamsSchema,
  replay_outputs: SnapshotOutputsSchema,
  reproducibility_score: z.number().int().min(0).max(100),
  components: z.object({
    decision: z.number().min(0).max(1),
    reasoning: z.number().min(0).max(1),
    raw: z.number().min(0).max(1),
  }),
  decision: z.enum(['AUTO_APPROVE', 'REQUIRE_APPROVAL', 'REJECTED']),
  replay_hash: HashStringSchema,
  replayed_at: z.string(),
});
