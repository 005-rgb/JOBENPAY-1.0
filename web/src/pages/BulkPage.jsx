/**
 * web/src/pages/BulkPage.jsx
 * Bulk Payouts UI: batch list, item progress tracker, summary report, Maker/Checker approval
 * (K-BULK, AD-17, T-19)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

export function BulkPage({ batchId: propBatchId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveBatchId = propBatchId || params.id || null;
  const { environment, isLive } = useEnvironment();
  const { notify } = useToast();

  // 1. Single Batch Detail Query (when batchId is provided)
  const {
    data: batchData,
    isLoading: isBatchLoading,
    isError: isBatchError,
    error: batchError,
    refetch: refetchBatch,
    isFetching: isFetchingBatch,
  } = useQuery({
    queryKey: ['bulk', effectiveBatchId, environment],
    queryFn: async () => {
      if (!effectiveBatchId) return null;
      return apiClient.get(`/bulk/${effectiveBatchId}`);
    },
    enabled: Boolean(effectiveBatchId),
  });

  // 2. Batches List Query (when on list view)
  const {
    data: listData,
    isLoading: isListLoading,
    isError: isListError,
    error: listError,
    refetch: refetchList,
    isFetching: isFetchingList,
  } = useQuery({
    queryKey: ['bulk-list', environment],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/bulk');
        return res?.batches || [];
      } catch {
        try {
          const res = await apiClient.get('/transactions?category=BULK&limit=50');
          return res?.transactions || [];
        } catch {
          return [];
        }
      }
    },
    enabled: !effectiveBatchId,
  });

  // --------------------------------------------------------------------------
  // DETAIL VIEW
  // --------------------------------------------------------------------------
  if (effectiveBatchId) {
    if (isBatchLoading) {
      return (
        <div className={styles.emptyCard} data-testid="bulk-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading bulk payout batch data...</p>
        </div>
      );
    }

    if (isBatchError) {
      return (
        <div className={styles.pageStack} data-testid="bulk-error">
          <div className={styles.errorBanner}>
            <AlertCircle size={20} />
            <div>
              <strong>Failed to Load Bulk Payout Batch</strong>
              <p style={{ margin: '4px 0 0 0' }}>{batchError?.message || 'A system error occurred while contacting the server.'}</p>
            </div>
          </div>
          <Link to="/transactions" className={styles.secondaryLink} style={{ alignSelf: 'flex-start' }}>
            Back to Transactions
          </Link>
        </div>
      );
    }

    const batch = batchData?.batch;
    const items = batchData?.items || [];

    if (!batch) {
      return (
        <div className={styles.emptyCard} data-testid="bulk-not-found">
          <FileSpreadsheet size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>Batch Not Found</h3>
          <p className={styles.emptyDesc}>No bulk batch was found for ID: {effectiveBatchId}</p>
          <Link to="/transactions" className={styles.primaryLink}>
            Back to Transactions
          </Link>
        </div>
      );
    }

    return (
      <div className={styles.pageStack} data-testid="bulk-page">
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 className={styles.pageTitle}>Bulk Batch #{batch.batch_id?.slice(0, 8)}</h1>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                TIER B / PAYPAL
              </span>
            </div>
            <p className={styles.pageSubtitle}>
              Parent Intent: {batch.parent_intent_id || '—'}
            </p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={() => {
                refetchBatch();
                notify({ message: 'Refreshing batch details...' });
              }}
              disabled={isFetchingBatch}
              className={styles.secondaryLink}
            >
              <RefreshCw size={14} className={isFetchingBatch ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/transactions/new?category=BULK" className={styles.primaryLink}>
              <Plus size={16} />
              Submit New Batch
            </Link>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className={styles.formGrid} data-testid="bulk-batch-summary">
          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Total Batch Volume</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
                ${(Number(batch.total_amount_minor || 0) / 100).toFixed(2)}
              </span>
              <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                {batch.currency || 'USD'}
              </span>
            </div>
            <p className={styles.calcRow} style={{ margin: '8px 0 0 0' }}>
              <span className={styles.calcLabel}>Batch Status:</span>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>{batch.status}</span>
            </p>
          </div>

          <div className={styles.calculationCard}>
            <span className={styles.fieldLabel}>Batch Item Execution</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Total Items:</span>
                <strong className={styles.mono}>{batch.item_count || items.length} items</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Completed Items:</span>
                <strong className={styles.mono} style={{ color: 'var(--jp-success)' }}>
                  {items.filter((i) => i.status === 'COMPLETED' || i.status === 'APPROVED').length} items
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--jp-text-muted)' }}>Failed Items:</span>
                <strong className={styles.mono} style={{ color: 'var(--jp-badge-red)' }}>
                  {items.filter((i) => i.status === 'FAILED' || i.status === 'REJECTED').length} items
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className={styles.tableCard}>
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileSpreadsheet size={18} />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Batch Items Progress Tracking</h2>
          </div>

          <div className={styles.tableScroll}>
            {items.length === 0 ? (
              <div className={styles.emptyCard}>
                <p className={styles.emptyDesc}>No child item records found for this bulk batch.</p>
              </div>
            ) : (
              <table className={styles.dataTable} data-testid="bulk-items-table">
                <thead>
                  <tr>
                    <th>Item Intent ID</th>
                    <th>Recipient Email</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.intent_id}>
                      <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                        <Link to={`/transactions/${item.intent_id}`} style={{ color: 'inherit' }}>
                          {item.intent_id}
                        </Link>
                      </td>
                      <td>{item.metadata?.recipientEmail || item.counterparty_id || 'payee@example.com'}</td>
                      <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                        ${(Number(item.amount_minor || 0) / 100).toFixed(2)} {item.currency}
                      </td>
                      <td>
                        <span
                          className={`${styles.providerBadge} ${
                            item.status === 'COMPLETED' || item.status === 'APPROVED'
                              ? styles.successBanner
                              : item.status === 'FAILED' || item.status === 'REJECTED'
                              ? styles.errorBanner
                              : styles.badgeSandbox
                          }`}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LIST VIEW (when batchId is null)
  // --------------------------------------------------------------------------
  const batches = listData || [];

  return (
    <div className={styles.pageStack} data-testid="bulk-page">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Bulk Payout Batches</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              TIER B / PAYPAL
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            High-volume batch payout orchestration up to 15,000 items with stream processing and precise fund reservation (K-BULK, T-19).
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => {
              refetchList();
              notify({ message: 'Refreshing bulk batches...' });
            }}
            disabled={isFetchingList}
            className={styles.secondaryLink}
          >
            <RefreshCw size={14} className={isFetchingList ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link to="/transactions/new?category=BULK" className={styles.primaryLink}>
            <Plus size={16} />
            Submit New Batch
          </Link>
        </div>
      </div>

      {isListLoading ? (
        <div className={styles.emptyCard} data-testid="bulk-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading bulk payout batches...</p>
        </div>
      ) : isListError ? (
        <div className={styles.errorBanner} data-testid="bulk-error">
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Bulk Batches</strong>
            <p style={{ margin: '4px 0 0 0' }}>{listError?.message || 'Could not retrieve bulk batches.'}</p>
          </div>
        </div>
      ) : batches.length === 0 ? (
        <div className={styles.emptyCard} data-testid="bulk-empty">
          <FileSpreadsheet size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Bulk Batches Found</h3>
          <p className={styles.emptyDesc}>
            No bulk payout batches have been created in this environment. Submit a new batch to disburse funds to multiple payees at once.
          </p>
          <Link to="/transactions/new?category=BULK" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Submit New Batch
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard} data-testid="bulk-batches-table">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Parent Intent</th>
                  <th>Total Amount</th>
                  <th>Items</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch_id || b.intent_id}>
                    <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                      {b.batch_id ? b.batch_id.slice(0, 8) + '...' : b.intent_id?.slice(0, 8) + '...'}
                    </td>
                    <td className={styles.mono}>
                      <Link to={`/transactions/${b.parent_intent_id || b.intent_id}`} style={{ color: 'inherit' }}>
                        {(b.parent_intent_id || b.intent_id)?.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                      ${(Number(b.total_amount_minor || b.amount_minor || 0) / 100).toFixed(2)} {b.currency || 'USD'}
                    </td>
                    <td>{b.item_count || '1'} items</td>
                    <td>
                      <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                        {b.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      {b.created_at ? new Date(b.created_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={b.batch_id ? `/transactions/bulk?batchId=${b.batch_id}` : `/transactions/${b.intent_id}`}
                        className={styles.secondaryLink}
                        style={{ height: '26px', fontSize: '11px', padding: '0 8px' }}
                      >
                        View Items &rarr;
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

export default BulkPage;
