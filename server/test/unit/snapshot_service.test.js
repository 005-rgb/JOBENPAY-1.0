/**
 * server/test/unit/snapshot_service.test.js
 * PRD 1.7 Cognitive Snapshot Unit Tests
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  generateSnapshotId,
  detectPII,
  computeSnapshotHash,
  signSnapshot,
  verifySnapshotSignature,
  createCognitiveSnapshotPayload,
} from '../../src/services/snapshot_service.js';
import { CognitiveSnapshotSchema } from '../../../shared/cpl_schema.js';
import { generateEd25519Keys } from '../../src/lib/crypto.js';

test('Cognitive Snapshot Service Unit Tests', async (t) => {
  const keys = generateEd25519Keys();

  await t.test('test_generate_snapshot_id_format: matches ^snap_[0-9A-HJKMNP-TV-Z]{26}$', () => {
    for (let i = 0; i < 50; i++) {
      const id = generateSnapshotId();
      assert.match(id, /^snap_[0-9A-HJKMNP-TV-Z]{26}$/);
    }
  });

  await t.test('test_snapshot_schema_valid: valid snapshot passes Zod schema', () => {
    const validSnapshot = {
      snapshot_id: generateSnapshotId(),
      request_id: crypto.randomUUID(),
      org_id: crypto.randomUUID(),
      model: {
        provider: 'openai',
        model_id: 'gpt-4o',
        model_version: '2024-08-06',
        temperature: 0,
        top_p: 1,
        seed: 42,
        max_tokens: 2000,
        system_prompt_hash: `sha256:${'a'.repeat(64)}`,
      },
      inputs: {
        user_prompt_hash: `sha256:${'b'.repeat(64)}`,
        context_hash: `sha256:${'c'.repeat(64)}`,
        document_hashes: [`sha256:${'d'.repeat(64)}`],
        tool_calls: [
          {
            tool_name: 'extract_invoice',
            input_hash: `sha256:${'e'.repeat(64)}`,
            output_hash: `sha256:${'f'.repeat(64)}`,
          },
        ],
      },
      outputs: {
        decision: 'APPROVED',
        reasoning_trace_hash: `sha256:${'1'.repeat(64)}`,
        raw_output_hash: `sha256:${'2'.repeat(64)}`,
        decision_integrity_score: 95,
      },
      environment: {
        api_version: '2024-08-06',
        sdk_version: 'jobenpay-sdk-1.0',
        timestamp: new Date().toISOString(),
        region: 'us-east-1',
      },
      created_at: new Date().toISOString(),
    };

    const hash = computeSnapshotHash(validSnapshot);
    const signature = signSnapshot(hash, keys.privateKey);

    const fullSnapshot = {
      ...validSnapshot,
      snapshot_hash: hash,
      signature,
    };

    const parsed = CognitiveSnapshotSchema.parse(fullSnapshot);
    assert.equal(parsed.snapshot_id, fullSnapshot.snapshot_id);
    assert.equal(parsed.outputs.decision, 'APPROVED');
  });

  await t.test('test_snapshot_hash_deterministic: 10.000 iterations produce identical hash', () => {
    const snapshot = {
      snapshot_id: 'snap_01HX4Z8K9M2N3P4Q5R6S7T8V9W',
      request_id: 'req_test',
      org_id: 'org_test',
      model: {
        provider: 'openai',
        model_id: 'gpt-4o',
        model_version: '2024-08-06',
        temperature: 0,
        top_p: 1,
        seed: 42,
      },
      inputs: {
        user_prompt_hash: `sha256:${'1'.repeat(64)}`,
        context_hash: `sha256:${'2'.repeat(64)}`,
        document_hashes: [],
      },
      outputs: {
        decision: 'APPROVED',
        reasoning_trace_hash: `sha256:${'3'.repeat(64)}`,
        raw_output_hash: `sha256:${'4'.repeat(64)}`,
      },
      created_at: '2026-11-07T10:00:00.000Z',
    };

    const baselineHash = computeSnapshotHash(snapshot);
    for (let i = 0; i < 10000; i++) {
      const h = computeSnapshotHash(snapshot);
      assert.equal(h, baselineHash);
    }
  });

  await t.test('test_snapshot_signature_ed25519: signature verifies against public key', () => {
    const payload = createCognitiveSnapshotPayload({
      requestId: crypto.randomUUID(),
      orgId: crypto.randomUUID(),
      model: {
        provider: 'openai',
        model_id: 'gpt-4o',
        model_version: '2024-08-06',
        temperature: 0,
        top_p: 1,
        seed: 42,
      },
      inputs: {
        user_prompt_hash: `sha256:${'a'.repeat(64)}`,
        context_hash: `sha256:${'b'.repeat(64)}`,
        document_hashes: [],
      },
      outputs: {
        decision: 'APPROVED',
        reasoning_trace_hash: `sha256:${'c'.repeat(64)}`,
        raw_output_hash: `sha256:${'d'.repeat(64)}`,
      },
      privateKey: keys.privateKey,
    });

    const isValid = verifySnapshotSignature(payload, keys.publicKey);
    assert.equal(isValid, true);

    // Tampered hash fails verification
    const tampered = { ...payload, snapshot_hash: `sha256:${'0'.repeat(64)}` };
    assert.equal(verifySnapshotSignature(tampered, keys.publicKey), false);
  });

  await t.test('test_snapshot_no_pii: detects email, phone, card, ssn', () => {
    assert.equal(detectPII({ note: 'hello' }).hasPII, false);
    assert.equal(detectPII({ email: 'user@example.com' }).hasPII, true);
    assert.equal(detectPII({ phone: '+1 555-019-2834' }).hasPII, true);
    assert.equal(detectPII({ ssn: '123-45-6789' }).hasPII, true);
    assert.equal(detectPII({ card: '4111 1111 1111 1111' }).hasPII, true);

    // createCognitiveSnapshotPayload throws on PII
    assert.throws(() => {
      createCognitiveSnapshotPayload({
        requestId: crypto.randomUUID(),
        orgId: crypto.randomUUID(),
        model: {
          provider: 'openai',
          model_id: 'gpt-4o',
          model_version: '2024-08-06',
          temperature: 0,
          seed: 42,
        },
        inputs: {
          user_prompt_hash: `sha256:${'a'.repeat(64)}`,
          context_hash: `sha256:${'b'.repeat(64)}`,
          document_hashes: [],
          tool_calls: [{ tool_name: 'test', input_hash: `sha256:${'a'.repeat(64)}`, output_hash: `sha256:${'b'.repeat(64)}` }],
        },
        outputs: {
          decision: 'APPROVED',
          reasoning_trace_hash: `sha256:${'c'.repeat(64)}`,
          raw_output_hash: `sha256:${'d'.repeat(64)}`,
        },
        environment: {
          region: 'user@secret.com', // PII injected
        },
      });
    }, (err) => err.code === 'PII_DETECTED' || /PII/i.test(err.message));
  });
});
