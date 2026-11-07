/**
 * web/src/pages/PayoutPage.jsx
 * Payout Transaction UI: maker/checker controls, states, timeline, double-entry view
 * (K-PAYOUT, FR-1301...1307)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Loader2,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function PayoutPage({ payoutId = null }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  const {
    data: payout,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['payout', payoutId],
    queryFn: async () => {
      if (!payoutId) return null;
      return apiClient.get(`/api/v1/payouts/${payoutId}`);
    },
    enabled: Boolean(payoutId),
  });

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="payout-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data transaksi payout...</p>
      </div>
    );
  }

  // 2. Error State
  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="payout-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal Memuat Payout</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan sistem'}</p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Empty State (no payout selected or no payouts found)
  if (!payoutId || !payout) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] p-8 text-center max-w-md mx-auto" data-testid="payout-empty">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-gray-400">
          <DollarSign className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">Belum Ada Transaksi Payout</h3>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Buat usulan payout baru dari agen atau simulator transaksi.
        </p>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
          SANDBOX ONLY — Simulasi Dana
        </span>
      </div>
    );
  }

  // 4. Detail / Success State
  const statusColors = {
    DRAFT: 'bg-gray-100 text-gray-800',
    SUBMITTED: 'bg-blue-100 text-blue-800',
    EVALUATING: 'bg-purple-100 text-purple-800',
    NEEDS_APPROVAL: 'bg-amber-100 text-amber-800',
    APPROVED: 'bg-teal-100 text-teal-800',
    EXECUTING: 'bg-indigo-100 text-indigo-800',
    COMPLETED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6" data-testid="payout-detail">
      {/* Sandbox Warning Banner */}
      <div className="rounded-md bg-amber-50 border border-amber-200 p-3 flex items-center justify-between text-xs text-amber-900">
        <span className="font-semibold tracking-wide">SANDBOX ONLY</span>
        <span>Lingkungan Uji Coba — Tidak ada pergerakan uang nyata</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Payout #{payout.intent_id?.slice(0, 8)}</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColors[payout.status] || 'bg-gray-100'}`}>
              {payout.status}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">Kategori: PAYOUT (standard)</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-900">
            {payout.currency} {(Number(payout.amount_minor || 0) / 100).toFixed(2)}
          </div>
          <p className="text-xs text-gray-500">Rekonsiliasi: {payout.reconciliation_status}</p>
        </div>
      </div>

      {/* Maker / Checker Control Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <UserCheck className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <h4 className="text-sm font-semibold text-blue-900">Kontrol Maker/Checker Terintegrasi</h4>
          <p className="text-xs text-blue-800 mt-0.5">
            Setiap usulan payout oleh agen wajib melewati Decision Engine (Tahap A/B/C/D) dan persetujuan manusia
            (Approver) bila melampaui batas auto-approve.
          </p>
        </div>
      </div>

      {/* Double-Entry Ledger Preview */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Buku Besar Berimbang (Double-Entry Balanced)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-red-50 border border-red-100 rounded">
            <span className="font-semibold text-red-700">DEBIT (Pengurangan Kas)</span>
            <div className="mt-1 font-mono text-gray-800">Akun: org:main</div>
            <div className="font-mono text-red-900 font-bold mt-0.5">
              -{payout.currency} {(Number(payout.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
          <div className="p-3 bg-green-50 border border-green-100 rounded">
            <span className="font-semibold text-green-700">CREDIT (Hak Tagih Penerima)</span>
            <div className="mt-1 font-mono text-gray-800">Akun: payee:{payout.counterparty_id?.slice(0, 8)}...</div>
            <div className="font-mono text-green-900 font-bold mt-0.5">
              +{payout.currency} {(Number(payout.amount_minor || 0) / 100).toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PayoutPage;

