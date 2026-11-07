/**
 * web/src/pages/PayoutPage.jsx
 * Payout Transaction UI: maker/checker controls, states, timeline, double-entry view
 * (K-PAYOUT, FR-1301...1307)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
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

export function PayoutPage({ payoutId = null }) {
  const { t } = useTranslation();

  const {
    data: payout,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['payout', payoutId],
    queryFn: async () => {
      if (!payoutId) return null;
      return apiClient.get(`/api/v1/payouts/${payoutId}`);
    },
    enabled: Boolean(payoutId),
  });

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="payout-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading payout transaction data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="payout-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Payout</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'An internal system error occurred.'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!payoutId || !payout) {
    return (
      <div className={styles.emptyCard} data-testid="payout-empty">
        <DollarSign size={36} color="var(--jp-text-muted)" />
        <h3 className={styles.emptyTitle}>No Payout Transactions Found</h3>
        <p className={styles.emptyDesc}>
          Submit a new payout proposal from an agent, API request, or the transaction proposal hub.
        </p>
        <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
          SANDBOX ONLY — Simulated Funds
        </span>
      </div>
    );
  }

  return (
    <div className={styles.pageStack} data-testid="payout-detail">
      {/* Sandbox Warning Banner */}
      <div className={styles.calculationCard} style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
          <strong style={{ color: 'var(--jp-blue-dark)' }}>SANDBOX ONLY</strong>
          <span style={{ color: 'var(--jp-text-muted)' }}>Testing Environment — No real money movement</span>
        </div>
      </div>

      {/* Header */}
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

      {/* Maker / Checker Control Notice */}
      <div className={styles.formCard} style={{ maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={18} />
          <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Integrated Maker / Checker Governance</h4>
        </div>
        <p className={styles.pageSubtitle} style={{ margin: 0 }}>
          Every payout proposal initiated by an AI agent must clear the 4-stage Decision Engine (Stages A/B/C/D) and requires human approver sign-off if policy thresholds are met.
        </p>
      </div>

      {/* Double-Entry Ledger Preview */}
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

export default PayoutPage;
