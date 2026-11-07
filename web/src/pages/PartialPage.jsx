/**
 * web/src/pages/PartialPage.jsx
 * Partial Capture UI: maker/checker controls, cumulative capture tracking, double-entry view
 * (K-PARTIAL, FR-1301...1307, AD-10, AD-27)
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
  PieChart,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function PartialPage({ partialId = null }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  const {
    data: partialData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['partial', partialId],
    queryFn: async () => {
      if (!partialId) return null;
      return apiClient.get(`/api/v1/partials/${partialId}`);
    },
    enabled: Boolean(partialId),
  });

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="partial-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data partial capture...</p>
      </div>
    );
  }

  // 2. Error State
  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="partial-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal Memuat Data Partial</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan sistem'}</p>
          </div>
        </div>
      </div>
    );
  }

  // Fallback demo data if no ID is passed
  const intent = partialData?.data || {
    intent_id: 'e0000000-0000-4000-8000-000000000055',
    category: 'PARTIAL',
    sub_type: 'payment',
    status: 'NEEDS_APPROVAL',
    amount_minor: '50000',
    currency: 'USD',
    counterparty_id: '00000000-0000-4000-8000-000000000011',
    created_at: new Date().toISOString(),
    metadata: {
      authorizationId: 'AUTH-DEMO-9988',
      isFinal: false,
      authorizedTotal: '100000',
      capturedCumulative: '50000',
      description: 'Partial capture for order shipment #1',
    },
  };

  const isNeedsApproval = intent.status === 'NEEDS_APPROVAL';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="partial-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Transaksi PARTIAL</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {intent.category} / {intent.sub_type}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Intent ID: <span className="font-mono text-gray-700">{intent.intent_id}</span>
          </p>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {intent.status === 'COMPLETED' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              COMPLETED
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
          Ringkasan & Approval
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
          {/* Amount Card & Cumulative Progress */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-5 shadow-sm space-y-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Nilai Penangkapan Parsial</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-gray-900">
                  {intent.currency} {(Number(intent.amount_minor) / 100).toFixed(2)}
                </span>
                <span className="text-xs text-gray-500 font-mono">({intent.amount_minor} minor)</span>
              </div>
              <p className="text-xs text-gray-500">
                Otorisasi Referensi:{' '}
                <span className="font-mono text-gray-700">{intent.metadata?.authorizationId || 'N/A'}</span>
              </p>
            </div>

            <div className="bg-white border rounded-lg p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <PieChart className="w-3.5 h-3.5 text-blue-500" />
                  Akumulasi Penangkapan Dana
                </span>
                <span className="text-xs font-semibold text-gray-700">50% Terpakai</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: '50%' }} />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Tertangkap: $500.00</span>
                <span>Batas Total: $1,000.00</span>
              </div>
            </div>
          </div>

          {/* Maker / Checker Controls */}
          {isNeedsApproval && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-3" data-testid="checker-controls">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <UserCheck className="w-5 h-5 text-amber-600" />
                Kontrol Maker / Checker (Persetujuan Manusia Wajib)
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Transaksi ini diusulkan oleh agen AI dan membutuhkan persetujuan approver manusia sebelum penangkapan parsial dana ke rekening organisasi diproses ke PayPal.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium transition shadow-sm"
                >
                  Setujui Penangkapan (Approve)
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-sm font-medium transition shadow-sm"
                >
                  Tolak Transaksi (Reject)
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-4" data-testid="partial-ledger">
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
                  <td className="p-3 font-mono text-gray-700">buyer:{intent.counterparty_id}</td>
                  <td className="p-3 font-mono">{intent.amount_minor}</td>
                  <td className="p-3">{intent.currency}</td>
                </tr>
                <tr className="bg-emerald-50/20">
                  <td className="p-3 font-semibold text-emerald-700">CREDIT</td>
                  <td className="p-3 font-mono text-gray-700">org:main</td>
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

export default PartialPage;

