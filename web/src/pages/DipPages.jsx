import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, FileCheck, CheckCircle2, XCircle, ArrowLeft, Eye, Award } from 'lucide-react';
import styles from './TransactionPages.module.css';

/**
 * Circular score gauge for DIS (0 - 100)
 */
export function DisGauge({ score = 0, size = 100 }) {
  const radius = size * 0.4;
  const strokeWidth = size * 0.08;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  let strokeColor = '#10b981'; // green >= 80
  if (score < 50) {
    strokeColor = '#ef4444'; // red < 50
  } else if (score < 80) {
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
          {score}
        </span>
        <span style={{ fontSize: `${size * 0.12}px`, color: 'var(--jp-text-muted)', textTransform: 'uppercase' }}>
          / 100
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
    fetch(`/api/v1/requests/${requestId}/dip`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
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
        <p className={styles.pageSubtitle}>Loading Decision Integrity Proof data...</p>
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
          <DisGauge score={dip.score} size={120} />
          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--jp-text)' }}>
            DIS Score
          </span>
          <span className={`${styles.providerBadge} ${dip.score >= 80 ? styles.badgeSandbox : styles.badgeSimulated}`}>
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
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setShowAnchorModal(false)}
        >
          <div
            className={styles.formCard}
            style={{ width: '100%', maxWidth: '640px', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--jp-border)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>Human-Signed Intent Anchor</h3>
              <button className={styles.secondaryButton} onClick={() => setShowAnchorModal(false)}>Close</button>
            </div>
            <div style={{ marginTop: '16px' }}>
              <p style={{ fontStyle: 'italic', color: 'var(--jp-text)' }}>
                "{dip.intent_anchor.natural_language_input}"
              </p>
              <pre className={styles.mono} style={{ fontSize: '12px', background: '#0a0a0c', padding: '12px', borderRadius: '6px', overflowX: 'auto' }}>
                {JSON.stringify(dip.intent_anchor, null, 2)}
              </pre>
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
      const res = await fetch('/api/v1/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
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

export default {
  DisGauge,
  DipDisplayCard,
  IntentAnchorBuilderPage,
};
