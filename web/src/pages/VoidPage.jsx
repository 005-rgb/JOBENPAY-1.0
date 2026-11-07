/**
 * web/src/pages/VoidPage.jsx
 * Void Transaction UI: list, detail, maker/checker controls, states, timeline, double-entry view
 * (K-VOID, FR-1301...1307, T-11)
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
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

export function VoidPage({ voidId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveId = voidId || params.id;

  // Single void query
  const {
    data: voidTx,
    isLoading: isSingleLoading,
    isError: isSingleError,
    error: singleError,
  } = useQuery({
    queryKey: ['void', effectiveId],
    queryFn: async () => {
      if (!effectiveId) return null;
      return apiClient.get(`/voids/${effectiveId}`);
    },
    enabled: Boolean(effectiveId),
  });

  // Voids list query (when no ID is selected)
  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['voids-list'],
    queryFn: async () => {
      try {
        return await apiClient.get('/transactions?category=VOID&limit=50');
      } catch {
        return apiClient.get('/voids');
      }
    },
    enabled: !effectiveId,
  });

  if (effectiveId) {
    if (isSingleLoading) {
      return (
        <div className={styles.emptyCard} data-testid="void-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading void transaction data...</p>
        </div>
      );
    }

    if (isSingleError) {
      return (
        <div className={styles.pageStack} data-testid="void-error">
          <div className={styles.errorBanner}>
            <AlertCircle size={20} />
            <div>
              <strong>Failed to Load Void Transaction</strong>
              <p style={{ margin: '4px 0 0 0' }}>{singleError?.message || 'An internal system error occurred.'}</p>
            </div>
          </div>
        </div>
      );
    }

    if (!voidTx) {
      return (
        <div className={styles.emptyCard} data-testid="void-empty">
          <Ban size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>Void Record Not Found</h3>
          <p className={styles.emptyDesc}>The requested void transaction could not be located in the ledger.</p>
          <Link to="/voids" className={styles.primaryLink}>
            Back to Voids List
          </Link>
        </div>
      );
    }

    return (
      <div className={styles.pageStack} data-testid="void-detail">
        <div className={styles.calculationCard} style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <strong style={{ color: 'var(--jp-blue-dark)' }}>SANDBOX VOID</strong>
            <span style={{ color: 'var(--jp-text-muted)' }}>Testing Environment — Release Held Authorization</span>
          </div>
        </div>

        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className={styles.pageTitle}>Void #{voidTx.intent_id?.slice(0, 8)}</h1>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                {voidTx.status}
              </span>
            </div>
            <p className={styles.pageSubtitle}>
              Category: VOID ({voidTx.sub_type || 'authorization'}) · Parent Auth: {voidTx.parent_intent_id ? voidTx.parent_intent_id.slice(0, 8) + '...' : 'Direct Auth'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className={styles.mono} style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {voidTx.currency} {(Number(voidTx.amount_minor || 0) / 100).toFixed(2)}
            </div>
            <p className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
              Reconciliation: {voidTx.reconciliation_status}
            </p>
          </div>
        </div>

        <div className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Authorization Voiding Safeguard (T-11)</h4>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Voiding an authorization releases the internal escrow and returns held balance to customer credit lines, preventing dangling authorization holds.
          </p>
        </div>

        <div className={styles.tableCard}>
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} />
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Double-Entry Void Ledger Preview</h3>
          </div>
          <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
            <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
              <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>DEBIT (Release Held Funds)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: liability:customer_held</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c6b3c', marginTop: '4px' }}>
                +{voidTx.currency} {(Number(voidTx.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
            <div className={styles.calculationCard} style={{ background: '#fdecef', borderColor: '#f8b4be' }}>
              <span style={{ fontWeight: 'bold', color: '#9b1c2a', fontSize: '12px' }}>CREDIT (Authorization Canceled)</span>
              <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: escrow:authorized_holds</div>
              <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#9b1c2a', marginTop: '4px' }}>
                -{voidTx.currency} {(Number(voidTx.amount_minor || 0) / 100).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Voids List View
  const transactions = listData?.transactions || [];

  return (
    <div className={styles.pageStack} data-testid="voids-page">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className={styles.pageTitle}>Void Authorizations</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>VOID</span>
          </div>
          <p className={styles.pageSubtitle}>
            Cancel pre-authorized payment holds and orders before capture via PayPal Void API.
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
            to="/transactions/new?category=VOID"
            className={styles.primaryLink}
            data-testid="new-void-btn"
          >
            <Plus size={16} />
            Void Authorization
          </Link>
        </div>
      </div>

      {isListLoading ? (
        <div className={styles.emptyCard} data-testid="void-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading voids list...</p>
        </div>
      ) : isListError ? (
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Voids</strong>
            <p style={{ margin: '4px 0 0 0' }}>{listError?.message || 'Could not fetch void transactions.'}</p>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className={styles.emptyCard} data-testid="void-empty">
          <Ban size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Void Transactions Found</h3>
          <p className={styles.emptyDesc}>
            No authorizations have been voided yet. Void an existing pre-authorized transaction to release held funds.
          </p>
          <Link to="/transactions/new?category=VOID" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Void an Authorization
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard} data-testid="voids-table">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Intent ID</th>
                  <th>Sub-Type</th>
                  <th>Parent Authorization</th>
                  <th>Amount Released</th>
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
                        {tx.sub_type || 'authorization'}
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

export default VoidPage;
