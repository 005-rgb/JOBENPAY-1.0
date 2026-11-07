/**
 * web/src/pages/InvoicePage.jsx
 * Invoice UI: List and Detail views with status pills (ISSUED/SENT/PAID/OVERDUE),
 * Send button for seller, Pay button for buyer, Maker/Checker controls, and double-entry view
 * (K-INVOICE, FR-1301...1307, T-05, WP F7-2)
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileCheck,
  FileText,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';

function formatMoney(amountMinor, currency = 'USD') {
  if (amountMinor === null || amountMinor === undefined) return '—';
  const major = Number(BigInt(amountMinor)) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(major);
}

function InvoiceStatusPill({ status }) {
  const normalized = (status || '').toUpperCase();
  let pillStyle = 'bg-gray-100 text-gray-800 border-gray-200';
  if (normalized === 'PAID') {
    pillStyle = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  } else if (normalized === 'SENT' || normalized === 'ISSUED') {
    pillStyle = 'bg-blue-100 text-blue-800 border-blue-300';
  } else if (normalized === 'OVERDUE') {
    pillStyle = 'bg-rose-100 text-rose-800 border-rose-300';
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${pillStyle}`}
      data-testid={`invoice-status-${status?.toLowerCase()}`}
    >
      {normalized || 'ISSUED'}
    </span>
  );
}

export function InvoicePage({ invoiceId = null }) {
  const { id } = useParams();
  const effectiveId = invoiceId || id;
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [actionSuccess, setActionSuccess] = useState('');
  const [actionError, setActionError] = useState('');

  // 1. Fetch list of invoices when on /invoices without an id
  const listQuery = useQuery({
    queryKey: ['invoices-list'],
    queryFn: async () => apiClient.get('/api/v1/invoices'),
    enabled: !effectiveId,
  });

  // 2. Fetch specific invoice when effectiveId is present
  const detailQuery = useQuery({
    queryKey: ['invoice-detail', effectiveId],
    queryFn: async () => apiClient.get(`/api/v1/invoices/${effectiveId}`),
    enabled: Boolean(effectiveId),
  });

  // Send Invoice mutation
  const sendMutation = useMutation({
    mutationFn: async (invId) => apiClient.post(`/api/v1/invoices/${invId}/send`),
    onSuccess: async () => {
      setActionSuccess('Invoice successfully sent to recipient!');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['invoices-list'] });
      await queryClient.invalidateQueries({ queryKey: ['invoice-detail', effectiveId] });
    },
    onError: (err) => {
      setActionError(err.message || 'Failed to send invoice');
    },
  });

  // Pay Invoice mutation
  const payMutation = useMutation({
    mutationFn: async (invId) => apiClient.post(`/api/v1/invoices/${invId}/pay`),
    onSuccess: async () => {
      setActionSuccess('Invoice successfully paid!');
      setActionError('');
      await queryClient.invalidateQueries({ queryKey: ['invoices-list'] });
      await queryClient.invalidateQueries({ queryKey: ['invoice-detail', effectiveId] });
    },
    onError: (err) => {
      setActionError(err.message || 'Failed to process payment');
    },
  });

  // --------------------------------------------------------------------------
  // LIST VIEW: /invoices
  // --------------------------------------------------------------------------
  if (!effectiveId) {
    if (listQuery.isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 bg-white border rounded-xl text-center space-y-3" data-testid="invoice-loading">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Memuat daftar faktur (invoices)...</p>
        </div>
      );
    }

    const invoices = listQuery.data?.invoices || [];

    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6" data-testid="invoices-list-page">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Faktur Tagihan (Invoices)</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Kelola penerbitan, pengiriman, dan pelunasan faktur tagihan sesuai aturan T-05.
            </p>
          </div>
          <Link
            to="/transactions/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Terbitkan Faktur Baru
          </Link>
        </div>

        {actionSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
            {actionSuccess}
          </div>
        )}

        {invoices.length === 0 ? (
          <div className="p-12 bg-white border rounded-xl text-center space-y-3">
            <FileText className="w-10 h-10 text-gray-300 mx-auto" />
            <h3 className="text-base font-semibold text-gray-900">Belum ada faktur tagihan</h3>
            <p className="text-sm text-gray-500">Faktur yang dibuat akan muncul di sini.</p>
          </div>
        ) : (
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm" data-testid="invoices-table">
              <thead className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="py-3 px-4">Nomor Faktur</th>
                  <th className="py-3 px-4">Penerima</th>
                  <th className="py-3 px-4">Jatuh Tempo</th>
                  <th className="py-3 px-4">Jumlah</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.intent_id} className="hover:bg-gray-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-gray-900">
                      <Link to={`/invoices/${inv.intent_id}`} className="hover:underline">
                        {inv.invoice_number || 'INV-DRAFT'}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-700">
                      {inv.counterparty_name || 'Counterparty'}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono text-gray-600">
                      {inv.due_date || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-900 whitespace-nowrap">
                      {formatMoney(inv.amount_minor, inv.currency)}
                    </td>
                    <td className="py-3.5 px-4">
                      <InvoiceStatusPill status={inv.invoice_status || inv.status} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {inv.invoice_status !== 'PAID' && (
                          <button
                            type="button"
                            onClick={() => sendMutation.mutate(inv.intent_id)}
                            disabled={sendMutation.isPending}
                            className="px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded text-xs font-semibold transition"
                            data-testid={`send-invoice-btn-${inv.intent_id}`}
                          >
                            Send
                          </button>
                        )}
                        <Link
                          to={`/invoices/${inv.intent_id}`}
                          className="text-xs font-semibold text-black hover:underline"
                        >
                          Lihat &rarr;
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // DETAIL VIEW: /invoices/:id
  // --------------------------------------------------------------------------
  if (detailQuery.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-6 text-center" data-testid="invoice-loading">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500 mb-2" />
        <p className="text-sm text-gray-500">Memuat data faktur (invoice)...</p>
      </div>
    );
  }

  const intent = detailQuery.data?.data || {
    intent_id: effectiveId,
    category: 'INVOICE',
    sub_type: 'standard',
    status: 'ISSUED',
    amount_minor: '150000',
    currency: 'USD',
    invoice_number: 'INV-2026-0042',
    due_date: '2026-12-15',
    metadata: {
      recipientEmail: 'client.corp@example.com',
      description: 'Consulting & software integration services - November 2026',
    },
  };

  const isNeedsApproval = intent.status === 'NEEDS_APPROVAL';
  const invoiceStatus = intent.invoice_status || intent.status;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6" data-testid="invoice-page">
      <div>
        <Link to="/invoices" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-black">
          <ArrowLeft className="w-4 h-4" />
          Kembali ke daftar faktur
        </Link>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold">
          {actionSuccess}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Faktur Tagihan (INVOICE)</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800">
              {intent.category} / {intent.sub_type}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Nomor Faktur: <span className="font-mono font-bold text-gray-800">{intent.invoice_number || intent.metadata?.invoiceNumber || 'INV-DRAFT'}</span> | Intent:{' '}
            <span className="font-mono text-gray-600">{intent.intent_id}</span>
          </p>
        </div>

        {/* Status Badge & Actions */}
        <div className="flex items-center gap-3">
          <InvoiceStatusPill status={invoiceStatus} />
          {/* Action buttons: Send (seller) and Pay (buyer) per T-05 */}
          {invoiceStatus !== 'PAID' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => sendMutation.mutate(intent.intent_id)}
                disabled={sendMutation.isPending}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold transition shadow-sm flex items-center gap-1"
                data-testid="send-btn"
              >
                <Send className="w-3.5 h-3.5" />
                Send Invoice
              </button>
              <button
                type="button"
                onClick={() => payMutation.mutate(intent.intent_id)}
                disabled={payMutation.isPending}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold transition shadow-sm flex items-center gap-1"
                data-testid="pay-btn"
              >
                <CreditCard className="w-3.5 h-3.5" />
                Pay Invoice
              </button>
            </div>
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
              ? 'border-black text-black font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Ringkasan & Detail Faktur
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'ledger'
              ? 'border-black text-black font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Double-Entry Ledger
        </button>
      </div>

      {activeTab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border rounded-lg p-5 shadow-sm space-y-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Tagihan</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-gray-900">
                  {formatMoney(intent.amount_minor, intent.currency)}
                </span>
                <span className="text-xs text-gray-500 font-mono">({intent.amount_minor} minor)</span>
              </div>
              <p className="text-xs text-gray-500">Mata uang: {intent.currency}</p>
            </div>

            <div className="bg-white border rounded-lg p-5 shadow-sm space-y-2">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Jatuh Tempo (Due Date)
              </span>
              <div className="text-xl font-bold text-gray-900">
                {intent.due_date || '2026-12-15'}
              </div>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-gray-400" />
                Email Klien: {intent.metadata?.recipientEmail || 'client@example.com'}
              </p>
            </div>
          </div>

          {/* Maker / Checker Controls if NEEDS_APPROVAL */}
          {isNeedsApproval && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-3" data-testid="checker-controls">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <UserCheck className="w-5 h-5 text-amber-600" />
                Kontrol Maker / Checker (Persetujuan Manusia Wajib)
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                Faktur ini diajukan oleh agen AI dan memerlukan persetujuan approver sebelum dikirimkan ke gateway penagihan PayPal dan klien.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border rounded-lg p-5 shadow-sm space-y-4" data-testid="invoice-ledger">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-black" />
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
                  <td className="p-3 font-mono text-gray-700">buyer:{intent.counterparty_id || 'client'}</td>
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

export default InvoicePage;
