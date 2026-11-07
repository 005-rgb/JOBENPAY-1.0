/**
 * web/src/pages/DisputePage.jsx
 * Dispute Defense UI: maker/checker controls, evidence package review, claim resolution, double-entry view
 * (K-DISPUTE, FR-1001...1004, AD-12, AD-23, T-06)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  HelpCircle,
  Loader2,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function DisputePage({ disputeId = null }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  const {
    data: dispData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['dispute', disputeId],
    queryFn: async () => {
      if (!disputeId) return null;
      return apiClient.get(`/api/v1/disputes/${disputeId}`);
    },
    enabled: Boolean(disputeId),
  });

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="dispute-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data sengketa (dispute)...</p>
      </div>
    );
  }

  // 2. Error State
  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="dispute-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal Memuat Dispute</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan sistem'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback demo data
  const intent = dispData?.data || {
    intent_id: 'e0000000-0000-4000-8000-000000000088',
    category: 'DISPUTE',
    sub_type: 'chargeback',
    status: 'NEEDS_APPROVAL',
    amount_minor: '7500',
    currency: 'USD',
    counterparty_id: '00000000-0000-4000-8000-000000000011',
    created_at: new Date().toISOString(),
    metadata: {
      paypalDisputeId: 'DISP-SANDBOX-001',
      reason: 'MERCHANDISE_OR_SERVICE_NOT_RECEIVED',
      evidenceDraft: 'Proof of fulfillment uploaded by system: Carrier UPS tracking 1Z9999999999999999 delivered to address.',
      description: 'Customer claims package was not received',
    },
  };

  const isNeedsApproval = intent.status === 'NEEDS_APPROVAL';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="dispute-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Pembelaan Sengketa (DISPUTE)</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
              {intent.category} / {intent.sub_type}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            PayPal Dispute ID: <span className="font-mono font-bold text-gray-800">{intent.metadata?.paypalDisputeId || 'DISP-SANDBOX-001'}</span> | Intent:{' '}
            <span className="font-mono text-gray-600">{intent.intent_id}</span>
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {intent.status === 'COMPLETED' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              RESOLVED
            </span>
          )}
          {intent.status === 'NEEDS_APPROVAL' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
              <Clock className="w-4 h-4 text-amber-600" />
              NEEDS APPROVAL
            </span>
          )}
          {intent.status === 'APPROVED' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              APPROVED
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-500 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Ringkasan & Pembelaan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ledger'
              ? 'border-primary-500 text-primary-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Double-Entry Ledger
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          {/* Dispute Amount Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-5 shadow-sm space-y-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Nilai Dana Disengketakan</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-gray-900">
                  {intent.currency} {(Number(intent.amount_minor) / 100).toFixed(2)}
                </span>
                <span className="text-xs text-gray-500 font-mono">({intent.amount_minor} minor)</span>
              </div>
              <p className="text-xs text-gray-500">
                Alasan Sengketa:{' '}
                <span className="font-semibold text-rose-700">{intent.metadata?.reason || 'ITEM_NOT_RECEIVED'}</span>
              </p>
            </div>

            <div className="bg-white border rounded-lg p-5 shadow-sm space-y-3">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-indigo-600" />
                Rekomendasi AI Defense
              </span>
              <div className="text-xs text-gray-700 leading-relaxed bg-indigo-50/50 p-3 rounded border border-indigo-100">
                {intent.metadata?.evidenceDraft || 'AI mendeteksi bukti pengiriman sah dengan nomor resi terverifikasi kurir. Rekomendasi: CONTEST (Ajukan Bukti).'}
              </div>
            </div>
          </div>

          {/* Maker / Checker Controls */}
          {isNeedsApproval && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-3" data-testid="checker-controls">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <UserCheck className="w-5 h-5 text-amber-600" />
                Kontrol Maker / Checker (Persetujuan Manusia Wajib — AD-23)
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                <strong>Aturan Emas:</strong> Agen AI dilarang secara otonom menerima klaim atau mendebit kas organisasi. Keputusan untuk mengajukan bukti pembelaan (*provide-evidence*) atau menerima klaim pengembalian (*accept-claim*) mutlak berada di tangan approver manusia.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-medium transition shadow-sm"
                >
                  Ajukan Bukti Pembelaan (Contest & Submit Evidence)
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-sm font-medium transition shadow-sm"
                >
                  Terima Klaim Pembeli (Accept Claim & Refund)
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-4" data-testid="dispute-ledger">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary-500" />
              Entri Pembukuan Berpasangan (Double-Entry Ledger Legs jika Kalah/Diterima)
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
                <tr className="bg-rose-50/20">
                  <td className="p-3 font-semibold text-rose-700">DEBIT</td>
                  <td className="p-3 font-mono text-gray-700">org:main</td>
                  <td className="p-3 font-mono">{intent.amount_minor}</td>
                  <td className="p-3">{intent.currency}</td>
                </tr>
                <tr className="bg-blue-50/20">
                  <td className="p-3 font-semibold text-blue-700">CREDIT</td>
                  <td className="p-3 font-mono text-gray-700">buyer:{intent.counterparty_id}</td>
                  <td className="p-3 font-mono">{intent.amount_minor}</td>
                  <td className="p-3">{intent.currency}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default DisputePage;

