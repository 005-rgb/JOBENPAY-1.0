/**
 * web/src/pages/DebitPage.jsx
 * Direct Debit UI: Authorization Management, Direct Debit Trigger, SIMULATED Provider Badge, Maker/Checker Controls
 * (Tier C, K-DEBIT, AD-17, B-F6)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileCheck,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function DebitPage({ debitId = null }) {
  const { t } = useTranslation();
  const [authId, setAuthId] = useState('');
  const [amount, setAmount] = useState('250.00');
  const [currency, setCurrency] = useState('USD');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [mandateRef, setMandateRef] = useState('MANDATE-ACH-2026-001');
  const [maxAmount, setMaxAmount] = useState('1000.00');
  const [authStatus, setAuthStatus] = useState('ACTIVE');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const {
    data: debitData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['debit', debitId],
    queryFn: async () => {
      if (!debitId) return null;
      return apiClient.get(`/debit/${debitId}`);
    },
    enabled: Boolean(debitId),
  });

  const parsedAmount = parseFloat(amount) || 0;
  const parsedMax = parseFloat(maxAmount) || 0;
  const isCapExceeded = parsedAmount > parsedMax;

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (parsedAmount <= 0) {
      setFormError('Direct debit amount must be greater than zero.');
      return;
    }

    if (isCapExceeded) {
      setFormError(`Withdrawal amount of $${parsedAmount} exceeds maximum authorized mandate cap of $${parsedMax}.`);
      return;
    }

    if (authStatus !== 'ACTIVE') {
      setFormError(`Direct debit authorization is in ${authStatus} status and cannot be debited.`);
      return;
    }

    setFormSuccess('Direct debit instruction successfully validated against mandate authorization.');
  };

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="debit-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading direct debit authorization...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="debit-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Direct Debit</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'A system error occurred while contacting the server.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageStack} data-testid="debit-page">
      {/* Header with Title and Badges */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Direct Debit Authorization</h1>
            <span
              className={`${styles.providerBadge} ${styles.badgeSimulated}`}
              data-testid="simulated-badge"
            >
              SIMULATED
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Direct counterparty account debit based on formal mandate authorization (Tier C, AD-17).
          </p>
        </div>

        <div className={styles.headerActions}>
          <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
            <ShieldAlert size={14} style={{ marginRight: '4px' }} />
            Always Require Approval (0 Auto-Approve)
          </span>
          <Link to="/transactions/new?category=DEBIT" className={styles.primaryLink}>
            New Debit Proposal
          </Link>
        </div>
      </div>

      <div className={styles.twoColumnLayout}>
        {/* Left Column: Form & Active Mandate */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }}>
          <form onSubmit={handleValidateForm} className={styles.formCard} data-testid="debit-form">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <FileCheck size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Direct Debit Instruction</h2>
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
                <label className={styles.fieldLabel}>Mandate Reference</label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={mandateRef}
                  onChange={(e) => setMandateRef(e.target.value)}
                  data-testid="mandate-ref-input"
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
                <label className={styles.fieldLabel}>Withdrawal Amount ($)</label>
                <input
                  type="number"
                  step="any"
                  className={styles.fieldInput}
                  placeholder="250.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="debit-amount-input"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Max Authorized Cap ($)</label>
                <input
                  type="text"
                  disabled
                  className={styles.fieldInput}
                  value={`$${parsedMax.toFixed(2)}`}
                  style={{ background: 'var(--jp-surface-sidebar)', color: 'var(--jp-text-muted)' }}
                />
              </div>
            </div>

            {/* Cap Compliance Banner */}
            <div className={isCapExceeded ? styles.errorBanner : styles.successBanner}>
              {isCapExceeded ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  Cap Utilization: <strong>${parsedAmount.toFixed(2)}</strong> of <strong>${parsedMax.toFixed(2)}</strong>
                </span>
                <strong style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  {isCapExceeded ? 'Exceeds Mandate Cap' : 'Within Authorized Limit'}
                </strong>
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryLink}
                data-testid="submit-debit-button"
              >
                Validate & Simulate Debit
              </button>
            </div>
          </form>

          {/* Revocation Safeguard Info */}
          <div className={styles.calculationCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} />
              <strong style={{ fontSize: '13px' }}>Revocation Safeguard & Rights</strong>
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--jp-text-muted)', lineHeight: '1.5' }}>
              The counterparty or organization owner may revoke direct debit authorization at any time. Any pending debit evaluations will immediately fail closed and transition to REJECTED.
            </p>
          </div>
        </div>

        {/* Right Column: Ledger Preview & Governance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }}>
          {/* Double-Entry Ledger Preview */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <Layers size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Settlement Double-Entry Ledger</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ padding: '10px 12px', background: '#e8f5ee', border: '1px solid #a3d9b8', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c6b3c' }}>DEBIT org:main (Cash Received)</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#0c6b3c', fontWeight: 'bold' }}>
                  ${parsedAmount.toFixed(2)} {currency}
                </p>
              </div>

              <div style={{ padding: '10px 12px', background: '#f5f0ff', border: '1px solid #d4c2fc', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#5521b5' }}>CREDIT counterparty:debit (Counterparty Account)</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#5521b5', fontWeight: 'bold' }}>
                  ${parsedAmount.toFixed(2)} {currency}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--jp-border)', paddingTop: '10px', fontSize: '12px' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Ledger Balance Status:</span>
              <span style={{ fontWeight: 'bold', color: 'var(--jp-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={14} />
                100% Balanced
              </span>
            </div>
          </div>

          {/* Maker / Checker Dual-Control Box */}
          <div className={styles.formCard}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <UserCheck size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Maker / Checker Governance</h2>
            </div>

            <p className={styles.pageSubtitle} style={{ margin: 0 }}>
              Tier C DIRECT DEBIT requires verified dual-control authorization before funds are deducted from the counterparty account.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                className={styles.primaryLink}
                style={{ width: '100%', background: '#0c6b3c' }}
                data-testid="checker-approve-button"
              >
                <CheckCircle2 size={16} />
                Approve Direct Debit (Checker)
              </button>

              <button
                type="button"
                className={styles.secondaryLink}
                style={{ width: '100%', color: '#9b1c2a', borderColor: '#f8b4be' }}
                data-testid="checker-reject-button"
              >
                <XCircle size={16} />
                Reject Debit Instruction (Checker)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DebitPage;
