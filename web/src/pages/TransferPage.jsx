/**
 * web/src/pages/TransferPage.jsx
 * P2P Transfer UI: transfer form, party selection, ledger balance preview, Maker/Checker approval
 * (K-TRANSFER, AD-17, T-18)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  HelpCircle,
  Layers,
  Loader2,
  Play,
  Plus,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import styles from './TransactionPages.module.css';

export function TransferPage({ transferId = null }) {
  const { t } = useTranslation();
  const [senderId, setSenderId] = useState('org-main-treasury');
  const [receiverId, setReceiverId] = useState('payee-vendor-002');
  const [amount, setAmount] = useState('250.00');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('Internal balanced book transfer');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const {
    data: transferData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['transfer', transferId],
    queryFn: async () => {
      if (!transferId) return null;
      return apiClient.get(`/api/v1/transfer/${transferId}`);
    },
    enabled: Boolean(transferId),
  });

  const parsedAmount = parseFloat(amount) || 0;

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!senderId || !receiverId) {
      setFormError('Both sender and receiver accounts must be selected.');
      return;
    }

    if (senderId === receiverId) {
      setFormError('Sender and receiver accounts cannot be identical (SENDER_EQUALS_RECEIVER violation).');
      return;
    }

    if (parsedAmount <= 0) {
      setFormError('Transfer amount must be greater than zero.');
      return;
    }

    setFormSuccess('Transfer transaction parameters successfully validated.');
  };

  if (isLoading) {
    return (
      <div className={styles.emptyCard} data-testid="transfer-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading transfer transaction...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className={styles.pageStack} data-testid="transfer-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Transfer</strong>
            <p style={{ margin: '4px 0 0 0' }}>{error?.message || 'An internal system error occurred.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageStack} data-testid="transfer-page">
      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Internal & Book Transfers</h1>
            <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
              TIER B / PAYPAL
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Balanced internal double-entry ledger book transfers between counterparties (Tier B, AD-17, T-18).
          </p>
        </div>

        <div className={styles.headerActions}>
          <Link to="/transactions/new?category=TRANSFER" className={styles.primaryLink}>
            <Plus size={16} />
            New Transfer Proposal
          </Link>
        </div>
      </div>

      <div className={styles.twoColumnLayout}>
        {/* Left Column: Transfer Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }}>
          <form onSubmit={handleValidateForm} className={styles.formCard} data-testid="transfer-form">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <ArrowRightLeft size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Transfer Order Instructions</h2>
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
                <label className={styles.fieldLabel}>Originating Account (Sender)</label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={senderId}
                  onChange={(e) => setSenderId(e.target.value)}
                  placeholder="Sender Account ID / UUID"
                  data-testid="sender-input"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Destination Account (Receiver)</label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                  placeholder="Receiver Account ID / UUID"
                  data-testid="receiver-input"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Transfer Amount ($)</label>
                <input
                  type="number"
                  step="any"
                  className={styles.fieldInput}
                  placeholder="250.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="transfer-amount-input"
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

              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Transfer Memo / Business Purpose</label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Audit reason for internal journal..."
                />
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.primaryLink}
                data-testid="submit-transfer-button"
              >
                Validate Transfer Proposal
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Ledger Preview & Governance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }}>
          {/* Double-Entry Ledger Preview */}
          <div className={styles.formCard} data-testid="transfer-ledger">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <Layers size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Transfer Double-Entry Ledger</h2>
            </div>

            <p className={styles.pageSubtitle} style={{ margin: 0 }}>
              Every transfer transaction creates a matching debit on the sender account and credit on the receiver account with identical minor values.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ padding: '10px 12px', background: '#eaf3ff', border: '1px solid #b3cdfb', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#003087' }}>DEBIT sender:{senderId || 'sender'}</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#003087', fontWeight: 'bold' }}>
                  ${parsedAmount.toFixed(2)} {currency}
                </p>
              </div>

              <div style={{ padding: '10px 12px', background: '#e8f5ee', border: '1px solid #a3d9b8', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c6b3c' }}>CREDIT receiver:{receiverId || 'receiver'}</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#0c6b3c', fontWeight: 'bold' }}>
                  ${parsedAmount.toFixed(2)} {currency}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--jp-border)', paddingTop: '10px', fontSize: '12px' }}>
              <span style={{ color: 'var(--jp-text-muted)' }}>Journal Balance Status:</span>
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

export default TransferPage;
