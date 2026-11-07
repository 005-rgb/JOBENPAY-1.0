/**
 * server/test/unit/error-codes-completeness.test.js
 * Memverifikasi kelengkapan dan integritas seluruh kode error di shared/error-codes.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES } from '../../../shared/error-codes.js';

const ALL_ERROR_CODE_NAMES = [
  'ORG_FROZEN', 'AGENT_DISABLED', 'MANDATE_INACTIVE', 'MANDATE_EXPIRED',
  'ACTION_NOT_ALLOWED', 'CURRENCY_NOT_ALLOWED', 'CAP_EXCEEDED', 'PAYEE_BLOCKED',
  'TARGET_INVALID', 'PREFLIGHT_UNAVAILABLE', 'OUTSIDE_TIME_WINDOW', 'VELOCITY_EXCEEDED',
  'DUPLICATE_SUSPECTED', 'INVOICE_REQUIRED', 'INVOICE_MISMATCH_AMOUNT', 'BUDGET_EXCEEDED',
  'PAYEE_NEW', 'PAYEE_CHANGED', 'INVOICE_PAYEE_MISMATCH', 'AMOUNT_REQUIRES_APPROVAL',
  'DOC_INJECTION_SUSPECTED', 'AI_HIGH_RISK', 'AI_INTENT_MISMATCH', 'AI_INJECTION_SUSPECTED',
  'AI_ANOMALY', 'AI_UNAVAILABLE', 'PAYEE_NOT_ALLOWED', 'UNAUTHENTICATED',
  'FORBIDDEN', 'VALIDATION_FAILED', 'NOT_FOUND', 'RATE_LIMITED',
  'IDEMPOTENCY_CONFLICT', 'STEP_UP_REQUIRED', 'REGISTRATION_DISABLED', 'EMAIL_NOT_VERIFIED',
  'TOKEN_INVALID_OR_EXPIRED', 'GOOGLE_AUTH_FAILED', 'UNSUPPORTED_MEDIA_TYPE', 'TIER_C_REQUIRES_APPROVAL',
  'CATEGORY_NOT_ALLOWED', 'SUBTYPE_NOT_ALLOWED', 'CATEGORY_NOT_IMPLEMENTED', 'CAPTURE_NOT_FOUND',
  'REFUND_EXCEEDS_REFUNDABLE', 'REFUND_WINDOW_EXPIRED', 'REFUND_CURRENCY_MISMATCH', 'AUTHORIZATION_NOT_FOUND',
  'AUTHORIZATION_EXPIRED', 'SETTLEMENT_EXCEEDS_REMAINING', 'INVOICE_NUMBER_DUPLICATE', 'DUE_DATE_OUT_OF_RANGE',
  'EXPOSURE_AUTH_EXCEEDED', 'EXPOSURE_RECEIVABLE_EXCEEDED', 'REFUND_RATE_EXCEEDED', 'PLAN_STEP_MISMATCH',
  'PLAN_NOT_APPROVED', 'PLAN_EXPIRED', 'IDEMPOTENCY_KEY_REUSED', 'ILLEGAL_TRANSITION',
  'INTERNAL',
];

test('shared/error-codes.js data-driven completeness test', async (t) => {
  const codes = Object.keys(ERROR_CODES);
  assert.ok(codes.length >= 40, 'shared/error-codes.js must contain at least 40 error codes');

  for (const name of ALL_ERROR_CODE_NAMES) {
    assert.ok(ERROR_CODES[name], `ERROR_CODES must include explicit code '${name}'`);
  }

  for (const code of codes) {
    await t.test(`Error code '${code}' is well-formed`, () => {
      const def = ERROR_CODES[code];
      assert.ok(def, `Definition for ${code} must exist`);
      assert.ok(typeof def.httpStatus === 'number' && def.httpStatus >= 400 && def.httpStatus <= 599,
        `${code} httpStatus must be a valid HTTP error status code`);
      assert.ok(typeof def.message === 'string' && def.message.length > 0,
        `${code} message must be a non-empty string`);
    });
  }

  // Khusus PREFLIGHT_UNAVAILABLE
  await t.test('PREFLIGHT_UNAVAILABLE code configuration', () => {
    assert.equal(ERROR_CODES.PREFLIGHT_UNAVAILABLE.httpStatus, 503);
    assert.equal(ERROR_CODES.PREFLIGHT_UNAVAILABLE.message, 'Preflight is unavailable.');
  });
});

