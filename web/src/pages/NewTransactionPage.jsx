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
import styles from './F04Pages.module.css';

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
      setFormError(err.message || 'Transaction submission failed');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');

    // Validation
    const majorVal = parseFloat(amountMajor);
    if (isNaN(majorVal) || majorVal <= 0) {
      setFormError(t('transactions.invalidAmount', 'Amount must be greater than zero.'));
      return;
    }

    const amountMinor = BigInt(Math.round(majorVal * 100)).toString();

    // Prepare metadata
    const metadata = {};
    if (category === 'INVOICE') {
      metadata.invoiceNumber = invoiceNumber;
      metadata.dueDate = dueDate;
      if (recipientEmail) metadata.recipientEmail = recipientEmail;
    } else if (category === 'DOWN_PAYMENT') {
      const totalMinor = BigInt(Math.round((parseFloat(totalContractAmountMajor) || majorVal) * 100)).toString();
      metadata.totalAmountMinor = totalMinor;
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
      {/* Back button */}
      <div>
        <Link
          to="/transactions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-black transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('transactions.backToList', 'Back to transactions')}
        </Link>
      </div>

      <div className="max-w-3xl mx-auto w-full bg-white border rounded-xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {t('transactions.newTransactionTitle', 'New Transaction Proposal')}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('transactions.newTransactionSubtitle', 'Propose an intent across 15 categories with policy gates & balanced ledger verification.')}
              </p>
            </div>
            <ProviderBadge provider={provider} />
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6" data-testid="new-transaction-form">
          {formError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-800 text-xs">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">{t('transactions.validationError', 'Validation error')}</span>
                <p className="mt-0.5 text-red-700">{formError}</p>
              </div>
            </div>
          )}

          {/* 1. Category and Sub-Type Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {t('transactions.categoryLabel', '1. Transaction Category')}
              </label>
              <select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border rounded-lg text-sm font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
                data-testid="category-select"
              >
                {TRANSACTION_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat} ({CATEGORY_PROVIDERS[cat] || 'SANDBOX'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {t('transactions.subTypeLabel', '2. Sub-Type')}
              </label>
              <select
                value={subType}
                onChange={(e) => setSubType(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border rounded-lg text-sm font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {t('transactions.amountLabel', '3. Amount (Major Units)')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400 font-bold">$</span>
                <input
                  type="text"
                  value={amountMajor}
                  onChange={(e) => setAmountMajor(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2 border rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-black"
                  data-testid="amount-input"
                  required
                />
              </div>
              <span className="text-[11px] text-gray-400 mt-1 block">
                Will be converted strictly to BigInt minor units ({BigInt(Math.round((parseFloat(amountMajor) || 0) * 100)).toString()})
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                {t('transactions.currencyLabel', 'Currency')}
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border rounded-lg text-sm font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
                data-testid="currency-select"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="IDR">IDR (Rp)</option>
              </select>
            </div>
          </div>

          {/* 3. Counterparty / Payee */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {t('transactions.counterpartyLabel', '4. Counterparty / Payee')}
            </label>
            <select
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border rounded-lg text-sm text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black"
              data-testid="counterparty-select"
            >
              <option value="">{t('transactions.selectPayee', '-- Select Registered Payee or Internal Ledger --')}</option>
              {payees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.identifier} ({p.trust_level || 'UNKNOWN'}) — {p.id.slice(0, 8)}...
                </option>
              ))}
            </select>
          </div>

          {/* 4. Category-Specific Fields */}
          {category === 'INVOICE' && (
            <div className="p-4 bg-gray-50 border rounded-lg space-y-4">
              <span className="text-xs font-bold text-gray-600 uppercase block">Invoice Specific Fields</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Invoice Number</label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full p-2 border rounded-md text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Due Date (YYYY-MM-DD)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full p-2 border rounded-md text-xs"
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs text-gray-600 mb-1">Recipient Email</label>
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="client@example.com"
                    className="w-full p-2 border rounded-md text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {category === 'DOWN_PAYMENT' && (
            <div className="p-4 bg-gray-50 border rounded-lg space-y-4">
              <span className="text-xs font-bold text-gray-600 uppercase block">Down Payment Specific Fields</span>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Total Contract Value ($)</label>
                <input
                  type="text"
                  value={totalContractAmountMajor}
                  onChange={(e) => setTotalContractAmountMajor(e.target.value)}
                  className="w-full p-2 border rounded-md text-xs"
                  placeholder="500.00"
                />
                <span className="text-[11px] text-gray-400">Must be &ge; down payment amount</span>
              </div>
            </div>
          )}

          {category === 'RECURRING' && (
            <div className="p-4 bg-gray-50 border rounded-lg space-y-4">
              <span className="text-xs font-bold text-gray-600 uppercase block">Subscription Frequency</span>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full p-2 border rounded-md text-xs"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
          )}

          {category === 'FINANCING' && (
            <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-lg space-y-4">
              <span className="text-xs font-bold text-purple-800 uppercase block">
                Tier C Financing Facility (SIMULATED)
              </span>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Facility Type</label>
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className="w-full p-2 border rounded-md text-xs"
                  >
                    <option value="INVOICE">Invoice Financing</option>
                    <option value="PO">Purchase Order (PO)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Tenor (Months)</label>
                  <input
                    type="number"
                    value={tenorMonths}
                    onChange={(e) => setTenorMonths(e.target.value)}
                    className="w-full p-2 border rounded-md text-xs"
                    min="1"
                    max="60"
                  />
                </div>
              </div>
            </div>
          )}

          {(category === 'REFUND' || category === 'VOID') && (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                Parent Transaction Intent ID
              </label>
              <input
                type="text"
                value={parentIntentId}
                onChange={(e) => setParentIntentId(e.target.value)}
                placeholder="UUID of original SALE or capture..."
                className="w-full p-2.5 border rounded-lg text-xs font-mono"
              />
            </div>
          )}

          {/* 5. Agent Reason / Description */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              {t('transactions.reasonLabel', '5. Business Justification / Description')}
            </label>
            <textarea
              value={agentReason}
              onChange={(e) => setAgentReason(e.target.value)}
              placeholder={t('transactions.reasonPlaceholder', 'Provide purpose and business context for the audit log...')}
              rows={2}
              className="w-full p-2.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          {/* Idempotency Notice */}
          <div className="p-3 bg-gray-50 border rounded-lg text-[11px] font-mono text-gray-500 flex items-center justify-between">
            <span>Idempotency-Key:</span>
            <span className="text-gray-700 font-semibold">{idempotencyKey}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Link
              to="/transactions"
              className="px-4 py-2 border rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              {t('app.cancel', 'Cancel')}
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-6 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-sm"
              data-testid="submit-transaction-btn"
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('transactions.submitting', 'Submitting...')}
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  {t('transactions.submitProposal', 'Propose Transaction')}
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

