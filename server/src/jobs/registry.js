import { runCleanup } from './cleanup.js';
import { processWebhook } from './webhook.js';
import { extractDocument } from './extractDocument.js';
import { evaluateRequestJob } from './evaluateRequest.js';
import { expireApprovals } from './expireApprovals.js';
import { executeRequest } from './handlers/executeRequest.js';
import { reconcileRequest } from './handlers/reconcileRequest.js';
import { resetDemoDataJob } from './resetDemoData.js';

export const JOB_TYPES = Object.freeze([
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
  'reset_demo_data',
]);

const handlers = new Map();

function notImplementedHandler() {
  const error = new Error('NOT_IMPLEMENTED');
  error.code = 'NOT_IMPLEMENTED';
  throw error;
}

for (const type of JOB_TYPES) {
  handlers.set(type, notImplementedHandler);
}
handlers.set('cleanup', runCleanup);
handlers.set('process_webhook', processWebhook);
handlers.set('extract_document', extractDocument);
handlers.set('evaluate_request', evaluateRequestJob);
handlers.set('expire_approvals', expireApprovals);
handlers.set('execute_request', executeRequest);
handlers.set('reconcile_request', reconcileRequest);
handlers.set('reset_demo_data', resetDemoDataJob);

export function registerHandler(type, handler) {
  if (!JOB_TYPES.includes(type)) {
    throw new TypeError(`Unsupported job type: ${type}`);
  }
  if (typeof handler !== 'function') {
    throw new TypeError('Job handler must be a function.');
  }
  handlers.set(type, handler);
}

export function getHandler(type) {
  return handlers.get(type) || notImplementedHandler;
}
