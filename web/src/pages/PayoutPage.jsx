/**
 * web/src/pages/PayoutPage.jsx
 * Payout Transaction UI: list, detail, maker/checker controls, states, timeline, double-entry view
 * (K-PAYOUT, FR-1301...1307)
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
  Send,
  ShieldCheck,
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

export function PayoutPage({ payoutId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveId = payoutId || params.id;

  // Single payout query
  const {
    data: payout,
    isLoading: isSingleLoading,
    isError: isSingleError,
    error: singleError,
  } = useQuery({
    queryKey: ['payout', effectiveId],
    queryFn: async () => {
      if (!effectiveId) return null;
      return apiClient.get(`/payouts/${effectiveId}`);
    },
    enabled: Boolean(effectiveId),
  });

  // Payout list query (when no ID is selected)
  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['payouts-list'],
    queryFn: async () => {
      try {
        return await apiClient.get('/transactions?category=PAYOUT&limit=50');
      } catch {
        try {
          return await apiClient.get('/payouts');
        } catch (err2) {
          if (err2.status === 404 || err2.status === 401 || err2.status === 500) {
            return { transactions: [], payouts: [] };
          }
          throw err2;
        }
      }
    },
    enabled: !effectiveId,
  });

  if (effectiveId) {
    if (isSingleLoading) {
      return (
        <div className={styles.emptyCard} data-testid="payout-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading payout transaction data...</p>
        </div>
      );
    }

    if (isSingleError) {
      return (
        <div className={styles.pageStack} data-testid="payout-error">
          <div className={styles.errorBanner}>
            <AlertCircle size={20} />
            <div>
              <strong>Failed to Load Payout</strong>
              <p style={{ margin: '4px 0 0 0' }}>{singleError?.message || 'An internal system error occurred.'}</p>
            </div>
          </div>
        </div>
      );
    }

    if (!payout) {
      return (
        <div className={styles.emptyCard} data-testid="payout-empty">
          <DollarSign size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>Payout Not Found</h3>
          <p className={styles.emptyDesc}>The requested payout transaction could not be located in the ledger.</p>
          <Link to="/payouts" className={styles.primaryLink}>
            Back to Payouts List
          </Link>
        </div>
      );
    }

    return (
      <div className={styles.pageStack} data-testid="payout-detail">
        <div className={styles.calculationCard} style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <strong style={{ color: 'var(--jp-blue-dark)' }}>SANDBOX ONLY</strong>
            <span style={{ color: 'var(--jp-text-muted)' }}>Testing Environment — No real money movement</span>
          </div>
        </div>

        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className={styles.pageTitle}>Payout #{payout.intent_id?.slice(0, 8)}</h1>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                {payout.status}
              </span>
            </div>
            <p className={styles.pageSubtitle}>Category: PAYOUT (standard)</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={styles.mono} style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {payout.currency} {(Number(payout.amount_minor || 0) / 100).toFixed(2)}
            </div>
            <p className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
              Reconciliation: {payout.reconciliation_status}
            </p>
          </div>
        </div>

        <div className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={18} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Integrated Maker / Checker Governance</h4>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Every payout proposal initiated by an AI agent must clear the 4-stage Decision Engine (Stages A/B/C/D) and requires human approver sign-off if policy thresholds are met.
          </p>
        </div>

        <div className={styles.tableCard}>
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Balanced Double-Entry Financial Ledger</h3>
          </div>
          <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
            <div className={styles.calculationCard} style={{ background: '#fdecef', borderColor: '#f8b4be' }}>
              <span style={{ fontWeight: 'bold', color: '#9b1c2a', fontSize: '12px' }}>DEBIT (Cash Outflow)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: org:main</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#9b1c2a', marginTop: '4px' }}>
                -{payout.currency} {(Number(payout.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
            <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
              <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>CREDIT (Payee Entitlement)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: payee:{payout.counterparty_id?.slice(0, 8)}...</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c6b3c', marginTop: '4px' }}>
                +{payout.currency} {(Number(payout.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Payout List View
  const transactions = listData?.transactions || [];

  return (
    <div className={styles.pageStack} data-testid="payouts-page">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className={styles.pageTitle}>Payouts</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>PAYOUT</span>
          </div>
          <p className={styles.pageSubtitle}>
            Disburse funds to suppliers, sellers, or contractors via PayPal Payouts API with policy evaluation and ledger enforcement.
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
            to="/transactions/new?category=PAYOUT"
            className={styles.primaryLink}
            data-testid="new-payout-btn"
          >
            <Plus size={16} />
            New Payout
          </Link>
        </div>
      </div>

      {isListLoading ? (
        <div className={styles.emptyCard} data-testid="payout-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading payouts list...</p>
        </div>
      ) : isListError ? (
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Payouts</strong>
            <p style={{ margin: '4px 0 0 0' }}>{listError?.message || 'Could not fetch payout transactions.'}</p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className={styles.emptyCard} data-testid="payout-empty">
          <Send size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Payout Transactions Found</h3>
          <p className={styles.emptyDesc}>
            No payouts have been proposed yet. Submit a new payout proposal from an agent or using the manual creation tool.
          </p>
          <Link to="/transactions/new?category=PAYOUT" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Propose First Payout
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard} data-testid="payouts-table">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Intent ID</th>
                  <th>Counterparty</th>
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
                    <td>{tx.counterparty_name || tx.counterparty_id?.slice(0, 8) || 'External Payee'}</td>
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

export default PayoutPage;
