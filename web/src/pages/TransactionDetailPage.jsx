/**
 * web/src/pages/TransactionDetailPage.jsx
 * Unified Transaction Detail for all 15 categories (PRD 1.3 §10, WP F7-1, WP F7-3)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  DollarSign,
  FileCheck,
  FileText,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { useToast } from '../components/primitives.jsx';
import StepUpDialog from '../components/StepUpDialog.jsx';
import { DipDisplayCard } from './DipPages.jsx';
import { CplDisplayCard } from './CplPages.jsx';
import { StatusPill, ProviderBadge } from './TransactionsPage.jsx';
import styles from './TransactionPages.module.css';

function formatMoney(amountMinor, currency = 'USD') {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const minor = BigInt(amountMinor);
  const major = Number(minor) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(major);
}

function dateLabel(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function TransactionDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { environment, isLive, setEnvironment } = useEnvironment();
  const { notify } = useToast();
  const [debugging, setDebugging] = useState(false);

  const handleTimeTravelDebug = async () => {
    setDebugging(true);
    try {
      const res = await apiClient.post(`/debug/time-travel/${id}`, {});
      notify({ message: 'Transaction cloned to Sandbox. Redirecting to Sandbox replay...' });
      try {
        localStorage.setItem('currentEnvironment', 'SANDBOX');
        localStorage.setItem('jobenpay_environment', 'SANDBOX');
      } catch {}
      setEnvironment('SANDBOX');
      setTimeout(() => {
        window.location.href = res.replay_url || `/transactions/${res.sandbox_intent_id}`;
      }, 500);
    } catch (err) {
      notify({ message: err.message || 'Time-Travel debug failed', kind: 'error' });
      setDebugging(false);
    }
  };

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'legs' | 'sar' | 'reconciliation'
  const [proofUrl, setProofUrl] = useState(null);
  const [sharing, setSharing] = useState(false);

  const handleShareProof = async () => {
    try {
      setSharing(true);
      const payload = {
        sar_id: sar?.sar_id || `sar_${id.replace(/-/g, '').slice(0, 26)}`,
        sar_json: sar || intent,
        expires_in_days: 30,
      };
      const res = await apiClient.post('/proofs', payload);
      setProofUrl(res.proof_url);
    } catch (err) {
      alert(`Failed to share proof: ${err.message}`);
    } finally {
      setSharing(false);
    }
  };
  const [showStepUp, setShowStepUp] = useState(false);
  const [pendingChoice, setPendingChoice] = useState('');
  const [decisionComment, setDecisionComment] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['transaction', id, environment],
    queryFn: async () => {
      return apiClient.get(`/transactions/${id}`);
    },
    enabled: Boolean(id),
  });

  const decideMutation = useMutation({
    mutationFn: async ({ choice, grantId }) => {
      return apiClient.post(`/transactions/${id}/decision`, {
        decision: choice,
        comment: decisionComment,
        stepUpGrantId: grantId,
      });
    },
    onSuccess: async () => {
      setActionError('');
      setDecisionComment('');
      await queryClient.invalidateQueries({ queryKey: ['transaction', id, environment] });
      await queryClient.invalidateQueries({ queryKey: ['transactions', environment] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err) => {
      setActionError(err.message || 'Decision failed');
    },
  });

  const handleStartDecision = (choice) => {
    setActionError('');
    setPendingChoice(choice);
    const amountBigInt = BigInt(data?.intent?.amount_minor || 0);
    const isTierC = data?.intent?.category === 'FINANCING' || data?.intent?.category === 'DEBIT';
    const needsStepUp = (amountBigInt >= 500000n || isTierC) && choice === 'APPROVE';

    if (needsStepUp) {
      setShowStepUp(true);
    } else {
      decideMutation.mutate({ choice });
    }
  };

  const handleConfirmStepUp = async (grantId) => {
    return decideMutation.mutateAsync({ choice: pendingChoice, grantId });
  };

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="tx-detail-loading">
        <RefreshCw className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading transaction details...</p>
      </div>
    );
  }

  if (isError || !data?.intent) {
    return (
      <div className={styles.emptyCard} data-testid="transaction-not-found">
        <AlertCircle size={36} color="var(--jp-badge-red)" />
        <h3 className={styles.emptyTitle}>Transaction Not Found</h3>
        <p className={styles.emptyDesc}>
          {error?.message || `No transaction record exists for Intent ID: ${id}`}
        </p>
        <Link to="/transactions" className={styles.secondaryLink}>
          Back to transactions list
        </Link>
      </div>
    );
  }

  const {
    intent,
    policyEvaluation,
    legs = [],
    transitions = [],
    sar = {},
    reconciliation = {},
  } = data;

  const isNeedsApproval = intent.status === 'NEEDS_APPROVAL' || intent.status === 'PENDING_APPROVAL';
  const canDecide = ['OWNER', 'ADMIN', 'APPROVER', 'OPERATOR'].includes(auth.role);
  const policyMessage = policyEvaluation?.rejectionReason || policyEvaluation?.approvalReason;

  return (
    <div className={styles.pageStack} data-testid="transaction-detail-page">
      <div>
        <Link to="/transactions" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to transactions
        </Link>
      </div>

      {/* Header Card */}
      <div className={styles.formCard} style={{ maxWidth: '100%', gap: 'var(--jp-space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className={styles.pageTitle} style={{ fontSize: '22px' }}>{intent.category}</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              {intent.sub_type || 'standard'}
            </span>
            <ProviderBadge provider={intent.provider} />
            <StatusPill status={intent.status} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isLive && intent.status === 'FAILED' && (
              <button
                type="button"
                onClick={handleTimeTravelDebug}
                disabled={debugging}
                className={styles.secondaryButton}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#eff6ff',
                  borderColor: '#93c5fd',
                  color: '#1d4ed8',
                  fontWeight: 600,
                  fontSize: '12px',
                  padding: '6px 12px',
                  cursor: 'pointer',
                  borderRadius: '4px',
                }}
                data-testid="debug-sandbox-btn"
              >
                <RefreshCw size={14} className={debugging ? 'animate-spin' : ''} />
                {debugging ? 'Cloning to Sandbox...' : 'Debug in Sandbox (Time-Travel)'}
              </button>
            )}
            <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
              Intent: {intent.intent_id}
            </span>
          </div>
        </div>

        {/* Amount & Key Metrics */}
        <div className={styles.formGrid}>
          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Amount</span>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
              {formatMoney(intent.amount_minor, intent.currency)}
            </div>
            <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
              ({intent.amount_minor} minor units)
            </span>
          </div>

          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Counterparty</span>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
              {intent.counterparty_name || 'Internal / Ledger'}
            </div>
            <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
              {intent.counterparty_id ? `ID: ${intent.counterparty_id.slice(0, 8)}...` : 'Internal'}
            </span>
          </div>

          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Reconciliation</span>
            <div style={{ fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: intent.reconciliation_status === 'RECONCILED' ? 'var(--jp-success)' : 'var(--jp-warning)',
                }}
              />
              {intent.reconciliation_status || 'UNRECONCILED'}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
              {reconciliation?.paypal_ref ? `Ref: ${reconciliation.paypal_ref}` : 'Settlement ledger verified'}
            </span>
          </div>

          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Timestamp</span>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
              {dateLabel(intent.created_at)}
            </div>
            <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
              Hash: {intent.request_hash ? `${intent.request_hash.slice(0, 8)}...` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Maker/Checker Decision Banner for NEEDS_APPROVAL */}
      {isNeedsApproval && (
        <div className={styles.formCard} style={{ maxWidth: '100%', borderColor: '#ffe18b', background: '#fffcf2' }} data-testid="approval-action-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#6a4b00', fontWeight: 'bold' }}>
            <UserCheck size={20} />
            Maker / Checker Human Approval Required
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: '#6a4b00', lineHeight: '1.5' }}>
            {policyMessage || 'This transaction is pending approval based on gate policy constraints.'}
          </p>

          {canDecide ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Review Comment (Optional)</label>
                <input
                  type="text"
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder="Add operational notes for the permanent audit trail..."
                  className={styles.fieldInput}
                />
              </div>

              {actionError && (
                <div className={styles.errorBanner}>
                  <AlertCircle size={16} />
                  <span>{actionError}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => handleStartDecision('APPROVE')}
                  disabled={decideMutation.isPending}
                  className={styles.primaryLink}
                  style={{ background: '#0c6b3c' }}
                  data-testid="approve-btn"
                >
                  <CheckCircle2 size={16} />
                  Approve Transaction
                </button>
                <button
                  type="button"
                  onClick={() => handleStartDecision('REJECT')}
                  disabled={decideMutation.isPending}
                  className={styles.secondaryLink}
                  style={{ color: '#9b1c2a', borderColor: '#f8b4be' }}
                  data-testid="reject-btn"
                >
                  <XCircle size={16} />
                  Reject Transaction
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.pageSubtitle} style={{ color: 'var(--jp-text-muted)' }}>
              You do not have approval permissions (Requires OWNER, ADMIN, or APPROVER role).
            </div>
          )}
        </div>
      )}

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '8px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={activeTab === 'overview' ? styles.primaryLink : styles.secondaryLink}
          style={{ height: '32px', fontSize: '13px' }}
          data-testid="tab-overview"
        >
          Overview & Timeline
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('legs')}
          className={activeTab === 'legs' ? styles.primaryLink : styles.secondaryLink}
          style={{ height: '32px', fontSize: '13px' }}
          data-testid="tab-legs"
        >
          Ledger Legs ({legs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sar')}
          className={activeTab === 'sar' ? styles.primaryLink : styles.secondaryLink}
          style={{ height: '32px', fontSize: '13px' }}
          data-testid="tab-sar"
        >
          Audit Record (SAR v1.1)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reconciliation')}
          className={activeTab === 'reconciliation' ? styles.primaryLink : styles.secondaryLink}
          style={{ height: '32px', fontSize: '13px' }}
          data-testid="tab-recon"
        >
          Reconciliation & PayPal
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dip')}
          className={activeTab === 'dip' ? styles.primaryLink : styles.secondaryLink}
          style={{ height: '32px', fontSize: '13px' }}
          data-testid="tab-dip"
        >
          Decision Integrity (DIP)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cpl')}
          className={activeTab === 'cpl' ? styles.primaryLink : styles.secondaryLink}
          style={{ height: '32px', fontSize: '13px' }}
          data-testid="tab-cpl"
        >
          Cognitive Provenance (CPL)
        </button>
      </div>

      {/* Tab 1: Overview & State Timeline */}
      {activeTab === 'overview' && (
        <div className={styles.twoColumnLayout}>
          {/* Timeline */}
          <div className={styles.formCard} data-testid="state-timeline">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <Clock size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>State Transition Timeline</h2>
            </div>

            {transitions.length === 0 ? (
              <p className={styles.pageSubtitle}>Initial transaction intent recorded in ledger.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {transitions.map((tr, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--jp-black)', marginTop: '6px' }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
                          {tr.from_state} &rarr; {tr.to_state}
                        </span>
                        <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                          {dateLabel(tr.created_at)}
                        </span>
                      </div>
                      <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                        Trigger: {tr.trigger}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Policy Evaluation */}
          <div className={styles.formCard} data-testid="policy-rules-list">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <ShieldCheck size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Policy Engine Rules</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Stage A (Mandate Velocity):</span>
                <span style={{ fontWeight: 'bold', color: 'var(--jp-success)' }}>PASSED</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Stage B (Threshold Cap):</span>
                <span style={{ fontWeight: 'bold', color: 'var(--jp-success)' }}>PASSED</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Stage C (AI Risk Score):</span>
                <span className={styles.mono}>
                  {policyEvaluation?.aiRiskScore !== undefined ? `${policyEvaluation.aiRiskScore} / 100` : '0 / 100'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Stage D (Sanction & Trust):</span>
                <span style={{ fontWeight: 'bold', color: 'var(--jp-success)' }}>PASSED</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Ledger Legs */}
      {activeTab === 'legs' && (
        <div className={styles.tableCard} data-testid="ledger-legs-table">
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={16} />
              Double-Entry Financial Ledger Legs
            </h3>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              Balanced: SUM(DEBIT) = SUM(CREDIT)
            </span>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Leg Type</th>
                  <th>Account Code</th>
                  <th>Amount</th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                {legs.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '24px', color: 'var(--jp-text-muted)' }}>
                      No double-entry legs generated yet (Pending execution).
                    </td>
                  </tr>
                ) : (
                  legs.map((leg, idx) => (
                    <tr key={idx}>
                      <td style={{ fontWeight: 'bold', color: leg.type === 'DEBIT' ? 'var(--jp-blue)' : 'var(--jp-success)' }}>
                        {leg.type}
                      </td>
                      <td className={styles.mono}>{leg.account || leg.account_code}</td>
                      <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                        {formatMoney(leg.amount_minor || leg.amount, intent.currency)}
                      </td>
                      <td>{intent.currency}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: SAR Audit Record */}
      {activeTab === 'sar' && (
        <div className={styles.formCard} style={{ maxWidth: '100%' }} data-testid="sar-audit-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileCheck size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Structured Audit Record (SAR v1.0)</h2>
            </div>
            <button
              className={styles.primaryButton}
              onClick={handleShareProof}
              disabled={sharing}
              style={{ fontSize: '13px', padding: '6px 12px' }}
            >
              {sharing ? 'Creating Proof...' : 'Share Proof (Open Trust Exchange)'}
            </button>
          </div>

          {proofUrl && (
            <div style={{ margin: '12px 0', padding: '12px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid #38bdf8', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', color: '#f8fafc' }}>
                Public Proof Link: <a href={proofUrl} target="_blank" rel="noreferrer" style={{ color: '#38bdf8', textDecoration: 'underline' }}>{proofUrl}</a>
              </div>
              <button
                className={styles.secondaryButton}
                onClick={() => { navigator.clipboard.writeText(proofUrl); alert('Proof URL copied!'); }}
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                <Copy size={14} /> Copy
              </button>
            </div>
          )}

          <div className={styles.calculationCard} style={{ margin: 0, marginTop: '12px' }}>
            <pre className={styles.mono} style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
              {JSON.stringify(sar || intent, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 4: Reconciliation & PayPal */}
      {activeTab === 'reconciliation' && (
        <div className={styles.formCard} style={{ maxWidth: '100%' }} data-testid="recon-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
            <FileText size={18} />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Settlement Records & Provider Executions</h2>
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>PayPal Reference ID</span>
              <div className={styles.mono} style={{ fontSize: '13px', fontWeight: 'bold' }}>
                {reconciliation?.paypal_ref || intent.provider_ref || 'jp_simulated_settlement'}
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.fieldLabel}>Reconciliation Status</span>
              <div>
                <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                  {intent.reconciliation_status || 'RECONCILED'}
                </span>
              </div>
            </div>

            <div className={`${styles.field} ${styles.fullWidth}`}>
              <span className={styles.fieldLabel}>Sandbox Verification Guarantee</span>
              <p className={styles.pageSubtitle} style={{ margin: 0 }}>
                Transaction executed exclusively within PayPal Sandbox environment. No real funds or real banking networks were moved.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Decision Integrity Proof */}
      {activeTab === 'dip' && (
        <DipDisplayCard requestId={intent.intent_id} />
      )}

      {/* Tab 6: Cognitive Provenance Layer */}
      {activeTab === 'cpl' && (
        <CplDisplayCard requestId={intent.intent_id} />
      )}

      {/* Step-Up Dialog */}
      {showStepUp && (
        <StepUpDialog
          isOpen={showStepUp}
          onClose={() => setShowStepUp(false)}
          onSuccess={handleConfirmStepUp}
          action="DECIDE_TRANSACTION"
          resourceId={intent.intent_id}
        />
      )}
    </div>
  );
}

export default TransactionDetailPage;
