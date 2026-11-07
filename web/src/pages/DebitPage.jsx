/**
 * web/src/pages/DebitPage.jsx
 * Direct Debit UI: Authorization Management, Direct Debit Trigger, SIMULATED Provider Badge, Maker/Checker Controls
 * (Tier C, K-DEBIT, AD-17, B-F6)
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
  FileCheck,
  Layers,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Unlock,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function DebitPage({ debitId = null }) {
  const { t } = useTranslation();
  const [authId, setAuthId] = useState('');
  const [amount, setAmount] = useState('250.00');
  const [currency, setCurrency] = useState('USD');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [mandateRef, setMandateRef] = useState('MANDATE-ACH-2026-001');
  const [maxAmount, setMaxAmount] = useState('1000.00');
  const [authStatus, setAuthStatus] = useState('ACTIVE');
  const [formError, setFormError] = useState('');

  const {
    data: debitData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['debit', debitId],
    queryFn: async () => {
      if (!debitId) return null;
      return apiClient.get(`/api/v1/debit/${debitId}`);
    },
    enabled: Boolean(debitId),
  });

  const parsedAmount = parseFloat(amount) || 0;
  const parsedMax = parseFloat(maxAmount) || 0;
  const isCapExceeded = parsedAmount > parsedMax;

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');

    if (parsedAmount <= 0) {
      setFormError('Nominal debit harus lebih besar dari 0.');
      return;
    }

    if (isCapExceeded) {
      setFormError(`Nominal penarikan $${parsedAmount} melampaui batas otorisasi maksimum $${parsedMax}.`);
      return;
    }

    if (authStatus !== 'ACTIVE') {
      setFormError(`Otorisasi penarikan berstatus ${authStatus} dan tidak dapat digunakan.`);
      return;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="debit-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data direct debit...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700" data-testid="debit-error">
        <div className="flex items-center gap-2 font-semibold mb-1">
          <AlertCircle className="w-5 h-5" />
          <span>Gagal Memuat Data Direct Debit</span>
        </div>
        <p className="text-sm">{error?.message || 'Terjadi kesalahan sistem saat menghubungi backend.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6" data-testid="debit-page">
      {/* Header with SIMULATED Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Direct Debit (Penarikan Langsung)</h1>
            {/* MANDATORY SIMULATED BADGE */}
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300"
              data-testid="simulated-badge"
            >
              SIMULATED
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Penarikan dana langsung dari rekening pihak lawan berbasis otorisasi mandat formal (Tier C, AD-17).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <ShieldAlert className="w-3.5 h-3.5" />
            Always Require Approval (0 Auto-Approve)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form & Active Mandate */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleValidateForm} className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary-600" />
              Instruksi Penarikan Debit
            </h2>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Status Otorisasi Mandat</label>
                <div className="flex items-center gap-2">
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={authStatus}
                    onChange={(e) => setAuthStatus(e.target.value)}
                    data-testid="auth-status-select"
                  >
                    <option value="ACTIVE">ACTIVE (Aktif & Valid)</option>
                    <option value="REVOKED">REVOKED (Dicabut)</option>
                    <option value="EXPIRED">EXPIRED (Kedaluwarsa)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Referensi Mandat</label>
                <input
                  type="text"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600"
                  value={mandateRef}
                  disabled
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Batas Maksimum Otorisasi ($)</label>
                <input
                  type="text"
                  disabled
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600"
                  value={`$${parsedMax.toFixed(2)}`}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nominal Ditarik ($)</label>
                <input
                  type="number"
                  step="any"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="250.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="debit-amount-input"
                />
              </div>
            </div>

            {/* Cap limit warning */}
            {isCapExceeded && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>Nominal diminta (${parsedAmount}) melebihi batas maksimum otorisasi (${parsedMax}).</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
                data-testid="submit-debit-button"
              >
                Simulasikan & Usulkan Penarikan Debit
              </button>
            </div>
          </form>

          {/* Revocation Workflow Box */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary-600" />
              Alur Pencabutan Mandat (Revocation)
            </h2>
            <p className="text-xs text-gray-500">
              Pihak lawan atau pemilik organisasi dapat mencabut otorisasi direct debit sewaktu-waktu. Penarikan debit yang sedang dievaluasi otomatis dibatalkan (*REJECTED*).
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAuthStatus('REVOKED')}
                className="py-1.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-medium rounded-md transition-colors"
                data-testid="revoke-mandate-button"
              >
                Cabut Otorisasi Sekarang (Revoke)
              </button>
              <button
                type="button"
                onClick={() => setAuthStatus('ACTIVE')}
                className="py-1.5 px-3 bg-gray-50 hover:bg-gray-100 text-gray-700 border text-xs font-medium rounded-md transition-colors"
              >
                Reset ke Active
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Ledger Preview & Maker/Checker Controls */}
        <div className="space-y-6">
          {/* Double-Entry Ledger Preview */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary-600" />
              Double-Entry Ledger (Direct Debit)
            </h2>

            <div className="space-y-2 font-mono text-xs">
              <div className="p-2.5 bg-green-50/60 border border-green-200 rounded-lg space-y-1">
                <span className="font-semibold text-green-800">DEBIT org:main (Kas Masuk)</span>
                <p className="text-green-700">${parsedAmount.toFixed(2)} {currency}</p>
              </div>

              <div className="p-2.5 bg-purple-50/60 border border-purple-200 rounded-lg space-y-1">
                <span className="font-semibold text-purple-800">CREDIT counterparty:debit (Pihak Lawan)</span>
                <p className="text-purple-700">${parsedAmount.toFixed(2)} {currency}</p>
              </div>
            </div>

            <div className="pt-2 border-t flex items-center justify-between text-xs text-gray-600">
              <span>Status Keseimbangan:</span>
              <span className="font-bold text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Balanced 100%
              </span>
            </div>
          </div>

          {/* Maker / Checker Dual-Control Box */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-primary-600" />
              Kontrol Dual-Approval (Maker/Checker)
            </h2>

            <p className="text-xs text-gray-500">
              Tier C DEBIT mewajibkan otorisasi Checker manusia sebelum instruksi penarikan dieksekusi.
            </p>

            <div className="space-y-2">
              <button
                type="button"
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                data-testid="checker-approve-debit-button"
              >
                <CheckCircle2 className="w-4 h-4" />
                Setujui Penarikan (Checker Approve)
              </button>

              <button
                type="button"
                className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                data-testid="checker-reject-debit-button"
              >
                <XCircle className="w-4 h-4" />
                Tolak Penarikan (Checker Reject)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DebitPage;

