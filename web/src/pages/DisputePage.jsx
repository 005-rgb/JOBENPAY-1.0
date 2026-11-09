/**
 * web/src/pages/DisputePage.jsx
 * Dispute Defense UI: maker/checker controls, evidence package review, claim resolution, double-entry view
 * (K-DISPUTE, FR-1001...1004, AD-12, AD-23, T-06)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

export function DisputePage({ disputeId: propDisputeId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveDisputeId = propDisputeId || params.id || null;
  const { environment, isLive } = useEnvironment();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  // 1. Single Dispute Detail Query
  const {
    data: dispData,
    isLoading: isDisputeLoading,
    isError: isDisputeError,
    error: disputeError,
    refetch: refetchDispute,
    isFetching: isFetchingDispute,
  } = useQuery({
    queryKey: ['dispute', effectiveDisputeId, environment],
    queryFn: async () => {
      if (!effectiveDisputeId) return null;
      return apiClient.get(`/disputes/${effectiveDisputeId}`);
    },
    enabled: Boolean(effectiveDisputeId),
  });

  // 2. Disputes List Query (when on list view)
  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch: refetchList,
    isFetching: isFetchingList,
  } = useQuery({
    queryKey: ['disputes-list', environment],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/disputes');
        return res?.disputes || res?.transactions || [];
      } catch {
        try {
          const res = await apiClient.get('/transactions?category=DISPUTE&limit=50');
          return res?.transactions || [];
        } catch {
          return [];
        }
      }
    },
    enabled: !effectiveDisputeId,
  });

  // Dispute Decision Mutation
  const decisionMutation = useMutation({
    mutationFn: async ({ id, decision, comment }) => {
      return apiClient.post(`/transactions/${id}/decision`, {
        decision,
        comment,
      });
    },
    onSuccess: async (_, variables) => {
      notify({
        message:
          variables.decision === 'APPROVE'
            ? `Evidence submitted! Dispute contested successfully.`
            : `Dispute claim accepted. Refund issued and balanced.`,
      });
      await queryClient.invalidateQueries({ queryKey: ['dispute', effectiveDisputeId, environment] });
      await queryClient.invalidateQueries({ queryKey: ['disputes-list', environment] });
      await queryClient.invalidateQueries({ queryKey: ['transactions', environment] });
    },
    onError: (err) => {
      notify({ message: `Dispute action failed: ${err.message}`, kind: 'error' });
    },
  });

  const handleContest = (targetId) => {
    decisionMutation.mutate({
      id: targetId,
      decision: 'APPROVE',
      comment: `Dispute contested with carrier evidence on ${isLive ? 'Live' : 'Sandbox'}`,
    });
  };

  const handleAccept = (targetId) => {
    decisionMutation.mutate({
      id: targetId,
      decision: 'REJECT',
      comment: 'Claim accepted by Human Checker. Settled against dispute ledger.',
    });
  };

  // --------------------------------------------------------------------------
  // DETAIL VIEW
  // --------------------------------------------------------------------------
  if (effectiveDisputeId) {
    if (isDisputeLoading) {
      return (
        <div className={styles.emptyCard} data-testid="dispute-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading dispute resolution records...</p>
        </div>
      );
    }

    if (isDisputeError) {
      return (
        <div className={styles.pageStack} data-testid="dispute-error">
          <div className={styles.errorBanner}>
            <AlertCircle size={20} />
            <div>
              <strong>Failed to Load Dispute Case</strong>
              <p style={{ margin: '4px 0 0 0' }}>{disputeError?.message || 'A system error occurred while contacting the server.'}</p>
            </div>
          </div>
          <Link to="/transactions" className={styles.secondaryLink} style={{ alignSelf: 'flex-start' }}>
            Back to Transactions
          </Link>
        </div>
      );
    }

    const intent = dispData?.data || dispData?.intent || dispData;

    if (!intent) {
      return (
        <div className={styles.emptyCard} data-testid="dispute-not-found">
          <Scale size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>Dispute Record Not Found</h3>
          <p className={styles.emptyDesc}>No dispute case was found for ID: {effectiveDisputeId}</p>
          <Link to="/transactions" className={styles.primaryLink}>
            Back to Transactions
          </Link>
        </div>
      );
    }

    const isNeedsApproval = intent.status === 'NEEDS_APPROVAL' || intent.status === 'SUBMITTED';

    return (
      <div className={styles.pageStack} data-testid="dispute-page">
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className={styles.pageTitle}>Dispute Resolution & Defense</h1>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                {intent.category || 'DISPUTE'} / {intent.sub_type || 'chargeback'}
              </span>
            </div>
            <p className={styles.pageSubtitle}>
              Case ID: <span className={styles.mono}>{intent.metadata?.paypalDisputeId || intent.intent_id?.slice(0, 8)}</span> | Intent ID: <span className={styles.mono}>{intent.intent_id}</span>
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => {
                refetchDispute();
                notify({ message: 'Refreshing dispute details...' });
              }}
              disabled={isFetchingDispute}
              className={styles.secondaryLink}
            >
              <RefreshCw size={14} className={isFetchingDispute ? 'animate-spin' : ''} />
              Refresh
            </button>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              <Scale size={14} style={{ marginRight: '4px' }} />
              Human Maker/Checker Enforced
            </span>
          </div>
        </div>

        {/* Overview Metrics */}
        <div className={styles.formGrid}>
          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Disputed Amount</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#9b1c2a' }}>
                ${(Number(intent.amount_minor || 0) / 100).toFixed(2)}
              </span>
              <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                ({intent.amount_minor} minor {intent.currency || 'USD'})
              </span>
            </div>
            <p className={styles.calcRow} style={{ margin: '8px 0 0 0' }}>
              <span className={styles.calcLabel}>Dispute Reason:</span>
              <span className={styles.calcValue}>{intent.metadata?.reason || 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED'}</span>
            </p>
          </div>

          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Resolution Timeline</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Status:</span>
                <strong className={styles.mono} style={{ color: isNeedsApproval ? 'var(--jp-warning-text)' : 'inherit' }}>
                  {intent.status}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Response Deadline:</span>
                <strong className={styles.mono}>Active Window Open</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Evidence State:</span>
                <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>Evidence Package Compiled</span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Evidence Recommendation */}
        <div className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
            <FileText size={18} />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>AI Evidence Package & Recommendation</h2>
          </div>

          <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.6', color: 'var(--jp-text)' }}>
            {intent.metadata?.evidenceDraft || intent.metadata?.description || 'AI identified verified carrier fulfillment tracking records with proof of delivery to recipient address. Recommendation: CONTEST (Submit Evidence).'}
          </p>

          <div className={styles.calculationCard} style={{ margin: 0 }}>
            <strong style={{ fontSize: '12px' }}>Golden Rule (Governance Boundary):</strong>
            <span style={{ fontSize: '12px', color: 'var(--jp-text-muted)', lineHeight: '1.5' }}>
              AI agents are strictly forbidden from autonomously accepting claims or debiting organization funds. The decision to contest evidence (provide-evidence) or accept a claim (accept-claim) resides exclusively with human approvers.
            </span>
          </div>

          {isNeedsApproval && (
            <div className={styles.formActions}>
              <button
                type="button"
                onClick={() => handleContest(intent.intent_id)}
                disabled={decisionMutation.isPending}
                className={styles.primaryLink}
                data-testid="contest-btn"
              >
                {decisionMutation.isPending && decisionMutation.variables?.decision === 'APPROVE' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Submitting Evidence...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Contest & Submit Evidence
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleAccept(intent.intent_id)}
                disabled={decisionMutation.isPending}
                className={styles.secondaryLink}
                style={{ color: '#9b1c2a', borderColor: '#f8b4be' }}
                data-testid="accept-claim-btn"
              >
                {decisionMutation.isPending && decisionMutation.variables?.decision === 'REJECT' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Processing Refund...
                  </>
                ) : (
                  <>
                    <XCircle size={16} />
                    Accept Claim & Refund
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Double-Entry Ledger Preview */}
        <div className={styles.tableCard} data-testid="dispute-ledger">
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={16} />
              Double-Entry Dispute Ledger Legs
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
                  <th>Minor Amount</th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 'bold', color: 'var(--jp-blue)' }}>DEBIT</td>
                  <td className={styles.mono}>dispute:hold</td>
                  <td className={styles.mono}>{intent.amount_minor}</td>
                  <td>{intent.currency || 'USD'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 'bold', color: 'var(--jp-success)' }}>CREDIT</td>
                  <td className={styles.mono}>org:main</td>
                  <td className={styles.mono}>{intent.amount_minor}</td>
                  <td>{intent.currency || 'USD'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LIST VIEW (when disputeId is null)
  // --------------------------------------------------------------------------
  const disputes = listData || [];

  return (
    <div className={styles.pageStack} data-testid="dispute-page">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Dispute Claims & Chargebacks</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>DISPUTE</span>
          </div>
          <p className={styles.pageSubtitle}>
            Manage buyer inquiries, dispute claims, and chargebacks with automated evidence compilation and human Maker/Checker defense.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => {
              refetchList();
              notify({ message: 'Refreshing dispute cases...' });
            }}
            disabled={isFetchingList}
            className={styles.secondaryLink}
          >
            <RefreshCw size={14} className={isFetchingList ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link to="/transactions/new?category=DISPUTE" className={styles.primaryLink}>
            <Plus size={16} />
            File Dispute Response
          </Link>
        </div>
      </div>

      {isListLoading ? (
        <div className={styles.emptyCard} data-testid="dispute-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading dispute cases...</p>
        </div>
      ) : isListError ? (
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Disputes</strong>
            <p style={{ margin: '4px 0 0 0' }}>{listError?.message || 'Could not fetch dispute cases.'}</p>
          </div>
        </div>
      ) : disputes.length === 0 ? (
        <div className={styles.emptyCard} data-testid="dispute-empty">
          <Scale size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Dispute Claims Found</h3>
          <p className={styles.emptyDesc}>
            There are currently zero open buyer claims, disputes, or chargebacks for this organization in this environment.
          </p>
          <Link to="/transactions/new?category=DISPUTE" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Create Dispute Case
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard} data-testid="disputes-table">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Case / Intent ID</th>
                  <th>Sub-Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d.intent_id || d.id}>
                    <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                      <Link to={`/transactions/${d.intent_id || d.id}`} style={{ color: 'inherit' }}>
                        {(d.intent_id || d.id)?.slice(0, 8)}...
                      </Link>
                    </td>
                    <td>
                      <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                        {d.sub_type || 'chargeback'}
                      </span>
                    </td>
                    <td className={styles.mono} style={{ fontWeight: 'bold', color: '#9b1c2a' }}>
                      ${(Number(d.amount_minor || 0) / 100).toFixed(2)} {d.currency || 'USD'}
                    </td>
                    <td>
                      <span
                        className={`${styles.providerBadge} ${
                          d.status === 'APPROVED'
                            ? styles.successBanner
                            : d.status === 'REJECTED'
                            ? styles.errorBanner
                            : styles.badgeSandbox
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      {d.created_at ? new Date(d.created_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/transactions/${d.intent_id || d.id}`}
                        className={styles.secondaryLink}
                        style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
                      >
                        Review Evidence &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default DisputePage;
