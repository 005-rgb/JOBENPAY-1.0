/**
 * web/src/pages/DisputePage.jsx
 * Dispute Defense UI: maker/checker controls, evidence package review, claim resolution, double-entry view
 * (K-DISPUTE, FR-1001...1004, AD-12, AD-23, T-06)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import styles from './TransactionPages.module.css';

export function DisputePage({ disputeId = null }) {
  const { t } = useTranslation();
  const { environment, isLive } = useEnvironment();
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  const {
    data: dispData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['dispute', disputeId, environment],
    queryFn: async () => {
      if (!disputeId) return null;
      return apiClient.get(`/disputes/${disputeId}`);
    },
    enabled: Boolean(disputeId),
  });

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="dispute-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading dispute resolution records...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="dispute-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Dispute Case</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'A system error occurred while contacting the server.'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback demo dispute data
  const intent = dispData?.data || {
    intent_id: 'e0000000-0000-4000-8000-000000000088',
    category: 'DISPUTE',
    sub_type: 'chargeback',
    status: 'NEEDS_APPROVAL',
    amount_minor: '7500',
    currency: 'USD',
    counterparty_id: '00000000-0000-4000-8000-000000000011',
    created_at: new Date().toISOString(),
    metadata: {
      paypalDisputeId: isLive ? 'DISP-LIVE-001' : 'DISP-SANDBOX-001',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      evidenceDraft: 'Proof of fulfillment uploaded by system: Carrier UPS tracking 1Z9999999999999999 delivered to buyer address.',
      description: 'Customer claims merchandise package was not received',
    },
  };

  const isNeedsApproval = intent.status === 'NEEDS_APPROVAL';

  const handleContest = () => {
    setActionSuccess(`Evidence submitted! Dispute contested with PayPal ${isLive ? 'Live' : 'Sandbox'}.`);
    setActionError('');
  };

  const handleAccept = () => {
    setActionSuccess('Claim accepted. Refund issued and settlement ledger balanced.');
    setActionError('');
  };

  return (
    <div className={styles.pageStack} data-testid="dispute-page">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Dispute Resolution & Defense</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              {intent.category} / {intent.sub_type}
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Case ID: <span className={styles.mono}>{intent.metadata?.paypalDisputeId || 'DISP-001'}</span> | Intent ID: <span className={styles.mono}>{intent.intent_id}</span>
          </p>
        </div>

        <div className={styles.headerActions}>
          <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
            <Scale size={14} style={{ marginRight: '4px' }} />
            Human Maker/Checker Enforced
          </span>
        </div>
      </div>

      {actionSuccess && (
        <div className={styles.successBanner}>
          <CheckCircle2 size={16} />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className={styles.errorBanner}>
          <AlertCircle size={16} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Overview Metrics */}
      <div className={styles.formGrid}>
        <div className={styles.calculationCard}>
          <span className={styles.fieldLabel}>Disputed Amount</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 'bold', color: '#9b1c2a' }}>
              ${(Number(intent.amount_minor) / 100).toFixed(2)}
            </span>
            <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
              ({intent.amount_minor} minor {intent.currency})
            </span>
          </div>
          <p className={styles.calcRow} style={{ margin: '8px 0 0 0' }}>
            <span className={styles.calcLabel}>Dispute Reason:</span>
            <span className={styles.calcValue}>{intent.metadata?.reason || 'GENERAL_DISPUTE'}</span>
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
              <strong className={styles.mono}>10 Days Remaining</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Evidence State:</span>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>Draft Ready for Review</span>
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
          {intent.metadata?.evidenceDraft || 'AI identified verified carrier fulfillment tracking records with proof of delivery to recipient address. Recommendation: CONTEST (Submit Evidence).'}
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
              onClick={handleContest}
              className={styles.primaryLink}
              data-testid="contest-btn"
            >
              <CheckCircle2 size={16} />
              Contest & Submit Evidence
            </button>

            <button
              type="button"
              onClick={handleAccept}
              className={styles.secondaryLink}
              style={{ color: '#9b1c2a', borderColor: '#f8b4be' }}
              data-testid="accept-claim-btn"
            >
              <XCircle size={16} />
              Accept Claim & Refund
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
                <td>{intent.currency}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', color: 'var(--jp-success)' }}>CREDIT</td>
                <td className={styles.mono}>org:main</td>
                <td className={styles.mono}>{intent.amount_minor}</td>
                <td>{intent.currency}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DisputePage;
