/**
 * web/src/pages/VoidPage.jsx
 * Void Transaction UI: maker/checker controls, authorization hold release, double-entry view
 * (K-VOID, FR-1301...1307, AD-11)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function VoidPage({ voidId = null }) {
  const { t } = useTranslation();

  const {
    data: voidData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['void', voidId],
    queryFn: async () => {
      if (!voidId) return null;
      return apiClient.get(`/api/v1/voids/${voidId}`);
    },
    enabled: Boolean(voidId),
  });

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="void-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading authorization void data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="void-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Void Transaction</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'An internal system error occurred.'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!voidData) {
    return (
      <div className={styles.emptyCard} data-testid="void-empty">
        <Ban size={36} color="var(--jp-text-muted)" />
        <h3 className={styles.emptyTitle}>Authorization Void (VOID)</h3>
        <p className={styles.emptyDesc}>
          Safely release an authorization hold or void an unpaid order without moving funds.
        </p>
        <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
          SANDBOX LOCKED ENVIRONMENT (TESTING ONLY)
        </span>
      </div>
    );
  }

  const { data } = voidData;

  return (
    <div className={styles.pageStack} data-testid="void-detail">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Void #{data.intent_id?.slice(0, 8)}</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              {data.status}
            </span>
          </div>
          <p className={styles.pageSubtitle}>Category: VOID (Authorization Hold Release)</p>
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
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Authorization Hold Release Ledger</h3>
        </div>
        <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
          <div className={styles.calculationCard} style={{ background: '#eaf3ff', borderColor: '#b3cdfb' }}>
            <span style={{ fontWeight: 'bold', color: '#003087', fontSize: '12px' }}>DEBIT (Hold Reversal)</span>
            <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: escrow:authorization_hold</div>
            <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#003087', marginTop: '4px' }}>
              +{data.currency} {(Number(data.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
          <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
            <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>CREDIT (Buyer Released)</span>
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

export default VoidPage;
