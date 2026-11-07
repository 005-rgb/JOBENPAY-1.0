/**
 * web/src/pages/ScheduledPage.jsx
 * Scheduled Transactions UI: list of schedules, state visualization, execution times (local & UTC), cancellation controls
 * (K-SCHEDULED, AD-14, T-01)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function ScheduledPage({ scheduleId = null }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('list');
  const [cancellingId, setCancellingId] = useState(null);

  const {
    data: schedData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['scheduled'],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/scheduled');
      return res?.scheduled || [];
    },
  });

  const handleCancel = async (id) => {
    if (!window.confirm('Batalkan transaksi terjadwal ini? Dana yang direservasi akan dilepaskan.')) {
      return;
    }
    setCancellingId(id);
    try {
      await apiClient.post(`/api/v1/scheduled/${id}/cancel`);
      await refetch();
    } catch (err) {
      alert(`Gagal membatalkan jadwal: ${err.message}`);
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="scheduled-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat transaksi terjadwal...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="scheduled-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal Memuat Jadwal</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan sistem'}</p>
          </div>
        </div>
      </div>
    );
  }

  const schedules = schedData || [
    {
      intent_id: 'sched-demo-001',
      category: 'SCHEDULED',
      sub_type: 'payout',
      status: 'SCHEDULED',
      amount_minor: '12000',
      currency: 'USD',
      scheduled_at: '2026-12-01T10:00:00Z',
      run_status: 'PENDING',
    },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" data-testid="scheduled-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <Calendar className="w-7 h-7 text-indigo-600" />
            Transaksi Terjadwal (Scheduled Transactions)
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Eksekusi otomatis berbasis jadwal jatuh tempo dengan evaluasi ulang saat penembakan (K-SCHEDULED, AD-14, T-01)
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`py-2 px-4 text-sm font-medium border-b-2 ${
            activeTab === 'list'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Daftar Antrean Jadwal
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`py-2 px-4 text-sm font-medium border-b-2 ${
            activeTab === 'rules'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Kebijakan & Double-Entry Ledger
        </button>
      </div>

      {/* Content */}
      {activeTab === 'list' && (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Intent ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sub-Tipe</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nominal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Waktu Eksekusi (UTC & Lokal)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {schedules.map((item) => {
                const schedDate = item.scheduled_at ? new Date(item.scheduled_at) : null;
                const canCancel = item.status === 'SCHEDULED' || item.run_status === 'PENDING';

                return (
                  <tr key={item.intent_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{item.intent_id.slice(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 capitalize">{item.sub_type}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      {(Number(item.amount_minor) / 100).toFixed(2)} {item.currency}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      <div>UTC: {schedDate ? schedDate.toISOString().replace('.000Z', 'Z') : '-'}</div>
                      <div className="text-xs text-gray-400">Lokal: {schedDate ? schedDate.toLocaleString() : '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        item.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                        item.status === 'SCHEDULED' ? 'bg-blue-100 text-blue-800' :
                        item.status === 'CANCELLED' ? 'bg-gray-100 text-gray-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {canCancel && (
                        <button
                          onClick={() => handleCancel(item.intent_id)}
                          disabled={cancellingId === item.intent_id}
                          className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 disabled:opacity-50"
                        >
                          {cancellingId === item.intent_id ? 'Membatalkan...' : 'Batalkan'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Aturan Ledger & Evaluasi Ulang (K-SCHEDULED)</h3>
          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-2">
            <li><strong>Evaluasi Pertama (Submit):</strong> Reservasi anggaran keluar (`payout`) dan validasi mandat.</li>
            <li><strong>Evaluasi Kedua (Fire):</strong> Worker memeriksa ulang kill switch, pembekuan organisasi, dan status mandat aktif sebelum eksekusi PayPal.</li>
            <li><strong>Double-Entry Ledger Payout:</strong> DEBIT <code>org:main</code>, CREDIT <code>payee:counterparty</code>.</li>
            <li><strong>Double-Entry Ledger Charge:</strong> DEBIT <code>buyer:counterparty</code>, CREDIT <code>org:main</code>.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default ScheduledPage;

