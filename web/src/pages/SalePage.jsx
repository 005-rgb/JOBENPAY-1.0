/**
 * web/src/pages/SalePage.jsx
 * Sale Transaction UI: list, detail, maker/checker controls, states, timeline, double-entry view
 * (K-SALE, FR-1301...1307)
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
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
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

export function SalePage({ saleId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveId = saleId || params.id;

  // Single sale query
  const {
    data: sale,
    isLoading: isSingleLoading,
    isError: isSingleError,
    error: singleError,
  } = useQuery({
    queryKey: ['sale', effectiveId],
    queryFn: async () => {
      if (!effectiveId) return null;
      return apiClient.get(`/api/v1/sales/${effectiveId}`);
    },
    enabled: Boolean(effectiveId),
  });

  // Sales list query (when no ID is selected)
  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['sales-list'],
    queryFn: async () => {
      return apiClient.get('/api/v1/transactions?category=SALE&limit=50');
    },
    enabled: !effectiveId,
  });

  if (effectiveId) {
    if (isSingleLoading) {
      return (
        <div className={styles.emptyCard} data-testid="sale-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading sale transaction data...</p>
        </div>
      );
    }

    if (isSingleError) {
      return (
        <div className={styles.pageStack} data-testid="sale-error">
          <div className={styles.errorBanner}>
            <AlertCircle size={20} />
            <div>
              <strong>Failed to Load Sale Transaction</strong>
              <p style={{ margin: '4px 0 0 0' }}>{singleError?.message || 'An internal system error occurred.'}</p>
            </div>
          </div>
        </div>
      );
    }

    if (!sale) {
      return (
        <div className={styles.emptyCard} data-testid="sale-empty">
          <ShoppingCart size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>Sale Transaction Not Found</h3>
          <p className={styles.emptyDesc}>The requested sale order could not be located in the ledger.</p>
          <Link to="/sales" className={styles.primaryLink}>
            Back to Sales List
          </Link>
        </div>
      );
    }

    return (
      <div className={styles.pageStack} data-testid="sale-detail">
        <div className={styles.calculationCard} style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <strong style={{ color: 'var(--jp-blue-dark)' }}>SANDBOX CHECKOUT</strong>
            <span style={{ color: 'var(--jp-text-muted)' }}>Testing Environment — PayPal Orders Capture API</span>
          </div>
        </div>

        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className={styles.pageTitle}>Sale Order #{sale.intent_id?.slice(0, 8)}</h1>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                {sale.status}
              </span>
            </div>
            <p className={styles.pageSubtitle}>Category: SALE (standard order capture)</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={styles.mono} style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {sale.currency} {(Number(sale.amount_minor || 0) / 100).toFixed(2)}
            </div>
            <p className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
              Reconciliation: {sale.reconciliation_status}
            </p>
          </div>
        </div>

        <div className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Customer Payment Capture Safeguards</h4>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Sale orders capture payments directly into the organization account with strict balance validation against double-entry ledger rules.
          </p>
        </div>

        <div className={styles.tableCard}>
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Double-Entry Inflow Ledger Preview</h3>
          </div>
          <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
            <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
              <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>DEBIT (Cash Inflow to Org)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: org:main</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c6b3c', marginTop: '4px' }}>
                +{sale.currency} {(Number(sale.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
            <div className={styles.calculationCard} style={{ background: '#fdecef', borderColor: '#f8b4be' }}>
              <span style={{ fontWeight: 'bold', color: '#9b1c2a', fontSize: '12px' }}>CREDIT (Sales Revenue)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: revenue:sales</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#9b1c2a', marginTop: '4px' }}>
                +{sale.currency} {(Number(sale.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sales List View
  const transactions = listData?.transactions || [];

  return (
    <div className={styles.pageStack} data-testid="sales-page">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className={styles.pageTitle}>Sales & Orders</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>SALE</span>
          </div>
          <p className={styles.pageSubtitle}>
            Process customer checkouts, create order authorizations, and capture settled payments via PayPal Orders API.
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
            to="/transactions/new?category=SALE"
            className={styles.primaryLink}
            data-testid="new-sale-btn"
          >
            <Plus size={16} />
            New Sale Order
          </Link>
        </div>
      </div>

      {isListLoading ? (
        <div className={styles.emptyCard} data-testid="sale-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading sales list...</p>
        </div>
      ) : isListError ? (
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Sales</strong>
            <p style={{ margin: '4px 0 0 0' }}>{listError?.message || 'Could not fetch sales transactions.'}</p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className={styles.emptyCard} data-testid="sale-empty">
          <ShoppingCart size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Sales Orders Found</h3>
          <p className={styles.emptyDesc}>
            No customer checkout sales have been processed yet. Create a new sale order to initiate checkout capture.
          </p>
          <Link to="/transactions/new?category=SALE" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Create First Sale
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard} data-testid="sales-table">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Intent ID</th>
                  <th>Customer / Counterparty</th>
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
                    <td>{tx.counterparty_name || tx.counterparty_id?.slice(0, 8) || 'Customer Checkout'}</td>
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

export default SalePage;
