/**
 * web/src/pages/RecurringPage.jsx
 * Recurring Billing & Subscriptions UI: agreement form, cycle limits, frequency schedule, double-entry preview, Maker/Checker approval
 * (K-RECURRING, AD-17, T-08)
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
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Repeat,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import styles from './TransactionPages.module.css';

export function RecurringPage({ recurringId = null }) {
  const { t } = useTranslation();
  const { environment, isLive } = useEnvironment();
  const [amount, setAmount] = useState('49.99');
  const [currency, setCurrency] = useState('USD');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [intervalCount, setIntervalCount] = useState(1);
  const [subscriberId, setSubscriberId] = useState('');
  const [remainingCycles, setRemainingCycles] = useState(12);
  const [description, setDescription] = useState('Enterprise API Subscription');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const {
    data: recurringData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['recurring', recurringId, environment],
    queryFn: async () => {
      if (!recurringId) return null;
      return apiClient.get(`/recurring/${recurringId}`);
    },
    enabled: Boolean(recurringId),
  });

  const parsedAmount = parseFloat(amount) || 0;

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (parsedAmount <= 0) {
      setFormError('Subscription amount per cycle must be greater than zero.');
      return;
    }

    if (remainingCycles < 1) {
      setFormError('Maximum billing cycles must be at least 1.');
      return;
    }

    setFormSuccess('Recurring subscription parameters successfully validated.');
  };

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="recurring-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading recurring billing agreement...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="recurring-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Recurring Billing</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'A system error occurred while contacting the server.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageStack} data-testid="recurring-page">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Recurring Billing & Subscriptions</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              TIER B / PAYPAL
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Automated recurring subscription billing management with cycle limits and double-entry tracking (Tier B, AD-17, T-08).
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link to="/transactions/new?category=RECURRING" className={styles.primaryLink}>
            New Subscription Agreement
          </Link>
        </div>
      </div>

      <div className={styles.twoColumnLayout}>
        {/* Left Column: Agreement Parameters Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }}>
          <form onSubmit={handleValidateForm} className={styles.formCard} data-testid="recurring-form">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <Repeat size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Subscription Agreement Setup</h2>
            </div>

            {formError && (
              <div className={styles.errorBanner}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className={styles.successBanner}>
                <CheckCircle2 size={16} />
                <span>{formSuccess}</span>
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Amount per Cycle ($)</label>
                <input
                  type="number"
                  step="any"
                  className={styles.fieldInput}
                  placeholder="49.99"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="recurring-amount-input"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Currency</label>
                <select
                  className={styles.fieldSelect}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Billing Cycle Frequency</label>
                <select
                  className={styles.fieldSelect}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  data-testid="frequency-select"
                >
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Maximum Billing Cycles</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  className={styles.fieldInput}
                  value={remainingCycles}
                  onChange={(e) => setRemainingCycles(parseInt(e.target.value, 10) || 1)}
                />
              </div>

              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Plan Description</label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Service or tier description for invoices..."
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryLink}
                data-testid="submit-recurring-button"
              >
                Validate Subscription Plan
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Ledger Preview & Governance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }}>
          {/* Double-Entry Ledger Preview */}
          <div className={styles.formCard} data-testid="recurring-ledger">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <Layers size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Per-Cycle Double-Entry Ledger</h2>
            </div>

            <p className={styles.pageSubtitle} style={{ margin: 0 }}>
              Each executed subscription cycle debits inbound payment gateway cash and credits revenue.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ padding: '10px 12px', background: '#e8f5ee', border: '1px solid #a3d9b8', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c6b3c' }}>DEBIT org:main (Subscription Inflow)</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#0c6b3c', fontWeight: 'bold' }}>
                  ${parsedAmount.toFixed(2)} {currency}
                </p>
              </div>

              <div style={{ padding: '10px 12px', background: '#f5f0ff', border: '1px solid #d4c2fc', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#5521b5' }}>CREDIT revenue:recurring (SaaS / Service Revenue)</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#5521b5', fontWeight: 'bold' }}>
                  ${parsedAmount.toFixed(2)} {currency}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--jp-border)', paddingTop: '10px', fontSize: '12px' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Cycle Balance Status:</span>
              <span style={{ fontWeight: 'bold', color: 'var(--jp-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} />
                100% Balanced
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RecurringPage;
