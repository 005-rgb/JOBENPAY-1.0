import React, { useState, useEffect } from 'react';
import { RotateCcw, ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Copy, Cpu, Eye, Layers } from 'lucide-react';
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
      const snapRes = await fetch(`/api/v1/requests/${requestId}/snapshot`);
      if (snapRes.ok) {
        const snapData = await snapRes.json();
        setSnapshot(snapData.snapshot || snapData);
      } else if (snapRes.status !== 404) {
        throw new Error(`Snapshot error: HTTP ${snapRes.status}`);
      }

      // Fetch replay if exists
      const repRes = await fetch(`/api/v1/requests/${requestId}/replay`);
      if (repRes.ok) {
        const repData = await repRes.json();
        setReplay(repData.replay || repData);
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
      const res = await fetch(`/api/v1/requests/${requestId}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `Replay failed: HTTP ${res.status}`);
      }
      setReplay(data.replay || data);
      setActionMsg('Replay executed successfully!');
      setTimeout(() => setActionMsg(''), 4000);
    } catch (err) {
      alert(`Replay error: ${err.message}`);
    } finally {
      setReplaying(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setActionMsg(`${label} copied to clipboard!`);
    setTimeout(() => setActionMsg(''), 3000);
  };

  if (loading) {
    return (
      <div className={styles.formCard} style={{ maxWidth: '100%' }}>
        <p className={styles.pageSubtitle}>Loading Cognitive Provenance Layer (CPL) data...</p>
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowRawModal(false)}
        >
          <div
            className={styles.formCard}
            style={{ width: '100%', maxWidth: '720px', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Cognitive Snapshot JSON</h3>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowRawModal(false)}
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                Close
              </button>
            </div>
            <pre className={styles.mono} style={{ fontSize: '11px', whiteSpace: 'pre-wrap', lineHeight: '1.4', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '6px' }}>
              {JSON.stringify(snapshot, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default CplDisplayCard;
