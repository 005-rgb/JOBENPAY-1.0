/**
 * web/src/pages/TransferPage.jsx
 * P2P Transfer UI: transfer form, party selection, ledger balance preview, Maker/Checker approval
 * (K-TRANSFER, AD-17, T-18)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  HelpCircle,
  Loader2,
  Play,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function TransferPage({ transferId = null }) {
  const { t } = useTranslation();
  const [senderId, setSenderId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const {
    data: transferData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['transfer', transferId],
    queryFn: async () => {
      if (!transferId) return null;
      return apiClient.get(`/api/v1/transfer/${transferId}`);
    },
    enabled: Boolean(transferId),
  });

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');

    if (!senderId || !receiverId) {
      setFormError('Pihak pengirim dan penerima wajib dipilih.');
      return;
    }

    if (senderId === receiverId) {
      setFormError('Pihak pengirim dan penerima tidak boleh sama (SENDER_EQUALS_RECEIVER).');
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setFormError('Nominal transfer harus lebih besar dari 0.');
      return;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="transfer-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data transfer p2p...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 max-w-2xl mx-auto" data-testid="transfer-error">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-red-800">Gagal memuat transfer</h3>
            <p className="text-sm text-red-700 mt-1">{error?.message || 'Terjadi kesalahan internal'}</p>
          </div>
        </div>
      </div>
    );
  }

  const transfer = transferData?.data || {
    intent_id: transferId || 'demo-transfer-id',
    status: 'SUBMITTED',
    amount_minor: '25000',
    currency: 'USD',
    sender_counterparty_id: 'sender-001',
    receiver_counterparty_id: 'receiver-002',
    created_at: new Date().toISOString(),
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="transfer-page">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Peer-to-Peer Transfer (P2P)</h1>
            <p className="text-sm text-gray-500">
              Transfer buku besar internal berimbang antar pihak (Tier B, AD-17, T-18)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            Tier B
          </span>
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            RULE_TRANSFER_P2P
          </span>
        </div>
      </div>

      {/* Proposal / Transfer Form */}
      <div className="bg-white border rounded-xl p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-600" />
          Formulir Usulan Transfer P2P
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
              Pengirim (Sender Counterparty)
            </label>
            <input
              type="text"
              placeholder="UUID Pihak Pengirim"
              value={senderId}
              onChange={(e) => setSenderId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Penerima (Receiver Counterparty)
            </label>
            <input
              type="text"
              placeholder="UUID Pihak Penerima"
              value={receiverId}
              onChange={(e) => setReceiverId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Nominal Transfer
            </label>
            <input
              type="number"
              placeholder="e.g. 250.00"
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

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Deskripsi / Catatan Audit
            </label>
            <input
              type="text"
              placeholder="Catatan transfer internal..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition"
            >
              Ajukan Usulan Transfer
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
          Setiap mutasi transfer selalu menghasilkan debit pada akun pengirim dan kredit pada akun penerima dengan nominal yang identik.
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
                <td className="py-3 px-4">payee:{transfer.sender_counterparty_id || 'sender'}</td>
                <td className="py-3 px-4 text-right font-semibold">
                  {(BigInt(transfer.amount_minor || '0') / 100n).toString()}.00 {transfer.currency}
                </td>
                <td className="py-3 px-4 text-right text-gray-400">-</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-sans font-semibold text-emerald-600">CREDIT</td>
                <td className="py-3 px-4">payee:{transfer.receiver_counterparty_id || 'receiver'}</td>
                <td className="py-3 px-4 text-right text-gray-400">-</td>
                <td className="py-3 px-4 text-right font-semibold">
                  {(BigInt(transfer.amount_minor || '0') / 100n).toString()}.00 {transfer.currency}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                <td colSpan="2" className="py-2.5 px-4 uppercase text-gray-600">
                  Total (Keseimbangan Mutlak: DEBIT = KREDIT)
                </td>
                <td className="py-2.5 px-4 text-right text-blue-600">
                  {(BigInt(transfer.amount_minor || '0') / 100n).toString()}.00 {transfer.currency}
                </td>
                <td className="py-2.5 px-4 text-right text-emerald-600">
                  {(BigInt(transfer.amount_minor || '0') / 100n).toString()}.00 {transfer.currency}
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
              Hanya manusia dengan peran Approver yang berhak menyetujui atau menolak transfer ini.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-4 py-2 border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg text-sm font-medium transition"
          >
            Tolak Transfer
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-medium transition flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Setujui Transfer (Approve)
          </button>
        </div>
      </div>
    </div>
  );
}

export default TransferPage;

