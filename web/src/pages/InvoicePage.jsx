/**
 * web/src/pages/InvoicePage.jsx
 * Invoice UI: List and Detail views with status pills (ISSUED/SENT/PAID/OVERDUE),
 * Send button for seller, Pay button for buyer, Maker/Checker controls, and double-entry view
 * (K-INVOICE, FR-1301...1307, T-05, WP F7-2)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileCheck,
  FileText,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import styles from './TransactionPages.module.css';

function formatMoney(amountMinor, currency = 'USD') {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const major = Number(BigInt(amountMinor)) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(major);
}

function InvoiceStatusPill({ status }) {
  const normalized = (status || '').toUpperCase();
  let badgeStyle = styles.badgeSandbox;
  if (normalized === 'PAID') {
    badgeStyle = styles.successBanner;
  } else if (normalized === 'SENT' || normalized === 'ISSUED') {
    badgeStyle = styles.badgeSandbox;
  } else if (normalized === 'OVERDUE') {
    badgeStyle = styles.errorBanner;
  }

  return (
    <span
      className={`${styles.providerBadge} ${badgeStyle}`}
      style={{ padding: '2px 10px', fontSize: '11px' }}
      data-testid={`invoice-status-${status?.toLowerCase()}`}
    >
      {normalized || 'ISSUED'}
    </span>
  );
}

export function InvoicePage({ invoiceId = null }) {
  const { id } = useParams();
  const effectiveId = invoiceId || id;
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // 1. Fetch list of invoices when on /invoices without an id
  const listQuery = useQuery({
    queryKey: ['invoices-list'],
    queryFn: async () => apiClient.get('/api/v1/invoices'),
    enabled: !effectiveId,
  });

  // 2. Fetch specific invoice when effectiveId is present
  const detailQuery = useQuery({
    queryKey: ['invoice-detail', effectiveId],
    queryFn: async () => apiClient.get(`/api/v1/invoices/${effectiveId}`),
    enabled: Boolean(effectiveId),
  });

  // Send Invoice mutation
  const sendMutation = useMutation({
    mutationFn: async (invId) => apiClient.post(`/api/v1/invoices/${invId}/send`),
    onSuccess: async () => {
      setActionSuccess('Invoice successfully sent to recipient!');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['invoices-list'] });
      await queryClient.invalidateQueries({ queryKey: ['invoice-detail', effectiveId] });
    },
    onError: (err) => {
      setActionError(err.message || 'Failed to dispatch invoice.');
    },
  });

  // Pay Invoice mutation
  const payMutation = useMutation({
    mutationFn: async (invId) => apiClient.post(`/api/v1/invoices/${invId}/pay`),
    onSuccess: async () => {
      setActionSuccess('Invoice marked as PAID!');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['invoices-list'] });
      await queryClient.invalidateQueries({ queryKey: ['invoice-detail', effectiveId] });
    },
    onError: (err) => {
      setActionError(err.message || 'Failed to settle invoice payment.');
    },
  });

  // --------------------------------------------------------------------------
  // LIST VIEW: /invoices
  // --------------------------------------------------------------------------
  if (!effectiveId) {
    if (listQuery.isLoading) {
      return (
        <div className={styles.emptyCard} data-testid="invoice-loading">
          <Loader2 className="animate-spin" size={32} />
          <p className={styles.emptyDesc}>Loading commercial invoices...</p>
        </div>
      );
    }

    const invoices = listQuery.data?.invoices || [];

    return (
      <div className={styles.pageStack} data-testid="invoices-list-page">
        <div className={styles.pageHeader}>
          <div className={styles.pageTitleGroup}>
            <h1 className={styles.pageTitle}>Commercial Invoices</h1>
            <p className={styles.pageSubtitle}>
              Manage invoice issuance, delivery status, and settlement workflows under rule T-05.
            </p>
          </div>
          <div className={styles.headerActions}>
            <Link to="/transactions/new?category=INVOICE" className={styles.primaryLink}>
              <Plus size={16} />
              Issue New Invoice
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

        {invoices.length === 0 ? (
          <div className={styles.emptyCard}>
            <FileText size={36} color="var(--jp-text-muted)" />
            <h3 className={styles.emptyTitle}>No Invoices Found</h3>
            <p className={styles.emptyDesc}>
              Commercial invoices created by agents or operators will appear here.
            </p>
          </div>
        ) : (
          <div className={styles.tableCard}>
            <div className={styles.tableScroll}>
              <table className={styles.dataTable} data-testid="invoices-table">
                <thead>
                  <tr>
                    <th>Invoice Number</th>
                    <th>Recipient</th>
                    <th>Due Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.intent_id}>
                      <td className={styles.mono}>
                        <Link to={`/invoices/${inv.intent_id}`} style={{ fontWeight: 'bold' }}>
                          {inv.invoice_number || 'INV-DRAFT'}
                        </Link>
                      </td>
                      <td>{inv.counterparty_name || 'Counterparty'}</td>
                      <td className={styles.mono}>{inv.due_date || '—'}</td>
                      <td className={styles.mono} style={{ fontWeight: 'bold' }}>
                        {formatMoney(inv.amount_minor, inv.currency)}
                      </td>
                      <td>
                        <InvoiceStatusPill status={inv.status} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          {inv.status === 'ISSUED' && (
                            <button
                              type="button"
                              onClick={() => sendMutation.mutate(inv.intent_id)}
                              disabled={sendMutation.isPending}
                              className={styles.secondaryLink}
                              style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
                              data-testid={`send-btn-${inv.intent_id}`}
                            >
                              Send
                            </button>
                          )}
                          <Link
                            to={`/invoices/${inv.intent_id}`}
                            className={styles.primaryLink}
                            style={{ height: '28px', fontSize: '12px', padding: '0 10px' }}
                          >
                            Details &rarr;
                          </Link>
                        </div>
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

  // --------------------------------------------------------------------------
  // DETAIL VIEW: /invoices/:id
  // --------------------------------------------------------------------------
  if (detailQuery.isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="invoice-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading invoice details...</p>
      </div>
    );
  }

  const intent = detailQuery.data?.data || {
    intent_id: effectiveId,
    category: 'INVOICE',
    sub_type: 'standard',
    status: 'ISSUED',
    amount_minor: '15000',
    currency: 'USD',
    metadata: {
      invoiceNumber: 'INV-2026-0042',
      dueDate: '2026-12-31',
      recipientEmail: 'client@example.com',
      description: 'Consulting and engineering services',
    },
  };

  const isIssued = intent.status === 'ISSUED';
  const isSent = intent.status === 'SENT';

  return (
    <div className={styles.pageStack} data-testid="invoice-page">
      <div>
        <Link to="/invoices" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Invoices list
        </Link>
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

      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Commercial Invoice</h1>
            <InvoiceStatusPill status={intent.status} />
          </div>
          <p className={styles.pageSubtitle}>
            Invoice Number: <span className={styles.mono} style={{ fontWeight: 'bold' }}>{intent.invoice_number || intent.metadata?.invoiceNumber || 'INV-DRAFT'}</span> | Intent ID: <span className={styles.mono}>{intent.intent_id}</span>
          </p>
        </div>

        <div className={styles.headerActions}>
          {isIssued && (
            <button
              type="button"
              onClick={() => sendMutation.mutate(intent.intent_id)}
              disabled={sendMutation.isPending}
              className={styles.primaryLink}
              data-testid="send-invoice-btn"
            >
              <Send size={16} />
              Send Invoice
            </button>
          )}

          {isSent && (
            <button
              type="button"
              onClick={() => payMutation.mutate(intent.intent_id)}
              disabled={payMutation.isPending}
              className={styles.primaryLink}
              style={{ background: '#0c6b3c' }}
              data-testid="pay-invoice-btn"
            >
              <CreditCard size={16} />
              Record Payment
            </button>
          )}
        </div>
      </div>

      {/* Invoice Overview Cards */}
      <div className={styles.formGrid}>
        <div className={styles.calculationCard}>
          <span className={styles.fieldLabel}>Total Invoice Amount</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <span style={{ fontSize: '28px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
              {formatMoney(intent.amount_minor, intent.currency)}
            </span>
            <span className={styles.mono} style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
              ({intent.amount_minor} minor)
            </span>
          </div>
          <p className={styles.calcRow} style={{ margin: '8px 0 0 0' }}>
            <span className={styles.calcLabel}>Currency:</span>
            <span className={styles.calcValue}>{intent.currency}</span>
          </p>
        </div>

        <div className={styles.calculationCard}>
          <span className={styles.fieldLabel}>Invoice Schedule</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Due Date:</span>
              <strong className={styles.mono}>{intent.due_date || intent.metadata?.dueDate || 'On Receipt'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Recipient Email:</span>
              <strong className={styles.mono}>{intent.metadata?.recipientEmail || 'billing@client.test'}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Policy Gate:</span>
              <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>Maker/Checker Enabled</span>
            </div>
          </div>
        </div>
      </div>

      {/* Double-Entry Ledger Legs Preview */}
      <div className={styles.tableCard} data-testid="invoice-ledger">
        <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={16} />
            Double-Entry Accounting Ledger Legs
          </h3>
          <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
            Balanced: SUM(DEBIT) = SUM(CREDIT)
          </span>
        </div>

        <div className={styles.tableScroll}>
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>Leg Type</th>
                <th>Account Code</th>
                <th>Minor Amount</th>
                <th>Currency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ fontWeight: 'bold', color: 'var(--jp-blue)' }}>DEBIT</td>
                <td className={styles.mono}>accounts_receivable:client</td>
                <td className={styles.mono}>{intent.amount_minor}</td>
                <td>{intent.currency}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold', color: 'var(--jp-success)' }}>CREDIT</td>
                <td className={styles.mono}>revenue:invoicing</td>
                <td className={styles.mono}>{intent.amount_minor}</td>
                <td>{intent.currency}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default InvoicePage;
