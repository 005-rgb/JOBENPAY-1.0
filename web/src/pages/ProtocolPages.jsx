// @ts-check
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Copy,
  ExternalLink,
  Trash2,
  RefreshCw,
  Send,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function StatusPill({ status }) {
  let styleClass = styles.badgeApproved;
  if (status === 'INVALID' || status === 'DENIED') styleClass = styles.badgeRejected;
  else if (status === 'INDETERMINATE') styleClass = styles.badgeEvaluating;
  else if (status === 'PENDING' || status === 'EXPIRED') styleClass = styles.badgeSandbox;

  return (
    <span className={`${styles.statusPill} ${styleClass}`}>
      {status}
    </span>
  );
}

export function ProofsPage() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['public-proofs', filterStatus],
    queryFn: () => apiClient.get(`/proofs${filterStatus !== 'ALL' ? `?status=${filterStatus}` : ''}`),
  });

  const revokeMutation = useMutation({
    mutationFn: (proofId) => apiClient.delete(`/proofs/${proofId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-proofs'] });
    },
  });

  const proofs = data?.proofs || [];

  const handleCopy = (url, id) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Public Authorization Proofs</h1>
          <p className={styles.pageSubtitle}>
            Cryptographically signed transaction proofs shared via Open Trust Exchange.
          </p>
        </div>
        <button className={styles.primaryButton} onClick={() => refetch()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
        {['ALL', 'ACTIVE', 'REVOKED', 'EXPIRED'].map((s) => (
          <button
            key={s}
            className={filterStatus === s ? styles.primaryButton : styles.secondaryButton}
            onClick={() => setFilterStatus(s)}
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Proof ID</th>
              <th>SAR ID</th>
              <th>Status</th>
              <th>Access Count</th>
              <th>Expires At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px' }}>Loading proofs...</td></tr>
            ) : proofs.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No proofs found.</td></tr>
            ) : (
              proofs.map((p) => (
                <tr key={p.proof_id}>
                  <td className={styles.mono} style={{ fontSize: '12px' }}>{p.proof_id.slice(0, 8)}...</td>
                  <td className={styles.mono} style={{ fontSize: '12px' }}>{p.sar_id}</td>
                  <td><StatusPill status={p.status} /></td>
                  <td>{p.access_count}</td>
                  <td style={{ fontSize: '12px' }}>{new Date(p.expires_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className={styles.secondaryButton}
                        style={{ padding: '4px 8px' }}
                        title="Copy Proof Link"
                        onClick={() => handleCopy(p.proof_url, p.proof_id)}
                      >
                        {copiedId === p.proof_id ? <CheckCircle2 size={14} color="#34d399" /> : <Copy size={14} />}
                      </button>
                      <a
                        href={p.proof_url}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.secondaryButton}
                        style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}
                        title="Open Proof"
                      >
                        <ExternalLink size={14} />
                      </a>
                      {p.status === 'ACTIVE' && (
                        <button
                          className={styles.secondaryButton}
                          style={{ padding: '4px 8px', color: '#f87171' }}
                          title="Revoke Proof"
                          onClick={() => {
                            if (window.confirm('Are you sure you want to revoke this public proof link?')) {
                              revokeMutation.mutate(p.proof_id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HandshakesPage() {
  const [filterStatus, setFilterStatus] = useState('ALL');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['trust-handshakes', filterStatus],
    queryFn: () => apiClient.get(`/handshakes${filterStatus !== 'ALL' ? `?status=${filterStatus}` : ''}`),
  });

  const handshakes = data?.handshakes || [];

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.pageTitle}>Trust Handshakes</h1>
          <p className={styles.pageSubtitle}>
            Pre-transaction cryptographic verification requests between autonomous agents.
          </p>
        </div>
        <button className={styles.primaryButton} onClick={() => refetch()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', margin: '16px 0' }}>
        {['ALL', 'PENDING', 'VERIFIED', 'DENIED', 'INDETERMINATE', 'EXPIRED'].map((s) => (
          <button
            key={s}
            className={filterStatus === s ? styles.primaryButton : styles.secondaryButton}
            onClick={() => setFilterStatus(s)}
            style={{ padding: '6px 12px', fontSize: '13px' }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Handshake ID</th>
              <th>Target Org</th>
              <th>Category</th>
              <th>Status</th>
              <th>Issued At</th>
              <th>Expires In</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px' }}>Loading handshakes...</td></tr>
            ) : handshakes.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>No trust handshakes found.</td></tr>
            ) : (
              handshakes.map((h) => (
                <tr key={h.handshake_id}>
                  <td className={styles.mono} style={{ fontSize: '12px' }}>{h.handshake_id.slice(0, 8)}...</td>
                  <td className={styles.mono} style={{ fontSize: '12px' }}>{h.target_org_id?.slice(0, 8)}...</td>
                  <td>{h.request_intent?.category || 'PAYOUT'}</td>
                  <td><StatusPill status={h.status} /></td>
                  <td style={{ fontSize: '12px' }}>{new Date(h.issued_at).toLocaleTimeString()}</td>
                  <td style={{ fontSize: '12px' }}>{new Date(h.expires_at) > new Date() ? 'Active' : 'Expired'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProtocolConformancePage() {
  const [sarInput, setSarInput] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError(null);
      const parsedSar = JSON.parse(sarInput);
      const res = await fetch('/v1/verify/receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sar: parsedSar, mode: 'online' }),
      });
      const data = await res.json();
      setVerificationResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>Open Trust Exchange Conformance Tester</h1>
      <p className={styles.pageSubtitle}>
        Paste a Signed Authorization Receipt (SAR v1.0) JSON artifact below to test cryptographic verification.
      </p>

      <div className={styles.formCard} style={{ maxWidth: '100%', marginTop: '20px' }}>
        <textarea
          rows={12}
          value={sarInput}
          onChange={(e) => setSarInput(e.target.value)}
          placeholder="Paste SAR v1.0 JSON here..."
          className={styles.mono}
          style={{ width: '100%', background: '#090d16', color: '#38bdf8', border: '1px solid #334155', borderRadius: '8px', padding: '12px', fontSize: '13px' }}
        />

        <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
          <button className={styles.primaryButton} onClick={handleVerify} disabled={loading || !sarInput.trim()}>
            {loading ? 'Verifying...' : 'Run Verification'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid #f87171', borderRadius: '8px', color: '#f87171' }}>
            {error}
          </div>
        )}

        {verificationResult && (
          <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>Verification Verdict</h3>
              <StatusPill status={verificationResult.status} />
            </div>

            <pre className={styles.mono} style={{ background: '#090d16', padding: '12px', borderRadius: '8px', fontSize: '12px' }}>
              {JSON.stringify(verificationResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default {
  ProofsPage,
  HandshakesPage,
  ProtocolConformancePage,
};
