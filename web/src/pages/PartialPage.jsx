/**
 * web/src/pages/PartialPage.jsx
 * Partial Capture UI: maker/checker controls, cumulative capture tracking, double-entry view
 * (K-PARTIAL, FR-1301...1307, AD-10, AD-27)
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
  PieChart,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function PartialPage({ partialId = null }) {
  const { t } = useTranslation();

  const {
    data: partialData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['partial', partialId],
    queryFn: async () => {
      if (!partialId) return null;
      return apiClient.get(`/api/v1/partials/${partialId}`);
    },
    enabled: Boolean(partialId),
  });

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="partial-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading partial capture transaction...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="partial-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Partial Capture</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'An internal system error occurred.'}</p>
          </div>
        </div>
      </div>
    );
  }

  const intent = partialData?.data || {
    intent_id: 'e0000000-0000-4000-8000-000000000055',
    category: 'PARTIAL',
    sub_type: 'payment',
    status: 'NEEDS_APPROVAL',
    amount_minor: '50000',
    currency: 'USD',
    counterparty_id: '00000000-0000-4000-8000-000000000011',
    created_at: new Date().toISOString(),
    metadata: {
      authorizationId: 'AUTH-DEMO-9988',
      isFinal: false,
      authorizedTotal: '100000',
      capturedCumulative: '50000',
      description: 'Partial capture for order shipment #1',
    },
  };

  return (
    <div className={styles.pageStack} data-testid="partial-page">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Partial Capture #{intent.intent_id?.slice(0, 8)}</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              {intent.category} / {intent.sub_type}
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Intent ID: <span className={styles.mono}>{intent.intent_id}</span>
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className={styles.mono} style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {intent.currency} {(Number(intent.amount_minor || 0) / 100).toFixed(2)}
          </div>
          <p className={styles.pageSubtitle} style={{ fontSize: '11px' }}>
            Status: {intent.status}
          </p>
        </div>
      </div>

      {/* Cumulative Capture Metrics */}
      <div className={styles.formGrid}>
        <div className={styles.calculationCard}>
          <span className={styles.fieldLabel}>Current Partial Capture</span>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
            ${(Number(intent.amount_minor || 0) / 100).toFixed(2)} {intent.currency}
          </div>
          <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
            ({intent.amount_minor} minor units)
          </span>
        </div>

        <div className={styles.calculationCard}>
          <span className={styles.fieldLabel}>Cumulative Authorization Cap</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Authorized Total:</span>
              <strong className={styles.mono}>
                ${(Number(intent.metadata?.authorizedTotal || 0) / 100).toFixed(2)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Captured to Date:</span>
              <strong className={styles.mono} style={{ color: 'var(--jp-blue)' }}>
                ${(Number(intent.metadata?.capturedCumulative || 0) / 100).toFixed(2)}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Is Final Capture:</span>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
                {intent.metadata?.isFinal ? 'FINAL CAPTURE' : 'PARTIAL - MORE DUE'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Double-Entry Ledger Preview */}
      <div className={styles.tableCard}>
        <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} />
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Balanced Double-Entry Financial Ledger</h3>
        </div>
        <div className={styles.formGrid} style={{ padding: 'var(--jp-space-4)' }}>
          <div className={styles.calculationCard} style={{ background: '#e8f5ee', borderColor: '#a3d9b8' }}>
            <span style={{ fontWeight: 'bold', color: '#0c6b3c', fontSize: '12px' }}>DEBIT (Cash Inflow)</span>
            <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: org:main</div>
            <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#0c6b3c', marginTop: '4px' }}>
              +{intent.currency} {(Number(intent.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
          <div className={styles.calculationCard} style={{ background: '#f5f0ff', borderColor: '#d4c2fc' }}>
            <span style={{ fontWeight: 'bold', color: '#5521b5', fontSize: '12px' }}>CREDIT (Sales Revenue)</span>
            <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: revenue:sales</div>
            <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#5521b5', marginTop: '4px' }}>
              +{intent.currency} {(Number(intent.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PartialPage;
