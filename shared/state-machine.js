// @ts-check

/**
 * Aggregate state machine.
 * Semua Tahap A (vLEI, Intent, DIP, CPL) memetakan ke state inti.
 * PRD 2.0 Unified Architecture §2.2 & §3.
 */
export const AGGREGATE_STATES = [
  'DRAFT', 'SUBMITTED', 'EVALUATING',
  'REJECTED', 'NEEDS_APPROVAL', 'APPROVED',
  'EXECUTING', 'EXECUTED', 'FAILED', 'RECONCILED'
];

export const AGGREGATE_TRANSITIONS = [
  // Dari DRAFT
  { from: 'DRAFT', to: 'SUBMITTED', actor: 'agent' },
  { from: 'DRAFT', to: 'CANCELLED', actor: 'user' },

  // Dari SUBMITTED
  { from: 'SUBMITTED', to: 'EVALUATING', actor: 'worker' },

  // Dari EVALUATING (Tahap A)
  { from: 'EVALUATING', to: 'REJECTED', actor: 'worker', guard: 'tahapA_failed' },
  { from: 'EVALUATING', to: 'NEEDS_APPROVAL', actor: 'worker', guard: 'tahapA_passed_with_marker' },
  { from: 'EVALUATING', to: 'APPROVED', actor: 'worker', guard: 'tahapA_passed_no_marker' },

  // Dari NEEDS_APPROVAL
  { from: 'NEEDS_APPROVAL', to: 'APPROVED', actor: 'approver' },
  { from: 'NEEDS_APPROVAL', to: 'REJECTED', actor: 'approver' },
  { from: 'NEEDS_APPROVAL', to: 'CANCELLED', actor: 'user' },
  { from: 'NEEDS_APPROVAL', to: 'EXPIRED', actor: 'worker' },

  // Dari APPROVED
  { from: 'APPROVED', to: 'EXECUTING', actor: 'worker' },

  // Dari EXECUTING
  { from: 'EXECUTING', to: 'EXECUTED', actor: 'worker' },
  { from: 'EXECUTING', to: 'FAILED', actor: 'worker' },

  // Dari EXECUTED
  { from: 'EXECUTED', to: 'RECONCILED', actor: 'worker' }
];

/**
 * Validasi transisi.
 * @param {string} from
 * @param {string} to
 * @param {string} [actor]
 * @returns {boolean}
 */
export function isValidTransition(from, to, actor) {
  return AGGREGATE_TRANSITIONS.some(t =>
    t.from === from && t.to === to && (!actor || t.actor === actor)
  );
}

/**
 * Eksekusi transisi state agregat.
 * Melempar error dengan kode ILLEGAL_TRANSITION dan status 409 jika transisi tidak sah.
 * @param {string} from
 * @param {string} to
 * @param {string} [actor]
 * @returns {string} to
 */
export function transition(from, to, actor) {
  if (!isValidTransition(from, to, actor)) {
    const error = new Error(`Illegal transition from ${from} to ${to}${actor ? ` by ${actor}` : ''}`);
    // @ts-ignore
    error.code = 'ILLEGAL_TRANSITION';
    // @ts-ignore
    error.statusCode = 409;
    // @ts-ignore
    error.httpStatus = 409;
    throw error;
  }
  return to;
}

/**
 * Mapping Tahap A ke state.
 */
export const TAHAP_A_MAPPING = {
  A1_vLEI: { failState: 'REJECTED', failCode: 'VLEI_INACTIVE' },
  A2_Intent: { failState: 'REJECTED', failCode: 'INTENT_MANDATE_MISSING' },
  A3_DIP: {
    rejectBelow: 50, rejectState: 'REJECTED', rejectCode: 'DIP_CRITICAL',
    escalateBelow: 80, escalateState: 'NEEDS_APPROVAL', escalateCode: 'DIP_LOW_SCORE'
  },
  A4_CPL: {
    rejectBelow: 70, rejectState: 'REJECTED', rejectCode: 'CPL_CRITICAL',
    escalateBelow: 90, escalateState: 'NEEDS_APPROVAL', escalateCode: 'CPL_LOW_REPRODUCIBILITY'
  }
};
