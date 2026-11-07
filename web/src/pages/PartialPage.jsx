/**
 * web/src/pages/PartialPage.jsx
 * Partial Capture UI: list, detail, maker/checker controls, states, timeline, cumulative balance tracker
 * (K-PARTIAL, FR-1301...1307, T-12)
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
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Split,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
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

export function PartialPage({ partialId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveId = partialId || params.id;

  // Single partial capture query
  const {
    data: partial,
    isLoading: isSingleLoading,
    isError: isSingleError,
    error: singleError,
  } = useQuery({
    queryKey: ['partial', effectiveId],
    queryFn: async () => {
      if (!effectiveId) return null;
      return apiClient.get(`/partials/${effectiveId}`);
    },
    enabled: Boolean(effectiveId),
  });

  // Partial captures list query (when no ID is selected)
  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['partials-list'],
    queryFn: async () => {
      return apiClient.get('/transactions?category=PARTIAL&limit=50');
    },
    enabled: !effectiveId,
  });

  if (effectiveId) {
    if (isSingleLoading) {
      return (
        <div className={styles.emptyCard} data-testid="partial-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading partial capture data...</p>
        </div>
      );
    }

    if (isSingleError) {
      return (
        <div className={styles.pageStack} data-testid="partial-error">
          <div className={styles.errorBanner}>
            <AlertCircle size={20} />
            <div>
              <strong>Failed to Load Partial Capture</strong>
              <p style={{ margin: '4px 0 0 0' }}>{singleError?.message || 'An internal system error occurred.'}</p>
            </div>
          </div>
        </div>
      );
    }

    if (!partial) {
      return (
        <div className={styles.emptyCard} data-testid="partial-empty">
          <Split size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>Partial Capture Not Found</h3>
          <p className={styles.emptyDesc}>The requested partial capture could not be located in the ledger.</p>
          <Link to="/partials" className={styles.primaryLink}>
            Back to Partials List
          </Link>
        </div>
      );
    }

    return (
      <div className={styles.pageStack} data-testid="partial-detail">
        <div className={styles.calculationCard} style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <strong style={{ color: 'var(--jp-blue-dark)' }}>SANDBOX MULTI-CAPTURE</strong>
            <span style={{ color: 'var(--jp-text-muted)' }}>Testing Environment — Cumulative Remaining Balance Tracking</span>
          </div>
        </div>

        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className={styles.pageTitle}>Partial Capture #{partial.intent_id?.slice(0, 8)}</h1>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                {partial.status}
              </span>
            </div>
            <p className={styles.pageSubtitle}>
              Category: PARTIAL ({partial.sub_type || 'payment'}) · Parent Auth: {partial.parent_intent_id ? partial.parent_intent_id.slice(0, 8) + '...' : 'Direct Auth'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={styles.mono} style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {partial.currency} {(Number(partial.amount_minor || 0) / 100).toFixed(2)}
            </div>
            <p className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
              Reconciliation: {partial.reconciliation_status}
            </p>
          </div>
        </div>

        <div className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Multi-Capture Cumulative Tracking (T-12)</h4>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Allows up to multiple partial captures against a single authorization without exceeding the total pre-authorized sum. The final capture flag releases remaining authorization holds.
          </p>
        </div>

        <div className={styles.tableCard}>
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Double-Entry Partial Capture Ledger Preview</h3>
          </div>
          <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
            <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
              <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>DEBIT (Cash Inflow to Org)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: org:main</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c6b3c', marginTop: '4px' }}>
                +{partial.currency} {(Number(partial.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
            <div className={styles.calculationCard} style={{ background: '#fdecef', borderColor: '#f8b4be' }}>
              <span style={{ fontWeight: 'bold', color: '#9b1c2a', fontSize: '12px' }}>CREDIT (Authorization Drawdown)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: escrow:authorized_holds</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#9b1c2a', marginTop: '4px' }}>
                -{partial.currency} {(Number(partial.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Partials List View
  const transactions = listData?.transactions || [];

  return (
    <div className={styles.pageStack} data-testid="partials-page">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className={styles.pageTitle}>Partial Captures</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>PARTIAL</span>
          </div>
          <p className={styles.pageSubtitle}>
            Capture authorized payments in multi-installment increments against pre-authorized PayPal orders.
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
            to="/transactions/new?category=PARTIAL"
            className={styles.primaryLink}
            data-testid="new-partial-btn"
          >
            <Plus size={16} />
            New Partial Capture
          </Link>
        </div>
      </div>

      {isListLoading ? (
        <div className={styles.emptyCard} data-testid="partial-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading partial captures list...</p>
        </div>
      ) : isListError ? (
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Partial Captures</strong>
            <p style={{ margin: '4px 0 0 0' }}>{listError?.message || 'Could not fetch partial capture transactions.'}</p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className={styles.emptyCard} data-testid="partial-empty">
          <Split size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Partial Captures Found</h3>
          <p className={styles.emptyDesc}>
            No partial captures have been initiated yet. Capture a portion of an active pre-authorized order.
          </p>
          <Link to="/transactions/new?category=PARTIAL" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Initiate First Partial Capture
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard} data-testid="partials-table">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Intent ID</th>
                  <th>Sub-Type</th>
                  <th>Parent Authorization</th>
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
                        {tx.sub_type || 'payment'}
                      </span>
                    </td>
                    <td className={styles.mono} style={{ fontSize: '12px' }}>
                      {tx.parent_intent_id ? tx.parent_intent_id.slice(0, 8) + '...' : '—'}
                    </td>
                    <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                      {formatMoney(tx.amount_minor, tx.currency)}
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

export default PartialPage;
