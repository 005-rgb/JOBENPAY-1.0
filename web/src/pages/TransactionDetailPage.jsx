/**
 * web/src/pages/TransactionDetailPage.jsx
 * Unified Transaction Detail for all 15 categories (PRD 1.3 §10, WP F7-1, WP F7-3)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  DollarSign,
  FileCheck,
  FileText,
  KeyRound,
  Layers,
  Lock,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import StepUpDialog from '../components/StepUpDialog.jsx';
import { StatusPill, ProviderBadge } from './TransactionsPage.jsx';
import styles from './F04Pages.module.css';

function formatMoney(amountMinor, currency = 'USD') {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const minor = BigInt(amountMinor);
  const major = Number(minor) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(major);
}

function dateLabel(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function TransactionDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'legs' | 'sar' | 'reconciliation'
  const [showStepUp, setShowStepUp] = useState(false);
  const [pendingChoice, setPendingChoice] = useState('');
  const [decisionComment, setDecisionComment] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['transaction', id],
    queryFn: async () => {
      return apiClient.get(`/api/v1/transactions/${id}`);
    },
    enabled: Boolean(id),
  });

  const decideMutation = useMutation({
    mutationFn: async ({ choice, grantId }) => {
      return apiClient.post(`/api/v1/transactions/${id}/decision`, {
        decision: choice,
        comment: decisionComment,
        stepUpGrantId: grantId,
      });
    },
    onSuccess: async () => {
      setActionError('');
      setDecisionComment('');
      await queryClient.invalidateQueries({ queryKey: ['transaction', id] });
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (err) => {
      setActionError(err.message || 'Decision failed');
    },
  });

  const handleStartDecision = (choice) => {
    setActionError('');
    setPendingChoice(choice);
    const amountBigInt = BigInt(data?.intent?.amount_minor || 0);
    const isTierC = data?.intent?.category === 'FINANCING' || data?.intent?.category === 'DEBIT';
    const needsStepUp = (amountBigInt >= 500000n || isTierC) && choice === 'APPROVE';

    if (needsStepUp) {
      setShowStepUp(true);
    } else {
      decideMutation.mutate({ choice });
    }
  };

  const handleConfirmStepUp = async (grantId) => {
    return decideMutation.mutateAsync({ choice: pendingChoice, grantId });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 bg-white border rounded-xl text-center space-y-3" data-testid="tx-detail-loading">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-500">{t('transactions.loadingDetail', 'Loading transaction details...')}</p>
      </div>
    );
  }

  if (isError || !data?.intent) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 rounded-xl space-y-3" data-testid="tx-detail-error">
        <div className="flex items-center gap-2 text-red-800 font-semibold text-base">
          <AlertCircle className="w-5 h-5 text-red-600" />
          {t('transactions.notFoundTitle', 'Transaction Not Found')}
        </div>
        <p className="text-sm text-red-700">{error?.message || 'Transaction could not be retrieved.'}</p>
        <Link to="/transactions" className="inline-flex items-center gap-1.5 text-xs font-semibold text-black hover:underline mt-2">
          <ArrowLeft className="w-4 h-4" />
          {t('transactions.backToList', 'Back to transactions list')}
        </Link>
      </div>
    );
  }

  const {
    intent,
    timeline = [],
    legs = [],
    legs_summary: legsSummary,
    sar,
    sar_hash: sarHash,
    executions = [],
    reconciliation,
    policy_evaluation: policyEvaluation,
  } = data;

  const isNeedsApproval = intent.status === 'NEEDS_APPROVAL';
  const canDecide = ['OWNER', 'ADMIN', 'APPROVER'].includes(auth.role) && isNeedsApproval;
  const isIndonesian = i18n.language === 'id';
  const policyMessage = isIndonesian ? policyEvaluation?.explanation_id : policyEvaluation?.explanation_en;

  return (
    <div className={styles.pageStack} data-testid="transaction-detail-page">
      {/* Back link */}
      <div>
        <Link
          to="/transactions"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-black transition"
          data-testid="back-link"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('transactions.backToList', 'Back to transactions')}
        </Link>
      </div>

      {/* Header Card */}
      <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900">{intent.category}</h1>
              <span className="text-sm font-medium text-gray-500">/ {intent.sub_type}</span>
              <ProviderBadge provider={intent.provider} />
            </div>
            <p className="text-xs font-mono text-gray-400 mt-1">
              ID: <span className="text-gray-700 font-semibold">{intent.intent_id}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusPill status={intent.status} />
            {legsSummary?.is_balanced && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Balanced Ledger
              </span>
            )}
          </div>
        </div>

        {/* Amount & Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2">
          <div className="p-4 bg-gray-50 rounded-lg">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
              {t('transactions.colAmount', 'Amount')}
            </span>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">
              {formatMoney(intent.amount_minor, intent.currency)}
            </div>
            <span className="text-[11px] font-mono text-gray-400">({intent.amount_minor} minor)</span>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
              {t('transactions.colCounterparty', 'Counterparty')}
            </span>
            <div className="text-sm font-semibold text-gray-900 mt-1 truncate">
              {intent.counterparty_name || 'Internal / Ledger'}
            </div>
            <span className="text-[11px] font-mono text-gray-400">
              {intent.counterparty_id ? `ID: ${intent.counterparty_id.slice(0, 8)}...` : 'Internal'}
            </span>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
              {t('transactions.reconciliation', 'Reconciliation')}
            </span>
            <div className="text-sm font-semibold text-gray-900 mt-1 flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  intent.reconciliation_status === 'RECONCILED' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              {intent.reconciliation_status}
            </div>
            <span className="text-[11px] text-gray-400">
              {reconciliation?.paypal_ref ? `Ref: ${reconciliation.paypal_ref}` : 'Settlement ledger verified'}
            </span>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider block">
              {t('transactions.colDate', 'Date')}
            </span>
            <div className="text-xs font-semibold text-gray-900 mt-1">
              {dateLabel(intent.created_at)}
            </div>
            <span className="text-[11px] font-mono text-gray-400">
              Hash: {intent.request_hash ? `${intent.request_hash.slice(0, 8)}...` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Maker/Checker Decision Banner for NEEDS_APPROVAL */}
      {isNeedsApproval && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3" data-testid="approval-action-card">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <UserCheck className="w-5 h-5 text-amber-600" />
            {t('approvals.actionRequired', 'Maker / Checker Human Approval Required')}
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">
            {policyMessage || t('approvals.explanationNotice', 'This transaction is pending approval based on gate policy constraints.')}
          </p>

          {canDecide ? (
            <div className="pt-2 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  {t('approvals.commentLabel', 'Review comment (optional)')}
                </label>
                <input
                  type="text"
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder={t('approvals.commentPlaceholder', 'Add note for audit log...')}
                  className="w-full text-xs p-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              {actionError && (
                <div className="text-xs font-semibold text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {actionError}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleStartDecision('APPROVE')}
                  disabled={decideMutation.isPending}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition shadow-sm flex items-center gap-1.5"
                  data-testid="approve-btn"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {t('approvals.approve', 'Approve Transaction')}
                </button>
                <button
                  type="button"
                  onClick={() => handleStartDecision('REJECT')}
                  disabled={decideMutation.isPending}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition shadow-sm flex items-center gap-1.5"
                  data-testid="reject-btn"
                >
                  <AlertCircle className="w-4 h-4" />
                  {t('approvals.reject', 'Reject Transaction')}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500 italic">
              {t('approvals.permissionDenied', 'You do not have approver privileges (OWNER/ADMIN/APPROVER required).')}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {[
          { key: 'overview', label: t('transactions.tabOverview', 'Overview & Timeline') },
          { key: 'legs', label: t('transactions.tabLegs', 'Double-Entry Legs') },
          { key: 'sar', label: t('transactions.tabSar', 'Structured Audit Record (SAR v1.1)') },
          { key: 'reconciliation', label: t('transactions.tabRecon', 'Reconciliation & PayPal') },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Overview & Timeline */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="md:col-span-2 bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-500" />
              {t('transactions.stateTimeline', 'State Transition Timeline')}
            </h3>

            <div className="relative border-l-2 border-gray-200 ml-3 pl-5 space-y-6">
              {timeline.map((step, idx) => (
                <div key={step.seq || idx} className="relative">
                  <span className="absolute -left-[27px] top-1 w-3.5 h-3.5 rounded-full bg-black border-2 border-white ring-2 ring-gray-200" />
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-bold text-gray-900">{step.status}</span>
                    <span className="text-[11px] text-gray-400 font-mono">{dateLabel(step.timestamp)}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">
                    Actor: <span className="font-semibold text-gray-800">{step.actor?.kind || 'SYSTEM'}</span> ({step.actor?.id || 'engine'})
                  </p>
                  {step.reason && (
                    <p className="text-[11px] text-gray-500 italic mt-0.5">"{step.reason}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Policy Evaluation Details */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-gray-500" />
              {t('transactions.policyEvaluation', 'Policy Engine Rules')}
            </h3>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-gray-50 rounded-lg">
                <span className="text-[11px] font-bold text-gray-500 uppercase">Decision Result</span>
                <div className="font-semibold text-gray-900 mt-0.5">{policyEvaluation?.decision || intent.status}</div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Reason Codes</span>
                {policyEvaluation?.reasonCodes?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {policyEvaluation.reasonCodes.map((code) => (
                      <span key={code} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] font-mono text-gray-700">
                        {code}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic">No restricting reason codes</span>
                )}
              </div>

              <div className="pt-2 border-t">
                <span className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Human Explanation (EN / ID)</span>
                <p className="text-gray-700 leading-relaxed text-[11px]">
                  <strong>EN:</strong> {policyEvaluation?.explanation_en || 'Rules verified.'}
                </p>
                <p className="text-gray-700 leading-relaxed text-[11px] mt-1">
                  <strong>ID:</strong> {policyEvaluation?.explanation_id || 'Aturan terverifikasi.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Double-Entry Legs */}
      {activeTab === 'legs' && (
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4" data-testid="legs-tab-card">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Scale className="w-4 h-4 text-gray-700" />
                {t('transactions.doubleEntryTitle', 'Double-Entry Financial Ledger Legs')}
              </h3>
              <p className="text-xs text-gray-500">
                Guaranteed balanced trigger enforcement: SUM(DEBIT) = SUM(CREDIT) per currency.
              </p>
            </div>
            <div className="text-right">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                legsSummary?.is_balanced
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-rose-100 text-rose-800 border border-rose-300'
              }`}>
                {legsSummary?.is_balanced ? 'BALANCED' : 'UNBALANCED'}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-xs" data-testid="legs-table">
              <thead className="bg-gray-50 border-b text-gray-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Account Reference</th>
                  <th className="p-3 text-right">Amount (Minor)</th>
                  <th className="p-3 text-right">Amount (Formatted)</th>
                  <th className="p-3">Currency</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {legs.map((leg) => (
                  <tr key={leg.leg_id} className={leg.leg_type === 'DEBIT' ? 'bg-blue-50/20' : 'bg-purple-50/20'}>
                    <td className="p-3 font-bold">
                      <span className={leg.leg_type === 'DEBIT' ? 'text-blue-700' : 'text-purple-700'}>
                        {leg.leg_type}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-gray-800">{leg.account_ref}</td>
                    <td className="p-3 font-mono text-right text-gray-600">{leg.amount_minor}</td>
                    <td className="p-3 font-bold text-right text-gray-900">
                      {formatMoney(leg.amount_minor, leg.currency)}
                    </td>
                    <td className="p-3 text-gray-700">{leg.currency}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-[10px] font-semibold">
                        {leg.status || 'POSTED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-bold border-t">
                <tr>
                  <td colSpan={2} className="p-3 text-gray-700">Totals:</td>
                  <td className="p-3 font-mono text-right">
                    Debit: {legsSummary?.debit_sum || '0'} | Credit: {legsSummary?.credit_sum || '0'}
                  </td>
                  <td className="p-3 font-mono text-right text-emerald-700">
                    {legsSummary?.is_balanced ? 'Δ = 0 (Balanced)' : 'Δ != 0'}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Structured Audit Record (SAR v1.1) */}
      {activeTab === 'sar' && (
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4" data-testid="sar-tab-card">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-gray-700" />
                {t('transactions.sarTitle', 'Structured Audit Record (SAR v1.1)')}
              </h3>
              <p className="text-xs text-gray-500">
                Immutable, canonically serialized audit record with SHA-256 integrity hash (AD-02).
              </p>
            </div>
            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full text-xs font-mono font-semibold">
              v{sar?.version || '1.1'}
            </span>
          </div>

          <div className="p-3 bg-gray-50 border rounded-lg flex items-center justify-between font-mono text-xs">
            <span className="text-gray-500">SHA-256 Hash:</span>
            <span className="text-gray-900 font-bold select-all">{sarHash}</span>
          </div>

          <div className="relative border rounded-lg bg-slate-900 text-slate-100 p-4 font-mono text-xs overflow-x-auto max-h-[400px]">
            <pre>{JSON.stringify(sar, null, 2)}</pre>
          </div>
        </div>
      )}

      {/* Tab 4: Reconciliation & PayPal */}
      {activeTab === 'reconciliation' && (
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4" data-testid="recon-tab-card">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-gray-700" />
            {t('transactions.reconTitle', 'Settlement Records & Provider Executions')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg bg-gray-50 space-y-2">
              <span className="text-xs font-bold text-gray-500 uppercase">Reconciliation Status</span>
              <div className="text-base font-bold text-gray-900">{intent.reconciliation_status}</div>
              <p className="text-xs text-gray-600">
                Settlement matched against ledger legs: {reconciliation?.reconciled_at ? dateLabel(reconciliation.reconciled_at) : 'Pending final settlement'}
              </p>
            </div>

            <div className="p-4 border rounded-lg bg-gray-50 space-y-2">
              <span className="text-xs font-bold text-gray-500 uppercase">PayPal Reference</span>
              <div className="text-xs font-mono font-semibold text-gray-900">
                {executions[0]?.paypal_ref || reconciliation?.paypal_ref || 'N/A (Simulation / Internal)'}
              </div>
              <p className="text-xs text-gray-600">
                Provider execution mode: <span className="font-semibold">{intent.provider}</span>
              </p>
            </div>
          </div>

          {executions.length > 0 && (
            <div className="mt-4 border rounded-lg overflow-hidden">
              <div className="bg-gray-50 p-2.5 font-bold text-xs text-gray-700 border-b">
                Execution History ({executions.length})
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-100 text-gray-500 text-[11px]">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Kind</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">HTTP</th>
                    <th className="p-2.5">Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {executions.map((ex) => (
                    <tr key={ex.id}>
                      <td className="p-2.5 font-mono">{dateLabel(ex.created_at)}</td>
                      <td className="p-2.5">{ex.kind || 'PAYMENT'}</td>
                      <td className="p-2.5 font-semibold">{ex.status}</td>
                      <td className="p-2.5 font-mono">{ex.http_status || '200'}</td>
                      <td className="p-2.5 font-mono text-gray-600">{ex.paypal_ref || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step-up Dialog for High Value Approval */}
      <StepUpDialog
        open={showStepUp}
        onOpenChange={setShowStepUp}
        onConfirm={handleConfirmStepUp}
        purpose="APPROVE_ABOVE_THRESHOLD"
        description={t('approvals.stepUpDesc', 'Confirm your identity to approve this high-value or Tier C transaction.')}
      />
    </div>
  );
}

export default TransactionDetailPage;
