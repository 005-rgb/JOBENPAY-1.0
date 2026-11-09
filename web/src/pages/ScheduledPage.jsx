/**
 * web/src/pages/ScheduledPage.jsx
 * Scheduled Transactions UI: list of schedules, state visualization, execution times (local & UTC), cancellation controls
 * (K-SCHEDULED, AD-14, T-01)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

export function ScheduledPage({ scheduleId = null }) {
  const { t } = useTranslation();
  const { environment, isLive } = useEnvironment();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [cancellingId, setCancellingId] = useState(null);

  const {
    data: schedData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['scheduled', environment],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/scheduled');
        return res?.scheduled || res?.transactions || [];
      } catch {
        try {
          const res = await apiClient.get('/transactions?category=SCHEDULED&limit=50');
          return res?.transactions || [];
        } catch {
          return [];
        }
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id) => {
      return apiClient.post(`/scheduled/${id}/cancel`);
    },
    onSuccess: async () => {
      notify({ message: 'Scheduled transaction successfully cancelled. Reserved funds released back to ledger.' });
      await queryClient.invalidateQueries({ queryKey: ['scheduled', environment] });
      await queryClient.invalidateQueries({ queryKey: ['transactions', environment] });
    },
    onError: (err) => {
      notify({ message: `Failed to cancel scheduled transaction: ${err.message}`, kind: 'error' });
    },
    onSettled: () => {
      setCancellingId(null);
    },
  });

  const handleCancel = (id) => {
    setCancellingId(id);
    cancelMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="scheduled-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading scheduled transactions...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="scheduled-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Scheduled Transactions</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'An internal system error occurred.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const schedules = schedData || [];

  return (
    <div className={styles.pageStack} data-testid="scheduled-page">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Scheduled Transactions</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              TIER A / DETERMINISTIC
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Time-delayed payment execution with pre-allocated ledger reservations and cancellation governance (K-SCHEDULED, AD-14, T-01).
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            onClick={() => {
              refetch();
              notify({ message: 'Refreshing scheduled transactions...' });
            }}
            disabled={isFetching}
            className={styles.secondaryLink}
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
            Refresh
          </button>
          <Link to="/transactions/new?category=SCHEDULED" className={styles.primaryLink}>
            <Plus size={16} />
            Schedule New Payment
          </Link>
        </div>
      </div>

      {/* Schedules Table */}
      {schedules.length === 0 ? (
        <div className={styles.emptyCard} data-testid="scheduled-empty">
          <Clock size={36} color="var(--jp-text-muted)" />
          <h3 className={styles.emptyTitle}>No Scheduled Payments Found</h3>
          <p className={styles.emptyDesc}>
            There are no delayed or future-dated transactions scheduled for execution in this environment.
          </p>
          <Link to="/transactions/new?category=SCHEDULED" className={styles.primaryLink} style={{ marginTop: '12px' }}>
            <Plus size={16} />
            Schedule First Payment
          </Link>
        </div>
      ) : (
        <div className={styles.tableCard}>
          <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Clock size={18} />
            <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Upcoming Execution Schedule</h2>
          </div>

          <div className={styles.tableScroll}>
            <table className={styles.dataTable} data-testid="scheduled-table">
              <thead>
                <tr>
                  <th>Schedule Intent ID</th>
                  <th>Target Category</th>
                  <th>Execution Time (UTC)</th>
                  <th>Execution Time (Local)</th>
                  <th>Amount</th>
                  <th>Run Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((item) => {
                  const schedDate = item.scheduled_at ? new Date(item.scheduled_at) : (item.created_at ? new Date(item.created_at) : new Date());
                  const isPending = item.run_status === 'PENDING' || item.status === 'SCHEDULED' || item.status === 'SUBMITTED';
                  const isCurrentCancelling = cancellingId === item.intent_id;

                  return (
                    <tr key={item.intent_id}>
                      <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                        <Link to={`/transactions/${item.intent_id}`} style={{ color: 'inherit' }}>
                          {item.intent_id.slice(0, 8)}...
                        </Link>
                      </td>
                      <td>
                        <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                          {item.category || 'SCHEDULED'} {item.sub_type ? `/ ${item.sub_type}` : ''}
                        </span>
                      </td>
                      <td className={styles.mono}>{schedDate.toUTCString()}</td>
                      <td className={styles.mono}>{schedDate.toLocaleString()}</td>
                      <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                        ${(Number(item.amount_minor || 0) / 100).toFixed(2)} {item.currency || 'USD'}
                      </td>
                      <td>
                        <span
                          className={`${styles.providerBadge} ${
                            isPending ? styles.badgeSandbox : styles.successBanner
                          }`}
                          style={{ padding: '2px 8px', fontSize: '10px' }}
                        >
                          {item.run_status || item.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isPending && (
                          <button
                            type="button"
                            onClick={() => handleCancel(item.intent_id)}
                            disabled={cancelMutation.isPending && isCurrentCancelling}
                            className={styles.secondaryLink}
                            style={{ height: '28px', fontSize: '12px', padding: '0 10px', color: '#9b1c2a', borderColor: '#f8b4be' }}
                            data-testid={`cancel-sched-${item.intent_id}`}
                          >
                            {isCurrentCancelling ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                Cancelling...
                              </>
                            ) : (
                              <>
                                <XCircle size={14} />
                                Cancel Schedule
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ScheduledPage;
