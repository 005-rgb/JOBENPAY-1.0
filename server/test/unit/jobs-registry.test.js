import test from 'node:test';
import assert from 'node:assert/strict';

import { getHandler, JOB_TYPES, registerHandler } from '../../src/jobs/registry.js';

test('job registry contains the supported job types', () => {
  assert.deepEqual(JOB_TYPES, [
    'extract_document',
    'evaluate_request',
    'execute_request',
    'reconcile_request',
    'process_webhook',
    'sync_disputes',
    'draft_dispute_case',
    'submit_dispute_action',
    'send_email',
    'expire_approvals',
    'cleanup',
  ]);
});

test('unimplemented job handlers fail with NOT_IMPLEMENTED', async () => {
  await assert.rejects(
    async () => getHandler('extract_document')({}, {}),
    { code: 'NOT_IMPLEMENTED', message: 'NOT_IMPLEMENTED' },
  );
});

test('job registry rejects unsupported types and invalid handlers', () => {
  assert.throws(() => registerHandler('unknown', async () => {}), /Unsupported job type/);
  assert.throws(() => registerHandler('send_email', null), /must be a function/);
});
