/**
 * web/src/pages/FinancingPage.jsx
 * Supply Chain Financing UI: PO & Invoice Underwriting, Amortization Schedule, SIMULATED Provider Badge, Maker/Checker Controls
 * (Tier C, K-FINANCING, AD-17, B-F6)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Layers,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

export function FinancingPage({ financingId: propFinancingId = null }) {
  const { t } = useTranslation();
  const params = useParams();
  const effectiveFinancingId = propFinancingId || params.id || null;
  const { environment, isLive } = useEnvironment();
  const { notify } = useToast();
  const queryClient = useQueryClient();

  const [facilityType, setFacilityType] = useState('PO');
  const [principalAmount, setPrincipalAmount] = useState('50000');
  const [collateralValue, setCollateralValue] = useState('100000');
  const [currency, setCurrency] = useState('USD');
  const [tenorMonths, setTenorMonths] = useState(3);
  const [counterpartyId, setCounterpartyId] = useState('00000000-0000-4000-8000-000000000002');
  const [counterpartyHistory, setCounterpartyHistory] = useState(4);
  const [interestBps, setInterestBps] = useState(1200); // 12% p.a.
  const [formError, setFormError] = useState('');
  const [selectedTxId, setSelectedTxId] = useState(effectiveFinancingId);

  // 1. Single Financing Query
  const {
    data: financingData,
    isLoading: isFinancingLoading,
    isError: isFinancingError,
    error: financingError,
    refetch: refetchFinancing,
  } = useQuery({
    queryKey: ['financing', effectiveFinancingId, environment],
    queryFn: async () => {
      if (!effectiveFinancingId) return null;
      return apiClient.get(`/financing/${effectiveFinancingId}`);
    },
    enabled: Boolean(effectiveFinancingId),
  });

  // 2. Financing List Query
  const {
    data: listData,
    isLoading: isListLoading,
  } = useQuery({
    queryKey: ['financing-list', environment],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/financing');
        return res?.facilities || res?.transactions || [];
      } catch {
        try {
          const res = await apiClient.get('/transactions?category=FINANCING&limit=50');
          return res?.transactions || [];
        } catch {
          return [];
        }
      }
    },
  });

  const parsedPrincipal = parseFloat(principalAmount) || 0;
  const parsedCollateral = parseFloat(collateralValue) || 0;
  const ltv = parsedCollateral > 0 ? (parsedPrincipal / parsedCollateral) * 100 : 0;
  const maxLtv = facilityType === 'PO' ? 70 : 80;
  const isLtvExceeded = ltv > maxLtv;

  // Exact BigInt calculation simulation for UI preview
  const principalMinor = BigInt(Math.round(parsedPrincipal * 100));
  const adminFeeMinor = (principalMinor * 150n) / 10000n; // 1.5%
  const totalInterestMinor = (principalMinor * BigInt(interestBps) * BigInt(tenorMonths)) / 120000n;
  const totalObligationMinor = principalMinor + adminFeeMinor + totalInterestMinor;

  const N = BigInt(tenorMonths || 1);
  const monthlyBaseMinor = totalObligationMinor / N;
  const residueMinor = totalObligationMinor - (monthlyBaseMinor * N);

  const formatMoney = (minorBigInt) => (Number(minorBigInt) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  // Submit Financing Proposal Mutation
  const submitFinancingMutation = useMutation({
    mutationFn: async (payload) => {
      const idemp = `fin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      return apiClient.post('/financing', payload, {
        headers: { 'Idempotency-Key': idemp },
      });
    },
    onSuccess: async (res) => {
      const intentId = res?.intent?.intent_id || res?.data?.intent_id;
      if (intentId) setSelectedTxId(intentId);
      notify({ message: 'Supply chain financing proposal successfully submitted for Underwriting and Maker/Checker approval.' });
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['financing-list', environment] });
      await queryClient.invalidateQueries({ queryKey: ['transactions', environment] });
    },
    onError: (err) => {
      setFormError(err.message || 'Financing proposal submission failed.');
      notify({ message: err.message || 'Submission failed.', kind: 'error' });
    },
  });

  // Maker/Checker Decision Mutation
  const decisionMutation = useMutation({
    mutationFn: async ({ txId, decision }) => {
      return apiClient.post(`/transactions/${txId}/decision`, {
        decision,
        comment: `Tier C Supply Chain Financing Maker/Checker ${decision.toLowerCase()} via UI`,
      });
    },
    onSuccess: async (_, variables) => {
      notify({ message: `Financing facility successfully ${variables.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}.` });
      await queryClient.invalidateQueries({ queryKey: ['financing', selectedTxId, environment] });
      await queryClient.invalidateQueries({ queryKey: ['financing-list', environment] });
      await queryClient.invalidateQueries({ queryKey: ['transactions', environment] });
    },
    onError: (err) => {
      notify({ message: `Decision failed: ${err.message}`, kind: 'error' });
    },
  });

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');

    if (parsedPrincipal <= 0) {
      setFormError('Principal financing amount must be greater than zero.');
      return;
    }

    if (parsedCollateral <= 0) {
      setFormError('Collateral / invoice value must be greater than zero.');
      return;
    }

    if (isLtvExceeded) {
      setFormError(`Loan-to-Value (LTV) of ${ltv.toFixed(1)}% exceeds the maximum cap of ${maxLtv}% for ${facilityType} facility.`);
      return;
    }

    if (counterpartyHistory < 3) {
      setFormError('Counterparty requires a minimum of 3 clean, undisputed historical transactions.');
      return;
    }

    if (tenorMonths < 1 || tenorMonths > 6) {
      setFormError('Facility tenor must be between 1 and 6 months (180 days).');
      return;
    }

    submitFinancingMutation.mutate({
      facilityType,
      principalAmountMinor: principalMinor.toString(),
      collateralValueMinor: BigInt(Math.round(parsedCollateral * 100)).toString(),
      currency,
      tenorMonths,
      counterpartyId,
      counterpartyHistoryCount: counterpartyHistory,
      interestBps,
    });
  };

  const handleCheckerDecision = (decision) => {
    const txId = selectedTxId || effectiveFinancingId;
    if (!txId) {
      notify({ message: 'Please select or submit a financing facility first to perform Checker decision.', kind: 'info' });
      return;
    }
    decisionMutation.mutate({ txId, decision });
  };

  if (isFinancingLoading) {
    return (
      <div className={styles.emptyCard} data-testid="financing-loading">
        <Loader2 className="animate-spin" size={32} />
        <p className={styles.emptyDesc}>Loading supply chain financing facility...</p>
      </div>
    );
  }

  if (isFinancingError) {
    return (
      <div className={styles.pageStack} data-testid="financing-error">
        <div className={styles.errorBanner}>
          <AlertCircle size={20} />
          <div>
            <strong>Failed to Load Financing Facility</strong>
            <p style={{ margin: '4px 0 0 0' }}>{financingError?.message || 'A system error occurred while contacting the server.'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.pageStack} data-testid="financing-page">
      {/* Header with Title and Badges */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className={styles.pageTitle}>Supply Chain Financing</h1>
            <span
              className={`${styles.providerBadge} ${styles.badgeSimulated}`}
              data-testid="simulated-badge"
            >
              SIMULATED
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Purchase Order and Invoice Financing facilities with deterministic underwriting evaluation (Tier C, AD-17).
          </p>
        </div>

        <div className={styles.headerActions}>
          <span className={`${styles.providerBadge} ${styles.badgeSandbox}`}>
            <ShieldAlert size={14} style={{ marginRight: '4px' }} />
            Always Require Approval (0 Auto-Approve)
          </span>
          <Link to="/transactions/new?category=FINANCING" className={styles.primaryLink}>
            New Facility Proposal
          </Link>
        </div>
      </div>

      <div className={styles.twoColumnLayout}>
        {/* Left Column: Form & Schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-6)' }}>
          <form onSubmit={handleValidateForm} className={styles.formCard} data-testid="financing-form">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <Calculator size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Financing Facility Parameters</h2>
            </div>

            {formError && (
              <div className={styles.errorBanner}>
                <AlertCircle size={16} />
                <span>{formError}</span>
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Facility Type</label>
                <select
                  className={styles.fieldSelect}
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value)}
                  data-testid="facility-type-select"
                >
                  <option value="PO">Purchase Order Financing (Max 70% LTV)</option>
                  <option value="INVOICE">Invoice Financing (Max 80% LTV)</option>
                </select>
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
                <label className={styles.fieldLabel}>Collateral / Invoice Value ($)</label>
                <input
                  type="number"
                  step="any"
                  className={styles.fieldInput}
                  placeholder="100000"
                  value={collateralValue}
                  onChange={(e) => setCollateralValue(e.target.value)}
                  data-testid="collateral-value-input"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Requested Principal ($)</label>
                <input
                  type="number"
                  step="any"
                  className={styles.fieldInput}
                  placeholder="50000"
                  value={principalAmount}
                  onChange={(e) => setPrincipalAmount(e.target.value)}
                  data-testid="principal-amount-input"
                />
              </div>
            </div>

            {/* LTV Real-Time Indicator */}
            <div className={isLtvExceeded ? styles.errorBanner : styles.successBanner}>
              {isLtvExceeded ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  Loan-to-Value (LTV): <strong>{ltv.toFixed(1)}%</strong> (Maximum Cap: {maxLtv}%)
                </span>
                <strong style={{ fontSize: '11px', textTransform: 'uppercase' }}>
                  {isLtvExceeded ? 'Exceeds Cap' : 'LTV Compliant'}
                </strong>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Facility Tenor (Months)</label>
                <select
                  className={styles.fieldSelect}
                  value={tenorMonths}
                  onChange={(e) => setTenorMonths(parseInt(e.target.value, 10))}
                  data-testid="tenor-months-select"
                >
                  <option value={1}>1 Month (30 Days)</option>
                  <option value={2}>2 Months (60 Days)</option>
                  <option value={3}>3 Months (90 Days)</option>
                  <option value={4}>4 Months (120 Days)</option>
                  <option value={5}>5 Months (150 Days)</option>
                  <option value={6}>6 Months (180 Days - Max Cap)</option>
                </select>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Fixed Interest Rate (p.a.)</label>
                <input
                  type="text"
                  disabled
                  className={styles.fieldInput}
                  value="12.00% (1,200 bps pro-rata)"
                  style={{ background: 'var(--jp-surface-sidebar)', color: 'var(--jp-text-muted)' }}
                />
              </div>

              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label className={styles.fieldLabel}>Counterparty Transaction History</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className={styles.fieldInput}
                    style={{ width: '120px' }}
                    value={counterpartyHistory}
                    onChange={(e) => setCounterpartyHistory(parseInt(e.target.value, 10) || 0)}
                    data-testid="counterparty-history-input"
                  />
                  <span className={styles.pageSubtitle}>
                    completed transactions (Underwriting minimum threshold: 3)
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                disabled={submitFinancingMutation.isPending}
                className={styles.primaryLink}
                data-testid="submit-financing-button"
              >
                {submitFinancingMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Underwriting & Submitting...
                  </>
                ) : (
                  'Validate & Simulate Underwriting'
                )}
              </button>
            </div>
          </form>

          {/* Amortization Schedule Waterfall Table */}
          <div className={styles.tableCard}>
            <div style={{ padding: 'var(--jp-space-4)', borderBottom: '1px solid var(--jp-border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={18} />
              <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Amortization Waterfall & Repayment Schedule</h2>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.dataTable}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Total Installment</th>
                    <th>Admin Fee (1.5%)</th>
                    <th>Interest</th>
                    <th>Principal</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: tenorMonths }, (_, i) => {
                    const month = i + 1;
                    const isFinal = month === tenorMonths;
                    const amt = isFinal ? monthlyBaseMinor + residueMinor : monthlyBaseMinor;
                    const feePortion = month === 1 ? adminFeeMinor : 0n;
                    const interestPortion = totalInterestMinor / N;
                    const principalPortion = amt - feePortion - interestPortion;

                    return (
                      <tr key={month}>
                        <td className={styles.mono} style={{ fontWeight: 'bold' }}>Cycle #{month}</td>
                        <td className={styles.mono} style={{ fontWeight: 'bold' }}>${formatMoney(amt)}</td>
                        <td className={styles.mono} style={{ color: feePortion > 0n ? 'var(--jp-blue-dark)' : 'var(--jp-text-muted)' }}>
                          ${formatMoney(feePortion)}
                        </td>
                        <td className={styles.mono} style={{ color: 'var(--jp-badge-purple)' }}>
                          ${formatMoney(interestPortion)}
                        </td>
                        <td className={styles.mono} style={{ color: 'var(--jp-success)' }}>
                          ${formatMoney(principalPortion)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--jp-surface-sidebar)', fontWeight: 'bold' }}>
                    <td>Total Facility Obligation</td>
                    <td className={styles.mono}>${formatMoney(totalObligationMinor)} {currency}</td>
                    <td className={styles.mono}>${formatMoney(adminFeeMinor)}</td>
                    <td className={styles.mono}>${formatMoney(totalInterestMinor)}</td>
                    <td className={styles.mono}>${formatMoney(principalMinor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#0c6b3c' }}>DEBIT org:main (Disbursed Cash)</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#0c6b3c', fontWeight: 'bold' }}>
                  ${formatMoney(principalMinor - adminFeeMinor)} {currency}
                </p>
              </div>

              <div style={{ padding: '10px 12px', background: '#eaf3ff', border: '1px solid #b3cdfb', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#003087' }}>DEBIT loan:fee (Admin Fee 1.5%)</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#003087', fontWeight: 'bold' }}>
                  ${formatMoney(adminFeeMinor)} {currency}
                </p>
              </div>

              <div style={{ padding: '10px 12px', background: '#f5f0ff', border: '1px solid #d4c2fc', borderRadius: '8px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#5521b5' }}>CREDIT loan:principal (Principal Obligation)</span>
                <p className={styles.mono} style={{ margin: '4px 0 0 0', color: '#5521b5', fontWeight: 'bold' }}>
                  ${formatMoney(principalMinor)} {currency}
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
              Tier C FINANCING strictly mandates human Checker authorization before funds can be released by the partner simulator.
              {selectedTxId ? ` Active Target: ${selectedTxId.slice(0, 8)}...` : ' Select or submit a facility to decide.'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleCheckerDecision('APPROVE')}
                disabled={decisionMutation.isPending}
                className={styles.primaryLink}
                style={{ width: '100%', background: '#0c6b3c' }}
                data-testid="checker-approve-button"
              >
                {decisionMutation.isPending && decisionMutation.variables?.decision === 'APPROVE' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Approving Disbursement...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    Approve Disbursement (Checker)
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleCheckerDecision('REJECT')}
                disabled={decisionMutation.isPending}
                className={styles.secondaryLink}
                style={{ width: '100%', color: '#9b1c2a', borderColor: '#f8b4be' }}
                data-testid="checker-reject-button"
              >
                {decisionMutation.isPending && decisionMutation.variables?.decision === 'REJECT' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Rejecting Facility...
                  </>
                ) : (
                  <>
                    <XCircle size={16} />
                    Reject Facility (Checker)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FinancingPage;
