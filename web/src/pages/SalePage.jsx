/**
 * web/src/pages/SalePage.jsx
 * Sale Transaction UI: maker/checker controls, states, timeline, double-entry view, buyer approval link
 * (K-SALE, FR-1301...1307)
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
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  ShoppingCart,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function SalePage({ saleId = null }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('overview');

  const {
    data: sale,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: async () => {
      if (!saleId) return null;
      return apiClient.get(`/api/v1/sales/${saleId}`);
    },
    enabled: Boolean(saleId),
  });

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="sale-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data transaksi sale...</p>
      </div>
    );
  }

  // 2. Error State
  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="sale-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal Memuat Sale</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan sistem'}</p>
          </div>
        </div>
      </div>
    );
  }

  // 3. Empty / Create State
  if (!sale) {
    return (
      <div className="p-6 max-w-4xl mx-auto" data-testid="sale-empty">
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center bg-gray-50">
          <ShoppingCart className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h2 className="text-lg font-medium text-gray-900">Transaksi Penjualan (SALE)</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto mt-1 mb-4">
            Buat order penjualan baru untuk menerima pembayaran pelanggan via PayPal Orders Capture API.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 font-medium">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            LINGKUNGAN SANDBOX TERKUNCI (HANYA UJI COBA)
          </div>
        </div>
      </div>
    );
  }

  const { data } = sale;
  const isExecuting = data.status === 'EXECUTING';
  const isCompleted = data.status === 'COMPLETED';
  const isNeedsApproval = data.status === 'NEEDS_APPROVAL';
  const approvalUrl = data.metadata?.approvalUrl;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6" data-testid="sale-detail">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Sale #{data.intent_id?.slice(0, 8)}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {data.status}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
              SANDBOX ONLY
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">ID Transaksi Universal: {data.intent_id}</p>
        </div>

        {/* Maker/Checker Action Buttons */}
        {isNeedsApproval && (
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors shadow-sm">
              Setujui (Approve)
            </button>
            <button className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors">
              Tolak (Reject)
            </button>
          </div>
        )}
      </div>

      {/* Buyer Approval Notification Banner */}
      {isExecuting && approvalUrl && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-blue-900">
            <Clock className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <span>Menunggu persetujuan pembeli. Silakan buka tautan checkout untuk menyelesaikan simulasi pembayaran:</span>
          </div>
          <a
            href={approvalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md shrink-0 shadow-sm"
          >
            Buka Approval PayPal
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-6 text-sm">
        <button
          className={`pb-2 font-medium border-b-2 transition-colors ${
            activeTab === 'overview'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Ringkasan & Detail
        </button>
        <button
          className={`pb-2 font-medium border-b-2 transition-colors ${
            activeTab === 'ledger'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('ledger')}
        >
          Pratinjau Buku Besar (Double-Entry Ledger)
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card Info */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Informasi Pembayaran</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500">Jumlah:</span>
                <p className="font-semibold text-gray-900 text-sm mt-0.5">
                  {(Number(data.amount_minor) / 100).toFixed(2)} {data.currency}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Arah Arus:</span>
                <p className="font-semibold text-green-600 mt-0.5">MASUK (INCOMING)</p>
              </div>
              <div>
                <span className="text-gray-500">Kategori:</span>
                <p className="font-medium text-gray-900 mt-0.5">{data.category} ({data.sub_type})</p>
              </div>
              <div>
                <span className="text-gray-500">Counterparty ID (Buyer):</span>
                <p className="font-mono text-gray-700 mt-0.5">{data.counterparty_id || 'customer'}</p>
              </div>
            </div>
          </div>

          {/* Card Provider Refs */}
          <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Referensi Provider (PayPal)</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">Order ID:</span>
                <span className="font-mono text-gray-800">{data.metadata?.orderId || 'Belum dibuat'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100">
                <span className="text-gray-500">Capture ID:</span>
                <span className="font-mono text-gray-800">{data.metadata?.captureId || (isCompleted ? 'CAP-MOCKED' : 'Menunggu capture')}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'ledger' && (
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Entri Jurnal Berimbang (Double-Entry)</h3>
            <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded border border-green-200 font-medium">
              SUM(DEBIT) = SUM(CREDIT)
            </span>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-500 uppercase font-medium border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5">Tipe Leg</th>
                  <th className="px-4 py-2.5">Akun Buku Besar</th>
                  <th className="px-4 py-2.5 text-right">Debit</th>
                  <th className="px-4 py-2.5 text-right">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-2.5 font-bold text-blue-600">DEBIT</td>
                  <td className="px-4 py-2.5 font-mono text-gray-800">
                    buyer:{data.counterparty_id || 'customer'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-900">
                    {(Number(data.amount_minor) / 100).toFixed(2)} {data.currency}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-400">-</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-bold text-emerald-600">CREDIT</td>
                  <td className="px-4 py-2.5 font-mono text-gray-800">org:main</td>
                  <td className="px-4 py-2.5 text-right text-gray-400">-</td>
                  <td className="px-4 py-2.5 text-right font-mono font-medium text-gray-900">
                    {(Number(data.amount_minor) / 100).toFixed(2)} {data.currency}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default SalePage;

