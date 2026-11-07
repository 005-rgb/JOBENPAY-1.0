/**
 * web/src/pages/RecurringPage.jsx
 * Recurring Billing & Subscriptions UI: agreement form, cycle limits, frequency schedule, double-entry preview, Maker/Checker approval
 * (K-RECURRING, AD-17, T-08)
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
  RefreshCw,
  Repeat,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function RecurringPage({ recurringId = null }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [intervalCount, setIntervalCount] = useState(1);
  const [subscriberId, setSubscriberId] = useState('');
  const [remainingCycles, setRemainingCycles] = useState(12);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const {
    data: recurringData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['recurring', recurringId],
    queryFn: async () => {
      if (!recurringId) return null;
      return apiClient.get(`/api/v1/recurring/${recurringId}`);
    },
    enabled: Boolean(recurringId),
  });

  const parsedAmount = parseFloat(amount) || 0;

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');

    if (parsedAmount <= 0) {
      setFormError('Nominal langganan per siklus harus lebih besar dari 0.');
      return;
    }

    if (!subscriberId) {
      setFormError('Pelanggan (subscriber) wajib dipilih.');
      return;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="recurring-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data langganan berulang (recurring)...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="recurring-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal memuat data langganan</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan internal'}</p>
          </div>
        </div>
      </div>
    );
  }

  const recurring = recurringData?.data || {
    intent_id: recurringId || 'demo-recurring-id',
    status: 'SUBMITTED',
    amount_minor: '4900',
    currency: 'USD',
    frequency: 'MONTHLY',
    interval_count: 1,
    counterparty_id: 'sub-001',
    remaining_cycles: 12,
    created_at: new Date().toISOString(),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="recurring-page">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
            <Repeat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Recurring Subscriptions Engine</h1>
            <p className="text-sm text-gray-500">
              Pengelolaan tagihan dan langganan berkala otomatis (Tier B, AD-17, T-08)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
            Tier B
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            RULE_RECURRING_CHARGE
          </span>
        </div>
      </div>

      {/* Subscription Proposal Form */}
      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-indigo-600" />
          Formulir Perjanjian Langganan Baru
        </h2>

        {formError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleValidateForm} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Tarif per Siklus
            </label>
            <input
              type="number"
              placeholder="e.g. 49.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Mata Uang
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="USD">USD - US Dollar</option>
              <option value="EUR">EUR - Euro</option>
              <option value="GBP">GBP - British Pound</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Frekuensi Siklus Tagihan
            </label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="DAILY">Harian (DAILY)</option>
              <option value="WEEKLY">Mingguan (WEEKLY)</option>
              <option value="MONTHLY">Bulanan (MONTHLY)</option>
              <option value="YEARLY">Tahunan (YEARLY)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Batas Maksimal Siklus Tagihan
            </label>
            <input
              type="number"
              placeholder="e.g. 12"
              value={remainingCycles}
              onChange={(e) => setRemainingCycles(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Pelanggan (Subscriber Counterparty UUID)
            </label>
            <input
              type="text"
              placeholder="UUID Pelanggan"
              value={subscriberId}
              onChange={(e) => setSubscriberId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Deskripsi Paket Langganan
            </label>
            <input
              type="text"
              placeholder="Paket langganan premium SaaS bulanan..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
            >
              Daftarkan Perjanjian Langganan
            </button>
          </div>
        </form>
      </div>

      {/* Double-Entry Ledger Preview */}
      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          Pratinjau Pembukuan Siklus Tagihan (Double-Entry Ledger)
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Setiap penagihan siklus langganan yang berhasil menghasilkan pendebitan kas masuk dan pengkreditan hak penerima.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <th className="py-2.5 px-4">Tipe Leg</th>
                <th className="py-2.5 px-4">Referensi Akun (account_ref)</th>
                <th className="py-2.5 px-4 text-right">Debit</th>
                <th className="py-2.5 px-4 text-right">Kredit</th>
              </tr>
            </thead>
            <tbody className="divide-y text-gray-800 font-mono text-xs">
              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-blue-600">DEBIT</td>
                <td className="py-3 px-4">org:main</td>
                <td className="py-3 px-4 text-right font-semibold">
                  {(BigInt(recurring.amount_minor || '0') / 100n).toString()}.00 {recurring.currency}
                </td>
                <td className="py-3 px-4 text-right text-gray-400">-</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-emerald-600">CREDIT</td>
                <td className="py-3 px-4">payee:{recurring.counterparty_id || 'subscriber'}</td>
                <td className="py-3 px-4 text-right text-gray-400">-</td>
                <td className="py-3 px-4 text-right font-semibold">
                  {(BigInt(recurring.amount_minor || '0') / 100n).toString()}.00 {recurring.currency}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                <td colSpan="2" className="py-2.5 px-4 uppercase text-gray-600">
                  Total (Keseimbangan Mutlak: DEBIT = KREDIT)
                </td>
                <td className="py-2.5 px-4 text-right text-blue-600">
                  {(BigInt(recurring.amount_minor || '0') / 100n).toString()}.00 {recurring.currency}
                </td>
                <td className="py-2.5 px-4 text-right text-emerald-600">
                  {(BigInt(recurring.amount_minor || '0') / 100n).toString()}.00 {recurring.currency}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Maker / Checker Controls */}
      <div className="bg-white border rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCheck className="w-5 h-5 text-gray-600" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Kontrol Maker / Checker (Dual-Control)</h3>
            <p className="text-xs text-gray-500">
              Hanya manusia dengan peran Approver yang berhak menyetujui atau membatalkan langganan ini.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-4 py-2 border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition"
          >
            Batalkan Langganan
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Setujui Langganan (Approve)
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecurringPage;

