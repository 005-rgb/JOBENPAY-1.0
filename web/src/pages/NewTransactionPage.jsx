/**
 * web/src/pages/NewTransactionPage.jsx
 * Dynamic Schema-Driven Transaction Creation Form for all 15 categories (PRD 1.3 §10, WP F7-1, FR-1307)
 */

import React, { useId, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Split,
  Users,
  Wallet,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { useToast } from '../components/primitives.jsx';
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
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [searchParams] = useSearchParams();
  const { environment, isLive } = useEnvironment();
  const [isDelayingLive, setIsDelayingLive] = useState(false);
  const delayTimerRef = React.useRef(null);

  useEffect(() => {
    return () => {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
    };
  }, []);

  // Category and Sub-Type Initialization
  const initialCategory = searchParams.get('category')?.toUpperCase();
  const validCategory = TRANSACTION_CATEGORIES.includes(initialCategory) ? initialCategory : 'PAYOUT';

  const [category, setCategory] = useState(() => {
    if (isLive && (validCategory === 'FINANCING' || validCategory === 'DEBIT')) {
      return 'PAYOUT';
    }
    return validCategory;
  });
  const [subType, setSubType] = useState(() => (CATEGORY_SUBTYPES[validCategory] || ['standard'])[0]);

  // Common Fields
  const [amountMajor, setAmountMajor] = useState('100.00');
  const [currency, setCurrency] = useState('USD');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [agentReason, setAgentReason] = useState('');

  // Category 1: PAYOUT
  const [payoutRecipientEmail, setPayoutRecipientEmail] = useState('');
  const [payoutNote, setPayoutNote] = useState('');

  // Category 2: SALE
  const [customerEmail, setCustomerEmail] = useState('');
  const [orderDescription, setOrderDescription] = useState('Product / Service checkout');
  const [orderRef, setOrderRef] = useState('ORD-2026-0001');

  // Category 3: REFUND
  const [refundParentIntentId, setRefundParentIntentId] = useState('');
  const [refundReason, setRefundReason] = useState('BUYER_RETURN');

  // Category 4: VOID
  const [voidParentIntentId, setVoidParentIntentId] = useState('');
  const [voidReason, setVoidReason] = useState('CANCELED_BY_BUYER');

  // Category 5: PARTIAL
  const [partialParentIntentId, setPartialParentIntentId] = useState('');
  const [partialSequence, setPartialSequence] = useState('1');
  const [isFinalCapture, setIsFinalCapture] = useState(false);

  // Category 6: DOWN_PAYMENT
  const [totalContractAmountMajor, setTotalContractAmountMajor] = useState('500.00');
  const [milestoneIndex, setMilestoneIndex] = useState('1');
  const [milestoneDescription, setMilestoneDescription] = useState('Phase 1 Project Kickoff Deliverable');

  // Category 7: INVOICE
  const [invoiceNumber, setInvoiceNumber] = useState('INV-2026-0001');
  const [dueDate, setDueDate] = useState('2026-12-31');
  const [invoiceRecipientEmail, setInvoiceRecipientEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('NET_30');

  // Category 8: DISPUTE
  const [disputeCaseId, setDisputeCaseId] = useState('PP-D-2026-9901');
  const [disputeReason, setDisputeReason] = useState('UNAUTHORIZED_TRANSACTION');
  const [evidenceSummary, setEvidenceSummary] = useState('');
  const [disputeAction, setDisputeAction] = useState('CONTEST');

  // Category 9: SCHEDULED
  const [scheduledExecutionTime, setScheduledExecutionTime] = useState('2026-12-01T09:00');

  // Category 10: RECURRING
  const [recurringFrequency, setRecurringFrequency] = useState('MONTHLY');
  const [recurringPlanName, setRecurringPlanName] = useState('SaaS Enterprise Subscription');
  const [totalCycles, setTotalCycles] = useState('12');

  // Category 11: BULK
  const [batchName, setBatchName] = useState('Payroll Batch Nov 2026');
  const [batchItemCount, setBatchItemCount] = useState('5');

  // Category 12: SPLIT
  const [secondaryPayeeId, setSecondaryPayeeId] = useState('');
  const [platformFeePercent, setPlatformFeePercent] = useState('5.0');

  // Category 13: TRANSFER
  const [sourceAccount, setSourceAccount] = useState('org:main');
  const [destinationAccount, setDestinationAccount] = useState('org:reserve');

  // Category 14: FINANCING
  const [facilityType, setFacilityType] = useState('INVOICE');
  const [collateralValueMajor, setCollateralValueMajor] = useState('100000.00');
  const [tenorMonths, setTenorMonths] = useState('3');
  const [counterpartyHistoryCount, setCounterpartyHistoryCount] = useState('4');

  // Category 15: DEBIT
  const [mandateReference, setMandateReference] = useState('MND-SEPA-2026-001');
  const [debtorIban, setDebtorIban] = useState('DE89370400440532013000');
  const [debtorName, setDebtorName] = useState('Acme Corp Europe GmbH');

  // Client-generated Idempotency-Key retained across retry
  const [idempotencyKey] = useState(() => generateClientUuid());
  const [formError, setFormError] = useState('');

  // Fetch registered payees
  const { data: payeesData } = useQuery({
    queryKey: ['payees', environment],
    queryFn: async () => apiClient.get('/payees'),
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
      return apiClient.post('/transactions', payload, {
        headers: {
          'Idempotency-Key': idempotencyKey,
        },
      });
    },
    onSuccess: async (res) => {
      notify({ message: `Transaction proposal submitted successfully in ${environment} mode.` });
      await queryClient.invalidateQueries({ queryKey: ['transactions', environment] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      const intentId = res.data?.intent_id || res.data?.id;
      if (intentId) {
        navigate(`/transactions/${intentId}`);
      } else {
        navigate('/transactions');
      }
    },
    onError: (err) => {
      setFormError(err.message || 'Transaction proposal failed.');
      notify({ message: `Proposal failed: ${err.message}`, kind: 'error' });
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
    let parentIntentId = undefined;

    // Build category-specific metadata
    switch (category) {
      case 'PAYOUT':
        if (payoutRecipientEmail) metadata.recipientEmail = payoutRecipientEmail;
        if (payoutNote) metadata.note = payoutNote;
        break;

      case 'SALE':
        if (customerEmail) metadata.customerEmail = customerEmail;
        metadata.orderDescription = orderDescription;
        metadata.orderRef = orderRef;
        break;

      case 'REFUND':
        parentIntentId = refundParentIntentId || undefined;
        metadata.refundReason = refundReason;
        break;

      case 'VOID':
        parentIntentId = voidParentIntentId || undefined;
        metadata.voidReason = voidReason;
        break;

      case 'PARTIAL':
        parentIntentId = partialParentIntentId || undefined;
        metadata.captureSequence = parseInt(partialSequence, 10) || 1;
        metadata.isFinalCapture = isFinalCapture;
        break;

      case 'DOWN_PAYMENT': {
        const totalParsed = parseFloat(totalContractAmountMajor) || parsed;
        metadata.totalAmountMinor = BigInt(Math.round(totalParsed * 100)).toString();
        metadata.milestoneIndex = parseInt(milestoneIndex, 10) || 1;
        metadata.milestoneDescription = milestoneDescription;
        break;
      }

      case 'INVOICE':
        metadata.invoiceNumber = invoiceNumber;
        metadata.dueDate = dueDate;
        metadata.paymentTerms = paymentTerms;
        if (invoiceRecipientEmail) metadata.recipientEmail = invoiceRecipientEmail;
        break;

      case 'DISPUTE':
        metadata.disputeCaseId = disputeCaseId;
        metadata.disputeReason = disputeReason;
        metadata.action = disputeAction;
        if (evidenceSummary) metadata.evidenceSummary = evidenceSummary;
        break;

      case 'SCHEDULED':
        metadata.scheduledExecutionTime = scheduledExecutionTime;
        break;

      case 'RECURRING':
        metadata.frequency = recurringFrequency;
        metadata.planName = recurringPlanName;
        metadata.totalCycles = parseInt(totalCycles, 10) || 12;
        break;

      case 'BULK':
        metadata.batchName = batchName;
        metadata.itemCount = parseInt(batchItemCount, 10) || 1;
        break;

      case 'SPLIT':
        metadata.secondaryPayeeId = secondaryPayeeId || undefined;
        metadata.platformFeeBps = Math.round((parseFloat(platformFeePercent) || 0) * 100);
        break;

      case 'TRANSFER':
        metadata.sourceAccount = sourceAccount;
        metadata.destinationAccount = destinationAccount;
        break;

      case 'FINANCING': {
        const collateralParsed = parseFloat(collateralValueMajor) || parsed;
        metadata.facilityType = facilityType;
        metadata.collateralAmountMinor = BigInt(Math.round(collateralParsed * 100)).toString();
        metadata.tenorMonths = parseInt(tenorMonths, 10) || 3;
        metadata.interestBps = 1200;
        metadata.counterpartyCompletedTransactions = parseInt(counterpartyHistoryCount, 10) || 3;
        break;
      }

      case 'DEBIT':
        metadata.mandateReference = mandateReference;
        metadata.debtorIban = debtorIban;
        metadata.debtorName = debtorName;
        break;

      default:
        break;
    }

    const payload = {
      category,
      subType,
      amountMinor,
      currency,
      counterpartyId: counterpartyId || undefined,
      parentIntentId,
      metadata,
      agentReason: agentReason || undefined,
    };

    if (isLive) {
      setIsDelayingLive(true);
      delayTimerRef.current = setTimeout(() => {
        setIsDelayingLive(false);
        createMutation.mutate(payload);
      }, 2000);
    } else {
      createMutation.mutate(payload);
    }
  };

  const visibleCategories = TRANSACTION_CATEGORIES.filter((cat) => {
    if (isLive && (cat === 'FINANCING' || cat === 'DEBIT')) {
      return false;
    }
    return true;
  });

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
          <span
            className={`${styles.providerBadge} ${isLive ? styles.badgeFailed : styles.badgeSandbox}`}
            style={{ fontWeight: 700, padding: '4px 12px', fontSize: '12px' }}
          >
            {isLive ? 'LIVE' : 'SANDBOX'}
          </span>
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
                {visibleCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
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
                Converted to minor units: {BigInt(Math.round((parseFloat(amountMajor) || 0) * 100)).toString()}
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

          {/* 3. Counterparty / Payee Selection */}
          <div className={styles.field}>
            <label className={styles.fieldLabel}>4. Counterparty / Registered Payee</label>
            <select
              value={counterpartyId}
              onChange={(e) => setCounterpartyId(e.target.value)}
              className={styles.fieldSelect}
              data-testid="counterparty-select"
            >
              <option value="">-- Select Registered Payee or Internal Ledger --</option>
              {payees.map((p) => {
                const label = p.displayName || p.display_name || p.name || p.identifierMasked || p.identifier || 'Registered Payee';
                const trustStatus = p.trust || p.trust_level || 'TRUSTED';
                return (
                  <option key={p.id} value={p.id}>
                    {label} ({trustStatus}) — {p.id.slice(0, 8)}...
                  </option>
                );
              })}
            </select>
          </div>

          {/* 4. DYNAMIC CATEGORY-SPECIFIC ATTRIBUTES FOR ALL 15 CATEGORIES */}

          {/* 1. PAYOUT Specific Attributes */}
          {category === 'PAYOUT' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Send size={14} /> Payout Specific Attributes (PAYOUT)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Recipient PayPal Email</label>
                  <input
                    type="email"
                    value={payoutRecipientEmail}
                    onChange={(e) => setPayoutRecipientEmail(e.target.value)}
                    placeholder="seller@example.com"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Disbursement Note</label>
                  <input
                    type="text"
                    value={payoutNote}
                    onChange={(e) => setPayoutNote(e.target.value)}
                    placeholder="Monthly supplier payout"
                    className={styles.fieldInput}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 2. SALE Specific Attributes */}
          {category === 'SALE' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShoppingCart size={14} /> Customer Sale Order Attributes (SALE)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Customer Email</label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="buyer@client.com"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Order Reference ID</label>
                  <input
                    type="text"
                    value={orderRef}
                    onChange={(e) => setOrderRef(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Item / Product Description</label>
                  <input
                    type="text"
                    value={orderDescription}
                    onChange={(e) => setOrderDescription(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 3. REFUND Specific Attributes */}
          {category === 'REFUND' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RotateCcw size={14} /> Refund Attributes & Limit Safeguards (REFUND)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Parent Capture Intent ID</label>
                  <input
                    type="text"
                    value={refundParentIntentId}
                    onChange={(e) => setRefundParentIntentId(e.target.value)}
                    placeholder="UUID of settled sale capture..."
                    className={`${styles.fieldInput} ${styles.mono}`}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Refund Reason Code</label>
                  <select
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="BUYER_RETURN">Buyer Return / Exchange</option>
                    <option value="DEFECTIVE_PRODUCT">Defective / Damaged Product</option>
                    <option value="CUSTOMER_SERVICE">Customer Satisfaction Goodwill</option>
                    <option value="ORDER_CANCELED">Order Canceled Before Dispatch</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 4. VOID Specific Attributes */}
          {category === 'VOID' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Ban size={14} /> Void Authorization Attributes (VOID)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Parent Authorization Intent ID</label>
                  <input
                    type="text"
                    value={voidParentIntentId}
                    onChange={(e) => setVoidParentIntentId(e.target.value)}
                    placeholder="UUID of active pre-authorization..."
                    className={`${styles.fieldInput} ${styles.mono}`}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Void Reason Code</label>
                  <select
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="CANCELED_BY_BUYER">Canceled by Buyer</option>
                    <option value="EXPIRED_RESERVATION">Expired Inventory Reservation</option>
                    <option value="SUSPECTED_FRAUD">Suspected Fraud / Rule Check</option>
                    <option value="ADMIN_RELEASE">Administrative Release</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 5. PARTIAL Specific Attributes */}
          {category === 'PARTIAL' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Split size={14} /> Partial Multi-Capture Attributes (PARTIAL)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Parent Authorization Intent ID</label>
                  <input
                    type="text"
                    value={partialParentIntentId}
                    onChange={(e) => setPartialParentIntentId(e.target.value)}
                    placeholder="UUID of original authorization..."
                    className={`${styles.fieldInput} ${styles.mono}`}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Capture Sequence Number</label>
                  <input
                    type="number"
                    value={partialSequence}
                    onChange={(e) => setPartialSequence(e.target.value)}
                    min="1"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
                    <input
                      type="checkbox"
                      checked={isFinalCapture}
                      onChange={(e) => setIsFinalCapture(e.target.checked)}
                    />
                    <strong>Final Capture Flag:</strong> Release remaining authorization holds after this capture.
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* 6. DOWN_PAYMENT Specific Attributes */}
          {category === 'DOWN_PAYMENT' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wallet size={14} /> Down Payment Milestone Attributes (DOWN_PAYMENT)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Total Contract Value ($)</label>
                  <input
                    type="text"
                    value={totalContractAmountMajor}
                    onChange={(e) => setTotalContractAmountMajor(e.target.value)}
                    className={styles.fieldInput}
                    placeholder="500.00"
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Milestone Index</label>
                  <input
                    type="number"
                    value={milestoneIndex}
                    onChange={(e) => setMilestoneIndex(e.target.value)}
                    min="1"
                    max="10"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Milestone Deliverable Scope</label>
                  <input
                    type="text"
                    value={milestoneDescription}
                    onChange={(e) => setMilestoneDescription(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 7. INVOICE Specific Attributes */}
          {category === 'INVOICE' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} /> Commercial Invoice Attributes (INVOICE)
              </span>
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
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Recipient Email</label>
                  <input
                    type="email"
                    value={invoiceRecipientEmail}
                    onChange={(e) => setInvoiceRecipientEmail(e.target.value)}
                    placeholder="billing@partner.com"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="DUE_ON_RECEIPT">Due on Receipt</option>
                    <option value="NET_15">Net 15 Days</option>
                    <option value="NET_30">Net 30 Days</option>
                    <option value="NET_60">Net 60 Days</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* 8. DISPUTE Specific Attributes */}
          {category === 'DISPUTE' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={14} /> Dispute & Evidence Defense Attributes (DISPUTE)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>PayPal Dispute Case ID</label>
                  <input
                    type="text"
                    value={disputeCaseId}
                    onChange={(e) => setDisputeCaseId(e.target.value)}
                    className={styles.fieldInput}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Dispute Action</label>
                  <select
                    value={disputeAction}
                    onChange={(e) => setDisputeAction(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="CONTEST">Contest Dispute (Submit AI Evidence)</option>
                    <option value="ACCEPT">Accept Dispute (Concede Claim)</option>
                  </select>
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Dispute Reason Code</label>
                  <select
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="UNAUTHORIZED_TRANSACTION">Unauthorized Transaction</option>
                    <option value="ITEM_NOT_RECEIVED">Item Not Received (INR)</option>
                    <option value="SIGNIFICANTLY_NOT_AS_DESCRIBED">Significantly Not as Described (SNAD)</option>
                  </select>
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Evidence Summary & Proof</label>
                  <textarea
                    value={evidenceSummary}
                    onChange={(e) => setEvidenceSummary(e.target.value)}
                    placeholder="Delivery tracking, signed proof of service, correspondence..."
                    rows={2}
                    className={styles.fieldTextArea}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 9. SCHEDULED Specific Attributes */}
          {category === 'SCHEDULED' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={14} /> Scheduled Execution Attributes (SCHEDULED)
              </span>
              <div className={styles.formGrid}>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Target Execution Time (UTC)</label>
                  <input
                    type="datetime-local"
                    value={scheduledExecutionTime}
                    onChange={(e) => setScheduledExecutionTime(e.target.value)}
                    className={styles.fieldInput}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* 10. RECURRING Specific Attributes */}
          {category === 'RECURRING' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={14} /> Recurring Subscription Attributes (RECURRING)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Billing Frequency</label>
                  <select
                    value={recurringFrequency}
                    onChange={(e) => setRecurringFrequency(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Total Billing Cycles</label>
                  <input
                    type="number"
                    value={totalCycles}
                    onChange={(e) => setTotalCycles(e.target.value)}
                    min="1"
                    className={styles.fieldInput}
                  />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Plan / Service Name</label>
                  <input
                    type="text"
                    value={recurringPlanName}
                    onChange={(e) => setRecurringPlanName(e.target.value)}
                    className={styles.fieldInput}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 11. BULK Specific Attributes */}
          {category === 'BULK' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileSpreadsheet size={14} /> Bulk Payout Batch Attributes (BULK)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Batch Reference / Name</label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className={styles.fieldInput}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Recipient Item Count</label>
                  <input
                    type="number"
                    value={batchItemCount}
                    onChange={(e) => setBatchItemCount(e.target.value)}
                    min="1"
                    className={styles.fieldInput}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* 12. SPLIT Specific Attributes */}
          {category === 'SPLIT' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={14} /> Multi-Party Split Attributes (SPLIT)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Secondary Payee / Collaborator</label>
                  <select
                    value={secondaryPayeeId}
                    onChange={(e) => setSecondaryPayeeId(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="">-- Select Secondary Payee --</option>
                    {payees.map((p) => {
                      const label = p.displayName || p.display_name || p.name || p.identifierMasked || p.identifier || 'Registered Payee';
                      return (
                        <option key={p.id} value={p.id}>
                          {label} — {p.id.slice(0, 8)}...
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Platform Fee Percentage (%)</label>
                  <input
                    type="text"
                    value={platformFeePercent}
                    onChange={(e) => setPlatformFeePercent(e.target.value)}
                    className={styles.fieldInput}
                    placeholder="5.0"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 13. TRANSFER Specific Attributes */}
          {category === 'TRANSFER' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} /> Internal Book Transfer Attributes (TRANSFER)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Originating Account Code</label>
                  <input
                    type="text"
                    value={sourceAccount}
                    onChange={(e) => setSourceAccount(e.target.value)}
                    className={`${styles.fieldInput} ${styles.mono}`}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Destination Account Code</label>
                  <input
                    type="text"
                    value={destinationAccount}
                    onChange={(e) => setDestinationAccount(e.target.value)}
                    className={`${styles.fieldInput} ${styles.mono}`}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* 14. FINANCING Specific Attributes */}
          {category === 'FINANCING' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldCheck size={14} /> Supply Chain Financing Facility (FINANCING · SIMULATED)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Facility Type</label>
                  <select
                    value={facilityType}
                    onChange={(e) => setFacilityType(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="INVOICE">Invoice Financing (Max LTV 70%)</option>
                    <option value="PO">Purchase Order Financing (Max LTV 70%)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Collateral / Face Value ($)</label>
                  <input
                    type="text"
                    value={collateralValueMajor}
                    onChange={(e) => setCollateralValueMajor(e.target.value)}
                    className={styles.fieldInput}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Facility Tenor (Months)</label>
                  <select
                    value={tenorMonths}
                    onChange={(e) => setTenorMonths(e.target.value)}
                    className={styles.fieldSelect}
                  >
                    <option value="1">1 Month (30 Days)</option>
                    <option value="2">2 Months (60 Days)</option>
                    <option value="3">3 Months (90 Days)</option>
                    <option value="6">6 Months (180 Days)</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Counterparty Completed Tx (Min 3)</label>
                  <input
                    type="number"
                    value={counterpartyHistoryCount}
                    onChange={(e) => setCounterpartyHistoryCount(e.target.value)}
                    min="3"
                    className={styles.fieldInput}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* 15. DEBIT Specific Attributes */}
          {category === 'DEBIT' && (
            <div className={styles.calculationCard}>
              <span className={styles.fieldLabel} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wallet size={14} /> Direct Debit Authorization Attributes (DEBIT · SIMULATED)
              </span>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Mandate Reference Code</label>
                  <input
                    type="text"
                    value={mandateReference}
                    onChange={(e) => setMandateReference(e.target.value)}
                    className={`${styles.fieldInput} ${styles.mono}`}
                    required
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Debtor IBAN / Account</label>
                  <input
                    type="text"
                    value={debtorIban}
                    onChange={(e) => setDebtorIban(e.target.value)}
                    className={`${styles.fieldInput} ${styles.mono}`}
                    required
                  />
                </div>
                <div className={`${styles.field} ${styles.fullWidth}`}>
                  <label className={styles.fieldLabel}>Debtor Legal Entity / Full Name</label>
                  <input
                    type="text"
                    value={debtorName}
                    onChange={(e) => setDebtorName(e.target.value)}
                    className={styles.fieldInput}
                    required
                  />
                </div>
              </div>
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
            <Link
              to="/transactions"
              className={styles.secondaryLink}
              onClick={() => {
                if (delayTimerRef.current) {
                  clearTimeout(delayTimerRef.current);
                  setIsDelayingLive(false);
                }
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending || isDelayingLive}
              className={styles.primaryLink}
              data-testid="submit-transaction-btn"
              style={isLive ? { backgroundColor: '#dc2626', borderColor: '#b91c1c' } : {}}
            >
              {isDelayingLive ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Processing Real Money... (Hold to cancel)
                </>
              ) : createMutation.isPending ? (
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
