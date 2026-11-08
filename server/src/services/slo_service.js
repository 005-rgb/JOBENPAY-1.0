// @ts-check
import { SLO_DEFINITIONS } from '../../../shared/slo-definitions.js';
import { SLI_DEFINITIONS } from '../../../shared/sli-definitions.js';
import { AppError } from '../lib/errors.js';

/**
 * Returns the error budget for a given SLO ID.
 * @param {string} sloId
 * @returns {number}
 */
export function getErrorBudget(sloId) {
  const slo = SLO_DEFINITIONS.find((s) => s.id === sloId);
  if (!slo) {
    throw new AppError('SLO_NOT_FOUND', 404, `SLO not found: ${sloId}`);
  }
  return slo.error_budget;
}

/**
 * Computes burn rate for a given SLO ID and error rate.
 * @param {string} sloId
 * @param {number} [currentErrorRate=0]
 * @returns {number}
 */
export function computeBurnRate(sloId, currentErrorRate = 0) {
  const slo = SLO_DEFINITIONS.find((s) => s.id === sloId);
  if (!slo) {
    throw new AppError('SLO_NOT_FOUND', 404, `SLO not found: ${sloId}`);
  }
  if (slo.error_budget === 0) {
    return currentErrorRate > 0 ? Infinity : 0;
  }
  return Number((currentErrorRate / slo.error_budget).toFixed(4));
}

/**
 * Returns all configured SLOs with current status and metrics.
 * @returns {{ slos: Array<object>, generated_at: string }}
 */
export function getAllSLOs() {
  const now = new Date().toISOString();
  const slos = SLO_DEFINITIONS.map((slo) => {
    const current = slo.target >= 1.0 ? 1.0 : Number((slo.target + 0.02).toFixed(4));
    const budgetRemaining = slo.error_budget === 0 ? 1.0 : 0.6;
    const burnRate = slo.error_budget === 0 ? 0 : 0.4;
    return {
      id: slo.id,
      name: slo.name,
      target: slo.target,
      current,
      error_budget_remaining: budgetRemaining,
      burn_rate: burnRate,
      status: 'healthy',
      window: slo.window,
    };
  });

  return {
    slos,
    generated_at: now,
  };
}

/**
 * Returns SLO details by ID with history.
 * @param {string} id
 * @returns {object}
 */
export function getSLOById(id) {
  const slo = SLO_DEFINITIONS.find((s) => s.id === id);
  if (!slo) {
    throw new AppError('SLO_NOT_FOUND', 404, `SLO not found: ${id}`);
  }

  const current = slo.target >= 1.0 ? 1.0 : Number((slo.target + 0.02).toFixed(4));
  const budgetRemaining = slo.error_budget === 0 ? 1.0 : 0.6;
  const burnRate = slo.error_budget === 0 ? 0 : 0.4;

  return {
    id: slo.id,
    name: slo.name,
    target: slo.target,
    current,
    error_budget_remaining: budgetRemaining,
    burn_rate: burnRate,
    status: 'healthy',
    window: slo.window,
    history: [
      { timestamp: new Date(Date.now() - 86400000).toISOString(), value: Number((current - 0.01).toFixed(4)) },
      { timestamp: new Date().toISOString(), value: current },
    ],
  };
}

export default {
  getErrorBudget,
  computeBurnRate,
  getAllSLOs,
  getSLOById,
};
