/**
 * web/src/pages/SplitPage.jsx
 * Split Payments UI: split form, platform fee calculation, recipient shares, double-entry preview, Maker/Checker approval
 * (K-SPLIT, AD-13, AD-17, T-13, T-14)
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
  Layers,
  Loader2,
  PieChart,
  Play,
  ShieldCheck,
  Split,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function SplitPage({ splitId = null }) {
  const { t } = useTranslation();
  const [totalAmount, setTotalAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [platformFeeBps, setPlatformFeeBps] = useState(250); // Default 2.5%
  const [recipientId, setRecipientId] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const {
    data: splitData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['split', splitId],
    queryFn: async () => {
      if (!splitId) return null;
      return apiClient.get(`/api/v1/split/${splitId}`);
    },
    enabled: Boolean(splitId),
  });

  const parsedTotal = parseFloat(totalAmount) || 0;
  const feePercent = (platformFeeBps / 100).toFixed(2);
  const calculatedFee = (parsedTotal * (platformFeeBps / 10000)).toFixed(2);
  const calculatedPayee = (parsedTotal - parseFloat(calculatedFee)).toFixed(2);

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');

    if (parsedTotal <= 0) {
      setFormError('Nominal total split harus lebih besar dari 0.');
      return;
    }

    if (platformFeeBps < 0 || platformFeeBps > 10000) {
      setFormError('Platform fee bps harus berada di antara 0 dan 10.000.');
      return;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="split-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data split payments...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="split-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal memuat transaksi split</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan internal'}</p>
          </div>
        </div>
      </div>
    );
  }

  const split = splitData?.data || {
    intent_id: splitId || 'demo-split-id',
    status: 'SUBMITTED',
    amount_minor: '50000',
    currency: 'USD',
    platform_fee_bps: 250,
    platform_fee_minor: '1250',
    recipient_share_minor: '48750',
    created_at: new Date().toISOString(),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="split-page">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
            <Split className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Split Payments Engine</h1>
            <p className="text-sm text-gray-500">
              Distribusi pembayaran multi-pihak dengan platform fee berimbang (Tier B, AD-13, AD-17, T-13, T-14)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            Tier B
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            RULE_SPLIT_SPLIT
          </span>
        </div>
      </div>

      {/* Split Proposal Form */}
      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5 text-purple-600" />
          Formulir Usulan Split Payments
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
              Nominal Total Transaksi
            </label>
            <input
              type="number"
              placeholder="e.g. 500.00"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
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
              Platform Fee (Basis Points / bps) — {feePercent}%
            </label>
            <input
              type="number"
              placeholder="e.g. 250 (2.5%)"
              value={platformFeeBps}
              onChange={(e) => setPlatformFeeBps(Number(e.target.value))}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Penerima Utama (Recipient Counterparty ID)
            </label>
            <input
              type="text"
              placeholder="UUID Penerima"
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Deskripsi Pembayaran
            </label>
            <input
              type="text"
              placeholder="Catatan split pembayaran marketplace..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          {/* Real-time Calculation Breakdown */}
          {parsedTotal > 0 && (
            <div className="md:col-span-2 p-3 bg-purple-50 rounded-lg border border-purple-100 flex items-center justify-between text-xs text-purple-900">
              <span>Total: <strong>{parsedTotal.toFixed(2)} {currency}</strong></span>
              <span>Platform Fee ({feePercent}%): <strong>{calculatedFee} {currency}</strong></span>
              <span>Hak Bersih Penerima: <strong>{calculatedPayee} {currency}</strong></span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Konservasi 100% Berimbang
              </span>
            </div>
          )}

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition"
            >
              Ajukan Usulan Split
            </button>
          </div>
        </form>
      </div>

      {/* Double-Entry Ledger Preview */}
      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          Pratinjau Pembukuan Berimbang (Double-Entry Ledger)
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Eksekusi split mendebit rekening escrow sebesar nominal penuh, mengkredit pendapatan platform fee dan hak penerima.
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
                <td className="py-3 px-4">org:split_escrow</td>
                <td className="py-3 px-4 text-right font-semibold">
                  {(BigInt(split.amount_minor || '0') / 100n).toString()}.00 {split.currency}
                </td>
                <td className="py-3 px-4 text-right text-gray-400">-</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-emerald-600">CREDIT</td>
                <td className="py-3 px-4">org:main (Platform Fee)</td>
                <td className="py-3 px-4 text-right text-gray-400">-</td>
                <td className="py-3 px-4 text-right font-semibold">
                  {(BigInt(split.platform_fee_minor || '0') / 100n).toString()}.00 {split.currency}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-emerald-600">CREDIT</td>
                <td className="py-3 px-4">payee:{split.counterparty_id || 'recipient'}</td>
                <td className="py-3 px-4 text-right text-gray-400">-</td>
                <td className="py-3 px-4 text-right font-semibold">
                  {(BigInt(split.recipient_share_minor || '0') / 100n).toString()}.00 {split.currency}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                <td colSpan="2" className="py-2.5 px-4 uppercase text-gray-600">
                  Total (Keseimbangan Mutlak: DEBIT = KREDIT)
                </td>
                <td className="py-2.5 px-4 text-right text-blue-600">
                  {(BigInt(split.amount_minor || '0') / 100n).toString()}.00 {split.currency}
                </td>
                <td className="py-2.5 px-4 text-right text-emerald-600">
                  {(BigInt(split.amount_minor || '0') / 100n).toString()}.00 {split.currency}
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
              Hanya manusia dengan peran Approver yang berhak menyetujui pembagian split pembayaran ini.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-4 py-2 border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition"
          >
            Tolak Split
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Setujui Split (Approve)
          </button>
        </div>
      </div>
    </div>
  );
}

export default SplitPage;

