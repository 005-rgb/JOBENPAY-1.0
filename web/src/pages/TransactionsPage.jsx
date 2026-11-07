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
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { TRANSACTION_CATEGORIES, TRANSACTION_STATUSES, CATEGORY_PROVIDERS } from '../../../shared/transaction.js';
import styles from './F04Pages.module.css';

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
    return d.toLocaleString(undefined, {
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
  let colorStyle = 'bg-gray-100 text-gray-800 border-gray-200';
  if (normalized === 'COMPLETED' || normalized === 'APPROVED' || normalized === 'SETTLED' || normalized === 'RECONCILED') {
    colorStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  } else if (normalized === 'NEEDS_APPROVAL' || normalized === 'PENDING' || normalized === 'AWAITING_BUYER') {
    colorStyle = 'bg-amber-100 text-amber-800 border-amber-300';
  } else if (normalized === 'EXECUTING' || normalized === 'SUBMITTED' || normalized === 'EVALUATING') {
    colorStyle = 'bg-blue-100 text-blue-800 border-blue-300';
  } else if (normalized === 'FAILED' || normalized === 'REJECTED' || normalized === 'MISMATCH') {
    colorStyle = 'bg-rose-100 text-rose-800 border-rose-300';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorStyle}`}
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
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
        isSimulated ? 'bg-purple-100 text-purple-800 border border-purple-300' : 'bg-slate-100 text-slate-700 border border-slate-300'
      }`}
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
      return apiClient.get(`/api/v1/transactions?${queryParams.toString()}`);
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
      <div className={styles.pageToolbar}>
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t('transactions.title', 'Transactions')}</h2>
          <p className="text-sm text-gray-500">
            {t('transactions.subtitle', 'Universal transaction engine monitoring across all 15 categories')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 border rounded-md text-gray-600 hover:bg-gray-50 transition"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <Link
            to="/transactions/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition shadow-sm"
            data-testid="new-transaction-btn"
          >
            <Plus className="w-4 h-4" />
            {t('transactions.new', 'New Transaction')}
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border rounded-xl p-4 shadow-sm space-y-4">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t('transactions.searchPlaceholder', 'Search by ID, payee, counterparty, description...')}
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-black"
              data-testid="transactions-search"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-lg transition"
          >
            {t('transactions.search', 'Search')}
          </button>
          {(selectedCategories.length > 0 || selectedStatuses.length > 0 || searchTerm) && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg transition flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              {t('transactions.clearFilters', 'Clear')}
            </button>
          )}
        </form>

        {/* Category Filter Pills */}
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
            {t('transactions.filterCategory', 'Filter by Category')}
          </span>
          <div className="flex flex-wrap gap-1.5" data-testid="category-filters">
            {TRANSACTION_CATEGORIES.map((cat) => {
              const active = selectedCategories.includes(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    active
                      ? 'bg-black text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  data-testid={`filter-cat-${cat.toLowerCase()}`}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Filter Pills */}
        <div>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
            {t('transactions.filterStatus', 'Filter by Status')}
          </span>
          <div className="flex flex-wrap gap-1.5" data-testid="status-filters">
            {['SUBMITTED', 'NEEDS_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED'].map((st) => {
              const active = selectedStatuses.includes(st);
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => toggleStatus(st)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  data-testid={`filter-status-${st.toLowerCase()}`}
                >
                  {st.replaceAll('_', ' ')}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content: Loading, Error, Empty, or Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white border rounded-xl text-center space-y-3" data-testid="transactions-loading">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">{t('transactions.loading', 'Loading transactions...')}</p>
        </div>
      ) : isError ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-xl space-y-2" data-testid="transactions-error">
          <div className="flex items-center gap-2 text-red-800 font-semibold">
            <AlertCircle className="w-5 h-5 text-red-600" />
            {t('transactions.errorTitle', 'Failed to load transactions')}
          </div>
          <p className="text-sm text-red-700">{error?.message || 'Unknown network error'}</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-medium transition"
          >
            {t('app.retry', 'Retry')}
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-12 bg-white border rounded-xl text-center space-y-4" data-testid="transactions-empty">
          <div className="w-12 h-12 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">{t('transactions.noResults', 'No transactions found')}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {t('transactions.noResultsDesc', 'Transactions matching current filter criteria will be listed here.')}
            </p>
          </div>
          {(selectedCategories.length > 0 || selectedStatuses.length > 0 || searchTerm) && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="px-4 py-2 border rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              {t('transactions.resetFilters', 'Reset Filters')}
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden" data-testid="transactions-table-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="transactions-table">
              <thead className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">{t('transactions.colDate', 'Date')}</th>
                  <th className="py-3 px-4">{t('transactions.colCategory', 'Category')}</th>
                  <th className="py-3 px-4">{t('transactions.colAmount', 'Amount')}</th>
                  <th className="py-3 px-4">{t('transactions.colCounterparty', 'Counterparty')}</th>
                  <th className="py-3 px-4">{t('transactions.colProvider', 'Provider')}</th>
                  <th className="py-3 px-4">{t('transactions.colStatus', 'Status')}</th>
                  <th className="py-3 px-4 text-right">{t('transactions.colAction', 'Action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((tx) => (
                  <tr key={tx.intent_id || tx.id} className="hover:bg-gray-50/80 transition" data-testid={`tx-row-${tx.intent_id}`}>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-600 whitespace-nowrap">
                      {dateLabel(tx.created_at)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                        <span>{tx.category}</span>
                        <span className="text-xs text-gray-400 font-normal">/ {tx.sub_type}</span>
                      </div>
                      <div className="text-[11px] font-mono text-gray-400 truncate max-w-[140px]">
                        {tx.intent_id}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-900 whitespace-nowrap">
                      {formatMoney(tx.amount_minor, tx.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-gray-700">
                      <div className="font-medium text-xs truncate max-w-[200px]">
                        {tx.counterparty_name || '—'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <ProviderBadge provider={tx.provider} />
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusPill status={tx.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/transactions/${tx.intent_id || tx.id}`}
                        className="text-xs font-semibold text-black hover:underline"
                        data-testid={`view-tx-${tx.intent_id}`}
                      >
                        {t('transactions.viewDetails', 'View')} &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-3 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-500">
            <span>
              {t('transactions.showingCount', { count: rows.length, total: data?.totalCount || rows.length })}
            </span>
            <span className="font-mono text-[11px] text-gray-400">Double-entry verified & idempotency enforced</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TransactionsPage;

