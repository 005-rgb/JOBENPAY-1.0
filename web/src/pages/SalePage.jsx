/**
 * web/src/pages/SalePage.jsx
 * Sale Transaction UI: maker/checker controls, states, timeline, double-entry view, buyer approval link
 * (K-SALE, FR-1301...1307)
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
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function SalePage({ saleId = null }) {
  const { t } = useTranslation();

  const {
    data: sale,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      if (!saleId) return null;
      return apiClient.get(`/api/v1/sales/${saleId}`);
    },
    enabled: Boolean(saleId),
  });

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="sale-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading sale transaction data...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="sale-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Sale Transaction</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'An internal system error occurred.'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className={styles.emptyCard} data-testid="sale-empty">
        <ShoppingCart size={36} color="var(--jp-text-muted)" />
        <h3 className={styles.emptyTitle}>Sale Capture (SALE)</h3>
        <p className={styles.emptyDesc}>
          Create customer sales orders and capture payments via PayPal Orders Capture API.
        </p>
        <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
          SANDBOX LOCKED ENVIRONMENT (TESTING ONLY)
        </span>
      </div>
    );
  }

  const { data } = sale;
  const approvalUrl = data.metadata?.approvalUrl;

  return (
    <div className={styles.pageStack} data-testid="sale-detail">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Sale #{data.intent_id?.slice(0, 8)}</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              {data.status}
            </span>
          </div>
          <p className={styles.pageSubtitle}>Category: SALE (Orders Capture)</p>
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

      {/* Buyer Approval Link Callout if Awaiting */}
      {approvalUrl && data.status === 'EXECUTING' && (
        <div className={styles.calculationCard} style={{ background: '#eaf3ff', borderColor: '#b3cdfb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ color: '#003087', fontSize: '13px' }}>Buyer Approval Required</strong>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#003087' }}>
                Complete the payment simulation via PayPal checkout redirect link:
              </p>
            </div>
            <a
              href={approvalUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.primaryLink}
              style={{ height: '30px', fontSize: '12px' }}
            >
              Open Checkout Simulator <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

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
              +{data.currency} {(Number(data.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
          <div className={styles.calculationCard} style={{ background: '#f5f0ff', borderColor: '#d4c2fc' }}>
            <span style={{ fontWeight: 'bold', color: '#5521b5', fontSize: '12px' }}>CREDIT (Sales Revenue)</span>
            <div className={styles.mono} style={{ fontSize: '12px', marginTop: '4px' }}>Account: revenue:sales</div>
            <div className={styles.mono} style={{ fontSize: '18px', fontWeight: 'bold', color: '#5521b5', marginTop: '4px' }}>
              +{data.currency} {(Number(data.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SalePage;
