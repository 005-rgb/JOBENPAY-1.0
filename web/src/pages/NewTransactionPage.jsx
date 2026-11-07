/**
 * web/src/pages/NewTransactionPage.jsx
 * Dynamic Schema-Driven Transaction Creation Form for all 15 categories (PRD 1.3 §10, WP F7-1, FR-1307)
 */

import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  DollarSign,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import {
  TRANSACTION_CATEGORIES,
  CATEGORY_SUBTYPES,
  CATEGORY_PROVIDERS,
} from '../../../shared/transaction.js';
import { ProviderBadge } from './TransactionsPage.jsx';
import styles from './TransactionPages.module.css';

function generateClientUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function NewTransactionPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Selected Category and Sub-Type
  const [category, setCategory] = useState('PAYOUT');
  const [subType, setSubType] = useState('standard');

  // Common Fields
  const [amountMajor, setAmountMajor] = useState('100.00');
  const [currency, setCurrency] = useState('USD');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [agentReason, setAgentReason] = useState('');

  // Category Specific Fields
  const [invoiceNumber, setInvoiceNumber] = useState('INV-2026-0001');
  const [dueDate, setDueDate] = useState('2026-12-31');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [totalContractAmountMajor, setTotalContractAmountMajor] = useState('500.00');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [tenorMonths, setTenorMonths] = useState('12');
  const [facilityType, setFacilityType] = useState('INVOICE');
  const [parentIntentId, setParentIntentId] = useState('');

  // Client-generated Idempotency-Key retained across retry
  const [idempotencyKey] = useState(() => generateClientUuid());
  const [formError, setFormError] = useState('');

  // Fetch registered payees
  const { data: payeesData } = useQuery({
    queryKey: ['payees'],
    queryFn: async () => apiClient.get('/api/v1/payees'),
  });

  const payees = payeesData?.payees || [];

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    const subTypes = CATEGORY_SUBTYPES[newCat] || ['standard'];
    setSubType(subTypes[0]);
    setFormError('');
  };

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      return apiClient.post('/api/v1/transactions', payload, {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      });
    },
    onSuccess: (res) => {
      const intentId = res.data?.intent_id || res.data?.id;
      if (intentId) {
        navigate(`/transactions/${intentId}`);
      } else {
        navigate('/transactions');
      }
    },
    onError: (err) => {
      setFormError(err.message || 'Transaction submission failed.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    const parsed = parseFloat(amountMajor);
    if (isNaN(parsed) || parsed <= 0) {
      setFormError('Amount must be greater than zero.');
      return;
    }

    const amountMinor = BigInt(Math.round(parsed * 100)).toString();
    const metadata = {};

    if (category === 'INVOICE') {
      metadata.invoiceNumber = invoiceNumber;
      metadata.dueDate = dueDate;
      if (recipientEmail) metadata.recipientEmail = recipientEmail;
    } else if (category === 'DOWN_PAYMENT') {
      const totalParsed = parseFloat(totalContractAmountMajor) || parsed;
      metadata.totalAmountMinor = BigInt(Math.round(totalParsed * 100)).toString();
    } else if (category === 'RECURRING') {
      metadata.frequency = frequency;
      metadata.intervalCount = 1;
    } else if (category === 'FINANCING') {
      metadata.facilityType = facilityType;
      metadata.tenorMonths = parseInt(tenorMonths, 10) || 12;
      metadata.interestBps = 500;
    }

    const payload = {
      category,
      subType,
      amountMinor,
      currency,
      counterpartyId: counterpartyId || undefined,
      parentIntentId: parentIntentId || undefined,
      metadata,
      agentReason: agentReason || undefined,
    };

    createMutation.mutate(payload);
  };

  const currentSubTypes = CATEGORY_SUBTYPES[category] || ['standard'];
  const provider = CATEGORY_PROVIDERS[category] || 'SANDBOX';

  return (
    <div className={styles.pageStack} data-testid="new-transaction-page">
      <div>
        <Link to="/transactions" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Transactions list
        </Link>
      </div>

      <div className={styles.formCard}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--jp-border)', paddingBottom: '16px' }}>
          <div>
            <h1 className={styles.pageTitle} style={{ fontSize: '20px' }}>
              New Transaction Proposal
            </h1>
            <p className={styles.pageSubtitle}>
              Propose an intent across 15 categories with policy gates & balanced double-entry ledger verification.
            </p>
          </div>
          <ProviderBadge provider={provider} />
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }} data-testid="new-transaction-form">
          {formError && (
            <div className={styles.errorBanner}>
              <AlertCircle size={16} />
              <div>
                <strong>Validation Error:</strong> {formError}
              </div>
            </div>
          )}

          {/* 1. Category and Sub-Type Selection */}
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>1. Transaction Category</label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className={styles.fieldSelect}
                data-testid="category-select"
              >
                {TRANSACTION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({CATEGORY_PROVIDERS[cat] || 'SANDBOX'})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>2. Sub-Type</label>
              <select
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                className={styles.fieldSelect}
                data-testid="subtype-select"
              >
                {currentSubTypes.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 2. Amount and Currency */}
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>3. Amount (Major Units)</label>
              <input
                type="text"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
                placeholder="0.00"
                className={styles.fieldInput}
                data-testid="amount-input"
                required
              />
              <span className={styles.pageSubtitle} style={{ fontSize: '11px', marginTop: '2px' }}>
                Strictly converted to minor units ({BigInt(Math.round((parseFloat(amountMajor) || 0) * 100)).toString()})
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Currency</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={styles.fieldSelect}
                data-testid="currency-select"
              >
                <option value="USD">USD - US Dollar ($)</option>
                <option value="EUR">EUR - Euro (€)</option>
                <option value="GBP">GBP - British Pound (£)</option>
                <option value="IDR">IDR - Indonesian Rupiah (Rp)</option>
              </select>
            </div>
          </div>

          {/* 3. Counterparty / Payee */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>4. Counterparty / Payee</label>
            <select
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              className={styles.fieldSelect}
              data-testid="counterparty-select"
            >
              <option value="">-- Select Registered Payee or Internal Ledger --</option>
              {payees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.identifier} ({p.trust_level || 'UNKNOWN'}) — {p.id.slice(0, 8)}...
                </option>
              ))}
            </select>
          </div>

          {/* 4. Category-Specific Fields */}
          {category === 'INVOICE' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel}>Invoice Specific Fields</span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Invoice Number</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className={styles.fieldInput}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={styles.fieldInput}
                    required
                  />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Recipient Email</label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="client@example.com"
                    className={styles.fieldInput}
                  />
                </div>
              </div>
            </div>
          )}

          {category === 'DOWN_PAYMENT' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel}>Down Payment Specific Fields</span>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Total Contract Value ($)</label>
                <input
                  type="text"
                  value={totalContractAmountMajor}
                  onChange={(e) => setTotalContractAmountMajor(e.target.value)}
                  className={styles.fieldInput}
                  placeholder="500.00"
                />
                <span className={styles.pageSubtitle} style={{ fontSize: '11px', marginTop: '2px' }}>
                  Total contract value must be greater than or equal to down payment amount.
                </span>
              </div>
            </div>
          )}

          {category === 'RECURRING' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel}>Subscription Cycle Frequency</span>
              <div className={styles.field}>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className={styles.fieldSelect}
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
            </div>
          )}

          {category === 'FINANCING' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel}>Supply Chain Financing Facility (SIMULATED)</span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Facility Type</label>
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="INVOICE">Invoice Financing</option>
                    <option value="PO">Purchase Order (PO)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Tenor (Months)</label>
                  <input
                    type="number"
                    value={tenorMonths}
                    onChange={(e) => setTenorMonths(e.target.value)}
                    className={styles.fieldInput}
                    min="1"
                    max="60"
                  />
                </div>
              </div>
            </div>
          )}

          {(category === 'REFUND' || category === 'VOID') && (
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Parent Transaction Intent ID</label>
              <input
                type="text"
                value={parentIntentId}
                onChange={(e) => setParentIntentId(e.target.value)}
                placeholder="UUID of original transaction..."
                className={`${styles.fieldInput} ${styles.mono}`}
              />
            </div>
          )}

          {/* 5. Agent Reason / Description */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>5. Business Justification / Description</label>
            <textarea
              value={agentReason}
              onChange={(e) => setAgentReason(e.target.value)}
              placeholder="Provide business justification and operational context for the audit trail..."
              rows={3}
              className={styles.fieldTextArea}
            />
          </div>

          {/* Idempotency Notice */}
          <div className={styles.calculationCard} style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
              <span className={styles.fieldLabel}>Idempotency-Key:</span>
              <span className={styles.mono} style={{ color: 'var(--jp-text)' }}>{idempotencyKey}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={styles.formActions}>
            <Link to="/transactions" className={styles.secondaryLink}>
              Cancel
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className={styles.primaryLink}
              data-testid="submit-transaction-btn"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Submitting Proposal...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Propose Transaction
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewTransactionPage;
