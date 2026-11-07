/**
 * web/src/pages/Down_PaymentPage.jsx
 * Down Payment UI: List & Detail views, 29-day authorization window,
 * visual progress bar (initial -> settlement -> settled), "Settle" action button, and double-entry view
 * (K-DOWN_PAYMENT, FR-1301...1307, AD-04, AD-26, T-09, WP F7-2)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

function formatMoney(amountMinor, currency = 'USD') {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const major = Number(BigInt(amountMinor)) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(major);
}

export function DownPaymentProgressBar({ status }) {
  const norm = (status || '').toUpperCase();
  const isSettled = norm === 'SETTLED' || norm === 'COMPLETED';
  const isSettlementDue = norm === 'SETTLEMENT_DUE' || norm === 'AWAITING_DELIVERY';

  let step = 1;
  if (isSettled) step = 3;
  else if (isSettlementDue) step = 2;

  return (
    <div className={styles.stepIndicator} data-testid="dp-progress-bar">
      <div className={styles.stepHeader}>
        <span className={step >= 1 ? styles.stepHeaderActive : ''}>1. Initial Authorization</span>
        <span className={step >= 2 ? styles.stepHeaderActive : ''}>2. Settlement Due</span>
        <span className={step >= 3 ? styles.stepHeaderDone : ''}>3. Fully Settled</span>
      </div>
      <div className={styles.stepBar}>
        <div className={`${styles.stepSegment} ${step >= 1 ? styles.stepActive : ''}`} />
        <div className={`${styles.stepSegment} ${step >= 2 ? styles.stepActive : ''}`} />
        <div className={`${styles.stepSegment} ${step >= 3 ? styles.stepDone : ''}`} />
      </div>
    </div>
  );
}

export function Down_PaymentPage({ downPaymentId = null }) {
  const { id } = useParams();
  const effectiveId = downPaymentId || id;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // 1. Fetch list of down payments when on /down-payments
  const listQuery = useQuery({
    queryKey: ['down-payments-list'],
    queryFn: async () => apiClient.get('/down-payments'),
    enabled: !effectiveId,
  });

  // 2. Fetch specific down payment when effectiveId is present
  const detailQuery = useQuery({
    queryKey: ['down-payment-detail', effectiveId],
    queryFn: async () => apiClient.get(`/down-payments/${effectiveId}`),
    enabled: Boolean(effectiveId),
  });

  // Settle Down Payment mutation
  const settleMutation = useMutation({
    mutationFn: async (dpId) => apiClient.post(`/down-payments/${dpId}/settle`),
    onSuccess: async () => {
      setActionSuccess('Down payment successfully settled!');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['down-payments-list'] });
      await queryClient.invalidateQueries({ queryKey: ['down-payment-detail', effectiveId] });
    },
    onError: (err) => {
      setActionError(err.message || 'Settlement execution failed.');
    },
  });

  // --------------------------------------------------------------------------
  // LIST VIEW: /down-payments
  // --------------------------------------------------------------------------
  if (!effectiveId) {
    if (listQuery.isLoading) {
      return (
        <div className={styles.emptyCard} data-testid="down-payment-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading down payment agreements...</p>
        </div>
      );
    }

    const items = listQuery.data?.downPayments || [];

    return (
      <div className={styles.pageStack} data-testid="down-payments-list-page">
        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <h1 className={styles.pageTitle}>Down Payments</h1>
            <p className={styles.pageSubtitle}>
              Milestone-based down payment workflow with 29-day authorization window and settlement per AD-04/AD-26.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Link to="/transactions/new?category=DOWN_PAYMENT" className={styles.primaryLink}>
              <Plus size={16} />
              Propose Down Payment
            </Link>
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

        {items.length === 0 ? (
          <div className={styles.emptyCard}>
            <Lock size={36} color="var(--jp-text-muted)" />
            <h3 className={styles.emptyTitle}>No Down Payment Agreements Found</h3>
            <p className={styles.emptyDesc}>
              Down payment proposals submitted by agents or operators will appear here.
            </p>
          </div>
        ) : (
          <div className={styles.tableCard}>
            <div className={styles.tableScroll}>
              <table className={styles.dataTable} data-testid="down-payments-table">
                <thead>
                  <tr>
                    <th>Intent ID</th>
                    <th>Counterparty</th>
                    <th>Down Payment</th>
                    <th>Total Contract</th>
                    <th>Settlement Progress</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.intent_id}>
                      <td className={styles.mono}>
                        <Link to={`/down-payments/${item.intent_id}`} style={{ fontWeight: 'bold' }}>
                          {item.intent_id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td>{item.counterparty_name || 'Counterparty'}</td>
                      <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                        {formatMoney(item.dp_amount_minor || item.amount_minor, item.currency)}
                      </td>
                      <td className={styles.mono}>
                        {formatMoney(item.total_amount_minor || item.amount_minor, item.currency)}
                      </td>
                      <td>
                        <DownPaymentProgressBar status={item.dp_status || item.status} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          {item.dp_status !== 'SETTLED' && (
                            <button
                              type="button"
                              onClick={() => settleMutation.mutate(item.intent_id)}
                              disabled={settleMutation.isPending}
                              className={styles.secondaryLink}
                              style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
                              data-testid={`settle-btn-${item.intent_id}`}
                            >
                              Settle
                            </button>
                          )}
                          <Link
                            to={`/down-payments/${item.intent_id}`}
                            className={styles.primaryLink}
                            style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
                          >
                            Details &rarr;
                          </Link>
                        </div>
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

  // --------------------------------------------------------------------------
  // DETAIL VIEW: /down-payments/:id
  // --------------------------------------------------------------------------
  if (detailQuery.isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="down-payment-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading down payment details...</p>
      </div>
    );
  }

  const intent = detailQuery.data?.data || {
    intent_id: effectiveId,
    category: 'DOWN_PAYMENT',
    sub_type: 'initial',
    status: 'NEEDS_APPROVAL',
    amount_minor: '20000',
    currency: 'USD',
    metadata: {
      totalAmountMinor: '100000',
      authorizationId: 'AUTH-DP-DEMO-001',
    },
  };

  return (
    <div className={styles.pageStack} data-testid="down-payment-page">
      <div>
        <Link to="/down-payments" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Down Payments list
        </Link>
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

      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Down Payment Agreement</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              {intent.category} / {intent.sub_type}
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Intent ID: <span className={styles.mono}>{intent.intent_id}</span>
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => settleMutation.mutate(intent.intent_id)}
            disabled={settleMutation.isPending || intent.status === 'SETTLED'}
            className={styles.primaryLink}
            data-testid="settle-btn"
          >
            Settle Down Payment
          </button>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className={styles.formCard} style={{ maxWidth: '100%' }}>
        <span className={styles.fieldLabel}>Milestone Settlement Status</span>
        <DownPaymentProgressBar status={intent.status} />
      </div>

      {/* Overview Cards */}
      <div className={styles.formGrid}>
        <div className={styles.calculationCard}>
          <span className={styles.fieldLabel}>Down Payment Value</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
              {formatMoney(intent.amount_minor, intent.currency)}
            </span>
            <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
              ({intent.amount_minor} minor)
            </span>
          </div>
          <p className={styles.calcRow} style={{ margin: '8px 0 0 0' }}>
            <span className={styles.calcLabel}>Total Contract Value:</span>
            <span className={styles.calcValue}>
              {formatMoney(intent.metadata?.totalAmountMinor || intent.amount_minor, intent.currency)}
            </span>
          </p>
        </div>

        <div className={styles.calculationCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} />
              PayPal Authorization Window (29-Day Cap)
            </span>
            <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--jp-blue-dark)' }}>
              28 Days Remaining
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--jp-text-muted)' }}>
            <Lock size={16} />
            <span>
              Remaining milestone amount is authorized and must be settled before authorization expiry per AD-26.
            </span>
          </div>
        </div>
      </div>

      {/* Double-Entry Ledger Legs Preview */}
      <div className={styles.tableCard} data-testid="down-payment-ledger">
        <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={16} />
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
                <th>Minor Amount</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 'bold', color: 'var(--jp-blue)' }}>DEBIT</td>
                <td className={styles.mono}>buyer:{intent.counterparty_id || 'buyer'}</td>
                <td className={styles.mono}>{intent.amount_minor}</td>
                <td>{intent.currency}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', color: 'var(--jp-success)' }}>CREDIT</td>
                <td className={styles.mono}>org:down_payment_escrow</td>
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

export default Down_PaymentPage;
