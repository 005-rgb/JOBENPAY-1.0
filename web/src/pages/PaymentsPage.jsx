// @ts-check
import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  ShieldCheck,
  Layers,
  ArrowRightLeft,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  Plus,
  Trash2,
  Terminal,
  ExternalLink,
  Lock,
  Zap,
  Sliders,
  Search,
  FileText,
  Activity,
  Check,
  AlertCircle,
  ChevronRight,
  ShieldAlert,
  Clock,
  DollarSign,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { Button, EmptyState, Skeleton, useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

export default function PaymentsPage({ tab = 'overview' }) {
  const { environment } = useEnvironment();
  const isLive = String(environment || '').toUpperCase() === 'LIVE';
  const { notify } = useToast();
  const [activeTab, setActiveTab] = useState(tab);

  useEffect(() => {
    if (tab) setActiveTab(tab);
  }, [tab]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Data states
  const [gatewaysData, setGatewaysData] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [vaultMethods, setVaultMethods] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [webhooks, setWebhooks] = useState([]);

  // Modal & Form states
  const [showAddVaultModal, setShowAddVaultModal] = useState(false);
  const [vaultForm, setVaultForm] = useState({
    customerId: '',
    gateway: 'STRIPE',
    token: '',
    cardBrand: 'visa',
    cardLast4: '4242',
    cardExpMonth: '12',
    cardExpYear: '2028',
  });
  const [panWarning, setPanWarning] = useState('');

  // Simulator states
  const [simForm, setSimForm] = useState({
    amount: '150.00',
    currency: 'USD',
    customerId: 'cust_enterprise_01',
    scenario: 'NORMAL', // NORMAL | SOFT_DECLINE | HARD_DECLINE
    selectedPmId: '',
  });
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Initial & Environment change load
  useEffect(() => {
    loadAllData();
  }, [environment]);

  async function loadAllData() {
    setLoading(true);
    setError(null);
    try {
      const [gwRes, statsRes, vaultRes, txRes, hookRes] = await Promise.allSettled([
        apiClient.get('/payments/gateways'),
        apiClient.get('/payments/stats'),
        apiClient.get('/payments/vault'),
        apiClient.get('/payments/transactions'),
        apiClient.get('/payments/webhooks'),
      ]);

      if (gwRes.status === 'fulfilled') setGatewaysData(gwRes.value);
      if (statsRes.status === 'fulfilled') setStatsData(statsRes.value);
      if (vaultRes.status === 'fulfilled') setVaultMethods(vaultRes.value?.paymentMethods || []);
      if (txRes.status === 'fulfilled') setTransactions(txRes.value?.items || []);
      if (hookRes.status === 'fulfilled') setWebhooks(hookRes.value?.events || []);
    } catch (err) {
      setError(err?.message || 'Failed to load payments data');
    } finally {
      setLoading(false);
    }
  }

  // Handle Tokenize / Add Payment Method
  async function handleAddVaultMethod(e) {
    e.preventDefault();
    setPanWarning('');

    // Strict Zero PAN check
    const cleanToken = vaultForm.token.trim().replace(/[\s-]/g, '');
    if (/^\d{13,19}$/.test(cleanToken)) {
      setPanWarning('PCI DSS Violation: Storing raw Primary Account Numbers (PAN) is strictly prohibited. Enter a tokenized reference (e.g. tok_visa_4242).');
      return;
    }

    try {
      setLoading(true);
      await apiClient.post('/payments/vault', {
        customerId: vaultForm.customerId.trim() || `cust_${Date.now()}`,
        gateway: vaultForm.gateway,
        token: vaultForm.token.trim(),
        cardMeta: {
          brand: vaultForm.cardBrand.toLowerCase(),
          last4: vaultForm.cardLast4,
          expMonth: parseInt(vaultForm.cardExpMonth, 10),
          expYear: parseInt(vaultForm.cardExpYear, 10),
        },
      });

      setShowAddVaultModal(false);
      setSuccessMsg('Tokenized payment method securely stored in Vault.');
      setVaultForm({
        customerId: '',
        gateway: 'STRIPE',
        token: '',
        cardBrand: 'visa',
        cardLast4: '4242',
        cardExpMonth: '12',
        cardExpYear: '2028',
      });
      await loadAllData();
    } catch (err) {
      setError(err?.message || 'Failed to save token to vault');
    } finally {
      setLoading(false);
    }
  }

  // Delete Vault Method
  async function handleDeleteVaultMethod(pmId) {
    if (!confirm('Are you sure you want to remove this tokenized payment method?')) return;
    try {
      setLoading(true);
      await apiClient.delete(`/payments/vault/${pmId}`);
      setSuccessMsg('Payment method deleted from Vault.');
      await loadAllData();
    } catch (err) {
      setError(err?.message || 'Failed to delete payment method');
    } finally {
      setLoading(false);
    }
  }

  // Set Default Vault Method
  async function handleSetDefaultVaultMethod(pmId) {
    try {
      setLoading(true);
      await apiClient.post(`/payments/vault/${pmId}/default`);
      setSuccessMsg('Default payment method updated.');
      await loadAllData();
    } catch (err) {
      setError(err?.message || 'Failed to update default payment method');
    } finally {
      setLoading(false);
    }
  }

  // Execute Payment Simulator
  async function handleExecuteSimulator(e) {
    e.preventDefault();
    setSimulating(true);
    setSimResult(null);
    setError(null);

    try {
      const minor = Math.round(parseFloat(simForm.amount) * 100).toString();
      const idemKey = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const reqId = typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);

      let token = 'tok_visa_valid';
      if (simForm.scenario === 'SOFT_DECLINE') {
        token = 'tok_visa_soft_decline';
      } else if (simForm.scenario === 'HARD_DECLINE') {
        token = 'tok_visa_hard_decline';
      }

      const payload = {
        requestId: reqId,
        customerId: simForm.customerId,
        paymentMethodId: simForm.selectedPmId || undefined,
        token: simForm.selectedPmId ? undefined : token,
        amountMinor: minor,
        currency: simForm.currency,
        metadata: {
          scenario: simForm.scenario,
          testTerminal: true,
          triggeredAt: new Date().toISOString(),
        },
      };

      const res = await apiClient.post('/payments/execute', payload, {
        headers: { 'idempotency-key': idemKey },
      });

      setSimResult(res);
      setSuccessMsg(`Payment executed with status: ${res?.transaction?.status || 'COMPLETED'}`);
      await loadAllData();
    } catch (err) {
      setError(err?.message || 'Payment simulation failed');
      setSimResult({ error: err?.message, code: err?.code });
    } finally {
      setSimulating(false);
    }
  }

  // Capture Transaction
  async function handleCapture(txId) {
    try {
      setLoading(true);
      const res = await apiClient.post(`/payments/${txId}/capture`, {});
      setSuccessMsg(`Transaction ${txId.slice(0, 8)} captured successfully.`);
      await loadAllData();
    } catch (err) {
      setError(err?.message || 'Capture failed');
    } finally {
      setLoading(false);
    }
  }

  // Refund Transaction
  async function handleRefund(txId) {
    const amountStr = prompt('Enter refund amount (or leave blank for full refund):');
    if (amountStr === null) return;
    try {
      setLoading(true);
      const minor = amountStr.trim() ? Math.round(parseFloat(amountStr) * 100).toString() : undefined;
      const res = await apiClient.post(`/payments/${txId}/refund`, { amountMinor: minor });
      setSuccessMsg(`Transaction ${txId.slice(0, 8)} refunded successfully.`);
      await loadAllData();
    } catch (err) {
      setError(err?.message || 'Refund failed');
    } finally {
      setLoading(false);
    }
  }

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = tx.tx_id?.toLowerCase().includes(q);
      const matchReq = tx.request_id?.toLowerCase().includes(q);
      const matchGw = tx.gateway?.toLowerCase().includes(q);
      if (!matchId && !matchReq && !matchGw) return false;
    }
    return true;
  });

  return (
    <div className={styles.pageStack}>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleGroup}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--jp-space-2)' }}>
            <h1 className={styles.pageTitle}>Payment Orchestration Layer (POL)</h1>
            <span
              className={`${styles.providerBadge} ${isLive ? styles.badgeLive : styles.badgeSandbox}`}
              style={isLive ? { backgroundColor: '#fdecef', border: '1px solid #fca5a5', color: 'var(--jp-error)' } : undefined}
            >
              {isLive ? 'LIVE' : 'SANDBOX'}
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: '#e6f4ea',
                color: '#137333',
                border: '1px solid #ceead6',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ShieldCheck size={12} /> PCI DSS v4.0 Zero-PAN
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            Multi-Gateway Smart Failover (Stripe &harr; PayPal), Self-Owned Network Token Vault, & Idempotent State Machine.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.secondaryLink}
            onClick={loadAllData}
            disabled={loading}
            title="Refresh payments data"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className={styles.primaryLink}
            onClick={() => setShowAddVaultModal(true)}
          >
            <Plus size={15} />
            <span>Tokenize Card</span>
          </button>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {error && (
        <div
          style={{
            background: '#fdf2f2',
            border: '1px solid #f8b4b4',
            borderRadius: 'var(--jp-radius-card)',
            padding: 'var(--jp-space-3) var(--jp-space-4)',
            color: '#9b1c1c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: '#9b1c1c' }}
          >
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 'var(--jp-radius-card)',
            padding: 'var(--jp-space-3) var(--jp-space-4)',
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'transparent', border: 0, cursor: 'pointer', color: '#166534' }}
          >
            &times;
          </button>
        </div>
      )}

      {/* TAB NAVIGATION */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--jp-border)',
          gap: 'var(--jp-space-1)',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'overview', label: 'Gateways & Routing', icon: Layers },
          { id: 'vault', label: `Network Token Vault (${vaultMethods.length})`, icon: CreditCard },
          { id: 'transactions', label: `Transactions (${transactions.length})`, icon: DollarSign },
          { id: 'simulator', label: 'Failover Simulator', icon: Terminal },
          { id: 'webhooks', label: `Webhooks (${webhooks.length})`, icon: Activity },
        ].map((tItem) => {
          const Icon = tItem.icon;
          const isActive = activeTab === tItem.id;
          return (
            <button
              key={tItem.id}
              onClick={() => setActiveTab(tItem.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: 'transparent',
                border: 0,
                borderBottom: isActive ? '2px solid var(--jp-black)' : '2px solid transparent',
                color: isActive ? 'var(--jp-text)' : 'var(--jp-text-muted)',
                fontWeight: isActive ? 600 : 500,
                fontSize: '13px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={15} />
              <span>{tItem.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: GATEWAYS & ROUTING ARCHITECTURE */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-5)' }}>
          {/* Quick Metrics Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--jp-space-4)',
            }}
          >
            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Total Processed
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
                {statsData?.totalTransactions || 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)', marginTop: '2px' }}>
                Orchestrated requests
              </div>
            </div>

            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Captured
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#137333' }}>
                {statsData?.byStatus?.CAPTURED || 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)', marginTop: '2px' }}>
                Settled to double-entry ledger
              </div>
            </div>

            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Authorized
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#1a73e8' }}>
                {statsData?.byStatus?.AUTHORIZED || 0}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)', marginTop: '2px' }}>
                Held awaiting capture
              </div>
            </div>

            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                padding: 'var(--jp-space-4)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Network Tokens
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: '#8e24aa' }}>
                {vaultMethods.length}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)', marginTop: '2px' }}>
                PCI DSS tokenized cards
              </div>
            </div>
          </div>

          {/* Gateway Adapter Cards */}
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 'var(--jp-space-3)' }}>
              Integrated Payment Connectors
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--jp-space-4)',
              }}
            >
              {gatewaysData?.gateways?.map((gw) => (
                <div
                  key={gw.id}
                  style={{
                    background: 'var(--jp-surface)',
                    border: '1px solid var(--jp-border)',
                    borderRadius: 'var(--jp-radius-card)',
                    padding: 'var(--jp-space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--jp-space-3)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          background: gw.status === 'ACTIVE' ? '#34a853' : '#fbbc05',
                        }}
                      />
                      {gw.name}
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: gw.role === 'PRIMARY' ? '#e8f0fe' : '#f1f3f4',
                        color: gw.role === 'PRIMARY' ? '#1a73e8' : '#5f6368',
                      }}
                    >
                      {gw.role}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                    Gateway Code: <strong style={{ color: 'var(--jp-text)' }}>{gw.id}</strong> &bull; Mode: {gw.mode}
                  </div>

                  <div style={{ fontSize: '12px' }}>
                    <strong>Supported Currencies:</strong> {gw.supportedCurrencies?.join(', ')}
                  </div>

                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: 'var(--jp-space-2)',
                      borderTop: '1px solid var(--jp-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--jp-text-muted)',
                    }}
                  >
                    <span>Network Tokenization: {gw.supportsTokenization ? 'Supported' : 'No'}</span>
                    <span style={{ color: '#137333', fontWeight: 600 }}>Active</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Smart Failover Logic Visual Guide */}
          <div
            style={{
              background: 'var(--jp-surface-sidebar)',
              border: '1px solid var(--jp-border)',
              borderRadius: 'var(--jp-radius-card)',
              padding: 'var(--jp-space-5)',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: 'var(--jp-space-2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} color="#f59e0b" /> Smart Failover & State Machine Policy (PRD 4.1 §0)
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--jp-text-muted)', marginBottom: 'var(--jp-space-4)' }}>
              Orchestrator inspects connector decline codes and determines intelligent fallback routing without duplicating customer charges.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 'var(--jp-space-4)',
              }}
            >
              <div
                style={{
                  background: 'var(--jp-surface)',
                  padding: 'var(--jp-space-3)',
                  borderRadius: 'var(--jp-radius-input)',
                  border: '1px solid var(--jp-border)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#1a73e8', marginBottom: '4px' }}>
                  1. Primary Attempt (Stripe)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                  Authorizes network token with Stripe using organization idempotency key <code>jp_exec_*</code>.
                </div>
              </div>

              <div
                style={{
                  background: 'var(--jp-surface)',
                  padding: 'var(--jp-space-3)',
                  borderRadius: 'var(--jp-radius-input)',
                  border: '1px solid var(--jp-border)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#f59e0b', marginBottom: '4px' }}>
                  2. Soft Decline / Timeout &rarr; Failover
                </div>
                <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                  If Stripe returns <code>SOFT_DECLINE</code> or network timeout, the router automatically retries with PayPal using a fresh idempotency key.
                </div>
              </div>

              <div
                style={{
                  background: 'var(--jp-surface)',
                  padding: 'var(--jp-space-3)',
                  borderRadius: 'var(--jp-radius-input)',
                  border: '1px solid var(--jp-border)',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#dc2626', marginBottom: '4px' }}>
                  3. Hard Decline &rarr; Strict Stop
                </div>
                <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                  If gateway returns <code>HARD_DECLINE</code> (e.g. stolen card, fraud), failover is prohibited by policy. Transaction halts immediately.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NETWORK TOKEN VAULT */}
      {activeTab === 'vault' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-4)' }}>
          {/* Security Banner */}
          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: 'var(--jp-radius-card)',
              padding: 'var(--jp-space-4)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}
          >
            <Lock size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px', color: '#1e40af' }}>
                Self-Owned Network Token Vault (PCI DSS v4.0 Scoped)
              </div>
              <div style={{ fontSize: '12px', color: '#1e3a8a', marginTop: '2px' }}>
                JOBENPAY stores only multi-gateway network tokens and surrogate metadata (card brand, last 4 digits).
                Raw PANs are rejected at ingestion and never written to PostgreSQL.
              </div>
            </div>
          </div>

          {/* Vault Methods List */}
          {vaultMethods.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--jp-space-6)',
                background: 'var(--jp-surface)',
                border: '1px dashed var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
              }}
            >
              <CreditCard size={32} color="var(--jp-text-muted)" style={{ margin: '0 auto var(--jp-space-2)' }} />
              <div style={{ fontWeight: 600, fontSize: '14px' }}>No Tokenized Methods in Vault</div>
              <p style={{ fontSize: '12px', color: 'var(--jp-text-muted)', maxWidth: '400px', margin: '4px auto 16px' }}>
                Add your first network token to route payments across Stripe and PayPal seamlessly.
              </p>
              <button
                className={styles.primaryLink}
                onClick={() => setShowAddVaultModal(true)}
              >
                <Plus size={14} /> Add Tokenized Method
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 'var(--jp-space-4)',
              }}
            >
              {vaultMethods.map((pm) => (
                <div
                  key={pm.pm_id}
                  style={{
                    background: 'var(--jp-surface)',
                    border: pm.is_default ? '2px solid var(--jp-black)' : '1px solid var(--jp-border)',
                    borderRadius: 'var(--jp-radius-card)',
                    padding: 'var(--jp-space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--jp-space-3)',
                    position: 'relative',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          background: '#f1f3f4',
                          padding: '2px 8px',
                          borderRadius: '4px',
                        }}
                      >
                        {pm.card_brand || 'CARD'}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: '14px', fontFamily: 'monospace' }}>
                        &bull;&bull;&bull;&bull; {pm.card_last4}
                      </span>
                    </div>

                    {pm.is_default && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#e6f4ea',
                          color: '#137333',
                          padding: '2px 8px',
                          borderRadius: '10px',
                        }}
                      >
                        Default
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                    Customer: <strong style={{ color: 'var(--jp-text)' }}>{pm.customer_id}</strong>
                  </div>

                  <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                    Expires: {pm.card_exp_month ? `${String(pm.card_exp_month).padStart(2, '0')}/${pm.card_exp_year}` : 'N/A'} &bull; Gateway: {pm.gateway}
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)', fontFamily: 'monospace' }}>
                    Token: {pm.token ? `${pm.token.slice(0, 14)}...` : 'N/A'}
                  </div>

                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: 'var(--jp-space-2)',
                      borderTop: '1px solid var(--jp-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    {!pm.is_default ? (
                      <button
                        onClick={() => handleSetDefaultVaultMethod(pm.pm_id)}
                        style={{
                          background: 'transparent',
                          border: 0,
                          color: 'var(--jp-blue)',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Set as Default
                      </button>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Primary Method</span>
                    )}

                    <button
                      onClick={() => handleDeleteVaultMethod(pm.pm_id)}
                      title="Delete payment method"
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: '#dc2626',
                        cursor: 'pointer',
                        padding: '4px',
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TRANSACTIONS EXPLORER */}
      {activeTab === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-4)' }}>
          {/* Filter Bar */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--jp-space-3)',
              alignItems: 'center',
              flexWrap: 'wrap',
              background: 'var(--jp-surface)',
              padding: 'var(--jp-space-3)',
              border: '1px solid var(--jp-border)',
              borderRadius: 'var(--jp-radius-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '1', minWidth: '220px' }}>
              <Search size={14} color="var(--jp-text-muted)" />
              <input
                type="text"
                placeholder="Search Tx ID, Request ID, or Gateway..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={styles.fieldInput}
                style={{ height: '34px', fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--jp-text-muted)' }}>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={styles.fieldSelect}
                style={{ height: '34px', fontSize: '13px', width: 'auto' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="INITIATED">INITIATED</option>
                <option value="AUTHORIZED">AUTHORIZED</option>
                <option value="CAPTURED">CAPTURED</option>
                <option value="FAILED">FAILED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>
            </div>
          </div>

          {/* Transactions Table */}
          {filteredTransactions.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--jp-space-6)',
                background: 'var(--jp-surface)',
                border: '1px dashed var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                color: 'var(--jp-text-muted)',
                fontSize: '13px',
              }}
            >
              No orchestrated payment transactions match the selected criteria.
            </div>
          ) : (
            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                overflowX: 'auto',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--jp-border)', background: 'var(--jp-surface-sidebar)' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Tx ID / Request ID</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Gateway</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Amount</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Timestamp</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => {
                    const amountFloat = (parseInt(tx.amount_minor || '0', 10) / 100).toFixed(2);
                    let badgeStyle = { background: '#f1f3f4', color: '#5f6368' };
                    if (tx.status === 'CAPTURED') badgeStyle = { background: '#e6f4ea', color: '#137333' };
                    if (tx.status === 'AUTHORIZED') badgeStyle = { background: '#e8f0fe', color: '#1a73e8' };
                    if (tx.status === 'FAILED') badgeStyle = { background: '#fce8e6', color: '#c5221f' };
                    if (tx.status === 'REFUNDED') badgeStyle = { background: '#f3e8fd', color: '#8430ce' };

                    return (
                      <tr key={tx.tx_id} style={{ borderBottom: '1px solid var(--jp-border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{tx.tx_id.slice(0, 13)}...</div>
                          <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>{tx.request_id}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '11px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#f1f3f4',
                            }}
                          >
                            {tx.gateway}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                          ${amountFloat} {tx.currency}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '10px',
                              ...badgeStyle,
                            }}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                          {tx.created_at ? new Date(tx.created_at).toLocaleString() : 'N/A'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            {tx.status === 'AUTHORIZED' && (
                              <button
                                onClick={() => handleCapture(tx.tx_id)}
                                style={{
                                  background: 'var(--jp-black)',
                                  color: 'var(--jp-white)',
                                  border: 0,
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Capture
                              </button>
                            )}

                            {tx.status === 'CAPTURED' && (
                              <button
                                onClick={() => handleRefund(tx.tx_id)}
                                style={{
                                  background: 'transparent',
                                  color: '#8430ce',
                                  border: '1px solid #d8b4fe',
                                  borderRadius: '4px',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Refund
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FAILOVER SIMULATOR & TEST BENCH */}
      {activeTab === 'simulator' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1.8fr)', gap: 'var(--jp-space-5)' }}>
          {/* Simulator Form */}
          <form
            onSubmit={handleExecuteSimulator}
            style={{
              background: 'var(--jp-surface)',
              border: '1px solid var(--jp-border)',
              borderRadius: 'var(--jp-radius-card)',
              padding: 'var(--jp-space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--jp-space-4)',
            }}
          >
            <div style={{ borderBottom: '1px solid var(--jp-border)', paddingBottom: 'var(--jp-space-2)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={16} /> POL Test Terminal
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--jp-text-muted)', margin: '4px 0 0' }}>
                Test smart failover logic and multi-gateway state transitions in {isLive ? 'Live' : 'Sandbox'} mode.
              </p>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Simulation Scenario</label>
              <select
                value={simForm.scenario}
                onChange={(e) => setSimForm({ ...simForm, scenario: e.target.value })}
                className={styles.fieldSelect}
              >
                <option value="NORMAL">Normal Path (Stripe succeeds directly)</option>
                <option value="SOFT_DECLINE">Soft Decline &rarr; Automatic Failover to PayPal</option>
                <option value="HARD_DECLINE">Hard Decline &rarr; Strict Stop (No Failover)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 'var(--jp-space-3)' }}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={simForm.amount}
                  onChange={(e) => setSimForm({ ...simForm, amount: e.target.value })}
                  className={styles.fieldInput}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Currency</label>
                <select
                  value={simForm.currency}
                  onChange={(e) => setSimForm({ ...simForm, currency: e.target.value })}
                  className={styles.fieldSelect}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CAD">CAD</option>
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Customer Reference</label>
              <input
                type="text"
                value={simForm.customerId}
                onChange={(e) => setSimForm({ ...simForm, customerId: e.target.value })}
                className={styles.fieldInput}
                required
              />
            </div>

            {vaultMethods.length > 0 && (
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Or Select Vault Payment Method</label>
                <select
                  value={simForm.selectedPmId}
                  onChange={(e) => setSimForm({ ...simForm, selectedPmId: e.target.value })}
                  className={styles.fieldSelect}
                >
                  <option value="">Use Simulated Test Token</option>
                  {vaultMethods.map((pm) => (
                    <option key={pm.pm_id} value={pm.pm_id}>
                      {pm.card_brand.toUpperCase()} &bull;&bull;&bull;&bull; {pm.card_last4} ({pm.customer_id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              className={styles.primaryLink}
              disabled={simulating}
              style={{ width: '100%', marginTop: 'var(--jp-space-2)' }}
            >
              {simulating ? (
                <>
                  <RefreshCw size={14} className="spin" /> Executing POL Router...
                </>
              ) : (
                <>
                  <Zap size={14} /> Run Payment Orchestration
                </>
              )}
            </button>
          </form>

          {/* Simulator Execution Output Console */}
          <div
            style={{
              background: '#1e293b',
              color: '#f8fafc',
              borderRadius: 'var(--jp-radius-card)',
              padding: 'var(--jp-space-4)',
              fontFamily: 'monospace',
              fontSize: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--jp-space-3)',
              overflowY: 'auto',
              maxHeight: '480px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: '6px' }}>
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>ORCHESTRATION EXECUTION LOG</span>
              <span style={{ color: '#38bdf8' }}>Node 22 POL Engine</span>
            </div>

            {simResult ? (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(simResult, null, 2)}
              </pre>
            ) : (
              <div style={{ color: '#64748b', textAlign: 'center', margin: 'auto 0' }}>
                Awaiting simulation run. Trigger a payment above to observe multi-gateway routing and failover in action.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: WEBHOOKS LOG */}
      {activeTab === 'webhooks' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-4)' }}>
          <div
            style={{
              background: 'var(--jp-surface)',
              border: '1px solid var(--jp-border)',
              borderRadius: 'var(--jp-radius-card)',
              padding: 'var(--jp-space-4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '13px' }}>
                Idempotent Gateway Webhook Receivers
              </div>
              <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                Ingests signed inbound events from Stripe, PayPal, and Adyen. Duplicate events are acknowledged idempotenly.
              </div>
            </div>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', background: '#f1f3f4', padding: '4px 8px', borderRadius: '4px' }}>
              POST /webhooks/payments/:gateway
            </span>
          </div>

          {webhooks.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--jp-space-6)',
                background: 'var(--jp-surface)',
                border: '1px dashed var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                color: 'var(--jp-text-muted)',
                fontSize: '13px',
              }}
            >
              No webhook events ingested yet. Inbound webhook events will be listed here with deduplication proofs.
            </div>
          ) : (
            <div
              style={{
                background: 'var(--jp-surface)',
                border: '1px solid var(--jp-border)',
                borderRadius: 'var(--jp-radius-card)',
                overflowX: 'auto',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--jp-border)', background: 'var(--jp-surface-sidebar)' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Event ID / Gateway Event</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Gateway</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Event Type</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 14px', fontWeight: 600 }}>Received At</th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((ev) => (
                    <tr key={ev.event_id} style={{ borderBottom: '1px solid var(--jp-border)' }}>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{ev.event_id.slice(0, 13)}...</div>
                        <div style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>{ev.gateway_event_id}</div>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontWeight: 600, fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: '#f1f3f4' }}>
                          {ev.gateway}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '12px' }}>
                        {ev.event_type}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: ev.processed ? '#e6f4ea' : '#fff0b3',
                            color: ev.processed ? '#137333' : '#73510d',
                          }}
                        >
                          {ev.processed ? 'PROCESSED' : 'PENDING'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                        {ev.created_at ? new Date(ev.created_at).toLocaleString() : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: TOKENIZE CARD & STORE IN VAULT */}
      {showAddVaultModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setShowAddVaultModal(false);
            setPanWarning('');
          }}
        >
          <div
            className={styles.modalBox}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="vaultModalTitle"
          >
            <div className={styles.modalHeader}>
              <h3 id="vaultModalTitle" className={styles.modalTitle}>
                <Lock size={18} color="var(--jp-brand-teal, #0d9488)" />
                <span>Tokenize Card in Self-Owned Vault</span>
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => {
                  setShowAddVaultModal(false);
                  setPanWarning('');
                }}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            <p className={styles.modalDescription}>
              Strict PCI DSS v4.0 Zero-PAN architecture. The token is cryptographically isolated and never stored as raw cardholder data.
            </p>

            {panWarning && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#991b1b',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{panWarning}</span>
              </div>
            )}

            <form onSubmit={handleAddVaultMethod} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Customer ID / Reference</label>
                <input
                  type="text"
                  placeholder="e.g. cust_corp_442"
                  value={vaultForm.customerId}
                  onChange={(e) => setVaultForm({ ...vaultForm, customerId: e.target.value })}
                  className={styles.fieldInput}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Tokenizing Gateway</label>
                  <select
                    value={vaultForm.gateway}
                    onChange={(e) => setVaultForm({ ...vaultForm, gateway: e.target.value })}
                    className={styles.fieldSelect}
                  >
                    <option value="STRIPE">Stripe</option>
                    <option value="PAYPAL">PayPal</option>
                    <option value="ADYEN">Adyen</option>
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Card Brand</label>
                  <select
                    value={vaultForm.cardBrand}
                    onChange={(e) => setVaultForm({ ...vaultForm, cardBrand: e.target.value })}
                    className={styles.fieldSelect}
                  >
                    <option value="visa">Visa</option>
                    <option value="mastercard">Mastercard</option>
                    <option value="amex">American Express</option>
                    <option value="discover">Discover</option>
                  </select>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}>Network Token Reference</label>
                <input
                  type="text"
                  placeholder="e.g. tok_visa_4242 (Never enter raw 16-digit PAN)"
                  value={vaultForm.token}
                  onChange={(e) => {
                    setVaultForm({ ...vaultForm, token: e.target.value });
                    if (/^\d{13,19}$/.test(e.target.value.trim().replace(/[\s-]/g, ''))) {
                      setPanWarning('Forbidden: Raw PAN detected. You must provide a gateway network token.');
                    } else {
                      setPanWarning('');
                    }
                  }}
                  className={styles.fieldInput}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Last 4 Digits</label>
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="4242"
                    value={vaultForm.cardLast4}
                    onChange={(e) => setVaultForm({ ...vaultForm, cardLast4: e.target.value.replace(/\D/g, '') })}
                    className={styles.fieldInput}
                    required
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Exp Month</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={vaultForm.cardExpMonth}
                    onChange={(e) => setVaultForm({ ...vaultForm, cardExpMonth: e.target.value })}
                    className={styles.fieldInput}
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Exp Year</label>
                  <input
                    type="number"
                    min="2024"
                    max="2035"
                    value={vaultForm.cardExpYear}
                    onChange={(e) => setVaultForm({ ...vaultForm, cardExpYear: e.target.value })}
                    className={styles.fieldInput}
                  />
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  type="button"
                  className={styles.secondaryLink}
                  onClick={() => {
                    setShowAddVaultModal(false);
                    setPanWarning('');
                  }}
                  style={{ cursor: 'pointer', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--jp-border)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.primaryLink}
                  disabled={loading || Boolean(panWarning)}
                  style={{ cursor: loading || Boolean(panWarning) ? 'not-allowed' : 'pointer', padding: '8px 20px', borderRadius: '8px' }}
                >
                  {loading ? 'Tokenizing...' : 'Save to Vault'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
