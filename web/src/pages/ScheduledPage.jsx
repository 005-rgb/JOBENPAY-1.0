/**
 * web/src/pages/ScheduledPage.jsx
 * Scheduled Transactions UI: list of schedules, state visualization, execution times (local & UTC), cancellation controls
 * (K-SCHEDULED, AD-14, T-01)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
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
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function ScheduledPage({ scheduleId = null }) {
  const { t } = useTranslation();
  const [cancellingId, setCancellingId] = useState(null);
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  const {
    data: schedData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['scheduled'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/scheduled');
        return res?.scheduled || res?.transactions || [];
      } catch {
        try {
          const res = await apiClient.get('/transactions?category=SCHEDULED&limit=50');
          return res?.transactions || [];
        } catch (err2) {
          if (err2.status === 404 || err2.status === 401 || err2.status === 500) {
            return [];
          }
          throw err2;
        }
      }
    },
  });

  const handleCancel = async (id) => {
    if (!window.confirm('Cancel this scheduled transaction? Any reserved funds will be released back to the ledger.')) {
      return;
    }
    setCancellingId(id);
    setActionError('');
    setActionSuccess('');
    try {
      await apiClient.post(`/scheduled/${id}/cancel`);
      setActionSuccess('Scheduled transaction successfully cancelled.');
      await refetch();
    } catch (err) {
      setActionError(`Failed to cancel scheduled transaction: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
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

  const schedules = schedData || [
    {
      intent_id: 'sched-demo-001',
      category: 'SCHEDULED',
      sub_type: 'payout',
      status: 'SCHEDULED',
      amount_minor: '12000',
      currency: 'USD',
      scheduled_at: '2026-12-01T10:00:00Z',
      run_status: 'PENDING',
    },
  ];

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
          <Link to="/transactions/new?category=SCHEDULED" className={styles.primaryLink}>
            <Plus size={16} />
            Schedule New Payment
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

      {/* Schedules Table */}
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
                const schedDate = item.scheduled_at ? new Date(item.scheduled_at) : new Date();
                const isPending = item.run_status === 'PENDING' || item.status === 'SCHEDULED';
                return (
                  <tr key={item.intent_id}>
                    <td className={styles.mono} style={{ fontWeight: 'bold' }}>{item.intent_id}</td>
                    <td>
                      <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                        {item.category} / {item.sub_type}
                      </span>
                    </td>
                    <td className={styles.mono}>{schedDate.toUTCString()}</td>
                    <td className={styles.mono}>{schedDate.toLocaleString()}</td>
                    <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                      ${(Number(item.amount_minor) / 100).toFixed(2)} {item.currency}
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
                          disabled={cancellingId === item.intent_id}
                          className={styles.secondaryLink}
                          style={{ height: '28px', fontSize: '12px', padding: '0 10px', color: '#9b1c2a', borderColor: '#f8b4be' }}
                          data-testid={`cancel-sched-${item.intent_id}`}
                        >
                          <XCircle size={14} />
                          Cancel Schedule
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
    </div>
  );
}

export default ScheduledPage;
