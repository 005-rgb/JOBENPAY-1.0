// @ts-check
import { SLI_DEFINITIONS } from './sli-definitions.js';

/**
 * Setiap SLO memiliki:
 * - id: identifier unik
 * - name: nama manusiawi
 * - sli_id: referensi ke SLI
 * - target: target (0-1)
 * - window: window (30d, 7d, 1d)
 * - error_budget: 1 - target
 * - burn_rate_threshold: threshold untuk alert
 */
export const SLO_DEFINITIONS = [
  {
    id: 'slo_decision_latency',
    name: 'Decision Latency < 500ms',
    sli_id: 'sli_decision_latency',
    target: 0.95,
    window: '30d',
    error_budget: 0.05,
    burn_rate_threshold: 14.4, // 2% budget in 1 hour
  },
  {
    id: 'slo_decision_availability',
    name: 'Decision Availability 99.9%',
    sli_id: 'sli_decision_availability',
    target: 0.999,
    window: '30d',
    error_budget: 0.001,
    burn_rate_threshold: 14.4,
  },
  {
    id: 'slo_payout_success',
    name: 'Payout Success Rate 99.5%',
    sli_id: 'sli_payout_success',
    target: 0.995,
    window: '30d',
    error_budget: 0.005,
    burn_rate_threshold: 6,
  },
  {
    id: 'slo_double_payout',
    name: 'Zero Double Payout',
    sli_id: 'sli_double_payout',
    target: 1.0, // 0 double payout
    window: '30d',
    error_budget: 0,
    burn_rate_threshold: 1, // Any double payout = alert
  },
  {
    id: 'slo_webhook_processing',
    name: 'Webhook Processing < 60s',
    sli_id: 'sli_webhook_processing',
    target: 0.99,
    window: '7d',
    error_budget: 0.01,
    burn_rate_threshold: 14.4,
  },
  {
    id: 'slo_ledger_verification',
    name: 'Ledger Verification 100%',
    sli_id: 'sli_ledger_verification',
    target: 1.0,
    window: '30d',
    error_budget: 0,
    burn_rate_threshold: 1,
  },
];

export default SLO_DEFINITIONS;
