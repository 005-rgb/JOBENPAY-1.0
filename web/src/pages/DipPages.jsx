import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle, FileCheck, CheckCircle2, XCircle, ArrowLeft, Eye, Award, RefreshCw, Trash2, HelpCircle, X } from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { Button, EmptyState, Modal, Skeleton, useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

/**
 * Circular score gauge for DIS (0 - 100)
 */
export function DisGauge({ score = 0, size = 100, hard_rule_triggered = null, hardRule = null }) {
  const hardRuleVal = hard_rule_triggered || hardRule;
  const hasHardRule = Boolean(hardRuleVal && hardRuleVal !== 'NONE' && hardRuleVal !== 'DIP_LOW_SCORE');
  const effectiveScore = hasHardRule ? 0 : score;
  const radius = size * 0.4;
  const strokeWidth = size * 0.08;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (effectiveScore / 100) * circumference;

  let strokeColor = '#10b981'; // green >= 80 and hard_rule_triggered === null
  if (hasHardRule || effectiveScore < 50) {
    strokeColor = '#ef4444'; // red < 50 or hard rule violation
  } else if (effectiveScore < 80) {
    strokeColor = '#f59e0b'; // yellow 50-79
  }

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.1)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontSize: `${size * 0.28}px`, fontWeight: 'bold', color: strokeColor }}>
          {effectiveScore}
        </span>
        <span style={{ fontSize: hasHardRule ? `${size * 0.09}px` : `${size * 0.12}px`, color: hasHardRule ? '#ef4444' : 'var(--jp-text-muted)', textTransform: 'uppercase', fontWeight: hasHardRule ? 'bold' : 'normal', textAlign: 'center', lineHeight: 1.1 }}>
          {hasHardRule ? 'VIOLATION' : '/ 100'}
        </span>
      </div>
    </div>
  );
}

/**
 * DIP Display Component (PRD 1.6 §8.2)
 */
export function DipDisplayCard({ requestId }) {
  const [dip, setDip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAnchorModal, setShowAnchorModal] = useState(false);

  useEffect(() => {
    if (!requestId) return;
    setLoading(true);
    apiClient.get(`/requests/${requestId}/dip`)
      .then((data) => {
        setDip(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [requestId]);

  if (loading) {
    return (
      <div className={styles.formCard} style={{ maxWidth: '100%' }}>
        <Skeleton style={{ height: '32px', width: '240px', marginBottom: '12px' }} />
        <Skeleton style={{ height: '80px', width: '100%' }} />
      </div>
    );
  }

  if (error || !dip) {
    return (
      <div className={styles.formCard} style={{ maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--jp-text-muted)' }}>
          <AlertTriangle size={18} />
          <span>No Decision Integrity Proof (DIP) record found for this transaction intent.</span>
        </div>
      </div>
    );
  }

  const components = dip.components || {};
  const compItems = [
    { label: 'Purpose Match', weight: '15%', val: components.purpose ?? 0 },
    { label: 'Amount Cap & Tolerance', weight: '15%', val: components.amount ?? 0 },
    { label: 'Vendor Category', weight: '20%', val: components.vendor ?? 0 },
    { label: 'Brand Alignment', weight: '10%', val: components.brand ?? 0 },
    { label: 'Required Attributes', weight: '20%', val: components.attributes ?? 0 },
    { label: 'Evidence Validity', weight: '20%', val: components.evidence ?? 0 },
  ];

  const hardRule = dip.hard_rule_triggered;
  const hasHardRuleViolation = Boolean(hardRule && hardRule !== 'DIP_LOW_SCORE');
  const isDanger = hardRule === 'DIP_EVIDENCE_INVALID' || hardRule === 'DIP_CRITICAL';

  return (
    <div className={styles.formCard} style={{ maxWidth: '100%' }} data-testid="dip-display-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={18} color="var(--jp-success)" />
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Decision Integrity Proof (DIP v1.0)</h2>
        </div>
        {dip.intent_anchor && (
          <button
            className={styles.secondaryButton}
            onClick={() => setShowAnchorModal(true)}
            style={{ fontSize: '13px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Eye size={14} /> View Intent Anchor
          </button>
        )}
      </div>

      {/* Hard Rule Triggered Alert */}
      {hardRule && (
        <div
          style={{
            margin: '12px 0',
            padding: '12px',
            borderRadius: '8px',
            background: isDanger ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            border: `1px solid ${isDanger ? '#ef4444' : '#f59e0b'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertTriangle size={20} color={isDanger ? '#ef4444' : '#f59e0b'} />
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '14px', color: isDanger ? '#ef4444' : '#f59e0b' }}>
              Hard Rule Enforced: {hardRule}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
              Deterministic integrity check overridden decision: {dip.decision}.
            </div>
          </div>
        </div>
      )}

      {/* Score and Component Breakdown Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '24px', alignItems: 'center', margin: '20px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <DisGauge score={dip.score} size={120} hard_rule_triggered={dip.hard_rule_triggered} />
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: hasHardRuleViolation ? '#ef4444' : 'var(--jp-text)' }}>
            {hasHardRuleViolation ? 'VIOLATION DETECTED' : 'DIS Score'}
          </span>
          <span className={`${styles.providerBadge} ${dip.score >= 80 && !hasHardRuleViolation ? styles.badgeSandbox : styles.badgeSimulated}`}>
            {dip.decision}
          </span>
        </div>

        {/* Component Breakdown Bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {compItems.map((c, idx) => (
            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span>{c.label} <span style={{ color: 'var(--jp-text-muted)' }}>({c.weight})</span></span>
                <span style={{ fontWeight: 'bold' }}>{(c.val * 100).toFixed(0)}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, c.val * 100))}%`,
                    height: '100%',
                    background: c.val === 1 ? '#10b981' : c.val >= 0.5 ? '#f59e0b' : '#ef4444',
                    borderRadius: '4px',
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reasoning Trace List */}
      {dip.reasoning_trace && (
        <div style={{ marginTop: '24px', borderTop: '1px solid var(--jp-border)', paddingTop: '16px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>Agent Reasoning Trace</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {(dip.reasoning_trace.reasons || []).map((r, i) => (
              <div
                key={i}
                style={{
                  padding: '12px',
                  borderRadius: '6px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--jp-border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>#{i + 1}. {r.claim}</span>
                  <span className={styles.mono} style={{ fontSize: '11px', padding: '2px 6px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', borderRadius: '4px' }}>
                    {r.evidence_ref}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                  <span>Source: <strong>{r.data_source}</strong></span>
                  {r.extracted_attributes && Object.keys(r.extracted_attributes).length > 0 && (
                    <span className={styles.mono}>
                      Extracted: {JSON.stringify(r.extracted_attributes)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Intent Anchor Modal */}
      {showAnchorModal && dip.intent_anchor && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowAnchorModal(false)}
        >
          <div
            className={styles.modalBox}
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <FileCheck size={18} color="var(--jp-brand-teal, #0d9488)" />
                <span>Human-Signed Intent Anchor</span>
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setShowAnchorModal(false)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontStyle: 'italic', color: 'var(--jp-text)', margin: '4px 0 10px', fontSize: '13px' }}>
              "{dip.intent_anchor.natural_language_input}"
            </p>
            <pre className={styles.mono} style={{ fontSize: '12px', background: '#0a0a0c', padding: '12px', borderRadius: '8px', overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
              {JSON.stringify(dip.intent_anchor, null, 2)}
            </pre>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryLink}
                onClick={() => setShowAnchorModal(false)}
                style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Intent Anchor Builder Page (PRD 1.6 §8.1)
 */
export function IntentAnchorBuilderPage() {
  const { notify } = useToast();
  const [naturalLanguageInput, setNaturalLanguageInput] = useState('');
  const [purpose, setPurpose] = useState('equipment_purchase');
  const [minAmount, setMinAmount] = useState('0');
  const [maxAmount, setMaxAmount] = useState('200000');
  const [vendorCategories, setVendorCategories] = useState('electronics, computers');
  const [allowedBrands, setAllowedBrands] = useState('Apple, Dell');
  const [deadline, setDeadline] = useState('2026-12-31T23:59:59Z');
  const [requiredAttributes, setRequiredAttributes] = useState([
    { key: 'ram_gb', operator: 'gte', value: 32 },
  ]);

  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const buildStructuredIntent = () => {
    return {
      purpose,
      constraints: {
        amount_range: { min: String(minAmount).trim(), max: String(maxAmount).trim() },
        vendor_categories: vendorCategories.split(',').map((s) => s.trim()).filter(Boolean),
        allowed_brands: allowedBrands.split(',').map((s) => s.trim()).filter(Boolean),
        required_attributes: requiredAttributes,
        deadline,
      },
    };
  };

  const handlePreview = () => {
    const structured = buildStructuredIntent();
    setPreview({
      natural_language_input: naturalLanguageInput,
      structured_intent: structured,
    });
  };

  const handleAddAttribute = () => {
    setRequiredAttributes([...requiredAttributes, { key: '', operator: 'eq', value: '' }]);
  };

  const handleRemoveAttribute = (idx) => {
    setRequiredAttributes(requiredAttributes.filter((_, i) => i !== idx));
  };

  const handleAttributeChange = (idx, field, val) => {
    const updated = [...requiredAttributes];
    updated[idx][field] = val;
    setRequiredAttributes(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const payload = {
      natural_language_input: naturalLanguageInput,
      structured_intent: buildStructuredIntent(),
    };

    try {
      const data = await apiClient.post('/intents', payload);
      setResult(data);
      notify({
        title: 'Intent Anchor Created',
        message: `Intent ${data.intent?.id || data.id || ''} created and active.`,
        kind: 'info',
      });
    } catch (err) {
      setError(err.message);
      notify({
        title: 'Creation Failed',
        message: err.message || 'Could not create Intent Anchor.',
        kind: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
          Intent Anchor Builder (PRD 1.6)
        </h1>
        <p className={styles.pageSubtitle} style={{ margin: 0 }}>
          Sign and activate human intent constraints to mathematically bound autonomous agent decisions.
        </p>
      </div>

      {error && (
        <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', marginBottom: '16px', color: '#ef4444' }}>
          {error}
        </div>
      )}

      {result ? (
        <div className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '16px' }}>
            <CheckCircle2 size={24} />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Intent Anchor Activated & Signed</h2>
          </div>
          <div className={styles.calculationCard}>
            <div style={{ fontSize: '13px', marginBottom: '8px' }}>
              <strong>Intent ID:</strong> <span className={styles.mono}>{result.intent_id}</span>
            </div>
            <div style={{ fontSize: '13px', marginBottom: '8px' }}>
              <strong>Intent Hash:</strong> <span className={styles.mono}>{result.intent_hash}</span>
            </div>
            <div style={{ fontSize: '13px', marginBottom: '8px' }}>
              <strong>Signature:</strong> <span className={styles.mono}>{result.signature?.slice(0, 32)}...</span>
            </div>
            <div style={{ fontSize: '13px' }}>
              <strong>Status:</strong> <span className={styles.providerBadge}>{result.status}</span>
            </div>
          </div>
          <button
            className={styles.secondaryButton}
            onClick={() => { setResult(null); setPreview(null); }}
            style={{ marginTop: '16px' }}
          >
            Create Another Intent Anchor
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className={styles.formCard} style={{ maxWidth: '100%' }}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Natural Language Context & Intent</label>
            <textarea
              className={styles.inputField}
              rows={3}
              value={naturalLanguageInput}
              onChange={(e) => setNaturalLanguageInput(e.target.value)}
              placeholder="e.g. Beli laptop untuk tim engineering, RAM minimal 32GB, budget maksimal $2000, hanya merek Apple atau Dell."
              required
            />
          </div>

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>Purpose</label>
              <select
                className={styles.inputField}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              >
                <option value="equipment_purchase">Equipment Purchase</option>
                <option value="software_subscription">Software Subscription</option>
                <option value="service_payment">Service Payment</option>
                <option value="supplier_payout">Supplier Payout</option>
                <option value="invoice_payment">Invoice Payment</option>
                <option value="down_payment">Down Payment</option>
                <option value="refund_issuance">Refund Issuance</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Deadline (ISO-8601)</label>
              <input
                type="text"
                className={styles.inputField}
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Min Amount (minor units)</label>
              <input
                type="number"
                className={styles.inputField}
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Max Amount (minor units)</label>
              <input
                type="number"
                className={styles.inputField}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Vendor Categories (comma-separated)</label>
              <input
                type="text"
                className={styles.inputField}
                value={vendorCategories}
                onChange={(e) => setVendorCategories(e.target.value)}
                placeholder="electronics, computers"
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}>Allowed Brands (comma-separated)</label>
              <input
                type="text"
                className={styles.inputField}
                value={allowedBrands}
                onChange={(e) => setAllowedBrands(e.target.value)}
                placeholder="Apple, Dell"
              />
            </div>
          </div>

          {/* Dynamic Required Attributes */}
          <div style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className={styles.fieldLabel} style={{ margin: 0 }}>Required Attributes</label>
              <button type="button" className={styles.secondaryButton} onClick={handleAddAttribute} style={{ fontSize: '11px', padding: '4px 8px' }}>
                + Add Attribute
              </button>
            </div>
            {requiredAttributes.map((attr, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  placeholder="Key (e.g. ram_gb)"
                  className={styles.inputField}
                  value={attr.key}
                  onChange={(e) => handleAttributeChange(idx, 'key', e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  className={styles.inputField}
                  value={attr.operator}
                  onChange={(e) => handleAttributeChange(idx, 'operator', e.target.value)}
                  style={{ width: '120px' }}
                >
                  <option value="gte">&gt;=</option>
                  <option value="lte">&lt;=</option>
                  <option value="eq">==</option>
                  <option value="neq">!=</option>
                  <option value="contains">contains</option>
                </select>
                <input
                  type="text"
                  placeholder="Value"
                  className={styles.inputField}
                  value={attr.value}
                  onChange={(e) => handleAttributeChange(idx, 'value', e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveAttribute(idx)}
                  className={styles.secondaryButton}
                  style={{ color: '#ef4444' }}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="button" className={styles.secondaryButton} onClick={handlePreview}>
              Preview Structured Intent
            </button>
            <button type="submit" className={styles.primaryButton} disabled={loading}>
              {loading ? 'Signing...' : 'Sign & Activate Intent Anchor'}
            </button>
          </div>

          {preview && (
            <div style={{ marginTop: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '6px' }}>JSON Preview (Canonical Form)</h3>
              <pre className={styles.mono} style={{ fontSize: '12px', background: '#0a0a0c', padding: '12px', borderRadius: '6px', overflowX: 'auto' }}>
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * Intent Anchors Directory & DIP Hub Page (PRD 1.6 §8)
 */
export function IntentAnchorsPage({ initialTab = 'anchors' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const { environment } = useEnvironment();
  const { notify } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [selectedIntent, setSelectedIntent] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  // DIS Inspector Interactive State
  const [inspectPurpose, setInspectPurpose] = useState(1.0);
  const [inspectAmount, setInspectAmount] = useState(1.0);
  const [inspectVendor, setInspectVendor] = useState(1.0);
  const [inspectBrand, setInspectBrand] = useState(1.0);
  const [inspectAttributes, setInspectAttributes] = useState(1.0);
  const [inspectEvidence, setInspectEvidence] = useState(1.0);
  const [hardRuleTrigger, setHardRuleTrigger] = useState('NONE');

  const { data, isLoading: loading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['intents', environment],
    queryFn: () => apiClient.get('/intents'),
  });

  const intents = data?.intents || [];

  const handleRevoke = async (intentId) => {
    if (!window.confirm('Are you sure you want to revoke this Intent Anchor?')) return;
    try {
      setRevokingId(intentId);
      await apiClient.post(`/intents/${intentId}/revoke`, {});
      notify({
        title: 'Intent Revoked',
        message: `Intent Anchor ${intentId.slice(0, 8)}... successfully revoked.`,
        kind: 'info',
      });
      await queryClient.invalidateQueries({ queryKey: ['intents', environment] });
    } catch (err) {
      notify({
        title: 'Revocation Failed',
        message: err.message || 'Could not revoke intent anchor.',
        kind: 'error',
      });
    } finally {
      setRevokingId(null);
    }
  };

  // Compute simulated DIS score
  const rawDisScore = Math.round(
    (0.15 * inspectPurpose +
     0.15 * inspectAmount +
     0.20 * inspectVendor +
     0.10 * inspectBrand +
     0.20 * inspectAttributes +
     0.20 * inspectEvidence) * 100
  );

  const hasInspectorHardRule = hardRuleTrigger !== 'NONE';
  const computedDisScore = hasInspectorHardRule ? 0 : rawDisScore;

  let simulatedDecision = rawDisScore >= 80 ? 'AUTO_APPROVE' : rawDisScore >= 50 ? 'REQUIRE_APPROVAL' : 'REJECTED';
  if (hasInspectorHardRule) {
    simulatedDecision = hardRuleTrigger === 'DIP_EVIDENCE_INVALID' ? 'REJECTED' : 'REQUIRE_APPROVAL';
  }

  const filteredIntents = intents.filter((item) => {
    if (filterStatus === 'ALL') return true;
    return item.status === filterStatus;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Award size={24} color="#10b981" />
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
              Decision Integrity Proof (DIP)
            </h1>
            <span className={styles.providerBadge} style={{ background: '#0a2b9e', color: '#fff' }}>
              AI TRUST
            </span>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Cryptographically signed human intent anchors bounding autonomous agent decisions with Ground-Truth verification.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsHelpOpen(true)}
            title="Module Guide & Help"
          >
            <HelpCircle size={14} />
            <span>Help</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            loading={isFetching}
          >
            <RefreshCw size={14} className={isFetching ? 'spin' : ''} />
            <span>Refresh</span>
          </Button>
          <a
            href="/intents/new"
            className={styles.primaryLink}
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            + New Intent Anchor
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--jp-border)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('anchors')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'anchors' ? '2px solid var(--jp-primary)' : '2px solid transparent',
            color: activeTab === 'anchors' ? 'var(--jp-text)' : 'var(--jp-text-muted)',
            fontWeight: activeTab === 'anchors' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Intent Anchors Directory ({intents.length})
        </button>
        <button
          onClick={() => setActiveTab('inspector')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'inspector' ? '2px solid var(--jp-primary)' : '2px solid transparent',
            color: activeTab === 'inspector' ? 'var(--jp-text)' : 'var(--jp-text-muted)',
            fontWeight: activeTab === 'inspector' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          DIS Mathematical Inspector & Simulator
        </button>
      </div>

      {/* Tab 1: Intent Anchors Directory */}
      {activeTab === 'anchors' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            {['ALL', 'ACTIVE', 'REVOKED'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={filterStatus === s ? styles.primaryLink : styles.secondaryLink}
                style={{ padding: '4px 12px', height: '32px', fontSize: '12px' }}
              >
                {s}
              </button>
            ))}
          </div>

          <div className={styles.tableCard}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Intent ID</th>
                  <th>Natural Language Context</th>
                  <th>Constraints & Budget</th>
                  <th>Signature</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} style={{ padding: '16px' }}>
                        <Skeleton style={{ height: '24px', width: '100%' }} />
                      </td>
                    </tr>
                  ))
                ) : filteredIntents.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center' }}>
                      <EmptyState
                        icon={Award}
                        title="No Intent Anchors Found"
                        description={`No intent anchors recorded with status ${filterStatus} in ${environment} environment.`}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredIntents.map((item) => {
                    const structured = typeof item.structured_intent === 'string'
                      ? JSON.parse(item.structured_intent)
                      : (item.structured_intent || {});
                    const amountRange = structured.constraints?.amount_range || structured.amount_range;
                    const maxBudget = amountRange?.max ? `$${(amountRange.max / 100).toFixed(2)}` : '—';

                    return (
                      <tr key={item.intent_id}>
                        <td className={styles.mono} style={{ fontSize: '12px' }}>
                          {item.intent_id?.slice(0, 8)}...
                        </td>
                        <td style={{ maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <span title={item.natural_language_input}>
                            {item.natural_language_input || structured.purpose || '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px' }}>
                          <span>Max: <strong>{maxBudget}</strong></span>
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', color: item.signature ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <ShieldCheck size={13} /> {item.signature ? 'Ed25519 Valid' : 'Unsigned'}
                          </span>
                        </td>
                        <td>
                          <span className={`${styles.providerBadge} ${item.status === 'ACTIVE' ? styles.badgeSandbox : styles.badgeFailed}`}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              type="button"
                              className={styles.secondaryLink}
                              onClick={() => setSelectedIntent(item)}
                              style={{ padding: '2px 8px', height: '28px', fontSize: '11px' }}
                            >
                              <Eye size={12} /> View
                            </button>
                            {item.status === 'ACTIVE' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleRevoke(item.intent_id)}
                                loading={revokingId === item.intent_id}
                                disabled={Boolean(revokingId)}
                                style={{ padding: '2px 8px', height: '28px', fontSize: '11px', color: '#ef4444' }}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: DIS Mathematical Inspector & Simulator */}
      {activeTab === 'inspector' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 400px) 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Left: Gauge and Decision Summary */}
          <div className={styles.formCard} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}>Decision Integrity Score (DIS)</h2>
            <DisGauge score={computedDisScore} size={150} hard_rule_triggered={hardRuleTrigger !== 'NONE' ? hardRuleTrigger : null} />
            <div style={{ marginTop: '16px', fontSize: '18px', fontWeight: 'bold', color: hasInspectorHardRule ? '#ef4444' : 'inherit' }}>
              {hasInspectorHardRule ? 'VIOLATION DETECTED' : `${computedDisScore} / 100`}
            </div>
            <div style={{ marginTop: '8px' }}>
              <span className={`${styles.providerBadge} ${simulatedDecision === 'AUTO_APPROVE' ? styles.badgeSandbox : simulatedDecision === 'REQUIRE_APPROVAL' ? styles.badgeSimulated : styles.badgeFailed}`} style={{ fontSize: '13px', padding: '6px 14px' }}>
                {simulatedDecision}
              </span>
            </div>
            {hardRuleTrigger !== 'NONE' && (
              <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '6px', fontSize: '12px', color: '#ef4444' }}>
                <AlertTriangle size={14} style={{ display: 'inline', marginRight: '4px' }} />
                Hard Rule Overridden: <strong>{hardRuleTrigger}</strong>
              </div>
            )}
            <p style={{ fontSize: '12px', color: 'var(--jp-text-muted)', marginTop: '16px', lineHeight: '1.4' }}>
              Formula: DIS = 0.15(Purpose) + 0.15(Amount) + 0.20(Vendor) + 0.10(Brand) + 0.20(Attributes) + 0.20(Evidence)
            </p>
          </div>

          {/* Right: Component Sliders & Hard Rules */}
          <div className={styles.formCard}>
            <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}>Adjust Component Weights & Ground Truth</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Purpose Semantic Match (15% weight)</span>
                  <strong>{(inspectPurpose * 100).toFixed(0)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={inspectPurpose}
                  onChange={(e) => setInspectPurpose(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Amount Cap & Tolerance Match (15% weight)</span>
                  <strong>{(inspectAmount * 100).toFixed(0)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={inspectAmount}
                  onChange={(e) => setInspectAmount(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Vendor Category Consistency (20% weight)</span>
                  <strong>{(inspectVendor * 100).toFixed(0)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={inspectVendor}
                  onChange={(e) => setInspectVendor(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Brand Alignment (10% weight)</span>
                  <strong>{(inspectBrand * 100).toFixed(0)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={inspectBrand}
                  onChange={(e) => setInspectBrand(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Required Attributes Satisfaction (20% weight)</span>
                  <strong>{(inspectAttributes * 100).toFixed(0)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={inspectAttributes}
                  onChange={(e) => setInspectAttributes(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                  <span>Evidence Ground-Truth Validity (20% weight)</span>
                  <strong>{(inspectEvidence * 100).toFixed(0)}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={inspectEvidence}
                  onChange={(e) => setInspectEvidence(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ borderTop: '1px solid var(--jp-border)', paddingTop: '16px', marginTop: '8px' }}>
                <label className={styles.fieldLabel} style={{ marginBottom: '8px' }}>Trigger Hard Rule (Deterministic Override)</label>
                <select
                  className={styles.inputField}
                  value={hardRuleTrigger}
                  onChange={(e) => setHardRuleTrigger(e.target.value)}
                >
                  <option value="NONE">None (Rely purely on weighted DIS score)</option>
                  <option value="DIP_EVIDENCE_INVALID">DIP_EVIDENCE_INVALID (Evidence invalid or ungrounded -&gt; REJECTED)</option>
                  <option value="DIP_BRAND_MISMATCH">DIP_BRAND_MISMATCH (Brand not in allowlist -&gt; REQUIRE_APPROVAL)</option>
                  <option value="DIP_ATTRIBUTES_MISMATCH">DIP_ATTRIBUTES_MISMATCH (Required specs missing -&gt; REQUIRE_APPROVAL)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Selected Intent Modal */}
      {selectedIntent && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedIntent(null)}
        >
          <div
            className={styles.modalBox}
            style={{ maxWidth: '640px' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <Award size={18} color="var(--jp-brand-teal, #0d9488)" />
                <span>Intent Anchor Details</span>
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedIntent(null)}
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontStyle: 'italic', color: 'var(--jp-text)', margin: '4px 0 10px', fontSize: '13px' }}>
              "{selectedIntent.natural_language_input}"
            </p>
            <pre className={styles.mono} style={{ fontSize: '11px', background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px', overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto' }}>
              {JSON.stringify(selectedIntent, null, 2)}
            </pre>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.secondaryLink}
                onClick={() => setSelectedIntent(null)}
                style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '6px 16px', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contextual Help Modal */}
      <Modal
        open={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        title="Decision Integrity Proof (DIP) Guide"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
            <Button variant="secondary" onClick={() => setIsHelpOpen(false)}>Close</Button>
            <a
              href="/help#ai-dip"
              className={styles.primaryLink}
              style={{ textDecoration: 'none' }}
              onClick={() => setIsHelpOpen(false)}
            >
              Read Full Manual &rarr;
            </a>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px', lineHeight: '1.5' }}>
          <p>
            <strong>Decision Integrity Proof (DIP)</strong> ensures autonomous AI agents remain mathematically aligned with human objectives before any money moves.
          </p>
          <ul style={{ margin: '0 0 0 20px', padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <li><strong>Intent Anchoring:</strong> Cryptographically binds the human principal's objective hash to incoming agent proposals.</li>
            <li><strong>DIS Score (0–100):</strong> Evaluates vendor alignment, purpose coherence, amount justification, evidence validity, and temporal plausibility.</li>
            <li><strong>Fail-Closed Hard Rules:</strong> Brand mismatches and invalid evidence instantly reject the transaction regardless of agent reasoning.</li>
          </ul>
          <p style={{ color: 'var(--jp-text-muted)', fontSize: '13px', margin: 0 }}>
            Navigate to the Help Center to review the complete scoring formula and governance chain.
          </p>
        </div>
      </Modal>
    </div>
  );
}

export function DipPage() {
  return <IntentAnchorsPage initialTab="inspector" />;
}

export default {
  DisGauge,
  DipDisplayCard,
  IntentAnchorBuilderPage,
  IntentAnchorsPage,
  DipPage,
};
