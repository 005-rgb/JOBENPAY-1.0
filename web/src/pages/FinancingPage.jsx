/**
 * web/src/pages/FinancingPage.jsx
 * Supply Chain Financing UI: PO & Invoice Underwriting, Amortization Schedule, SIMULATED Provider Badge, Maker/Checker Controls
 * (Tier C, K-FINANCING, AD-17, B-F6)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Layers,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { apiClient } from '../api/client.js';

export function FinancingPage({ financingId = null }) {
  const { t } = useTranslation();
  const [facilityType, setFacilityType] = useState('PO');
  const [principalAmount, setPrincipalAmount] = useState('50000');
  const [collateralValue, setCollateralValue] = useState('100000');
  const [currency, setCurrency] = useState('USD');
  const [tenorMonths, setTenorMonths] = useState(3);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [counterpartyHistory, setCounterpartyHistory] = useState(4);
  const [interestBps, setInterestBps] = useState(1200); // 12% p.a.
  const [formError, setFormError] = useState('');

  const {
    data: financingData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['financing', financingId],
    queryFn: async () => {
      if (!financingId) return null;
      return apiClient.get(`/api/v1/financing/${financingId}`);
    },
    enabled: Boolean(financingId),
  });

  const parsedPrincipal = parseFloat(principalAmount) || 0;
  const parsedCollateral = parseFloat(collateralValue) || 0;
  const ltv = parsedCollateral > 0 ? (parsedPrincipal / parsedCollateral) * 100 : 0;
  const maxLtv = facilityType === 'PO' ? 70 : 80;
  const isLtvExceeded = ltv > maxLtv;

  // Exact BigInt calculation simulation for UI preview
  const principalMinor = BigInt(Math.round(parsedPrincipal * 100));
  const adminFeeMinor = (principalMinor * 150n) / 10000n; // 1.5%
  const totalInterestMinor = (principalMinor * BigInt(interestBps) * BigInt(tenorMonths)) / 120000n;
  const totalObligationMinor = principalMinor + adminFeeMinor + totalInterestMinor;

  const N = BigInt(tenorMonths || 1);
  const monthlyBaseMinor = totalObligationMinor / N;
  const residueMinor = totalObligationMinor - (monthlyBaseMinor * N);

  const formatMoney = (minorBigInt) => (Number(minorBigInt) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handleValidateForm = (e) => {
    e.preventDefault();
    setFormError('');

    if (parsedPrincipal <= 0) {
      setFormError('Nominal pokok pembiayaan harus lebih besar dari 0.');
      return;
    }

    if (parsedCollateral <= 0) {
      setFormError('Nilai jaminan / invoice harus lebih besar dari 0.');
      return;
    }

    if (isLtvExceeded) {
      setFormError(`LTV ${ltv.toFixed(1)}% melampaui batas maksimum ${maxLtv}% untuk fasilitas ${facilityType}.`);
      return;
    }

    if (counterpartyHistory < 3) {
      setFormError('Pihak lawan membutuhkan minimal 3 riwayat transaksi tanpa sengketa.');
      return;
    }

    if (tenorMonths < 1 || tenorMonths > 6) {
      setFormError('Tenor pembiayaan harus antara 1 sampai 6 bulan (180 hari).');
      return;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="financing-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data pembiayaan (financing)...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700" data-testid="financing-error">
        <div className="flex items-center gap-2 font-semibold mb-1">
          <AlertCircle className="w-5 h-5" />
          <span>Gagal Memuat Data Pembiayaan</span>
        </div>
        <p className="text-sm">{error?.message || 'Terjadi kesalahan sistem saat menghubungi backend.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6" data-testid="financing-page">
      {/* Header with SIMULATED Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Supply Chain Financing</h1>
            {/* MANDATORY SIMULATED BADGE */}
            <span
              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300"
              data-testid="simulated-badge"
            >
              SIMULATED
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Fasilitas Purchase Order & Invoice Financing dengan evaluasi underwriting deterministik (Tier C, AD-17).
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
        {/* Left Column: Input Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleValidateForm} className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary-600" />
              Parameter Fasilitas Pembiayaan
            </h2>

            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Jenis Fasilitas</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary-500"
                  value={facilityType}
                  onChange={(e) => setFacilityType(e.target.value)}
                  data-testid="facility-type-select"
                >
                  <option value="PO">PO Financing (Max LTV 70%)</option>
                  <option value="INVOICE">Invoice Financing (Max LTV 80%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Mata Uang</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Nilai Agunan / Invoice ($)</label>
                <input
                  type="number"
                  step="any"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="100000"
                  value={collateralValue}
                  onChange={(e) => setCollateralValue(e.target.value)}
                  data-testid="collateral-value-input"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Pokok Pinjaman Diminta ($)</label>
                <input
                  type="number"
                  step="any"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="50000"
                  value={principalAmount}
                  onChange={(e) => setPrincipalAmount(e.target.value)}
                  data-testid="principal-amount-input"
                />
              </div>
            </div>

            {/* LTV Real-Time Indicator */}
            <div className={`p-3 rounded-lg border text-sm flex items-center justify-between ${
              isLtvExceeded ? 'bg-red-50 border-red-300 text-red-800' : 'bg-green-50 border-green-300 text-green-800'
            }`}>
              <div className="flex items-center gap-2">
                {isLtvExceeded ? <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" /> : <ShieldCheck className="w-4 h-4 shrink-0 text-green-600" />}
                <span>Loan-to-Value (LTV): <strong>{ltv.toFixed(1)}%</strong> (Batas Maksimum: {maxLtv}%)</span>
              </div>
              <span className="text-xs font-semibold uppercase">{isLtvExceeded ? 'Melebihi Cap' : 'Lolos LTV'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Tenor (Bulan)</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                  value={tenorMonths}
                  onChange={(e) => setTenorMonths(parseInt(e.target.value, 10))}
                  data-testid="tenor-months-select"
                >
                  <option value={1}>1 Bulan (30 Hari)</option>
                  <option value={2}>2 Bulan (60 Hari)</option>
                  <option value={3}>3 Bulan (90 Hari)</option>
                  <option value={4}>4 Bulan (120 Hari)</option>
                  <option value={5}>5 Bulan (150 Hari)</option>
                  <option value={6}>6 Bulan (180 Hari - Max Cap)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Suku Bunga Tetap (p.a.)</label>
                <input
                  type="text"
                  disabled
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500"
                  value="12.00% (1,200 bps pro-rata)"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Riwayat Transaksi Pihak Lawan</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  className="w-32 border rounded-lg px-3 py-2 text-sm"
                  value={counterpartyHistory}
                  onChange={(e) => setCounterpartyHistory(parseInt(e.target.value, 10) || 0)}
                  data-testid="counterparty-history-input"
                />
                <span className="text-xs text-gray-500">transaksi selesai (syarat minimum underwriting: 3)</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
                data-testid="submit-financing-button"
              >
                Simulasikan & Usulkan Pembiayaan
              </button>
            </div>
          </form>

          {/* Amortization Schedule Waterfall Table */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-600" />
              Jadwal Cicilan & Alokasi Pelunasan (Amortization Waterfall)
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                    <th className="py-2.5 px-3">Bulan</th>
                    <th className="py-2.5 px-3">Total Cicilan</th>
                    <th className="py-2.5 px-3">Admin Fee (1.5%)</th>
                    <th className="py-2.5 px-3">Bunga (Interest)</th>
                    <th className="py-2.5 px-3">Pokok Pinjaman</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-gray-700">
                  {Array.from({ length: tenorMonths }, (_, i) => {
                    const month = i + 1;
                    const isFinal = month === tenorMonths;
                    const amt = isFinal ? monthlyBaseMinor + residueMinor : monthlyBaseMinor;
                    return (
                      <tr key={month} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-3 font-medium">Bulan ke-{month} {isFinal && <span className="text-xs text-primary-600 font-bold">(Residue)</span>}</td>
                        <td className="py-2.5 px-3 font-semibold text-gray-900">${formatMoney(amt)}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">{month === 1 ? `$${formatMoney(adminFeeMinor)}` : '$0.00'}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">${formatMoney(totalInterestMinor / N)}</td>
                        <td className="py-2.5 px-3 text-xs text-gray-600">${formatMoney(amt - (month === 1 ? adminFeeMinor : 0n) - (totalInterestMinor / N))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-gray-50 font-bold text-gray-900">
                    <td className="py-2.5 px-3">Total Kewajiban</td>
                    <td className="py-2.5 px-3 text-primary-700">${formatMoney(totalObligationMinor)}</td>
                    <td className="py-2.5 px-3 text-xs">${formatMoney(adminFeeMinor)}</td>
                    <td className="py-2.5 px-3 text-xs">${formatMoney(totalInterestMinor)}</td>
                    <td className="py-2.5 px-3 text-xs">${formatMoney(principalMinor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Ledger Preview & Maker/Checker Controls */}
        <div className="space-y-6">
          {/* Double-Entry Ledger Preview */}
          <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary-600" />
              Double-Entry Ledger (Pencairan)
            </h2>

            <div className="space-y-2 font-mono text-xs">
              <div className="p-2.5 bg-green-50/60 border border-green-200 rounded-lg space-y-1">
                <span className="font-semibold text-green-800">DEBIT org:main (Kas Bersih)</span>
                <p className="text-green-700">${formatMoney(principalMinor - adminFeeMinor)} {currency}</p>
              </div>

              <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-lg space-y-1">
                <span className="font-semibold text-blue-800">DEBIT loan:fee (Admin Fee 1.5%)</span>
                <p className="text-blue-700">${formatMoney(adminFeeMinor)} {currency}</p>
              </div>

              <div className="p-2.5 bg-purple-50/60 border border-purple-200 rounded-lg space-y-1">
                <span className="font-semibold text-purple-800">CREDIT loan:principal (Kewajiban Pokok)</span>
                <p className="text-purple-700">${formatMoney(principalMinor)} {currency}</p>
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
              Tier C FINANCING mewajibkan otorisasi Checker manusia sebelum dana dicairkan oleh engine simulator.
            </p>

            <div className="space-y-2">
              <button
                type="button"
                className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                data-testid="checker-approve-button"
              >
                <CheckCircle2 className="w-4 h-4" />
                Setujui Pencairan (Checker Approve)
              </button>

              <button
                type="button"
                className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                data-testid="checker-reject-button"
              >
                <XCircle className="w-4 h-4" />
                Tolak Fasilitas (Checker Reject)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FinancingPage;

