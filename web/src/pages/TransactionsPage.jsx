/**
 * web/src/pages/TransactionsPage.jsx
 * Unified Transactions List for all 15 categories (PRD 1.3 §10, WP F7-1, FR-1301...1307)
 */

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { TRANSACTION_CATEGORIES, TRANSACTION_STATUSES, CATEGORY_PROVIDERS } from '../../../shared/transaction.js';
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

export function StatusPill({ status }) {
  const normalized = (status || '').toUpperCase();
  let badgeStyle = styles.badgeSandbox;
  if (normalized === 'COMPLETED' || normalized === 'APPROVED' || normalized === 'SETTLED' || normalized === 'RECONCILED') {
    badgeStyle = styles.successBanner;
  } else if (normalized === 'NEEDS_APPROVAL' || normalized === 'PENDING' || normalized === 'AWAITING_BUYER') {
    badgeStyle = styles.badgeSimulated;
  } else if (normalized === 'FAILED' || normalized === 'REJECTED' || normalized === 'MISMATCH') {
    badgeStyle = styles.errorBanner;
  }

  return (
    <span
      className={`${styles.providerBadge} ${badgeStyle}`}
      style={{ padding: '2px 8px', fontSize: '10px' }}
      data-testid={`status-${status?.toLowerCase()}`}
    >
      {status?.replaceAll('_', ' ') || 'UNKNOWN'}
    </span>
  );
}

export function ProviderBadge({ provider }) {
  const isSimulated = provider === 'SIMULATED';
  return (
    <span
      className={`${styles.providerBadge} ${isSimulated ? styles.badgeSimulated : styles.badgeSandbox}`}
      data-testid="provider-badge"
    >
      {provider || 'SANDBOX'}
    </span>
  );
}

export function TransactionsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCategories = useMemo(() => {
    const raw = searchParams.get('category');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const selectedStatuses = useMemo(() => {
    const raw = searchParams.get('status');
    return raw ? raw.split(',').filter(Boolean) : [];
  }, [searchParams]);

  const searchTerm = searchParams.get('q') || '';
  const [searchInput, setSearchInput] = useState(searchTerm);

  const queryParams = new URLSearchParams();
  if (selectedCategories.length) queryParams.set('category', selectedCategories.join(','));
  if (selectedStatuses.length) queryParams.set('status', selectedStatuses.join(','));
  if (searchTerm) queryParams.set('search', searchTerm);
  queryParams.set('limit', '100');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['transactions', queryParams.toString()],
    queryFn: async () => {
      return apiClient.get(`/transactions?${queryParams.toString()}`);
    },
  });

  const toggleCategory = (cat) => {
    const next = new Set(selectedCategories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);

    const nextParams = new URLSearchParams(searchParams);
    if (next.size) nextParams.set('category', [...next].join(','));
    else nextParams.delete('category');
    setSearchParams(nextParams);
  };

  const toggleStatus = (st) => {
    const next = new Set(selectedStatuses);
    if (next.has(st)) next.delete(st);
    else next.add(st);

    const nextParams = new URLSearchParams(searchParams);
    if (next.size) nextParams.set('status', [...next].join(','));
    else nextParams.delete('status');
    setSearchParams(nextParams);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const nextParams = new URLSearchParams(searchParams);
    if (searchInput.trim()) nextParams.set('q', searchInput.trim());
    else nextParams.delete('q');
    setSearchParams(nextParams);
  };

  const clearAllFilters = () => {
    setSearchInput('');
    setSearchParams(new URLSearchParams());
  };

  const rows = data?.transactions || [];

  return (
    <div className={styles.pageStack} data-testid="transactions-page">
      {/* Header Toolbar */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <h1 className={styles.pageTitle}>Transactions</h1>
          <p className={styles.pageSubtitle}>
            Universal transaction engine monitoring across all 15 financial categories.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className={styles.secondaryLink}
            title="Refresh transactions"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link
            to="/transactions/new"
            className={styles.primaryLink}
            data-testid="new-transaction-btn"
          >
            <Plus size={16} />
            New Transaction
          </Link>
        </div>
      </div>

      {/* Filter Card */}
      <div className={styles.formCard} style={{ maxWidth: '100%', gap: 'var(--jp-space-4)' }}>
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--jp-text-muted)' }} />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by Intent ID, payee, counterparty, description..."
              className={styles.fieldInput}
              style={{ paddingLeft: '36px' }}
              data-testid="transactions-search"
            />
          </div>
          <button type="submit" className={styles.secondaryLink}>
            Search
          </button>
          {(selectedCategories.length > 0 || selectedStatuses.length > 0 || searchTerm) && (
            <button
              type="button"
              onClick={clearAllFilters}
              className={styles.secondaryLink}
              style={{ color: '#9b1c2a', borderColor: '#f8b4be' }}
            >
              <X size={14} />
              Clear Filters
            </button>
          )}
        </form>

        {/* Category Filter Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className={styles.fieldLabel}>Filter by Category</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }} data-testid="category-filters">
            {TRANSACTION_CATEGORIES.map((cat) => {
              const active = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={active ? styles.primaryLink : styles.secondaryLink}
                  style={{ height: '26px', fontSize: '11px', padding: '0 10px' }}
                  data-testid={`filter-cat-${cat.toLowerCase()}`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Filter Pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span className={styles.fieldLabel}>Filter by Status</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }} data-testid="status-filters">
            {TRANSACTION_STATUSES.map((st) => {
              const active = selectedStatuses.includes(st);
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => toggleStatus(st)}
                  className={active ? styles.primaryLink : styles.secondaryLink}
                  style={{ height: '26px', fontSize: '11px', padding: '0 10px' }}
                  data-testid={`filter-status-${st.toLowerCase()}`}
                >
                  {st.replaceAll('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading && (
        <div className={styles.emptyCard} data-testid="transactions-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading transactions from universal engine...</p>
        </div>
      )}

      {isError && (
        <div className={styles.errorBanner} data-testid="transactions-error">
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Transactions</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'Error communicating with backend transaction API.'}</p>
          </div>
        </div>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <div className={styles.emptyCard} data-testid="transactions-empty">
          <Layers size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Transactions Found</h3>
          <p className={styles.emptyDesc}>
            Transactions matching current filter criteria will be listed here.
          </p>
          {(selectedCategories.length > 0 || selectedStatuses.length > 0 || searchTerm) && (
            <button
              type="button"
              onClick={clearAllFilters}
              className={styles.secondaryLink}
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <div className={styles.tableCard} data-testid="transactions-table-card">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable} data-testid="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Counterparty</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr key={tx.intent_id || tx.id}>
                    <td className={styles.mono}>{dateLabel(tx.created_at)}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 'bold' }}>{tx.category}</span>
                        <span className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
                          {tx.sub_type || 'standard'}
                        </span>
                      </div>
                    </td>
                    <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                      {formatMoney(tx.amount_minor, tx.currency)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '500' }}>{tx.counterparty_name || 'Internal Ledger'}</span>
                        {tx.counterparty_id && (
                          <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                            {tx.counterparty_id.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <ProviderBadge provider={tx.provider || CATEGORY_PROVIDERS[tx.category] || 'SANDBOX'} />
                    </td>
                    <td>
                      <StatusPill status={tx.status} />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/transactions/${tx.intent_id || tx.id}`}
                        className={styles.primaryLink}
                        style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
                      >
                        View &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: 'var(--jp-space-3) var(--jp-space-4)', background: 'var(--jp-surface-sidebar)', borderTop: '1px solid var(--jp-border)', fontSize: '12px', color: 'var(--jp-text-muted)' }}>
            Showing {rows.length} of {data?.totalCount || rows.length} transactions
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionsPage;
