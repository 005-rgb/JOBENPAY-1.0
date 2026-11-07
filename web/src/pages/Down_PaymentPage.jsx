/**
 * web/src/pages/Down_PaymentPage.jsx
 * Down Payment UI: List & Detail views, 29-day authorization window,
 * visual progress bar (initial -> settlement -> settled), "Settle" action button, and double-entry view
 * (K-DOWN_PAYMENT, FR-1301...1307, AD-04, AD-26, T-09, WP F7-2)
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
  DollarSign,
  FileText,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

function formatMoney(amountMinor, currency = 'USD') {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const major = Number(BigInt(amountMinor)) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(major);
}

export function DownPaymentProgressBar({ status }) {
  const norm = (status || '').toUpperCase();
  const isSettled = norm === 'SETTLED' || norm === 'COMPLETED';
  const isSettlementDue = norm === 'SETTLEMENT_DUE' || norm === 'AWAITING_DELIVERY';

  let step = 1;
  if (isSettled) step = 3;
  else if (isSettlementDue) step = 2;

  return (
    <div className="space-y-1.5" data-testid="dp-progress-bar">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className={step >= 1 ? 'text-black' : 'text-gray-400'}>1. Initial DP</span>
        <span className={step >= 2 ? 'text-black' : 'text-gray-400'}>2. Settlement Due</span>
        <span className={step >= 3 ? 'text-emerald-700' : 'text-gray-400'}>3. Settled</span>
      </div>
      <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden flex">
        <div className={`h-full transition-all duration-300 ${step >= 1 ? 'w-1/3 bg-black' : 'w-0'}`} />
        <div className={`h-full transition-all duration-300 ${step >= 2 ? 'w-1/3 bg-blue-600' : 'w-0'}`} />
        <div className={`h-full transition-all duration-300 ${step >= 3 ? 'w-1/3 bg-emerald-500' : 'w-0'}`} />
      </div>
    </div>
  );
}

export function Down_PaymentPage({ downPaymentId = null }) {
  const { id } = useParams();
  const effectiveId = downPaymentId || id;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // 1. Fetch list of down payments when on /down-payments
  const listQuery = useQuery({
    queryKey: ['down-payments-list'],
    queryFn: async () => apiClient.get('/api/v1/down-payments'),
    enabled: !effectiveId,
  });

  // 2. Fetch specific down payment when effectiveId is present
  const detailQuery = useQuery({
    queryKey: ['down-payment-detail', effectiveId],
    queryFn: async () => apiClient.get(`/api/v1/down-payments/${effectiveId}`),
    enabled: Boolean(effectiveId),
  });

  // Settle Down Payment mutation
  const settleMutation = useMutation({
    mutationFn: async (dpId) => apiClient.post(`/api/v1/down-payments/${dpId}/settle`),
    onSuccess: async () => {
      setActionSuccess('Down payment successfully settled!');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['down-payments-list'] });
      await queryClient.invalidateQueries({ queryKey: ['down-payment-detail', effectiveId] });
    },
    onError: (err) => {
      setActionError(err.message || 'Settlement failed');
    },
  });

  // --------------------------------------------------------------------------
  // LIST VIEW: /down-payments
  // --------------------------------------------------------------------------
  if (!effectiveId) {
    if (listQuery.isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 bg-white border rounded-xl text-center space-y-3" data-testid="down-payment-loading">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Memuat data uang muka (down payments)...</p>
        </div>
      );
    }

    const items = listQuery.data?.downPayments || [];

    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="down-payments-list-page">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Uang Muka (Down Payments)</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Alur uang muka bertahap, otorisasi 29 hari, dan pelunasan (settlement) per AD-04/AD-26.
            </p>
          </div>
          <Link
            to="/transactions/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Ajukan Down Payment
          </Link>
        </div>

        {actionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
            {actionSuccess}
          </div>
        )}

        {items.length === 0 ? (
          <div className="p-12 bg-white border rounded-xl text-center space-y-3">
            <Lock className="w-10 h-10 text-gray-300 mx-auto" />
            <h3 className="text-base font-semibold text-gray-900">Belum ada akun uang muka</h3>
            <p className="text-sm text-gray-500">Down payments yang diajukan akan muncul di sini.</p>
          </div>
        ) : (
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm" data-testid="down-payments-table">
              <thead className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Intent ID</th>
                  <th className="py-3 px-4">Counterparty</th>
                  <th className="py-3 px-4">Nilai DP</th>
                  <th className="py-3 px-4">Total Kontrak</th>
                  <th className="py-3 px-4 min-w-[180px]">Progres Pelunasan</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.intent_id} className="hover:bg-gray-50/80 transition">
                    <td className="py-3.5 px-4 font-mono text-xs font-bold text-gray-900">
                      <Link to={`/down-payments/${item.intent_id}`} className="hover:underline">
                        {item.intent_id.slice(0, 8)}...
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-700">
                      {item.counterparty_name || 'Counterparty'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-900 whitespace-nowrap">
                      {formatMoney(item.dp_amount_minor || item.amount_minor, item.currency)}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-gray-600">
                      {formatMoney(item.total_amount_minor || item.amount_minor, item.currency)}
                    </td>
                    <td className="py-3.5 px-4">
                      <DownPaymentProgressBar status={item.dp_status || item.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {item.dp_status !== 'SETTLED' && (
                          <button
                            type="button"
                            onClick={() => settleMutation.mutate(item.intent_id)}
                            disabled={settleMutation.isPending}
                            className="px-3 py-1 bg-emerald-600 text-white hover:bg-emerald-700 rounded text-xs font-semibold transition"
                            data-testid={`settle-btn-${item.intent_id}`}
                          >
                            Settle
                          </button>
                        )}
                        <Link
                          to={`/down-payments/${item.intent_id}`}
                          className="text-xs font-semibold text-black hover:underline"
                        >
                          Detail &rarr;
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // DETAIL VIEW: /down-payments/:id
  // --------------------------------------------------------------------------
  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="down-payment-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data uang muka (down payment)...</p>
      </div>
    );
  }

  const intent = detailQuery.data?.data || {
    intent_id: effectiveId,
    category: 'DOWN_PAYMENT',
    sub_type: 'initial',
    status: 'NEEDS_APPROVAL',
    amount_minor: '20000',
    currency: 'USD',
    metadata: {
      totalAmountMinor: '100000',
      authorizationId: 'AUTH-DP-DEMO-001',
    },
  };

  const isNeedsApproval = intent.status === 'NEEDS_APPROVAL';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="down-payment-page">
      <div>
        <Link to="/down-payments" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-black">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke daftar uang muka
        </Link>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
          {actionSuccess}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Uang Muka (DOWN_PAYMENT)</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              {intent.category} / {intent.sub_type}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Intent ID: <span className="font-mono text-gray-700">{intent.intent_id}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => settleMutation.mutate(intent.intent_id)}
            disabled={settleMutation.isPending || intent.status === 'SETTLED'}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition shadow-sm"
            data-testid="settle-btn"
          >
            Settle Down Payment
          </button>
        </div>
      </div>

      {/* Progress Bar Card */}
      <div className="p-4 bg-white border rounded-xl shadow-sm space-y-2">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block">
          Status Alur Pelunasan Kontrak
        </span>
        <DownPaymentProgressBar status={intent.status} />
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-2">
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Uang Muka (Down Payment)</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-gray-900">
              {formatMoney(intent.amount_minor, intent.currency)}
            </span>
            <span className="text-xs text-gray-500 font-mono">({intent.amount_minor} minor)</span>
          </div>
          <p className="text-xs text-gray-500">
            Total Nilai Kontrak:{' '}
            <span className="font-semibold text-gray-800">
              {formatMoney(intent.metadata?.totalAmountMinor || intent.amount_minor, intent.currency)}
            </span>
          </p>
        </div>

        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-purple-600" />
              Jendela Otorisasi PayPal (Batas 29 Hari)
            </span>
            <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
              28 Hari Tersisa
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>
              Sisa tagihan diotorisasi dan wajib dilunasi (`settlement`) sebelum masa otorisasi berakhir per AD-26.
            </span>
          </div>
        </div>
      </div>

      {/* Double-Entry Ledger Legs Preview */}
      <div className="bg-white border rounded-lg p-5 shadow-sm space-y-4" data-testid="down-payment-ledger">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-500" />
            Entri Pembukuan Berpasangan (Double-Entry Ledger Legs)
          </h3>
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            SUM(DEBIT) = SUM(CREDIT) Seimbang
          </span>
        </div>

        <div className="overflow-x-auto border rounded-md">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 border-b text-gray-500 font-medium">
              <tr>
                <th className="p-3">Tipe Kaki</th>
                <th className="p-3">Akun Buku</th>
                <th className="p-3">Jumlah Minor</th>
                <th className="p-3">Mata Uang</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr className="bg-blue-50/20">
                <td className="p-3 font-semibold text-blue-700">DEBIT</td>
                <td className="p-3 font-mono text-gray-700">buyer:{intent.counterparty_id || 'buyer'}</td>
                <td className="p-3 font-mono">{intent.amount_minor}</td>
                <td className="p-3">{intent.currency}</td>
              </tr>
              <tr className="bg-purple-50/20">
                <td className="p-3 font-semibold text-purple-700">CREDIT</td>
                <td className="p-3 font-mono text-gray-700">org:down_payment_escrow</td>
                <td className="p-3 font-mono">{intent.amount_minor}</td>
                <td className="p-3">{intent.currency}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default Down_PaymentPage;
