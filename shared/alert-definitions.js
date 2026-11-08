// @ts-check

/**
 * Alert definitions mapped to operational runbooks and severity tiers.
 */
export const ALERT_DEFINITIONS = [
  {
    id: 'alert_database_down',
    name: 'Database Down',
    condition: 'up{job="postgres"} == 0',
    severity: 'critical',
    runbook: 'docs/runbook/01-database-down.md',
    notify: ['pagerduty', 'slack'],
  },
  {
    id: 'alert_paypal_unavailable',
    name: 'PayPal Unavailable',
    condition: 'rate(jp_paypal_errors_total[5m]) > 0.1',
    severity: 'high',
    runbook: 'docs/runbook/02-paypal-unavailable.md',
    notify: ['slack'],
  },
  {
    id: 'alert_double_payout',
    name: 'Double Payout Detected',
    condition: 'increase(jp_double_payout_total[1h]) > 0',
    severity: 'critical',
    runbook: 'docs/runbook/06-double-payout-detected.md',
    notify: ['pagerduty', 'slack', 'email'],
  },
  {
    id: 'alert_slo_burn_rate',
    name: 'SLO Burn Rate High',
    condition: 'jp:slo_burn_rate > 14.4',
    severity: 'high',
    runbook: 'docs/runbook/07-high-error-rate.md',
    notify: ['slack'],
  },
];
