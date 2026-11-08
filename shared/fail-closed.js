// @ts-check

/**
 * Fail-closed matrix.
 * Setiap kegagalan memiliki outcome eksplisit.
 */
export const FAIL_CLOSED_MATRIX = {
  DB_UNAVAILABLE: { outcome: 'REJECT', retry: false, alert: 'critical' },
  VLEI_REGISTRY_UNAVAILABLE: { outcome: 'REJECT', retry: true, alert: 'high' },
  INTENT_SERVICE_UNAVAILABLE: { outcome: 'REJECT', retry: true, alert: 'high' },
  DIP_INDETERMINATE: { outcome: 'REQUIRE_APPROVAL', retry: false, alert: 'medium' },
  CPL_REPLAY_UNAVAILABLE: { outcome: 'REQUIRE_APPROVAL', retry: false, alert: 'medium' },
  AI_UNAVAILABLE: { outcome: 'REQUIRE_APPROVAL', retry: true, alert: 'medium' },
  PAYPAL_UNAVAILABLE: { outcome: 'REQUIRE_APPROVAL', retry: true, alert: 'high' },
  JPL_EVALUATION_ERROR: { outcome: 'DENY', retry: false, alert: 'high' },
  SIGNATURE_INVALID: { outcome: 'REJECT', retry: false, alert: 'critical' },
  REVOCATION_UNAVAILABLE: { outcome: 'REQUIRE_APPROVAL', retry: true, alert: 'medium' },
  UNKNOWN_ERROR: { outcome: 'REJECT', retry: false, alert: 'critical' },
};

/**
 * Dapatkan outcome untuk kode kegagalan.
 * @param {string} code
 * @returns {{outcome: string, retry: boolean, alert: string}}
 */
export function getFailClosedOutcome(code) {
  return FAIL_CLOSED_MATRIX[code] || FAIL_CLOSED_MATRIX.UNKNOWN_ERROR;
}
