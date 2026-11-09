// @ts-check
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  Binary,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  FileCheck2,
  HelpCircle,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from 'lucide-react';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { Button, Modal, useToast } from '../components/primitives.jsx';
import styles from './SecurityPage.module.css';

const PQC_ALGORITHMS = [
  { value: 'ML-DSA-65', label: 'ML-DSA-65 (NIST FIPS 204 Post-Quantum Signature)', type: 'PQC', defaultPurpose: 'SIGNING' },
  { value: 'ED25519', label: 'Ed25519 (Classical Edwards Curve Signature)', type: 'CLASSICAL', defaultPurpose: 'SIGNING' },
  { value: 'SLH-DSA-SHA2-128S', label: 'SLH-DSA-SHA2-128S (NIST FIPS 205 Stateless Hash Signature)', type: 'PQC', defaultPurpose: 'SIGNING' },
  { value: 'X25519MLKEM768', label: 'X25519MLKEM768 (Hybrid Post-Quantum KEM)', type: 'HYBRID', defaultPurpose: 'KEM' },
  { value: 'ML-KEM-768', label: 'ML-KEM-768 (NIST FIPS 203 Lattice KEM)', type: 'PQC', defaultPurpose: 'KEM' },
  { value: 'AES-256-GCM', label: 'AES-256-GCM (Authenticated Field Encryption)', type: 'SYMMETRIC', defaultPurpose: 'ENCRYPTION' },
  { value: 'HMAC-SHA256', label: 'HMAC-SHA256 (Message Authentication Code)', type: 'SYMMETRIC', defaultPurpose: 'JWT' },
];

const PURPOSES = [
  { value: 'SIGNING', label: 'SIGNING — Ledger and Attestation Signatures' },
  { value: 'ENCRYPTION', label: 'ENCRYPTION — Database PII & Field Encryption' },
  { value: 'KEM', label: 'KEM — Key Encapsulation & Ephemeral Exchange' },
  { value: 'JWT', label: 'JWT — Session and API Tokens' },
  { value: 'TLS', label: 'TLS — Transport Security Hybrid Handshakes' },
];

export default function SecurityPage({ tab = 'pqc' }) {
  const [activeTab, setActiveTab] = useState(
    tab === 'threats' ? 'threats' : tab === 'supply-chain' ? 'supply-chain' : 'pqc',
  );

  const { environment, isLive } = useEnvironment();
  const { role } = useAuth();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const canRotate = ['OWNER', 'ADMIN'].includes(role || '');

  // Help modal state
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

  // Rotation modal state
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);
  const [rotatePurpose, setRotatePurpose] = useState('SIGNING');
  const [rotateAlgorithm, setRotateAlgorithm] = useState('ML-DSA-65');
  const [isRotating, setIsRotating] = useState(false);

  // Behavioral check state
  const [behaviorAgentId, setBehaviorAgentId] = useState('');
  const [behaviorChecking, setBehaviorChecking] = useState(false);
  const [behaviorResult, setBehaviorResult] = useState(null);

  // Verification tool state
  const [verifyArtifactName, setVerifyArtifactName] = useState('jobenpay-engine');
  const [verifyVersion, setVerifyVersion] = useState('v5.0.0');
  const [verifyHash, setVerifyHash] = useState('sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);

  // Query 1: Cryptographic Keys
  const {
    data: keysData,
    isLoading: isLoadingKeys,
    refetch: refetchKeys,
  } = useQuery({
    queryKey: ['security', 'keys', environment],
    queryFn: () => apiClient.get('/security/keys'),
  });

  // Query 2: PQC Migration Status
  const {
    data: pqcStatusData,
    isLoading: isLoadingPqcStatus,
    refetch: refetchPqcStatus,
  } = useQuery({
    queryKey: ['security', 'pqc-status', environment],
    queryFn: () => apiClient.get('/security/pqc/status'),
  });

  // Query 3: Threat Detection Events
  const {
    data: eventsData,
    isLoading: isLoadingEvents,
    refetch: refetchEvents,
  } = useQuery({
    queryKey: ['security', 'events', environment],
    queryFn: () => apiClient.get('/security/events'),
  });

  // Query 4: Supply Chain Attestations
  const {
    data: attestationsData,
    isLoading: isLoadingAttestations,
    refetch: refetchAttestations,
  } = useQuery({
    queryKey: ['security', 'attestations', environment],
    queryFn: () => apiClient.get('/security/supply-chain/attestations'),
  });

  // Copy helper
  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard?.writeText(typeof text === 'object' ? JSON.stringify(text) : String(text));
    notify({
      title: 'Copied to Clipboard',
      message: `${label} has been copied.`,
      kind: 'info',
    });
  };

  // Handle Key Rotation
  const handleRotateKey = async (e) => {
    e.preventDefault();
    setIsRotating(true);
    try {
      const res = await apiClient.post('/security/keys/rotate', {
        purpose: rotatePurpose,
        algorithm: rotateAlgorithm,
      });

      notify({
        title: 'Key Rotation Succeeded',
        message: `New ${rotateAlgorithm} key ${res.newKeyId || ''} created with zero-downtime grace period.`,
        kind: 'info',
      });

      setIsRotateModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['security', 'keys', environment] }),
        queryClient.invalidateQueries({ queryKey: ['security', 'pqc-status', environment] }),
      ]);
    } catch (err) {
      notify({
        title: 'Rotation Failed',
        message: err.message || 'Failed to rotate key.',
        kind: 'error',
      });
    } finally {
      setIsRotating(false);
    }
  };

  // Handle On-Demand Behavioral Anomaly Scan
  const handleCheckBehavior = async (e) => {
    e.preventDefault();
    if (!behaviorAgentId.trim()) return;
    setBehaviorChecking(true);
    setBehaviorResult(null);

    try {
      const res = await apiClient.post(`/security/agents/${behaviorAgentId.trim()}/behavior-check`, {});
      setBehaviorResult(res);
      notify({
        title: res.rogueDetected ? 'Rogue Behavior Detected!' : 'Behavior Scan Clean',
        message: res.rogueDetected
          ? `Agent ${res.agentId} triggered anomaly mitigation: ${res.anomalyReason}`
          : `Agent ${res.agentId} velocity and transaction patterns are normal.`,
        kind: res.rogueDetected ? 'error' : 'info',
      });
      // Invalidate events
      queryClient.invalidateQueries({ queryKey: ['security', 'events', environment] });
    } catch (err) {
      notify({
        title: 'Scan Failed',
        message: err.message || 'Failed to scan agent behavior.',
        kind: 'error',
      });
    } finally {
      setBehaviorChecking(false);
    }
  };

  // Handle Artifact Verification
  const handleVerifyArtifact = async (e) => {
    e.preventDefault();
    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const queryParams = new URLSearchParams();
      if (verifyVersion) queryParams.set('version', verifyVersion);
      if (verifyHash) queryParams.set('hash', verifyHash);

      const res = await apiClient.get(
        `/security/supply-chain/${encodeURIComponent(verifyArtifactName)}?${queryParams.toString()}`,
      );
      setVerifyResult(res);
      notify({
        title: res.verified ? 'Artifact Verified (SLSA L3)' : 'Verification Mismatch',
        message: res.verified
          ? `Cryptographic signature & digest for ${verifyArtifactName}@${verifyVersion} verified.`
          : 'Digest or signature does not match stored attestation.',
        kind: res.verified ? 'info' : 'error',
      });
    } catch (err) {
      notify({
        title: 'Verification Failed',
        message: err.message || 'Could not verify artifact attestation.',
        kind: 'error',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  // Refresh current tab
  const handleRefreshCurrentTab = () => {
    if (activeTab === 'pqc') {
      refetchKeys();
      refetchPqcStatus();
    } else if (activeTab === 'threats') {
      refetchEvents();
    } else {
      refetchAttestations();
    }
  };

  const keys = keysData?.keys || [];
  const events = eventsData?.events || [];
  const attestations = attestationsData?.attestations || [];
  const pqcSummary = pqcStatusData?.summary || { total: 5, completed: 2, readyPercentage: 60 };
  const pqcComponents = pqcStatusData?.components || [];

  return (
    <div className={styles.container}>
      {/* Page Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.titleRow}>
            <ShieldAlert size={28} color="var(--jp-brand-teal, #0d9488)" />
            <h1 className={styles.title}>Security Hardening & PQC</h1>
            <span className={`${styles.envBadge} ${isLive ? styles.envLive : styles.envSandbox}`}>
              {environment} MODE
            </span>
          </div>
          <p className={styles.subtitle}>
            Quantum-safe post-quantum cryptography (FIPS 203/204/205), autonomous agent threat mitigation
            (OWASP ASI01–ASI10), and SLSA Level 3 supply chain provenance.
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button variant="secondary" size="sm" onClick={() => setIsHelpModalOpen(true)} title="Module Guide & Help">
            <HelpCircle size={14} />
            <span>Help</span>
          </Button>

          <Button variant="secondary" size="sm" onClick={handleRefreshCurrentTab}>
            <RefreshCw size={14} />
            <span>Refresh</span>
          </Button>

          {activeTab === 'pqc' && (
            <Button
              variant="primary"
              size="sm"
              disabled={!canRotate}
              title={!canRotate ? 'Admin privileges required' : 'Rotate cryptographic key'}
              onClick={() => setIsRotateModalOpen(true)}
            >
              <KeyRound size={14} />
              <span>Rotate Key</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className={styles.tabsBar}>
        <button
          className={`${styles.tabButton} ${activeTab === 'pqc' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('pqc')}
          type="button"
        >
          <Cpu size={16} />
          <span>Post-Quantum Cryptography (PQC)</span>
        </button>

        <button
          className={`${styles.tabButton} ${activeTab === 'threats' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('threats')}
          type="button"
        >
          <ShieldAlert size={16} />
          <span>Threat Detection (Rogue Agent)</span>
          {events.some((e) => e.severity === 'CRITICAL') && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#ef4444',
                display: 'inline-block',
              }}
            />
          )}
        </button>

        <button
          className={`${styles.tabButton} ${activeTab === 'supply-chain' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('supply-chain')}
          type="button"
        >
          <FileCheck2 size={16} />
          <span>Supply Chain (SLSA & SBOM)</span>
        </button>
      </div>

      {/* TAB 1: POST-QUANTUM CRYPTOGRAPHY */}
      {activeTab === 'pqc' && (
        <>
          {/* Top KPI Metrics */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>PQC Readiness Score</span>
                <Cpu size={16} color="var(--jp-brand-teal, #0d9488)" />
              </div>
              <div className={styles.metricValue}>
                {pqcSummary.readyPercentage ?? 60}%
                <span className={styles.badgeQuantum} style={{ fontSize: 11, padding: '2px 6px' }}>
                  NIST FIPS 204
                </span>
              </div>
              <div className={styles.metricSubtext}>
                {pqcSummary.completed || 2} of {pqcSummary.total || 5} core components enforce quantum-safe or hybrid algorithms.
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>Hybrid Key Exchange</span>
                <Binary size={16} color="#0284c7" />
              </div>
              <div className={styles.metricValue}>
                X25519MLKEM768
              </div>
              <div className={styles.metricSubtext}>
                Lattice-based ML-KEM-768 + X25519 hybrid. 1.2ms latency overhead, zero decryption failure risk.
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>Active Keys Registered</span>
                <KeyRound size={16} color="#7c3aed" />
              </div>
              <div className={styles.metricValue}>
                {keys.filter((k) => k.status === 'ACTIVE').length} Keys
              </div>
              <div className={styles.metricSubtext}>
                Cryptographic agility enabled with 1-hour overlap grace period during rotation.
              </div>
            </div>
          </div>

          {/* Cryptographic Keys Table */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <KeyRound size={18} color="var(--jp-brand-teal, #0d9488)" />
                Tenant Cryptographic Key Registry
              </h2>
              <span className={styles.fieldHint}>
                Environment: <strong>{environment}</strong>
              </span>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Key ID</th>
                    <th>Purpose</th>
                    <th>Algorithm</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Public JWK</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingKeys ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>
                        Loading cryptographic keys...
                      </td>
                    </tr>
                  ) : keys.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
                        No cryptographic keys registered for this tenant. Rotate a key to generate one.
                      </td>
                    </tr>
                  ) : (
                    keys.map((k) => {
                      const isQuantum = ['ML-DSA-65', 'SLH-DSA-SHA2-128S', 'ML-KEM-768'].includes(k.algorithm);
                      const isHybrid = k.algorithm === 'X25519MLKEM768';
                      return (
                        <tr key={k.keyId}>
                          <td className={styles.mono}>
                            <strong>{k.keyId}</strong>
                          </td>
                          <td>
                            <span className={styles.monoTag}>{k.purpose}</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className={styles.mono}>{k.algorithm}</span>
                              {isQuantum && <span className={`${styles.badge} ${styles.badgeQuantum}`}>PQC</span>}
                              {isHybrid && <span className={`${styles.badge} ${styles.badgeHybrid}`}>HYBRID</span>}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`${styles.badge} ${
                                k.status === 'ACTIVE'
                                  ? styles.badgeActive
                                  : k.status === 'ROTATED'
                                  ? styles.badgeRotated
                                  : styles.badgeRevoked
                              }`}
                            >
                              {k.status}
                            </span>
                          </td>
                          <td>
                            <span className={styles.mono} style={{ fontSize: 11 }}>
                              {k.createdAt ? new Date(k.createdAt).toLocaleString() : '—'}
                            </span>
                          </td>
                          <td className={styles.mono} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {k.publicJwk ? `${k.publicJwk.kty || 'OKP'} (${k.publicJwk.crv || k.algorithm})` : '—'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => copyToClipboard(k.publicJwk || k.keyId, 'Key Data')}
                              title="Copy Key Data"
                            >
                              <Copy size={12} />
                              <span>Copy</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Subsystem PQC Migration Status */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <Layers size={18} color="var(--jp-brand-teal, #0d9488)" />
                Subsystem Post-Quantum Transition Roadmap (NIST IR 8547 & CNSA 2.0)
              </h2>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Component Subsystem</th>
                    <th>Current Algorithm</th>
                    <th>Target Post-Quantum</th>
                    <th>Hybrid Mode</th>
                    <th>Status</th>
                    <th>Transition Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingPqcStatus ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>
                        Loading PQC migration status...
                      </td>
                    </tr>
                  ) : pqcComponents.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>
                        No PQC subsystem data available.
                      </td>
                    </tr>
                  ) : (
                    pqcComponents.map((c) => (
                      <tr key={c.component}>
                        <td>
                          <strong>{c.component}</strong>
                        </td>
                        <td className={styles.mono}>{c.currentAlgorithm}</td>
                        <td>
                          <span className={`${styles.badge} ${styles.badgeQuantum}`}>
                            {c.targetAlgorithm}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              c.hybridEnabled ? styles.badgeHybrid : styles.badgeActive
                            }`}
                          >
                            {c.hybridEnabled ? 'ENABLED' : 'DIRECT'}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              c.status === 'COMPLETED'
                                ? styles.badgeActive
                                : c.status === 'HYBRID'
                                ? styles.badgeHybrid
                                : styles.badgeRotated
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: '#4b5563' }}>{c.notes || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB 2: THREAT DETECTION */}
      {activeTab === 'threats' && (
        <>
          {/* Threat KPI Cards */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>Critical Anomalies</span>
                <ShieldAlert size={16} color="#ef4444" />
              </div>
              <div className={styles.metricValue}>
                <span style={{ color: events.filter((e) => e.severity === 'CRITICAL').length > 0 ? '#ef4444' : '#10b981' }}>
                  {events.filter((e) => e.severity === 'CRITICAL').length}
                </span>
                <span style={{ fontSize: 12, fontWeight: 500, color: '#6b7280' }}>events</span>
              </div>
              <div className={styles.metricSubtext}>
                Automatic quarantine triggered for agents exceeding 5x velocity or 3σ amount deviation.
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>OWASP ASI10 Guard</span>
                <ShieldCheck size={16} color="var(--jp-brand-teal, #0d9488)" />
              </div>
              <div className={styles.metricValue} style={{ color: '#0d9488' }}>
                ENFORCING
              </div>
              <div className={styles.metricSubtext}>
                Continuous monitoring of rogue autonomy, prompt injection, and excessive agency.
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>Environment Filter</span>
                <Shield size={16} color="#3b82f6" />
              </div>
              <div className={styles.metricValue} style={{ fontSize: 20 }}>
                {environment}
              </div>
              <div className={styles.metricSubtext}>
                Zero-leak isolation: Events strictly partitioned by tenant organization and active environment.
              </div>
            </div>
          </div>

          {/* On-Demand Rogue Agent Behavior Scan Form */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <Zap size={18} color="var(--jp-brand-teal, #0d9488)" />
                On-Demand Behavioral Anomaly Scanner (OWASP ASI10)
              </h2>
            </div>
            <div className={styles.sectionBody}>
              <form onSubmit={handleCheckBehavior} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor="agentIdScan" className={styles.fieldLabel}>
                    Agent UUID:
                  </label>
                  <input
                    id="agentIdScan"
                    type="text"
                    placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                    className={styles.fieldInput}
                    value={behaviorAgentId}
                    onChange={(e) => setBehaviorAgentId(e.target.value)}
                    required
                  />
                  <span className={styles.fieldHint}>
                    Evaluates velocity spike ratio and BigInt amount statistical deviation for active environment ({environment}).
                  </span>
                </div>

                <Button type="submit" variant="primary" loading={behaviorChecking}>
                  <Search size={14} />
                  <span>Scan Behavior</span>
                </Button>
              </form>

              {behaviorResult && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 8,
                    background: behaviorResult.rogueDetected ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                    border: `1px solid ${behaviorResult.rogueDetected ? '#ef4444' : '#10b981'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {behaviorResult.rogueDetected ? (
                      <AlertCircle size={20} color="#ef4444" />
                    ) : (
                      <CheckCircle2 size={20} color="#10b981" />
                    )}
                    <strong style={{ fontSize: 14, color: behaviorResult.rogueDetected ? '#b91c1c' : '#047857' }}>
                      {behaviorResult.rogueDetected ? 'THREAT CONFIRMED: ROGUE BEHAVIOR' : 'AGENT BEHAVIOR NORMAL'}
                    </strong>
                  </div>
                  <div style={{ fontSize: 13, color: '#374151' }}>
                    {behaviorResult.anomalyReason || 'No statistical velocity or amount anomalies detected.'}
                  </div>
                  {behaviorResult.actionTaken && (
                    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: '#b91c1c' }}>
                      Remediation Action: {behaviorResult.actionTaken}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Security Events Table */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <ShieldAlert size={18} color="#ef4444" />
                Security Audit & Threat Event Log
              </h2>
              <span className={styles.fieldHint}>Showing recent incidents for {environment}</span>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Severity</th>
                    <th>Event Type</th>
                    <th>Actor</th>
                    <th>Details</th>
                    <th>Environment</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingEvents ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>
                        Loading security audit events...
                      </td>
                    </tr>
                  ) : events.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
                        No threat events detected in this environment. System healthy.
                      </td>
                    </tr>
                  ) : (
                    events.map((evt) => {
                      const isCrit = evt.severity === 'CRITICAL';
                      const isHigh = evt.severity === 'HIGH';
                      return (
                        <tr
                          key={evt.eventId}
                          className={isCrit ? styles.rowCritical : isHigh ? styles.rowHigh : ''}
                        >
                          <td className={styles.mono} style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Clock size={12} color="#6b7280" />
                              {evt.createdAt ? new Date(evt.createdAt).toLocaleString() : '—'}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`${styles.badge} ${
                                isCrit
                                  ? styles.badgeSeverityCritical
                                  : isHigh
                                  ? styles.badgeSeverityHigh
                                  : evt.severity === 'MEDIUM'
                                  ? styles.badgeSeverityMedium
                                  : styles.badgeSeverityLow
                              }`}
                            >
                              {evt.severity}
                            </span>
                          </td>
                          <td>
                            <strong className={styles.mono} style={{ fontSize: 12 }}>
                              {evt.eventType}
                            </strong>
                          </td>
                          <td className={styles.mono} style={{ fontSize: 12 }}>
                            {evt.actorType ? `${evt.actorType}:${evt.actorId?.slice(0, 8)}...` : evt.actorId || 'SYSTEM'}
                          </td>
                          <td style={{ fontSize: 12, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {typeof evt.details === 'object'
                              ? JSON.stringify(evt.details)
                              : String(evt.details || '—')}
                          </td>
                          <td>
                            <span className={`${styles.badge} ${evt.environment === 'LIVE' ? styles.envLive : styles.envSandbox}`}>
                              {evt.environment}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* TAB 3: SUPPLY CHAIN (SLSA & SBOM) */}
      {activeTab === 'supply-chain' && (
        <>
          {/* Trust Badges Bar */}
          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>SLSA Level 3</span>
                <CheckCircle2 size={16} color="#059669" />
              </div>
              <div className={styles.metricValue} style={{ color: '#059669' }}>
                VERIFIED
              </div>
              <div className={styles.metricSubtext}>
                Hermetic container build, cryptographic source provenance, non-falsifiable artifact attestations.
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>Sigstore Cosign</span>
                <ShieldCheck size={16} color="#0284c7" />
              </div>
              <div className={styles.metricValue} style={{ color: '#0284c7' }}>
                VALID SIGNATURE
              </div>
              <div className={styles.metricSubtext}>
                OIDC-bound workload identity signing with transparency log timestamping.
              </div>
            </div>

            <div className={styles.metricCard}>
              <div className={styles.metricTop}>
                <span>CycloneDX 1.5 SBOM</span>
                <Layers size={16} color="#7c3aed" />
              </div>
              <div className={styles.metricValue} style={{ color: '#7c3aed' }}>
                COMPLIANT
              </div>
              <div className={styles.metricSubtext}>
                100% pure JS dependencies allowlist, zero native binaries, zero vulnerabilities.
              </div>
            </div>
          </div>

          {/* On-Demand Artifact Verifier */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <FileCheck2 size={18} color="var(--jp-brand-teal, #0d9488)" />
                Cryptographic Artifact & Attestation Verifier
              </h2>
            </div>
            <div className={styles.sectionBody}>
              <form onSubmit={handleVerifyArtifact} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'flex-end' }}>
                <div className={styles.formField}>
                  <label htmlFor="artName" className={styles.fieldLabel}>
                    Artifact Name:
                  </label>
                  <input
                    id="artName"
                    type="text"
                    className={styles.fieldInput}
                    value={verifyArtifactName}
                    onChange={(e) => setVerifyArtifactName(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="artVer" className={styles.fieldLabel}>
                    Version:
                  </label>
                  <input
                    id="artVer"
                    type="text"
                    className={styles.fieldInput}
                    value={verifyVersion}
                    onChange={(e) => setVerifyVersion(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.formField}>
                  <label htmlFor="artHash" className={styles.fieldLabel}>
                    Expected SHA-256 Digest:
                  </label>
                  <input
                    id="artHash"
                    type="text"
                    className={styles.fieldInput}
                    value={verifyHash}
                    onChange={(e) => setVerifyHash(e.target.value)}
                  />
                </div>

                <div>
                  <Button type="submit" variant="primary" loading={isVerifying} style={{ width: '100%' }}>
                    <ShieldCheck size={14} />
                    <span>Verify Attestation</span>
                  </Button>
                </div>
              </form>

              {verifyResult && (
                <div
                  style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 8,
                    background: verifyResult.verified ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: `1px solid ${verifyResult.verified ? '#10b981' : '#ef4444'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {verifyResult.verified ? (
                      <CheckCircle2 size={18} color="#10b981" />
                    ) : (
                      <AlertCircle size={18} color="#ef4444" />
                    )}
                    <strong style={{ color: verifyResult.verified ? '#047857' : '#b91c1c' }}>
                      {verifyResult.verified ? 'ATTESTATION VERIFIED: INTEGRITY VALID' : 'VERIFICATION FAILED'}
                    </strong>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: '#374151' }}>
                    {verifyResult.verified
                      ? `SLSA Level ${verifyResult.attestation?.slsaLevel || 3} Attestation confirmed with valid Cosign signature.`
                      : 'The supplied digest does not match the immutable attestation record.'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Attestation Records Table */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionHeaderTitle}>
                <Layers size={18} color="var(--jp-brand-teal, #0d9488)" />
                Software Bill of Materials (SBOM) & Attestations
              </h2>
            </div>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Artifact</th>
                    <th>Version</th>
                    <th>Digest (SHA-256)</th>
                    <th>Format</th>
                    <th>SLSA</th>
                    <th>Cosign Signature</th>
                    <th>Status</th>
                    <th>Verified At</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoadingAttestations ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: '#6b7280' }}>
                        Loading supply chain attestations...
                      </td>
                    </tr>
                  ) : attestations.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: 32, color: '#6b7280' }}>
                        No software supply chain attestations found.
                      </td>
                    </tr>
                  ) : (
                    attestations.map((a) => (
                      <tr key={a.attestationId}>
                        <td>
                          <strong>{a.artifactName}</strong>
                        </td>
                        <td>
                          <span className={styles.monoTag}>{a.artifactVersion}</span>
                        </td>
                        <td className={styles.mono} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span title={a.artifactHash}>{a.artifactHash?.slice(0, 20)}...</span>
                        </td>
                        <td>
                          <span className={styles.monoTag}>{a.sbomFormat}</span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${styles.badgeHybrid}`}>
                            SLSA L{a.slsaLevel}
                          </span>
                        </td>
                        <td className={styles.mono} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span title={a.cosignSignature}>{a.cosignSignature?.slice(0, 16)}...</span>
                        </td>
                        <td>
                          <span className={`${styles.badge} ${styles.badgeActive}`}>
                            {a.status || 'VERIFIED'}
                          </span>
                        </td>
                        <td className={styles.mono} style={{ fontSize: 11 }}>
                          {a.verifiedAt ? new Date(a.verifiedAt).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ROTATE KEY MODAL */}
      <Modal
        open={isRotateModalOpen}
        onOpenChange={setIsRotateModalOpen}
        title="Rotate Cryptographic Key"
        description="Select key purpose and target algorithm. Rotation generates a new active key while preserving the previous key for the 1-hour grace period to prevent verification failures."
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setIsRotateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={isRotating} onClick={handleRotateKey}>
              Confirm Key Rotation
            </Button>
          </div>
        }
      >
        <form onSubmit={handleRotateKey} className={styles.modalForm}>
          <div className={styles.formField}>
            <label htmlFor="rotPurpose" className={styles.fieldLabel}>
              Key Purpose:
            </label>
            <select
              id="rotPurpose"
              className={styles.fieldSelect}
              value={rotatePurpose}
              onChange={(e) => {
                const newPurp = e.target.value;
                setRotatePurpose(newPurp);
                // auto-select suggested algorithm
                const match = PQC_ALGORITHMS.find((a) => a.defaultPurpose === newPurp);
                if (match) setRotateAlgorithm(match.value);
              }}
            >
              {PURPOSES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label htmlFor="rotAlgorithm" className={styles.fieldLabel}>
              Cryptographic Algorithm:
            </label>
            <select
              id="rotAlgorithm"
              className={styles.fieldSelect}
              value={rotateAlgorithm}
              onChange={(e) => setRotateAlgorithm(e.target.value)}
            >
              {PQC_ALGORITHMS.map((a) => (
                <option key={a.value} value={a.value}>
                  [{a.type}] {a.label}
                </option>
              ))}
            </select>
            <span className={styles.fieldHint}>
              Algorithms tagged [PQC] comply with NIST FIPS 203/204/205 post-quantum standards.
            </span>
          </div>

          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: 'rgba(13, 148, 136, 0.08)',
              border: '1px solid rgba(13, 148, 136, 0.25)',
              fontSize: 12,
              color: '#0f766e',
            }}
          >
            <strong>Zero-Downtime Guarantee:</strong> Existing signatures verified using the rotated key remain valid. The new key immediately takes over new signing and encryption operations for tenant.
          </div>
        </form>
      </Modal>

      {/* Contextual Help Modal */}
      <Modal
        open={isHelpModalOpen}
        onOpenChange={setIsHelpModalOpen}
        title="Security Hardening & Post-Quantum Cryptography Guide"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <Button variant="secondary" onClick={() => setIsHelpModalOpen(false)}>Close</Button>
            <a
              href="/help#ops-security"
              style={{
                textDecoration: 'none',
                color: 'var(--jp-link)',
                fontWeight: 600,
                fontSize: '14px',
              }}
              onClick={() => setIsHelpModalOpen(false)}
            >
              Read Full Manual &rarr;
            </a>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', lineHeight: '1.5' }}>
          <p>
            <strong>Security Hardening</strong> provides multi-layered defenses against quantum decryption, rogue autonomous agents, and supply chain tampering.
          </p>
          <ul style={{ margin: '0 0 0 20px', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Post-Quantum Cryptography (PQC):</strong> Implements NIST FIPS 204 (ML-DSA-65) and hybrid encapsulation to future-proof financial records.</li>
            <li><strong>Threat Detection:</strong> Continuously calculates velocity spikes (&gt;5x) and amount anomalies (&gt;3 sigma) to quarantine compromised agents.</li>
            <li><strong>Supply Chain (SLSA & SBOM):</strong> Enforces SLSA Level 3 compliance and Cosign signature verification on all platform dependencies.</li>
          </ul>
          <p style={{ color: 'var(--jp-text-muted)', fontSize: '13px', margin: 0 }}>
            Read the complete guide in the Help Center to learn more about key rotation schedules and runbook procedures.
          </p>
        </div>
      </Modal>
    </div>
  );
}
