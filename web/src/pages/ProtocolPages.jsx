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
  FileCheck2,
  Search,
  Lock,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { Button, EmptyState, Skeleton, useToast } from '../components/primitives.jsx';
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
  const { environment } = useEnvironment();
  const { notify } = useToast();
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [copiedId, setCopiedId] = useState(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['public-proofs', filterStatus, environment],
    queryFn: () => apiClient.get(`/proofs${filterStatus !== 'ALL' ? `?status=${filterStatus}` : ''}`),
  });

  const revokeMutation = useMutation({
    mutationFn: (proofId) => apiClient.delete(`/proofs/${proofId}`),
    onSuccess: () => {
      notify({
        title: 'Proof Revoked',
        message: 'Public authorization proof has been successfully revoked.',
        kind: 'info',
      });
      queryClient.invalidateQueries({ queryKey: ['public-proofs'] });
    },
    onError: (err) => {
      notify({
        title: 'Revocation Failed',
        message: err.message || 'Could not revoke public authorization proof.',
        kind: 'error',
      });
    },
  });

  const proofs = data?.proofs || [];

  const handleCopy = (url, id) => {
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    notify({
      title: 'Link Copied',
      message: 'Proof public URL copied to clipboard.',
      kind: 'info',
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldCheck size={26} color="var(--jp-brand-teal, #0d9488)" />
            <h1 className={styles.pageTitle}>Public Authorization Proofs</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>{environment}</span>
          </div>
          <p className={styles.pageSubtitle}>
            Cryptographically signed transaction proofs shared via Open Trust Exchange.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'spin' : ''} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', margin: '8px 0', flexWrap: 'wrap' }}>
        {['ALL', 'ACTIVE', 'REVOKED', 'EXPIRED'].map((s) => (
          <button
            key={s}
            className={filterStatus === s ? styles.primaryLink : styles.secondaryLink}
            onClick={() => setFilterStatus(s)}
            style={{ padding: '6px 14px', fontSize: '13px', cursor: 'pointer' }}
            type="button"
          >
            {s}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Proof ID</th>
                <th>SAR ID</th>
                <th>Status</th>
                <th>Access Count</th>
                <th>Expires At</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} style={{ padding: '16px' }}>
                      <Skeleton style={{ height: '24px', width: '100%' }} />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                      <AlertTriangle size={24} />
                      <strong>Failed to load authorization proofs</strong>
                      <span style={{ fontSize: '12px' }}>{error?.message || 'Network error'}</span>
                      <Button variant="secondary" size="sm" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : proofs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <EmptyState
                      icon={ShieldCheck}
                      title="No Authorization Proofs Found"
                      description={`No public authorization proofs found with status ${filterStatus} in ${environment} environment.`}
                    />
                  </td>
                </tr>
              ) : (
                proofs.map((p) => (
                  <tr key={p.proof_id}>
                    <td className={styles.mono} style={{ fontSize: '12px', fontWeight: 600 }}>
                      {p.proof_id.slice(0, 8)}...
                    </td>
                    <td className={styles.mono} style={{ fontSize: '12px' }}>
                      {p.sar_id}
                    </td>
                    <td>
                      <StatusPill status={p.status} />
                    </td>
                    <td>{p.access_count}</td>
                    <td style={{ fontSize: '12px' }}>
                      {p.expires_at ? new Date(p.expires_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px' }}>
                        <Button
                          variant="secondary"
                          size="sm"
                          style={{ padding: '4px 8px' }}
                          title="Copy Proof Link"
                          onClick={() => handleCopy(p.proof_url, p.proof_id)}
                        >
                          {copiedId === p.proof_id ? <CheckCircle2 size={14} color="#10b981" /> : <Copy size={14} />}
                        </Button>
                        <a
                          href={p.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.secondaryLink}
                          style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}
                          title="Open Proof"
                        >
                          <ExternalLink size={14} />
                        </a>
                        {p.status === 'ACTIVE' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ padding: '4px 8px', color: '#ef4444' }}
                            title="Revoke Proof"
                            loading={revokeMutation.isPending && revokeMutation.variables === p.proof_id}
                            disabled={revokeMutation.isPending}
                            onClick={() => {
                              if (window.confirm('Are you sure you want to revoke this public proof link?')) {
                                revokeMutation.mutate(p.proof_id);
                              }
                            }}
                          >
                            <Trash2 size={14} />
                          </Button>
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
    </div>
  );
}

export function HandshakesPage() {
  const { environment } = useEnvironment();
  const [filterStatus, setFilterStatus] = useState('ALL');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['trust-handshakes', filterStatus, environment],
    queryFn: () => apiClient.get(`/handshakes${filterStatus !== 'ALL' ? `?status=${filterStatus}` : ''}`),
  });

  const handshakes = data?.handshakes || [];

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileCheck2 size={26} color="var(--jp-brand-teal, #0d9488)" />
            <h1 className={styles.pageTitle}>Trust Handshakes</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>{environment}</span>
          </div>
          <p className={styles.pageSubtitle}>
            Pre-transaction cryptographic verification requests between autonomous agents.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'spin' : ''} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', margin: '8px 0', flexWrap: 'wrap' }}>
        {['ALL', 'PENDING', 'VERIFIED', 'DENIED', 'INDETERMINATE', 'EXPIRED'].map((s) => (
          <button
            key={s}
            className={filterStatus === s ? styles.primaryLink : styles.secondaryLink}
            onClick={() => setFilterStatus(s)}
            style={{ padding: '6px 14px', fontSize: '13px', cursor: 'pointer' }}
            type="button"
          >
            {s}
          </button>
        ))}
      </div>

      <div className={styles.tableCard}>
        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
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
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} style={{ padding: '16px' }}>
                      <Skeleton style={{ height: '24px', width: '100%' }} />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={6} style={{ padding: '32px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                      <AlertTriangle size={24} />
                      <strong>Failed to load trust handshakes</strong>
                      <span style={{ fontSize: '12px' }}>{error?.message || 'Network error'}</span>
                      <Button variant="secondary" size="sm" onClick={() => refetch()}>
                        Retry
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : handshakes.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <EmptyState
                      icon={FileCheck2}
                      title="No Trust Handshakes Found"
                      description={`No trust handshakes recorded with status ${filterStatus} in ${environment} mode.`}
                    />
                  </td>
                </tr>
              ) : (
                handshakes.map((h) => (
                  <tr key={h.handshake_id}>
                    <td className={styles.mono} style={{ fontSize: '12px', fontWeight: 600 }}>
                      {h.handshake_id.slice(0, 8)}...
                    </td>
                    <td className={styles.mono} style={{ fontSize: '12px' }}>
                      {h.target_org_id?.slice(0, 8)}...
                    </td>
                    <td>{h.request_intent?.category || 'PAYOUT'}</td>
                    <td>
                      <StatusPill status={h.status} />
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {h.issued_at ? new Date(h.issued_at).toLocaleTimeString() : '—'}
                    </td>
                    <td style={{ fontSize: '12px' }}>
                      {h.expires_at && new Date(h.expires_at) > new Date() ? 'Active' : 'Expired'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ProtocolConformancePage() {
  const [sarInput, setSarInput] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { notify } = useToast();

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError(null);
      const parsedSar = JSON.parse(sarInput);
      const data = await apiClient.post('/verify/receipt', { sar: parsedSar, mode: 'online' });
      setVerificationResult(data);
      notify({
        title: data.status === 'VERIFIED' ? 'Conformance Passed' : 'Verification Received',
        message: `Cryptographic SAR verification completed with status: ${data.status || 'PROCESSED'}`,
        kind: data.status === 'VERIFIED' ? 'info' : 'warning',
      });
    } catch (err) {
      setError(err.message);
      notify({
        title: 'Verification Failed',
        message: err.message || 'Failed to verify SAR receipt.',
        kind: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={26} color="var(--jp-brand-teal, #0d9488)" />
            <h1 className={styles.pageTitle}>Open Trust Exchange Conformance Tester</h1>
          </div>
          <p className={styles.pageSubtitle}>
            Paste a Signed Authorization Record (SAR v1.1) JSON artifact below to test cryptographic verification.
          </p>
        </div>
      </div>

      <div className={styles.formCard} style={{ maxWidth: '100%', marginTop: '12px' }}>
        <textarea
          rows={12}
          value={sarInput}
          onChange={(e) => setSarInput(e.target.value)}
          placeholder="Paste SAR JSON here..."
          className={styles.mono}
          style={{
            width: '100%',
            background: 'var(--jp-surface-sunken, #090d16)',
            color: 'var(--jp-text, #38bdf8)',
            border: '1px solid var(--jp-border, #334155)',
            borderRadius: '8px',
            padding: '12px',
            fontSize: '13px',
          }}
        />

        <div style={{ marginTop: '12px', display: 'flex', gap: '12px' }}>
          <Button
            variant="primary"
            onClick={handleVerify}
            loading={loading}
            disabled={loading || !sarInput.trim()}
          >
            Run Cryptographic Verification
          </Button>
        </div>

        {error && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444' }}>
            {error}
          </div>
        )}

        {verificationResult && (
          <div style={{ marginTop: '20px', borderTop: '1px solid var(--jp-border)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h3 style={{ margin: 0 }}>Verification Verdict</h3>
              <StatusPill status={verificationResult.status} />
            </div>

            <pre className={styles.mono} style={{ background: 'var(--jp-surface-sunken, #090d16)', padding: '12px', borderRadius: '8px', fontSize: '12px', overflowX: 'auto' }}>
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
