/**
 * web/src/pages/RefundPage.jsx
 * Refund Transaction UI: maker/checker controls, cumulative tracker, double-entry view
 * (K-REFUND, FR-1301...1307, T-10)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function RefundPage({ refundId = null }) {
  const { t } = useTranslation();

  const {
    data: refund,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['refund', refundId],
    queryFn: async () => {
      if (!refundId) return null;
      return apiClient.get(`/api/v1/refunds/${refundId}`);
    },
    enabled: Boolean(refundId),
  });

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="refund-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading refund transaction data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="refund-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Refund</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'An internal system error occurred.'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!refund) {
    return (
      <div className={styles.emptyCard} data-testid="refund-empty">
        <RotateCcw size={36} color="var(--jp-text-muted)" />
        <h3 className={styles.emptyTitle}>Refund Processing (REFUND)</h3>
        <p className={styles.emptyDesc}>
          Full or partial refund processing against settled sale captures with cumulative limit tracking.
        </p>
        <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
          SANDBOX LOCKED ENVIRONMENT (TESTING ONLY)
        </span>
      </div>
    );
  }

  const { data } = refund;

  return (
    <div className={styles.pageStack} data-testid="refund-detail">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Refund #{data.intent_id?.slice(0, 8)}</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              {data.status}
            </span>
          </div>
          <p className={styles.pageSubtitle}>Category: REFUND (full / partial)</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={styles.mono} style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {data.currency} {(Number(data.amount_minor || 0) / 100).toFixed(2)}
          </div>
          <p className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
            Reconciliation: {data.reconciliation_status}
          </p>
        </div>
      </div>

      {/* Double-Entry Ledger Preview */}
      <div className={styles.tableCard}>
        <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Balanced Double-Entry Financial Ledger</h3>
        </div>
        <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
          <div className={styles.calculationCard} style={{ background: '#fdecef', borderColor: '#f8b4be' }}>
            <span style={{ fontWeight: 'bold', color: '#9b1c2a', fontSize: '12px' }}>DEBIT (Revenue Reversal)</span>
            <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: revenue:sales</div>
            <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#9b1c2a', marginTop: '4px' }}>
              +{data.currency} {(Number(data.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
          <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
            <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>CREDIT (Buyer Cash Refund)</span>
            <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: buyer:{data.counterparty_id?.slice(0, 8)}...</div>
            <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c6b3c', marginTop: '4px' }}>
              +{data.currency} {(Number(data.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RefundPage;
