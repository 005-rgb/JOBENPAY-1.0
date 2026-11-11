import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Copy, Cpu, Eye, Layers, RefreshCw, HelpCircle, X } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { Button, EmptyState, Modal, Skeleton, useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

/**
 * Circular score gauge for Reproducibility Score (RS: 0 - 100) per PRD 1.7 §8.1
 */
export function RsGauge({ score = 0, size = 110 }) {
  const radius = size * 0.4;
  const strokeWidth = size * 0.08;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let strokeColor = '#10b981'; // green >= 90
  if (score < 70) {
    strokeColor = '#ef4444'; // red < 70
  } else if (score < 90) {
    strokeColor = '#f59e0b'; // yellow 70 - 89
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: `${size * 0.28}px`, fontWeight: 'bold', color: strokeColor }}>
          {score}
        </span>
        <span style={{ fontSize: `${size * 0.11}px`, color: 'var(--jp-text-muted)', textTransform: 'uppercase' }}>
          RS / 100
        </span>
      </div>
    </div>
  );
}

/**
 * Cognitive Provenance Layer (CPL) Display Card
 * Displays Cognitive Snapshot and allows Deterministic Replay (PRD 1.7 §8.1)
 */
export function CplDisplayCard({ requestId }) {
  const { notify } = useToast();
  const [snapshot, setSnapshot] = useState(null);
  const [replay, setReplay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState('');
  const [showRawModal, setShowRawModal] = useState(false);

  const fetchData = async () => {
    if (!requestId) return;
    try {
      setLoading(true);
      setError(null);

      // Fetch snapshot
      try {
        const snapData = await apiClient.get(`/requests/${requestId}/snapshot`);
        setSnapshot(snapData.snapshot || snapData);
      } catch (err) {
        if (err.status !== 404) throw err;
      }

      // Fetch replay if exists
      try {
        const repData = await apiClient.get(`/requests/${requestId}/replay`);
        setReplay(repData.replay || repData);
      } catch {
        // ignore 404 replay
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [requestId]);

  const handleRunReplay = async () => {
    try {
      setReplaying(true);
      setActionMsg('');
      const data = await apiClient.post(`/requests/${requestId}/replay`, {});
      setReplay(data.replay || data);
      setActionMsg('Replay executed successfully!');
      notify({
        title: 'Replay Executed',
        message: 'Cognitive Provenance replay executed successfully.',
        kind: 'info',
      });
      setTimeout(() => setActionMsg(''), 4000);
    } catch (err) {
      notify({
        title: 'Replay Failed',
        message: err.message || 'Failed to execute replay.',
        kind: 'error',
      });
    } finally {
      setReplaying(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard?.writeText(text);
    setActionMsg(`${label} copied to clipboard!`);
    notify({
      title: 'Copied',
      message: `${label} copied to clipboard.`,
      kind: 'info',
    });
    setTimeout(() => setActionMsg(''), 3000);
  };

  if (loading) {
    return (
      <div className={styles.formCard} style={{ maxWidth: '100%' }}>
        <Skeleton style={{ height: '32px', width: '280px', marginBottom: '12px' }} />
        <Skeleton style={{ height: '120px', width: '100%' }} />
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className={styles.formCard} style={{ maxWidth: '100%' }} data-testid="cpl-empty-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--jp-text-muted)' }}>
          <AlertTriangle size={18} />
          <span>No Cognitive Snapshot record found for this transaction.</span>
        </div>
      </div>
    );
  }

  const model = snapshot.model || {};
  const rs = replay?.reproducibility_score ?? 100;
  const rsStatus = replay?.decision || snapshot.outputs?.decision || 'APPROVED';

  const compDecision = replay?.components?.decision_match ?? 1.0;
  const compReasoning = replay?.components?.reasoning_match ?? 1.0;
  const compRaw = replay?.components?.raw_output_match ?? 1.0;

  return (
    <div className={styles.formCard} style={{ maxWidth: '100%' }} data-testid="cpl-display-card">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={18} color="var(--jp-success)" />
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Cognitive Provenance Layer (CPL v1.0)</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {actionMsg && (
            <span style={{ fontSize: '12px', color: 'var(--jp-success)' }}>{actionMsg}</span>
          )}
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setShowRawModal(true)}
            style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Eye size={13} /> View Snapshot JSON
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleRunReplay}
            disabled={replaying}
            style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
            data-testid="cpl-replay-btn"
          >
            <RotateCcw size={13} className={replaying ? 'animate-spin' : ''} />
            {replaying ? 'Replaying...' : 'Replay Decision'}
          </button>
        </div>
      </div>

      {/* Main Score & Component Breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '24px', alignItems: 'center', margin: '20px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <RsGauge score={rs} size={120} />
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
            Reproducibility
          </span>
          <span className={`${styles.providerBadge} ${rs >= 90 ? styles.badgeSandbox : rs >= 70 ? styles.badgeSimulated : styles.badgeFailed}`}>
            {rs >= 90 ? 'REPRODUCIBLE' : rs >= 70 ? 'REQUIRE APPROVAL' : 'CRITICAL DIVERGENCE'}
          </span>
        </div>

        {/* Breakdown Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Decision Match */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>Decision Consistency <span style={{ color: 'var(--jp-text-muted)' }}>(50% weight)</span></span>
              <span style={{ fontWeight: 'bold' }}>{(compDecision * 100).toFixed(0)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${compDecision * 100}%`,
                  height: '100%',
                  background: compDecision === 1 ? '#10b981' : '#ef4444',
                  borderRadius: '4px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>

          {/* Reasoning Match */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>Reasoning Semantic Trace <span style={{ color: 'var(--jp-text-muted)' }}>(30% weight)</span></span>
              <span style={{ fontWeight: 'bold' }}>{(compReasoning * 100).toFixed(0)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${compReasoning * 100}%`,
                  height: '100%',
                  background: compReasoning === 1 ? '#10b981' : compReasoning >= 0.5 ? '#f59e0b' : '#ef4444',
                  borderRadius: '4px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>

          {/* Raw Match */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <span>Deterministic Raw Output Hash <span style={{ color: 'var(--jp-text-muted)' }}>(20% weight)</span></span>
              <span style={{ fontWeight: 'bold' }}>{(compRaw * 100).toFixed(0)}%</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${compRaw * 100}%`,
                  height: '100%',
                  background: compRaw === 1 ? '#10b981' : '#ef4444',
                  borderRadius: '4px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot Metadata Grid */}
      <div style={{ marginTop: '16px', borderTop: '1px solid var(--jp-border)', paddingTop: '16px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Cognitive Snapshot Identification</h3>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Snapshot ID</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className={styles.mono} style={{ fontSize: '12px' }}>{snapshot.snapshot_id}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(snapshot.snapshot_id, 'Snapshot ID')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jp-text-muted)' }}
              >
                <Copy size={13} />
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Canonical Snapshot Hash (RFC 8785)</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className={styles.mono} style={{ fontSize: '11px' }}>
                {snapshot.snapshot_hash ? `${snapshot.snapshot_hash.slice(0, 24)}...` : '—'}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(snapshot.snapshot_hash, 'Snapshot Hash')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--jp-text-muted)' }}
              >
                <Copy size={13} />
              </button>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Model Engine & Version</span>
            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
              {model.model_id} <span style={{ fontWeight: 'normal', color: 'var(--jp-text-muted)' }}>({model.model_version})</span>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Seed & Determinism</span>
            <div className={styles.mono} style={{ fontSize: '12px' }}>
              seed: {model.seed ?? 42} · temp: {model.temperature ?? 0}
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Ed25519 Cryptographic Proof</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={14} color="#10b981" />
              <span className={styles.mono} style={{ fontSize: '11px', color: '#10b981' }}>
                {snapshot.signature ? 'VALID SIGNATURE' : 'UNSIGNED'}
              </span>
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Replay Execution Timestamp</span>
            <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
              {replay?.replayed_at ? new Date(replay.replayed_at).toLocaleString() : 'Pending live replay'}
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot Raw Modal */}
      {showRawModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowRawModal(false)}
        >
          <div
            className={styles.modalBox}
            style={{ maxWidth: '720px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Cpu size={18} color="var(--jp-brand-teal, #0d9488)" />
                <span>Cognitive Snapshot JSON</span>
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowRawModal(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <pre className={styles.mono} style={{ fontSize: '11px', whiteSpace: 'pre-wrap', lineHeight: '1.4', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', maxHeight: '60vh', overflowY: 'auto' }}>
              {JSON.stringify(snapshot, null, 2)}
            </pre>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryLink}
                onClick={() => setShowRawModal(false)}
                style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Cognitive Provenance Layer (CPL) Hub Page (PRD 1.7)
 */
export function CplPage({ initialTab = 'snapshots' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const { environment } = useEnvironment();
  const [filterScore, setFilterScore] = useState('ALL');
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);

  // Replay Studio State
  const [targetRequestId, setTargetRequestId] = useState('');
  const [activeReplayId, setActiveReplayId] = useState('');

  const { data, isLoading: loading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['cpl-snapshots', environment],
    queryFn: () => apiClient.get('/cpl/snapshots'),
  });

  const snapshots = data?.snapshots || [];

  const handleRunReplayFromTable = (requestId) => {
    setTargetRequestId(requestId);
    setActiveReplayId(requestId);
    setActiveTab('replay');
  };

  const filteredSnapshots = snapshots.filter((s) => {
    const score = s.reproducibility_score ?? 100;
    if (filterScore === 'HIGH') return score >= 90;
    if (filterScore === 'MID') return score >= 70 && score < 90;
    if (filterScore === 'LOW') return score < 70;
    return true;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Cpu size={24} color="#10b981" />
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
              Cognitive Provenance Layer (CPL)
            </h1>
            <span className={styles.providerBadge} style={{ background: '#0a2b9e', color: '#fff' }}>
              REPLAY ENGINE
            </span>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Proving that AI agent decisions are cryptographically reproducible from the same ground-truth data, model, and parameters.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsHelpOpen(true)}
            title="Module Guide & Help"
          >
            <HelpCircle size={14} />
            <span>Help</span>
          </Button>
          <button
            type="button"
            className={styles.primaryLink}
            onClick={() => {
              setActiveTab('replay');
              if (snapshots.length > 0 && !targetRequestId) {
                setTargetRequestId(snapshots[0].request_id);
                setActiveReplayId(snapshots[0].request_id);
              }
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RotateCcw size={14} /> Open Replay Studio
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--jp-border)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('snapshots')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'snapshots' ? '2px solid var(--jp-primary)' : '2px solid transparent',
            color: activeTab === 'snapshots' ? 'var(--jp-text)' : 'var(--jp-text-muted)',
            fontWeight: activeTab === 'snapshots' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Cognitive Snapshots & Provenance Ledger ({snapshots.length})
        </button>
        <button
          onClick={() => setActiveTab('replay')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'replay' ? '2px solid var(--jp-primary)' : '2px solid transparent',
            color: activeTab === 'replay' ? 'var(--jp-text)' : 'var(--jp-text-muted)',
            fontWeight: activeTab === 'replay' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Deterministic Replay Studio
        </button>
      </div>

      {/* Tab 1: Snapshots List */}
      {activeTab === 'snapshots' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {[
              { id: 'ALL', label: 'All Snapshots' },
              { id: 'HIGH', label: 'Reproducible (RS ≥ 90)' },
              { id: 'MID', label: 'Require Approval (70-89)' },
              { id: 'LOW', label: 'Divergent (RS < 70)' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterScore(f.id)}
                className={filterScore === f.id ? styles.primaryLink : styles.secondaryLink}
                style={{ padding: '4px 12px', height: '32px', fontSize: '12px' }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className={styles.tableCard}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Snapshot ID</th>
                  <th>Request ID</th>
                  <th>Model & Engine</th>
                  <th>Parameters</th>
                  <th>Reproducibility Score</th>
                  <th>Ed25519 Proof</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} style={{ padding: '16px' }}>
                        <Skeleton style={{ height: '24px', width: '100%' }} />
                      </td>
                    </tr>
                  ))
                ) : filteredSnapshots.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <EmptyState
                        icon={Cpu}
                        title="No Cognitive Snapshots Found"
                        description={`No cognitive provenance snapshots recorded in ${environment} environment.`}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredSnapshots.map((item) => {
                    const score = item.reproducibility_score ?? 100;
                    return (
                      <tr key={item.snapshot_id || item.request_id}>
                        <td className={styles.mono} style={{ fontSize: '12px' }}>
                          {item.snapshot_id ? `${item.snapshot_id.slice(0, 10)}...` : '—'}
                        </td>
                        <td className={styles.mono} style={{ fontSize: '12px' }}>
                          <a href={`/transactions/${item.request_id}`} style={{ color: 'var(--jp-primary)' }}>
                            {item.request_id?.slice(0, 8)}...
                          </a>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <strong>{item.model?.model_id || 'simulated-engine'}</strong>
                          <span style={{ color: 'var(--jp-text-muted)' }}> ({item.model?.model_version || '1.0'})</span>
                        </td>
                        <td className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                          seed: {item.model?.seed ?? 42} · temp: {item.model?.temperature ?? 0}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 'bold', fontSize: '13px', color: score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444' }}>
                              {score} / 100
                            </span>
                            <span className={`${styles.providerBadge} ${score >= 90 ? styles.badgeSandbox : score >= 70 ? styles.badgeSimulated : styles.badgeFailed}`}>
                              {score >= 90 ? 'REPRODUCIBLE' : score >= 70 ? 'NEEDS APPROVAL' : 'DIVERGENT'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', color: item.signature ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldCheck size={13} /> {item.signature ? 'Signed' : 'Unsigned'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className={styles.secondaryLink}
                              onClick={() => setSelectedSnapshot(item)}
                              style={{ padding: '2px 8px', height: '28px', fontSize: '11px' }}
                            >
                              <Eye size={12} /> JSON
                            </button>
                            <button
                              type="button"
                              className={styles.primaryLink}
                              onClick={() => handleRunReplayFromTable(item.request_id)}
                              style={{ padding: '2px 10px', height: '28px', fontSize: '11px', gap: '4px' }}
                            >
                              <RotateCcw size={11} /> Replay
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Deterministic Replay Studio */}
      {activeTab === 'replay' && (
        <div>
          <div className={styles.formCard} style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>Target Request Replay Runner</h2>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <input
                  type="text"
                  className={styles.inputField}
                  placeholder="Enter Request ID UUID (e.g. 550e8400-e29b-41d4-a716-446655440000)"
                  value={targetRequestId}
                  onChange={(e) => setTargetRequestId(e.target.value.trim())}
                />
              </div>
              <button
                type="button"
                className={styles.primaryLink}
                onClick={() => setActiveReplayId(targetRequestId)}
                disabled={!targetRequestId}
                style={{ height: '40px', padding: '0 20px' }}
              >
                Load Snapshot & Replay
              </button>
            </div>
            {snapshots.length > 0 && (
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                <span>Quick Select from recent snapshots: </span>
                {snapshots.slice(0, 4).map((s) => (
                  <button
                    key={s.request_id}
                    type="button"
                    onClick={() => {
                      setTargetRequestId(s.request_id);
                      setActiveReplayId(s.request_id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--jp-primary)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      marginRight: '8px',
                      fontSize: '12px',
                    }}
                  >
                    {s.request_id.slice(0, 8)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {activeReplayId ? (
            <CplDisplayCard requestId={activeReplayId} />
          ) : (
            <div className={styles.formCard} style={{ textAlign: 'center', padding: '40px' }}>
              <Cpu size={40} color="var(--jp-text-muted)" style={{ margin: '0 auto 12px auto' }} />
              <p style={{ margin: 0, color: 'var(--jp-text-muted)' }}>
                Select a snapshot from the ledger or enter a Request ID above to execute deterministic cognitive replay.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Selected Snapshot JSON Modal */}
      {selectedSnapshot && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedSnapshot(null)}
        >
          <div
            className={styles.modalBox}
            style={{ maxWidth: '720px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Layers size={18} color="var(--jp-brand-teal, #0d9488)" />
                <span>Cognitive Snapshot Details</span>
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedSnapshot(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <pre className={styles.mono} style={{ fontSize: '11px', background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px', overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
              {JSON.stringify(selectedSnapshot, null, 2)}
            </pre>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryLink}
                onClick={() => setSelectedSnapshot(null)}
                style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Help Modal */}
      <Modal
        open={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        title="Cognitive Provenance Layer (CPL) Guide"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <Button variant="secondary" onClick={() => setIsHelpOpen(false)}>Close</Button>
            <a
              href="/help#ai-cpl"
              className={styles.primaryLink}
              style={{ textDecoration: 'none' }}
              onClick={() => setIsHelpOpen(false)}
            >
              Read Full Manual &rarr;
            </a>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', lineHeight: '1.5' }}>
          <p>
            <strong>Cognitive Provenance Layer (CPL)</strong> captures immutable snapshots of AI memory, prompt context, and execution parameters for regulatory audit.
          </p>
          <ul style={{ margin: '0 0 0 20px', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Cognitive Snapshots:</strong> Captures model metadata, temperature, prompt hashes, and retrieved grounding documents.</li>
            <li><strong>Deterministic Replay Engine:</strong> Re-executes past decisions through the evaluation pipeline in an isolated sandbox.</li>
            <li><strong>Reproducibility Score (RS: 0–100):</strong> Flags non-deterministic model drift if the replay score falls below 95%.</li>
          </ul>
          <p style={{ color: 'var(--jp-text-muted)', fontSize: '13px', margin: 0 }}>
            Read the complete guide in the Help Center to learn how CPL connects with DIP and Signed Authorization Receipts.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export default {
  RsGauge,
  CplDisplayCard,
  CplPage,
};
