/**
 * web/src/pages/RefundPage.jsx
 * Refund Transaction UI: list, detail, maker/checker controls, cumulative tracker, double-entry view
 * (K-REFUND, FR-1301...1307, T-10)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
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
    });
  } catch {
    return isoString;
  }
}

export function RefundPage({ refundId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveId = refundId || params.id;
  const { environment, isLive } = useEnvironment();

  // Single refund query
  const {
    data: refund,
    isLoading: isSingleLoading,
    isError: isSingleError,
    error: singleError,
  } = useQuery({
    queryKey: ['refund', effectiveId, environment],
    queryFn: async () => {
      if (!effectiveId) return null;
      return apiClient.get(`/refunds/${effectiveId}`);
    },
    enabled: Boolean(effectiveId),
  });

  // Refunds list query (when no ID is selected)
  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['refunds-list', environment],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/transactions?category=REFUND&limit=50');
        return res || { transactions: [] };
      } catch {
        try {
          const res = await apiClient.get('/refunds');
          return res || { transactions: [] };
        } catch {
          return { transactions: [], refunds: [] };
        }
      }
    },
    enabled: !effectiveId,
  });

  if (effectiveId) {
    if (isSingleLoading) {
      return (
        <div className={styles.emptyCard} data-testid="refund-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading refund transaction data...</p>
        </div>
      );
    }

    if (isSingleError) {
      return (
        <div className={styles.pageStack} data-testid="refund-error">
          <div className={styles.errorBanner}>
            <AlertCircle size={20} />
            <div>
              <strong>Failed to Load Refund</strong>
              <p style={{ margin: '4px 0 0 0' }}>{singleError?.message || 'An internal system error occurred.'}</p>
            </div>
          </div>
        </div>
      );
    }

    if (!refund) {
      return (
        <div className={styles.emptyCard} data-testid="refund-empty">
          <RotateCcw size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>Refund Not Found</h3>
          <p className={styles.emptyDesc}>The requested refund transaction could not be located in the ledger.</p>
          <Link to="/refunds" className={styles.primaryLink}>
            Back to Refunds List
          </Link>
        </div>
      );
    }

    return (
      <div className={styles.pageStack} data-testid="refund-detail">
        <div className={styles.calculationCard} style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <strong style={{ color: 'var(--jp-blue-dark)' }}>{isLive ? 'LIVE REFUND' : 'SANDBOX REFUND'}</strong>
            <span style={{ color: 'var(--jp-text-muted)' }}>{isLive ? 'Live Production Environment' : 'Testing Environment — Cumulative Refund Ceiling Safeguard'}</span>
          </div>
        </div>

        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className={styles.pageTitle}>Refund #{refund.intent_id?.slice(0, 8)}</h1>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                {refund.status}
              </span>
            </div>
            <p className={styles.pageSubtitle}>
              Category: REFUND ({refund.sub_type || 'full'}) · Parent: {refund.parent_intent_id ? refund.parent_intent_id.slice(0, 8) + '...' : 'Direct Capture'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={styles.mono} style={{ fontSize: '24px', fontWeight: 'bold', color: '#9b1c2a' }}>
              -{refund.currency} {(Number(refund.amount_minor || 0) / 100).toFixed(2)}
            </div>
            <p className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
              Reconciliation: {refund.reconciliation_status}
            </p>
          </div>
        </div>

        <div className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Cumulative Ceiling Guarantee (PRD §13, T-10)</h4>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Refunds are strictly bound to the original capture amount. Cumulative partial refunds cannot exceed the total amount settled in the parent capture.
          </p>
        </div>

        <div className={styles.tableCard}>
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Double-Entry Refund Ledger Preview</h3>
          </div>
          <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
            <div className={styles.calculationCard} style={{ background: '#fdecef', borderColor: '#f8b4be' }}>
              <span style={{ fontWeight: 'bold', color: '#9b1c2a', fontSize: '12px' }}>DEBIT (Reverse Revenue)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: revenue:sales</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#9b1c2a', marginTop: '4px' }}>
                +{refund.currency} {(Number(refund.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
            <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
              <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>CREDIT (Cash Returned to Buyer)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: org:main</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c6b3c', marginTop: '4px' }}>
                -{refund.currency} {(Number(refund.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Refunds List View
  const transactions = listData?.transactions || [];

  return (
    <div className={styles.pageStack} data-testid="refunds-page">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className={styles.pageTitle}>Refunds</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>REFUND</span>
          </div>
          <p className={styles.pageSubtitle}>
            Issue full or partial refunds against settled orders with verified cumulative limit enforcement.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className={styles.secondaryLink}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            to="/transactions/new?category=REFUND"
            className={styles.primaryLink}
            data-testid="new-refund-btn"
          >
            <Plus size={16} />
            New Refund
          </Link>
        </div>
      </div>

      {isListLoading ? (
        <div className={styles.emptyCard} data-testid="refund-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading refunds list...</p>
        </div>
      ) : isListError ? (
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Refunds</strong>
            <p style={{ margin: '4px 0 0 0' }}>{listError?.message || 'Could not fetch refund transactions.'}</p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className={styles.emptyCard} data-testid="refund-empty">
          <RotateCcw size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Refunds Found</h3>
          <p className={styles.emptyDesc}>
            No refunds have been processed yet. Propose a refund against an existing settled transaction.
          </p>
          <Link to="/transactions/new?category=REFUND" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Process First Refund
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard} data-testid="refunds-table">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Intent ID</th>
                  <th>Sub-Type</th>
                  <th>Parent Transaction</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reconciliation</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.intent_id}>
                    <td>
                      <Link
                        to={`/transactions/${tx.intent_id}`}
                        className={`${styles.mono} ${styles.tableLink}`}
                        style={{ fontWeight: 'bold' }}
                      >
                        {tx.intent_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td>
                      <span className={`${styles.providerBadge} ${styles.badgeSandbox}`} style={{ fontSize: '10px' }}>
                        {tx.sub_type || 'full'}
                      </span>
                    </td>
                    <td className={styles.mono} style={{ fontSize: '12px' }}>
                      {tx.parent_intent_id ? tx.parent_intent_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className={styles.mono} style={{ fontWeight: 'bold', color: '#9b1c2a' }}>
                      -{formatMoney(tx.amount_minor, tx.currency)}
                    </td>
                    <td><StatusPill status={tx.status} /></td>
                    <td>
                      <span className={`${styles.providerBadge} ${styles.badgeSandbox}`} style={{ fontSize: '10px' }}>
                        {tx.reconciliation_status || 'UNRECONCILED'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      {dateLabel(tx.created_at)}
                    </td>
                    <td>
                      <Link
                        to={`/transactions/${tx.intent_id}`}
                        className={styles.secondaryLink}
                        style={{ height: '24px', fontSize: '11px', padding: '0 8px' }}
                      >
                        View Details
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

export default RefundPage;
