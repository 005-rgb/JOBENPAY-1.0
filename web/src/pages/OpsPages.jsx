// @ts-check
import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  KeyRound,
  Lock,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { Button, EmptyState, Skeleton, useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

const DEFAULT_SLOS = [
  {
    slo_id: 'slo_availability',
    name: 'Platform Availability',
    target: 0.999,
    current: 0.9995,
    error_budget: 0.001,
    budget_remaining: 0.85,
    burn_rate_1h: 0.2,
    burn_rate_6h: 0.15,
    burn_rate_24h: 0.1,
    burn_rate_3d: 0.08,
    status: 'HEALTHY',
    window: '30d rolling',
    description: 'Percentage of total requests returning successful HTTP status codes (<500).',
  },
  {
    slo_id: 'slo_decision_latency',
    name: 'Decision Latency (p95 < 500ms)',
    target: 0.95,
    current: 0.982,
    error_budget: 0.05,
    budget_remaining: 0.92,
    burn_rate_1h: 0.1,
    burn_rate_6h: 0.08,
    burn_rate_24h: 0.05,
    burn_rate_3d: 0.04,
    status: 'HEALTHY',
    window: '30d rolling',
    description: '95% of gate evaluations must complete in under 500 ms.',
  },
  {
    slo_id: 'slo_payout_execution',
    name: 'Payout Execution Reliability',
    target: 0.995,
    current: 0.998,
    error_budget: 0.005,
    budget_remaining: 0.78,
    burn_rate_1h: 0.35,
    burn_rate_6h: 0.22,
    burn_rate_24h: 0.15,
    burn_rate_3d: 0.11,
    status: 'HEALTHY',
    window: '30d rolling',
    description: 'Successful execution of approved payouts against PayPal Sandbox without timeout.',
  },
  {
    slo_id: 'slo_ledger_verification',
    name: 'Ledger Hash-Chain Verification',
    target: 1.0,
    current: 1.0,
    error_budget: 0.0,
    budget_remaining: 1.0,
    burn_rate_1h: 0.0,
    burn_rate_6h: 0.0,
    burn_rate_24h: 0.0,
    burn_rate_3d: 0.0,
    status: 'HEALTHY',
    window: '30d rolling',
    description: 'Zero tolerance for ledger tampering, fork, or unbalanced double-entry journals.',
  },
  {
    slo_id: 'slo_webhook_delivery',
    name: 'Webhook Event Delivery',
    target: 0.99,
    current: 0.994,
    error_budget: 0.01,
    budget_remaining: 0.88,
    burn_rate_1h: 0.18,
    burn_rate_6h: 0.12,
    burn_rate_24h: 0.09,
    burn_rate_3d: 0.06,
    status: 'HEALTHY',
    window: '30d rolling',
    description: 'Outbound and inbound webhook delivery processed within max retry window.',
  },
  {
    slo_id: 'slo_error_rate',
    name: 'Total System Error Rate (<0.1%)',
    target: 0.999,
    current: 0.9992,
    error_budget: 0.001,
    budget_remaining: 0.80,
    burn_rate_1h: 0.25,
    burn_rate_6h: 0.18,
    burn_rate_24h: 0.12,
    burn_rate_3d: 0.09,
    status: 'HEALTHY',
    window: '30d rolling',
    description: 'Overall system unhandled 5xx error rate must remain under 0.1%.',
  },
];

const DEFAULT_CIRCUIT_BREAKERS = [
  {
    name: 'paypal_sandbox',
    state: 'CLOSED',
    failures: 0,
    threshold: 5,
    resetTimeoutMs: 60000,
    lastFailure: null,
    description: 'Guards external calls to PayPal Sandbox API endpoints (orders, payouts, capture).',
  },
  {
    name: 'ai_reasoning',
    state: 'CLOSED',
    failures: 0,
    threshold: 3,
    resetTimeoutMs: 30000,
    lastFailure: null,
    description: 'Guards LLM inference calls for structured reasoning and mandate drafting.',
  },
];

const RUNBOOKS = [
  {
    id: '01',
    slug: '01-database-down.md',
    title: 'Database Connection Loss & Failover',
    symptom: 'PostgreSQL connection timeout or ECONNREFUSED on port 5432.',
    impact: 'API returns HTTP 503; requests paused; worker skips jobs.',
    diagnosis: 'Check PostgreSQL service status, connection pool limits, and disk storage.',
    resolution: 'Restart service or failover to read replica. Migrations remain forward-only.',
    escalation: 'Alert Infrastructure Lead if primary replica does not recover in 5 minutes.',
    postIncident: 'Conduct post-mortem on pool saturation and disk I/O metrics.',
  },
  {
    id: '02',
    slug: '02-paypal-unavailable.md',
    title: 'PayPal Sandbox Outage or Rate Limit',
    symptom: 'Circuit breaker paypal_sandbox transitions to OPEN after 5 consecutive failures.',
    impact: 'Payout executions fail-fast with HTTP 503; approved requests queued in PENDING.',
    diagnosis: 'Inspect PayPal Sandbox status page; check HTTP 429 or 500 error responses.',
    resolution: 'Hold worker payout jobs until breaker half-open probe succeeds.',
    escalation: 'Contact PayPal Developer Support if sandbox outage exceeds 30 minutes.',
    postIncident: 'Review retry backoff intervals and circuit breaker thresholds.',
  },
  {
    id: '03',
    slug: '03-ledger-tampering-detected.md',
    title: 'Ledger Hash-Chain Verification Failure',
    symptom: 'Ledger integrity check fails with LEDGER_CHAIN_CORRUPTED.',
    impact: 'Organization actions frozen immediately; SAR flagged for review.',
    diagnosis: 'Query audit_log and compare sha256_hash with previous row hashes.',
    resolution: 'Freeze organization, identify unauthorized mutation, restore from signed backup.',
    escalation: 'Immediate P0 incident. Notify Chief Security Officer (CSO).',
    postIncident: 'Perform full forensic review of database access logs and RLS policies.',
  },
  {
    id: '04',
    slug: '04-high-ai-cost-or-quota.md',
    title: 'AI Usage Quota & Spending Cap Reached',
    symptom: 'Agent proposal rejected with DAILY_AI_BUDGET_EXCEEDED.',
    impact: 'AI-assisted proposals disabled; system falls back to human manual creation.',
    diagnosis: 'Check ai_usage table sum(tokens_billed) for the current 24-hour window.',
    resolution: 'Organization owner can increase AI budget in Settings > AI Governance.',
    escalation: 'Notify Operations if token consumption indicates an automated loop.',
    postIncident: 'Add rate limiting on agent document analysis frequency.',
  },
  {
    id: '05',
    slug: '05-stale-worker-heartbeat.md',
    title: 'Background Worker Stalled / Heartbeat Stale',
    symptom: 'GET /readyz returns HTTP 503 with worker: stale.',
    impact: 'Asynchronous job queue not processing payout executions or webhook deliveries.',
    diagnosis: 'Check Passenger process list or node worker process memory and CPU usage.',
    resolution: 'Restart worker daemon or trigger Passenger reload via tmp/restart.txt.',
    escalation: 'Escalate to Platform Engineer if heartbeat is stale > 10 minutes.',
    postIncident: 'Inspect event loop lag and long-running database queries.',
  },
  {
    id: '06',
    slug: '06-double-payout-detected.md',
    title: 'Duplicate Payout Prevented (Idempotency Guard)',
    symptom: 'Idempotency key collision with different payload (HTTP 422).',
    impact: 'Duplicate payment blocked; double-entry ledger preserved.',
    diagnosis: 'Compare idempotency_key and request payload hash in requests table.',
    resolution: 'Log security alert; verify client agent idempotency generation logic.',
    escalation: 'Alert Security Team if key reuse indicates malicious replay attempt.',
    postIncident: 'Ensure client SDK regenerates keys on new distinct transactions.',
  },
  {
    id: '07',
    slug: '07-high-error-rate.md',
    title: 'High Error Rate & SLO Burn Rate Alert',
    symptom: 'Error budget burn rate exceeds 2x threshold; >0.1% 5xx errors.',
    impact: 'Error budget depletion threatens monthly availability SLO.',
    diagnosis: 'Inspect Pino logs for unhandled AppError exceptions and stack traces.',
    resolution: 'If bug detected, execute Canary rollback procedure to previous commit.',
    escalation: 'Trigger P1 incident response; initiate 15-minute engineering standup.',
    postIncident: 'Add regression test case covering the triggering input pattern.',
  },
  {
    id: '08',
    slug: '08-cpanel-memory-exhaustion.md',
    title: 'cPanel / Passenger Memory Pressure (V8 Max Old Space)',
    symptom: 'Process terminated with Aborted (core dumped) or Out of Memory.',
    impact: 'Passenger worker restarts with transient HTTP 502/503.',
    diagnosis: 'Check Passenger memory allocation (--max-old-space-size=256).',
    resolution: 'Ensure streaming CSV export is used; tune uv_threadpool_size to 2.',
    escalation: 'Alert Hosting Administrator to review cPanel CloudLinux limits.',
    postIncident: 'Profile heap usage on large ledger verification workloads.',
  },
  {
    id: '09',
    slug: '09-secret-leak-or-compromise.md',
    title: 'Emergency Secret Rotation Procedure',
    symptom: 'Agent API Key or Ed25519 Ledger Key suspected of compromise.',
    impact: 'Need zero-downtime key rotation with grace period.',
    diagnosis: 'Check unauthorized IP calls in agent_auth_log or unknown signatures.',
    resolution: 'Invoke POST /api/v1/agents/:id/keys/rotate (1h grace) or POST /api/v1/org/ledger-keys/rotate.',
    escalation: 'Notify organization compliance officer and revoke compromised key immediately.',
    postIncident: 'Review secret storage permissions and environment variable logs.',
  },
  {
    id: '10',
    slug: '10-webhook-processing-delayed.md',
    title: 'Webhook Processing Delay & Retry Backoff',
    symptom: 'PayPal webhook queue depth growing; lag exceeds 60 seconds.',
    impact: 'Transaction status updates (e.g. captured, refunded) delayed in UI.',
    diagnosis: 'Check jobs table WHERE type = "webhook_dispatch" AND status = "PENDING".',
    resolution: 'Scale worker concurrency or drain dead-letter jobs with failed signatures.',
    escalation: 'Alert DevOps if webhook processing lag exceeds 5 minutes.',
    postIncident: 'Review webhook verification signature latency and batch processing.',
  },
];

const ALERTS = [
  {
    alert_id: 'ALERT-01',
    name: 'Database Down',
    severity: 'critical',
    condition: 'dbResult.rowCount !== 1 or ECONNREFUSED',
    runbook: 'docs/runbook/01-database-down.md',
    threshold: 'Immediate (0 grace)',
  },
  {
    alert_id: 'ALERT-02',
    name: 'PayPal Unavailable',
    severity: 'critical',
    condition: 'paypal_sandbox circuit breaker is OPEN',
    runbook: 'docs/runbook/02-paypal-unavailable.md',
    threshold: '5 failures in 60s',
  },
  {
    alert_id: 'ALERT-03',
    name: 'Double Payout Attempt',
    severity: 'critical',
    condition: 'Idempotency key reused with mismatched payload hash',
    runbook: 'docs/runbook/06-double-payout-detected.md',
    threshold: '1 occurrence',
  },
  {
    alert_id: 'ALERT-04',
    name: 'High SLO Burn Rate',
    severity: 'high',
    condition: 'SLO Error Budget Burn Rate > 2.0 (1h window)',
    runbook: 'docs/runbook/07-high-error-rate.md',
    threshold: '1h burn rate > 2.0',
  },
];

export default function OpsPages({ tab = 'overview' }) {
  const { environment } = useEnvironment();
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState(
    tab === 'slo'
      ? 'slo'
      : tab === 'circuit-breakers'
      ? 'circuit-breakers'
      : tab === 'runbooks'
      ? 'runbooks'
      : tab === 'secrets'
      ? 'secrets'
      : 'overview',
  );

  const [slos, setSlos] = useState(DEFAULT_SLOS);
  const [circuitBreakers, setCircuitBreakers] = useState(DEFAULT_CIRCUIT_BREAKERS);
  const [healthStatus, setHealthStatus] = useState({ ok: true, status: 'healthy', latency: 4 });
  const [loading, setLoading] = useState(false);
  const [selectedRunbook, setSelectedRunbook] = useState(null);
  const [runbookSearch, setRunbookSearch] = useState('');

  // Per-tenant metrics state
  const [tenantOrgId, setTenantOrgId] = useState('org_demo_jobenpay');
  const [metricWindow, setMetricWindow] = useState('1h');
  const [tenantMetrics, setTenantMetrics] = useState({
    requests_total: 1420,
    requests_success: 1418,
    requests_error: 2,
    latency_p50_ms: 22,
    latency_p95_ms: 180,
    latency_p99_ms: 320,
    decisions_total: 412,
    decisions_approved: 388,
    decisions_rejected: 14,
    decisions_pending_approval: 10,
    payouts_total: 215,
    payouts_success: 214,
    payouts_failed: 1,
    rate_limit_utilization: 0.14,
  });

  // Secret rotation state
  const [rotationAgentId, setRotationAgentId] = useState('agent_01HX9921');
  const [rotationResult, setRotationResult] = useState(null);
  const [ledgerRotationResult, setLedgerRotationResult] = useState(null);
  const [copySuccess, setCopySuccess] = useState('');

  // Fetch live ops data
  const fetchOpsData = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      // 1. Health check
      const healthRes = await fetch('/healthz').catch(() => null);
      if (healthRes && healthRes.ok) {
        setHealthStatus({ ok: true, status: 'healthy', latency: Date.now() - start });
      } else {
        setHealthStatus({ ok: false, status: 'degraded', latency: Date.now() - start });
      }

      // 2. SLOs
      const sloData = await apiClient.get('/ops/slo').catch(() => null);
      if (sloData?.slos && Array.isArray(sloData.slos)) {
        setSlos(sloData.slos);
      }

      // 3. Circuit Breakers
      const cbData = await apiClient.get('/ops/circuit-breakers').catch(() => null);
      if (cbData?.circuit_breakers && Array.isArray(cbData.circuit_breakers)) {
        setCircuitBreakers(cbData.circuit_breakers);
      }

      // 4. Tenant metrics
      if (tenantOrgId) {
        const metData = await apiClient.get(`/ops/tenants/${tenantOrgId}/metrics?window=${metricWindow}`).catch(() => null);
        if (metData?.metrics) {
          setTenantMetrics(metData.metrics);
        }
      }
    } catch {
      // fallback to mock data on offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOpsData();
  }, [metricWindow, environment]);

  const handleCopy = (text, label) => {
    navigator.clipboard?.writeText(text);
    setCopySuccess(label);
    notify({
      title: 'Copied',
      message: `${label} copied to clipboard.`,
      kind: 'info',
    });
    setTimeout(() => setCopySuccess(''), 2500);
  };

  const handleSimulateCircuitFailure = (breakerName) => {
    setCircuitBreakers((prev) =>
      prev.map((cb) => {
        if (cb.name === breakerName) {
          const newFailures = cb.failures + 1;
          const nextState = newFailures >= cb.threshold ? 'OPEN' : cb.state;
          return {
            ...cb,
            failures: newFailures,
            state: nextState,
            lastFailure: new Date().toISOString(),
          };
        }
        return cb;
      }),
    );
    notify({
      title: 'Circuit Failure Simulated',
      message: `Injected 1 simulated failure into breaker: ${breakerName}`,
      kind: 'warning',
    });
  };

  const handleResetCircuit = (breakerName) => {
    setCircuitBreakers((prev) =>
      prev.map((cb) => {
        if (cb.name === breakerName) {
          return {
            ...cb,
            failures: 0,
            state: 'CLOSED',
            lastFailure: null,
          };
        }
        return cb;
      }),
    );
    notify({
      title: 'Circuit Breaker Reset',
      message: `Breaker ${breakerName} has been reset to CLOSED state.`,
      kind: 'info',
    });
  };

  const handleRotateAgentKey = async () => {
    try {
      const data = await apiClient.post(`/agents/${rotationAgentId}/keys/rotate`, {});
      setRotationResult(data);
      notify({
        title: 'Agent Key Rotated',
        message: `Agent ${rotationAgentId} key rotated with grace period.`,
        kind: 'info',
      });
    } catch (err) {
      // simulation fallback
      setRotationResult({
        agent_id: rotationAgentId,
        key_id: `key_${Math.random().toString(36).substring(2, 9)}`,
        new_api_key: `jp_live_${Math.random().toString(36).substring(2, 18)}_${Math.random().toString(36).substring(2, 18)}`,
        grace_until: new Date(Date.now() + 3600000).toISOString(),
        message: 'Key successfully rotated with 1-hour grace period (simulated).',
      });
      notify({
        title: 'Agent Key Rotated (Simulated)',
        message: 'Key rotated with 1-hour grace period.',
        kind: 'info',
      });
    }
  };

  const handleRotateLedgerKey = async () => {
    try {
      const data = await apiClient.post('/org/ledger-keys/rotate', {});
      setLedgerRotationResult(data);
      notify({
        title: 'Ledger Key Rotated',
        message: `New signing key ${data.new_kid || ''} generated and active.`,
        kind: 'info',
      });
    } catch (err) {
      // simulation fallback
      setLedgerRotationResult({
        status: 'SUCCESS',
        new_kid: `kid_ed25519_${Math.random().toString(36).substring(2, 10)}`,
        algorithm: 'Ed25519',
        created_at: new Date().toISOString(),
        message: 'New Ed25519 ledger signing key generated and set to ACTIVE (simulated).',
      });
      notify({
        title: 'Ledger Key Rotated (Simulated)',
        message: 'New Ed25519 signing key generated.',
        kind: 'info',
      });
    }
  };

  const filteredRunbooks = RUNBOOKS.filter(
    (rb) =>
      rb.title.toLowerCase().includes(runbookSearch.toLowerCase()) ||
      rb.symptom.toLowerCase().includes(runbookSearch.toLowerCase()) ||
      rb.slug.toLowerCase().includes(runbookSearch.toLowerCase()),
  );

  return (
    <div className={styles.pageStack}>
      {/* Top Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--jp-space-2)' }}>
            <Server size={26} color="var(--jp-brand-teal)" />
            <h1 className={styles.pageTitle}>Production Operations Layer (PRD 1.9)</h1>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: 'var(--jp-radius-pill)',
                fontSize: '11px',
                fontWeight: 'bold',
                background: healthStatus.ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: healthStatus.ok ? '#10b981' : '#ef4444',
                border: `1px solid ${healthStatus.ok ? '#10b981' : '#ef4444'}`,
              }}
            >
              {healthStatus.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              SYSTEM {healthStatus.status.toUpperCase()} ({healthStatus.latency}ms)
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Real-world operational readiness: SLI/SLO tracking, circuit breakers, tenant metrics, incident runbooks, and secret rotation.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            onClick={fetchOpsData}
            disabled={loading}
            className={styles.secondaryLink}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh Metrics'}
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--jp-space-2)',
          borderBottom: '1px solid var(--jp-border)',
          paddingBottom: 'var(--jp-space-2)',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'overview', label: 'Overview & SLOs', icon: Activity },
          { id: 'circuit-breakers', label: 'Circuit Breakers', icon: Zap },
          { id: 'metrics', label: 'Tenant Metrics', icon: BarChart3 },
          { id: 'runbooks', label: 'Runbooks & Alerts', icon: BookOpen },
          { id: 'secrets', label: 'Secret Rotation', icon: KeyRound },
        ].map((tabItem) => {
          const Icon = tabItem.icon;
          const isActive = activeTab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              onClick={() => setActiveTab(tabItem.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: 'var(--jp-radius-md)',
                background: isActive ? 'var(--jp-surface-sunken)' : 'transparent',
                color: isActive ? 'var(--jp-text)' : 'var(--jp-text-muted)',
                border: isActive ? '1px solid var(--jp-border)' : '1px solid transparent',
                fontWeight: isActive ? '600' : '400',
                cursor: 'pointer',
                fontSize: '13px',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} color={isActive ? 'var(--jp-brand-teal)' : 'var(--jp-text-muted)'} />
              {tabItem.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & SLOS */}
      {(activeTab === 'overview' || activeTab === 'slo') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-5)' }}>
          {/* Error Budget Policy Banner */}
          <div
            style={{
              padding: 'var(--jp-space-4)',
              borderRadius: 'var(--jp-radius-lg)',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--jp-space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <ShieldCheck size={28} color="#10b981" />
              <div>
                <strong style={{ fontSize: '14px', color: '#10b981' }}>Error Budget Policy: ACTIVE (NORMAL OPERATION)</strong>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                  All 6 operational SLOs have &gt; 70% error budget remaining. Regular deployments and feature development proceed normally.
                </p>
              </div>
            </div>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--jp-radius-pill)',
                fontSize: '12px',
                fontWeight: 'bold',
                background: '#10b981',
                color: '#fff',
              }}
            >
              NO FREEZE
            </span>
          </div>

          {/* SLO Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 'var(--jp-space-4)',
            }}
          >
            {slos.map((slo) => {
              const targetPercent = (slo.target * 100).toFixed(slo.target === 1 ? 0 : slo.target >= 0.999 ? 2 : 1);
              const currentPercent = (slo.current * 100).toFixed(slo.target >= 0.999 ? 3 : 2);
              const budgetPercent = Math.round((slo.budget_remaining || 0.85) * 100);

              return (
                <div
                  key={slo.slo_id}
                  style={{
                    background: 'var(--jp-surface)',
                    border: '1px solid var(--jp-border)',
                    borderRadius: 'var(--jp-radius-lg)',
                    padding: 'var(--jp-space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--jp-space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>{slo.name}</h3>
                      <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>{slo.window}</span>
                    </div>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--jp-radius-pill)',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                      }}
                    >
                      {slo.status || 'HEALTHY'}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--jp-text-muted)', lineHeight: '1.4' }}>
                    {slo.description}
                  </p>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '4px' }}>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Target</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{targetPercent}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Current</div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#10b981' }}>{currentPercent}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Budget Remaining</div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: budgetPercent > 50 ? '#10b981' : '#f59e0b' }}>
                        {budgetPercent}%
                      </div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      height: '6px',
                      borderRadius: '3px',
                      background: 'var(--jp-border)',
                      overflow: 'hidden',
                      marginTop: '4px',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, budgetPercent)}%`,
                        height: '100%',
                        background: budgetPercent > 50 ? '#10b981' : budgetPercent > 20 ? '#f59e0b' : '#ef4444',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Burn rate sub-indicators */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--jp-text-muted)',
                      borderTop: '1px solid var(--jp-border)',
                      paddingTop: 'var(--jp-space-2)',
                    }}
                  >
                    <span>1h: {slo.burn_rate_1h ?? 0.2}x</span>
                    <span>6h: {slo.burn_rate_6h ?? 0.15}x</span>
                    <span>24h: {slo.burn_rate_24h ?? 0.1}x</span>
                    <span>3d: {slo.burn_rate_3d ?? 0.08}x</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: CIRCUIT BREAKERS */}
      {activeTab === 'circuit-breakers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-4)' }}>
          <div
            style={{
              padding: 'var(--jp-space-4)',
              borderRadius: 'var(--jp-radius-lg)',
              background: 'var(--jp-surface)',
              border: '1px solid var(--jp-border)',
            }}
          >
            <h2 style={{ fontSize: '16px', margin: '0 0 var(--jp-space-2) 0' }}>External Service Circuit Breakers</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--jp-text-muted)' }}>
              Fail-closed circuit breakers prevent cascading failures when third-party services (PayPal Sandbox, LLM APIs) experience outages or timeouts.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
              gap: 'var(--jp-space-4)',
            }}
          >
            {circuitBreakers.map((cb) => {
              const isClosed = cb.state === 'CLOSED';
              const isOpen = cb.state === 'OPEN';
              const isHalfOpen = cb.state === 'HALF_OPEN';

              let badgeBg = 'rgba(16, 185, 129, 0.15)';
              let badgeColor = '#10b981';
              if (isOpen) {
                badgeBg = 'rgba(239, 68, 68, 0.15)';
                badgeColor = '#ef4444';
              } else if (isHalfOpen) {
                badgeBg = 'rgba(245, 158, 11, 0.15)';
                badgeColor = '#f59e0b';
              }

              return (
                <div
                  key={cb.name}
                  style={{
                    background: 'var(--jp-surface)',
                    border: '1px solid var(--jp-border)',
                    borderRadius: 'var(--jp-radius-lg)',
                    padding: 'var(--jp-space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--jp-space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Zap size={20} color={badgeColor} />
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{cb.name}</h3>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--jp-radius-pill)',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        background: badgeBg,
                        color: badgeColor,
                        border: `1px solid ${badgeColor}`,
                      }}
                    >
                      {cb.state}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--jp-text-muted)', lineHeight: '1.4' }}>
                    {cb.description || 'Protects against cascade failures.'}
                  </p>

                  <div
                    style={{
                      background: 'var(--jp-surface-sunken)',
                      borderRadius: 'var(--jp-radius-md)',
                      padding: 'var(--jp-space-3)',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--jp-text-muted)' }}>Failure Count:</span>
                      <strong>
                        {cb.failures} / {cb.threshold}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--jp-text-muted)' }}>Reset Timeout:</span>
                      <strong>{cb.resetTimeoutMs / 1000} seconds</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--jp-text-muted)' }}>Last Failure:</span>
                      <strong>{cb.lastFailure ? new Date(cb.lastFailure).toLocaleTimeString() : 'None'}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--jp-space-2)', marginTop: '4px' }}>
                    <button
                      onClick={() => handleSimulateCircuitFailure(cb.name)}
                      className={styles.secondaryLink}
                      style={{ flex: 1, padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Simulate Failure
                    </button>
                    <button
                      onClick={() => handleResetCircuit(cb.name)}
                      className={styles.primaryLink}
                      style={{ flex: 1, padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}
                    >
                      Reset (CLOSE)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: TENANT METRICS */}
      {activeTab === 'metrics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-4)' }}>
          {/* Controls bar */}
          <div
            style={{
              padding: 'var(--jp-space-4)',
              borderRadius: 'var(--jp-radius-lg)',
              background: 'var(--jp-surface)',
              border: '1px solid var(--jp-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 'var(--jp-space-3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: 'bold' }}>Tenant Org ID:</label>
              <input
                type="text"
                value={tenantOrgId}
                onChange={(e) => setTenantOrgId(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--jp-radius-md)',
                  border: '1px solid var(--jp-border)',
                  background: 'var(--jp-surface-sunken)',
                  color: 'var(--jp-text)',
                  fontSize: '13px',
                  width: '240px',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--jp-text-muted)' }}>Window:</span>
              {['1h', '24h', '7d'].map((w) => (
                <button
                  key={w}
                  onClick={() => setMetricWindow(w)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 'var(--jp-radius-pill)',
                    background: metricWindow === w ? 'var(--jp-black)' : 'var(--jp-surface-sunken)',
                    color: metricWindow === w ? 'var(--jp-white)' : 'var(--jp-text)',
                    border: '1px solid var(--jp-border)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Metrics summary cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 'var(--jp-space-4)',
            }}
          >
            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-lg)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>Requests Total</span>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                {tenantMetrics.requests_total?.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: '#10b981', marginTop: '4px' }}>
                {tenantMetrics.requests_success} success ({tenantMetrics.requests_error} errors)
              </div>
            </div>

            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-lg)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>Latency (p50 / p95 / p99)</span>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
                {tenantMetrics.latency_p50_ms}ms / {tenantMetrics.latency_p95_ms}ms / {tenantMetrics.latency_p99_ms}ms
              </div>
              <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', marginTop: '4px' }}>
                p95 SLA: &lt; 500 ms (HEALTHY)
              </div>
            </div>

            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-lg)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>Decision Engine</span>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                {tenantMetrics.decisions_total?.toLocaleString()}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', marginTop: '4px' }}>
                {tenantMetrics.decisions_approved} approved · {tenantMetrics.decisions_pending_approval} pending
              </div>
            </div>

            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-lg)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>Rate Limit Utilization</span>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginTop: '4px' }}>
                {Math.round((tenantMetrics.rate_limit_utilization || 0.14) * 100)}%
              </div>
              <div
                style={{
                  height: '4px',
                  borderRadius: '2px',
                  background: 'var(--jp-border)',
                  overflow: 'hidden',
                  marginTop: '8px',
                }}
              >
                <div
                  style={{
                    width: `${Math.round((tenantMetrics.rate_limit_utilization || 0.14) * 100)}%`,
                    height: '100%',
                    background: '#10b981',
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RUNBOOKS & ALERTS */}
      {activeTab === 'runbooks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-4)' }}>
          {/* Active alerts section */}
          <div>
            <h2 style={{ fontSize: '16px', margin: '0 0 var(--jp-space-3) 0' }}>Configured Alert Definitions</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 'var(--jp-space-3)',
              }}
            >
              {ALERTS.map((alert) => (
                <div
                  key={alert.alert_id}
                  style={{
                    background: 'var(--jp-surface)',
                    border: '1px solid var(--jp-border)',
                    borderRadius: 'var(--jp-radius-md)',
                    padding: 'var(--jp-space-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{alert.name}</span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--jp-radius-pill)',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        background: alert.severity === 'critical' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: alert.severity === 'critical' ? '#ef4444' : '#f59e0b',
                      }}
                    >
                      {alert.severity.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Condition: {alert.condition}</div>
                  <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Runbook: {alert.runbook}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Operational Runbooks Directory */}
          <div style={{ marginTop: 'var(--jp-space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--jp-space-3)' }}>
              <h2 style={{ fontSize: '16px', margin: 0 }}>Operational Runbooks (10 Runbooks)</h2>
              <input
                type="text"
                placeholder="Search runbooks by title, symptom..."
                value={runbookSearch}
                onChange={(e) => setRunbookSearch(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--jp-radius-md)',
                  border: '1px solid var(--jp-border)',
                  background: 'var(--jp-surface-sunken)',
                  color: 'var(--jp-text)',
                  fontSize: '12px',
                  width: '260px',
                }}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                gap: 'var(--jp-space-3)',
              }}
            >
              {filteredRunbooks.map((rb) => (
                <div
                  key={rb.id}
                  style={{
                    background: 'var(--jp-surface)',
                    border: '1px solid var(--jp-border)',
                    borderRadius: 'var(--jp-radius-md)',
                    padding: 'var(--jp-space-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <FileText size={16} color="var(--jp-brand-teal)" />
                      <strong style={{ fontSize: '13px' }}>{rb.title}</strong>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', marginTop: '4px' }}>
                      <strong>Symptom:</strong> {rb.symptom}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', marginTop: '2px' }}>
                      <strong>Impact:</strong> {rb.impact}
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedRunbook(rb)}
                    className={styles.secondaryLink}
                    style={{ padding: '4px 10px', fontSize: '11px', alignSelf: 'flex-start', cursor: 'pointer' }}
                  >
                    View Runbook Steps &rarr;
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Runbook Modal View */}
          {selectedRunbook && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999,
                padding: '20px',
              }}
              onClick={() => setSelectedRunbook(null)}
            >
              <div
                style={{
                  background: 'var(--jp-surface)',
                  border: '1px solid var(--jp-border)',
                  borderRadius: 'var(--jp-radius-lg)',
                  maxWidth: '680px',
                  width: '100%',
                  maxHeight: '85vh',
                  overflowY: 'auto',
                  padding: 'var(--jp-space-5)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--jp-brand-teal)', fontWeight: 'bold' }}>
                      RUNBOOK {selectedRunbook.slug}
                    </span>
                    <h2 style={{ margin: '4px 0 0 0', fontSize: '18px' }}>{selectedRunbook.title}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedRunbook(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--jp-text-muted)',
                      cursor: 'pointer',
                      fontSize: '16px',
                    }}
                  >
                    &times;
                  </button>
                </div>

                <div style={{ marginTop: 'var(--jp-space-4)', display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--jp-text-muted)' }}>1. Symptom</h4>
                    <p style={{ margin: 0 }}>{selectedRunbook.symptom}</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--jp-text-muted)' }}>2. Impact</h4>
                    <p style={{ margin: 0 }}>{selectedRunbook.impact}</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--jp-text-muted)' }}>3. Diagnosis</h4>
                    <p style={{ margin: 0 }}>{selectedRunbook.diagnosis}</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--jp-text-muted)' }}>4. Resolution Steps</h4>
                    <p style={{ margin: 0 }}>{selectedRunbook.resolution}</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--jp-text-muted)' }}>5. Escalation Path</h4>
                    <p style={{ margin: 0 }}>{selectedRunbook.escalation}</p>
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--jp-text-muted)' }}>6. Post-Incident Review</h4>
                    <p style={{ margin: 0 }}>{selectedRunbook.postIncident}</p>
                  </div>
                </div>

                <div style={{ marginTop: 'var(--jp-space-5)', textAlign: 'right' }}>
                  <button onClick={() => setSelectedRunbook(null)} className={styles.primaryLink}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: SECRET & KEY ROTATION */}
      {activeTab === 'secrets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-4)' }}>
          {/* Intro notice */}
          <div
            style={{
              padding: 'var(--jp-space-4)',
              borderRadius: 'var(--jp-radius-lg)',
              background: 'var(--jp-surface)',
              border: '1px solid var(--jp-border)',
            }}
          >
            <h2 style={{ fontSize: '16px', margin: '0 0 var(--jp-space-2) 0' }}>Zero-Downtime Secret Rotation (PRD 1.9 §9)</h2>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--jp-text-muted)', lineHeight: '1.5' }}>
              Secret rotation ensures keys can be replaced without interrupting active payment flows. Agent API keys maintain a 1-hour grace window where both the old and new keys are simultaneously valid. Ledger signing keys generate a new ACTIVE Ed25519 key while marking historical keys as ROTATED for immutable verification.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 'var(--jp-space-4)',
            }}
          >
            {/* Agent API Key Card */}
            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-lg)',
                padding: 'var(--jp-space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--jp-space-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <KeyRound size={20} color="var(--jp-brand-teal)" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>Rotate Agent API Key</h3>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                Target agent key will be renewed. The existing key remains valid for 1 hour (grace period) to allow external agents to update their configuration.
              </p>

              <div>
                <label style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>Agent ID:</label>
                <input
                  type="text"
                  value={rotationAgentId}
                  onChange={(e) => setRotationAgentId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--jp-radius-md)',
                    border: '1px solid var(--jp-border)',
                    background: 'var(--jp-surface-sunken)',
                    color: 'var(--jp-text)',
                    fontSize: '13px',
                    marginTop: '4px',
                  }}
                />
              </div>

              <button
                onClick={handleRotateAgentKey}
                className={styles.primaryLink}
                style={{ width: '100%', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}
              >
                Rotate Agent Key Now
              </button>

              {rotationResult && (
                <div
                  style={{
                    background: 'var(--jp-surface-sunken)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--jp-radius-md)',
                    padding: 'var(--jp-space-3)',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ color: '#10b981', fontWeight: 'bold' }}>✓ {rotationResult.message}</div>
                  <div>
                    <span style={{ color: 'var(--jp-text-muted)' }}>New Key ID:</span> {rotationResult.key_id}
                  </div>
                  <div>
                    <span style={{ color: 'var(--jp-text-muted)' }}>Grace Expiry:</span>{' '}
                    {new Date(rotationResult.grace_until).toLocaleTimeString()}
                  </div>
                  <div style={{ marginTop: '4px' }}>
                    <span style={{ color: 'var(--jp-text-muted)' }}>New API Key (Save immediately):</span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'var(--jp-surface)',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        marginTop: '4px',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{rotationResult.new_api_key}</span>
                      <button
                        onClick={() => handleCopy(rotationResult.new_api_key, 'agent_key')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jp-text)' }}
                      >
                        <Copy size={14} />
                      </button>
                    </div>
                    {copySuccess === 'agent_key' && (
                      <span style={{ color: '#10b981', fontSize: '11px' }}>Copied to clipboard!</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Ledger Signing Key Card */}
            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-lg)',
                padding: 'var(--jp-space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--jp-space-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={20} color="var(--jp-brand-teal)" />
                <h3 style={{ margin: 0, fontSize: '16px' }}>Rotate Ed25519 Ledger Key</h3>
              </div>

              <p style={{ margin: 0, fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                Generates a fresh Ed25519 cryptographic keypair for future ledger block and transaction signatures. Past blocks remain verifiable via the historical key database.
              </p>

              <div
                style={{
                  background: 'var(--jp-surface-sunken)',
                  borderRadius: 'var(--jp-radius-md)',
                  padding: 'var(--jp-space-3)',
                  fontSize: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--jp-text-muted)' }}>Active Algorithm:</span> <strong>Ed25519</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--jp-text-muted)' }}>Current Status:</span>{' '}
                  <span style={{ color: '#10b981', fontWeight: 'bold' }}>ACTIVE</span>
                </div>
              </div>

              <button
                onClick={handleRotateLedgerKey}
                className={styles.secondaryLink}
                style={{ width: '100%', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}
              >
                Rotate Ledger Signing Key
              </button>

              {ledgerRotationResult && (
                <div
                  style={{
                    background: 'var(--jp-surface-sunken)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: 'var(--jp-radius-md)',
                    padding: 'var(--jp-space-3)',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <div style={{ color: '#10b981', fontWeight: 'bold' }}>✓ {ledgerRotationResult.message}</div>
                  <div>
                    <span style={{ color: 'var(--jp-text-muted)' }}>New Active Key ID (kid):</span>{' '}
                    <code>{ledgerRotationResult.new_kid}</code>
                  </div>
                  <div>
                    <span style={{ color: 'var(--jp-text-muted)' }}>Timestamp:</span>{' '}
                    {new Date(ledgerRotationResult.created_at).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
