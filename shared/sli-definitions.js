// @ts-check

/**
 * Setiap SLI memiliki:
 * - id: identifier unik
 * - name: nama manusiawi
 * - description: deskripsi
 * - metric: query Prometheus/PostgreSQL
 * - unit: unit (ms, %, count)
 * - good_event: kondisi "good"
 * - valid_event: kondisi "valid"
 */
export const SLI_DEFINITIONS = [
  {
    id: 'sli_decision_latency',
    name: 'Decision Latency',
    description: 'Persentase keputusan yang selesai < 500ms',
    metric: 'histogram_quantile(0.95, rate(jp_decision_duration_seconds_bucket[5m]))',
    unit: 'ms',
    good_event: 'duration < 0.5',
    valid_event: 'all_decisions',
  },
  {
    id: 'sli_decision_availability',
    name: 'Decision Availability',
    description: 'Persentase request keputusan yang berhasil (tidak 5xx)',
    metric: 'sum(rate(jp_decision_total{status!~"5.."}[5m])) / sum(rate(jp_decision_total[5m]))',
    unit: '%',
    good_event: 'status != 5xx',
    valid_event: 'all_requests',
  },
  {
    id: 'sli_payout_success',
    name: 'Payout Success Rate',
    description: 'Persentase payout yang berhasil (RECONCILED) dalam 5 menit',
    metric: 'sum(rate(jp_payout_total{status="RECONCILED"}[5m])) / sum(rate(jp_payout_total[5m]))',
    unit: '%',
    good_event: 'status == RECONCILED within 300s',
    valid_event: 'all_payouts',
  },
  {
    id: 'sli_double_payout',
    name: 'Double Payout Rate',
    description: 'Jumlah double payout per 1 juta transaksi',
    metric: 'sum(rate(jp_double_payout_total[1h])) / sum(rate(jp_payout_total[1h])) * 1000000',
    unit: 'per_million',
    good_event: 'double_payout == 0',
    valid_event: 'all_payouts',
  },
  {
    id: 'sli_webhook_processing',
    name: 'Webhook Processing Time',
    description: 'Persentase webhook yang diproses < 60 detik',
    metric: 'histogram_quantile(0.95, rate(jp_webhook_processing_seconds_bucket[5m]))',
    unit: 's',
    good_event: 'duration < 60',
    valid_event: 'all_webhooks',
  },
  {
    id: 'sli_ledger_verification',
    name: 'Ledger Verification',
    description: 'Persentase verifikasi ledger yang berhasil (valid)',
    metric: 'sum(rate(jp_ledger_verify_total{status="valid"}[1h])) / sum(rate(jp_ledger_verify_total[1h]))',
    unit: '%',
    good_event: 'status == valid',
    valid_event: 'all_verifications',
  },
];

export default SLI_DEFINITIONS;
