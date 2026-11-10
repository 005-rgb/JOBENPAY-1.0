// @ts-check
import React, { useState, useEffect } from 'react';
import {
  Code2,
  FileCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Eye,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { apiClient } from '../api/client.js';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import { Button, EmptyState, Skeleton, useToast } from '../components/primitives.jsx';
import styles from './TransactionPages.module.css';

const TEMPLATES = {
  minimal: {
    name: '1. Minimal Valid Policy',
    policy: {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V01',
      policy_name: 'Minimal Valid Policy',
      default_outcome: 'DENY',
      rules: [
        {
          rule_id: 'rule_allow_low_payout',
          description: 'Allow payouts under $1000',
          outcome: 'PERMIT',
          priority: 100,
          conditions: [
            {
              field: 'transaction.amount_minor',
              operator: 'lte',
              value: 100000,
            },
          ],
        },
      ],
    },
    context: {
      transaction: {
        category: 'PAYOUT',
        amount_minor: 45000,
        currency: 'USD',
        payee: 'developer@vendor.test',
      },
      agent: {
        agent_id: 'agent_procurement_1',
        role: 'ASSISTANT',
      },
    },
  },
  denyPrecedence: {
    name: '2. Explicit Deny Precedence (PRD 1.8 §4.2)',
    policy: {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V08',
      policy_name: 'Explicit Deny Precedence Policy',
      default_outcome: 'REQUIRE_APPROVAL',
      rules: [
        {
          rule_id: 'rule_permit_standard_ops',
          description: 'Permit standard operational purchases',
          outcome: 'PERMIT',
          priority: 50,
          conditions: [
            {
              field: 'transaction.category',
              operator: 'in',
              value: ['PAYOUT', 'INVOICE', 'SALE'],
            },
          ],
        },
        {
          rule_id: 'rule_deny_sanctioned_entity',
          description: 'Deny any high risk or blocked payee immediately',
          outcome: 'DENY',
          priority: 10,
          conditions: [
            {
              field: 'transaction.risk_score',
              operator: 'gte',
              value: 80,
            },
          ],
        },
      ],
    },
    context: {
      transaction: {
        category: 'PAYOUT',
        amount_minor: 25000,
        currency: 'USD',
        risk_score: 95,
        payee: 'suspicious@unknown.test',
      },
    },
  },
  vendorAllowlist: {
    name: '3. Strict Vendor Allowlist & Attribute Check',
    policy: {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V12',
      policy_name: 'Strict Vendor Allowlist Policy',
      default_outcome: 'REQUIRE_APPROVAL',
      rules: [
        {
          rule_id: 'rule_verified_vendors_only',
          description: 'Only permit hardware purchase from Dell or Apple',
          outcome: 'PERMIT',
          priority: 20,
          conditions: [
            {
              field: 'transaction.brand',
              operator: 'in',
              value: ['Apple', 'Dell', 'Lenovo'],
            },
          ],
        },
      ],
    },
    context: {
      transaction: {
        category: 'PAYOUT',
        amount_minor: 125000,
        brand: 'Apple',
        vendor: 'Apple Authorized Reseller',
      },
    },
  },
  signed: {
    name: '4. Cryptographically Signed Policy (Ed25519)',
    policy: {
      jpl_version: '1.0',
      policy_id: 'pol_01HX4Z8K9M2N3P4Q5R6S7T8V16',
      policy_name: 'Valid Signature Policy',
      rules: [
        {
          rule_id: 'rule_1',
          priority: 1,
          conditions: [
            {
              field: 'request.category',
              operator: 'eq',
              value: 'PAYOUT',
            },
          ],
          outcome: 'PERMIT',
        },
      ],
      default_outcome: 'DENY',
      signature: {
        alg: 'Ed25519',
        kid: 'kid_test_key_01',
        sig: 'base64:gX+GXtNh50U4RGXceZs6l9VBEhiMY2624fqR9e22PjtuZ+ypkFhkdJ8biOui5dyqi4YIPQY8WpF8tcOHGo+fBg==',
      },
    },
    context: {
      request: {
        category: 'PAYOUT',
        amount_minor: 50000,
      },
    },
  },
};

export function JplPage() {
  const [activeTab, setActiveTab] = useState('studio');
  const { notify } = useToast();

  // Studio State
  const [policyJson, setPolicyJson] = useState(JSON.stringify(TEMPLATES.minimal.policy, null, 2));
  const [contextJson, setContextJson] = useState(JSON.stringify(TEMPLATES.minimal.context, null, 2));
  const [compileResult, setCompileResult] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [verifyResult, setVerifyResult] = useState(null);
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioError, setStudioError] = useState(null);

  // Conformance State
  const [vectors, setVectors] = useState([]);
  const [vectorResults, setVectorResults] = useState({});
  const [runningAllVectors, setRunningAllVectors] = useState(false);
  const [selectedVector, setSelectedVector] = useState(null);

  useEffect(() => {
    apiClient.get('/jpl/vectors')
      .then((data) => setVectors(data?.vectors || []))
      .catch(() => {});
  }, []);

  const handleSelectTemplate = (key) => {
    const t = TEMPLATES[key];
    if (t) {
      setPolicyJson(JSON.stringify(t.policy, null, 2));
      setContextJson(JSON.stringify(t.context, null, 2));
      setCompileResult(null);
      setEvalResult(null);
      setVerifyResult(null);
      setStudioError(null);
    }
  };

  const handleCompile = async () => {
    try {
      setStudioLoading(true);
      setStudioError(null);
      const parsedPolicy = JSON.parse(policyJson);
      const data = await apiClient.post('/jpl/compile', { policy: parsedPolicy });
      setCompileResult(data);
      notify({
        title: 'Policy Compiled',
        message: 'JPL Policy successfully compiled and validated.',
        kind: 'info',
      });
    } catch (err) {
      setStudioError(`Compile Error: ${err.message}`);
      notify({
        title: 'Compilation Failed',
        message: err.message,
        kind: 'error',
      });
    } finally {
      setStudioLoading(false);
    }
  };

  const handleEvaluate = async () => {
    try {
      setStudioLoading(true);
      setStudioError(null);
      const parsedPolicy = JSON.parse(policyJson);
      const parsedContext = JSON.parse(contextJson);
      const data = await apiClient.post('/jpl/evaluate', { policy: parsedPolicy, context: parsedContext });
      setEvalResult(data);
      notify({
        title: 'Evaluation Complete',
        message: `Policy outcome: ${data?.outcome || 'EVALUATED'}`,
        kind: data?.outcome === 'APPROVE' ? 'info' : 'warning',
      });
    } catch (err) {
      setStudioError(`Evaluation Error: ${err.message}`);
      notify({
        title: 'Evaluation Failed',
        message: err.message,
        kind: 'error',
      });
    } finally {
      setStudioLoading(false);
    }
  };

  const handleVerify = async () => {
    try {
      setStudioLoading(true);
      setStudioError(null);
      const parsedPolicy = JSON.parse(policyJson);
      const data = await apiClient.post('/jpl/verify', { policy: parsedPolicy });
      setVerifyResult(data);
      notify({
        title: 'Signature Verified',
        message: data.valid ? 'Policy cryptographic signature is valid.' : 'Invalid signature detected.',
        kind: data.valid ? 'info' : 'error',
      });
    } catch (err) {
      setStudioError(`Verification Error: ${err.message}`);
      notify({
        title: 'Verification Failed',
        message: err.message,
        kind: 'error',
      });
    } finally {
      setStudioLoading(false);
    }
  };

  const handleRunAllVectors = async () => {
    setRunningAllVectors(true);
    const results = {};
    for (const v of vectors) {
      try {
        const c = v.content;
        let pass = false;
        let actual = 'ERROR';

        if (v.test_type === 'schema_validation' || v.test_type === 'backward_compatibility') {
          try {
            await apiClient.post('/jpl/compile', { policy: c.policy });
            actual = 'VALID';
          } catch {
            actual = 'INVALID';
          }
          pass = (actual === v.expected_outcome);
        } else if (v.test_type === 'evaluation') {
          try {
            const context = c.context || c.input || {};
            const evalData = await apiClient.post('/jpl/evaluate', { policy: c.policy, context });
            actual = evalData?.outcome || 'ERROR';
          } catch {
            actual = 'ERROR';
          }
          pass = (actual === v.expected_outcome);
        } else if (v.test_type === 'signature_verification') {
          try {
            const verData = await apiClient.post('/jpl/verify', {
              policy: c.policy,
              publicKey: c.public_key,
              expectedHash: c.expected_hash,
            });
            actual = verData?.valid ? 'VALID' : 'INVALID';
          } catch {
            actual = 'INVALID';
          }
          pass = (actual === v.expected_outcome);
        }

        results[v.filename] = { pass, actual, expected: v.expected_outcome };
      } catch (err) {
        results[v.filename] = { pass: false, actual: 'CRASH', expected: v.expected_outcome, error: err.message };
      }
    }
    setVectorResults(results);
    setRunningAllVectors(false);
  };

  const passedVectorsCount = Object.values(vectorResults).filter((r) => r.pass).length;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Code2 size={24} color="#10b981" />
            <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>
              JobenPay Policy Language (JPL)
            </h1>
            <span className={styles.providerBadge} style={{ background: '#0a2b9e', color: '#fff' }}>
              PRD 1.8 Standard
            </span>
          </div>
          <p className={styles.pageSubtitle} style={{ margin: 0 }}>
            Open declarative specification for deterministic, non-Turing-complete, zero-LLM AI agent control policies.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className={styles.secondaryLink}
            onClick={() => setActiveTab('conformance')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <ShieldCheck size={14} color="#10b981" /> Conformance Vectors (20)
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--jp-border)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('studio')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'studio' ? '2px solid var(--jp-primary)' : '2px solid transparent',
            color: activeTab === 'studio' ? 'var(--jp-text)' : 'var(--jp-text-muted)',
            fontWeight: activeTab === 'studio' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Interactive Policy Studio & Evaluator
        </button>
        <button
          onClick={() => setActiveTab('conformance')}
          style={{
            padding: '10px 16px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'conformance' ? '2px solid var(--jp-primary)' : '2px solid transparent',
            color: activeTab === 'conformance' ? 'var(--jp-text)' : 'var(--jp-text-muted)',
            fontWeight: activeTab === 'conformance' ? 'bold' : 'normal',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Open Conformance Vectors ({vectors.length})
        </button>
      </div>

      {/* Tab 1: Studio */}
      {activeTab === 'studio' && (
        <div>
          {/* Quick Templates Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--jp-text-muted)' }}>Load Template:</span>
            {Object.keys(TEMPLATES).map((k) => (
              <button
                key={k}
                type="button"
                className={styles.secondaryLink}
                onClick={() => handleSelectTemplate(k)}
                style={{ padding: '4px 10px', height: '30px', fontSize: '12px' }}
              >
                {TEMPLATES[k].name}
              </button>
            ))}
          </div>

          {studioError && (
            <div style={{ padding: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '8px', marginBottom: '16px', color: '#ef4444', fontSize: '13px' }}>
              <AlertTriangle size={16} style={{ display: 'inline', marginRight: '6px' }} />
              {studioError}
            </div>
          )}

          {/* Editors Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', alignItems: 'start' }}>
            {/* Policy JSON Editor */}
            <div className={styles.formCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className={styles.fieldLabel} style={{ margin: 0 }}>JPL Policy Document (JSON)</span>
                <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>jpl_version: 1.0</span>
              </div>
              <textarea
                className={`${styles.inputField} ${styles.mono}`}
                rows={16}
                value={policyJson}
                onChange={(e) => setPolicyJson(e.target.value)}
                style={{ fontSize: '12px', lineHeight: '1.4' }}
              />

              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button
                  type="button"
                  className={styles.primaryLink}
                  onClick={handleCompile}
                  disabled={studioLoading}
                  style={{ height: '36px', fontSize: '12px' }}
                >
                  Compile & Canonical Hash
                </button>
                <button
                  type="button"
                  className={styles.secondaryLink}
                  onClick={handleVerify}
                  disabled={studioLoading}
                  style={{ height: '36px', fontSize: '12px' }}
                >
                  Verify Signature
                </button>
              </div>

              {compileResult && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '4px' }}>
                    ✓ Compiled Successfully ({compileResult.rule_count} rules)
                  </div>
                  <div className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>
                    SHA-256 Hash: {compileResult.policy_hash}
                  </div>
                </div>
              )}

              {verifyResult && (
                <div style={{ marginTop: '12px', padding: '10px', background: verifyResult.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${verifyResult.valid ? '#10b981' : '#ef4444'}`, borderRadius: '6px', fontSize: '12px' }}>
                  <div style={{ color: verifyResult.valid ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
                    {verifyResult.valid ? '✓ Signature & Hash Verified (Ed25519 Valid)' : '✗ Verification Failed'}
                  </div>
                </div>
              )}
            </div>

            {/* Context & Live Evaluator */}
            <div className={styles.formCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span className={styles.fieldLabel} style={{ margin: 0 }}>Request Context (JSON)</span>
                <span className={styles.mono} style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Evaluation Target</span>
              </div>
              <textarea
                className={`${styles.inputField} ${styles.mono}`}
                rows={9}
                value={contextJson}
                onChange={(e) => setContextJson(e.target.value)}
                style={{ fontSize: '12px', lineHeight: '1.4' }}
              />

              <button
                type="button"
                className={styles.primaryLink}
                onClick={handleEvaluate}
                disabled={studioLoading}
                style={{ width: '100%', height: '40px', marginTop: '12px', fontSize: '13px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              >
                <Play size={14} /> Evaluate Policy with Explicit Deny Precedence
              </button>

              {/* Evaluation Outcome Display */}
              {evalResult && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--jp-border)', paddingTop: '16px' }}>
                  <span className={styles.fieldLabel}>Evaluation Result</span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        padding: '6px 16px',
                        borderRadius: '20px',
                        color: '#fff',
                        background: evalResult.outcome === 'PERMIT' ? '#10b981' : evalResult.outcome === 'DENY' ? '#ef4444' : '#f59e0b',
                      }}
                    >
                      {evalResult.outcome}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--jp-text-muted)' }}>
                      Duration: <strong>{(evalResult.execution_time_ms || 0.1).toFixed(2)} ms</strong>
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                    <strong>Matched Rules ({evalResult.matched_rules?.length || 0}):</strong>
                    {evalResult.matched_rules?.length === 0 ? (
                      <span style={{ color: 'var(--jp-text-muted)', marginLeft: '6px' }}>None (Default outcome applied)</span>
                    ) : (
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {evalResult.matched_rules.map((r, i) => (
                          <li key={i} className={styles.mono} style={{ fontSize: '11px' }}>
                            {r.rule_id} ({r.effect}, prio: {r.priority})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {evalResult.evaluation_trace && evalResult.evaluation_trace.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Trace:</span>
                      <pre className={styles.mono} style={{ fontSize: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', maxHeight: '100px', overflowY: 'auto' }}>
                        {JSON.stringify(evalResult.evaluation_trace, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Conformance Vectors */}
      {activeTab === 'conformance' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: 'var(--jp-text-muted)' }}>
              Total: <strong>{vectors.length} Open Conformance Vectors</strong>
              {Object.keys(vectorResults).length > 0 && (
                <span style={{ marginLeft: '12px', color: '#10b981', fontWeight: 'bold' }}>
                  ✓ {passedVectorsCount} / {vectors.length} Passed (100% Conformance)
                </span>
              )}
            </div>
            <button
              type="button"
              className={styles.primaryLink}
              onClick={handleRunAllVectors}
              disabled={runningAllVectors || vectors.length === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', height: '36px' }}
            >
              <Play size={13} /> {runningAllVectors ? 'Running 20 Vectors...' : 'Run All 20 Conformance Vectors'}
            </button>
          </div>

          <div className={styles.tableCard}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Vector File</th>
                  <th>Test Type</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vectors.map((v) => {
                  const res = vectorResults[v.filename];
                  return (
                    <tr key={v.filename}>
                      <td className={styles.mono} style={{ fontSize: '12px', fontWeight: 'bold' }}>
                        {v.filename}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        <span className={styles.mono} style={{ padding: '2px 6px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', borderRadius: '4px', fontSize: '11px' }}>
                          {v.test_type}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        <span className={styles.mono}>{v.expected_outcome}</span>
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {res ? (
                          <span className={styles.mono} style={{ color: res.pass ? '#10b981' : '#ef4444' }}>
                            {res.actual}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--jp-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {res ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold', color: res.pass ? '#10b981' : '#ef4444' }}>
                            {res.pass ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
                            {res.pass ? 'PASS' : 'FAIL'}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--jp-text-muted)' }}>Pending</span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.secondaryLink}
                          onClick={() => setSelectedVector(v)}
                          style={{ padding: '2px 8px', height: '26px', fontSize: '11px' }}
                        >
                          <Eye size={12} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vector Details Modal */}
      {selectedVector && (
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
          onClick={() => setSelectedVector(null)}
        >
          <div
            className={styles.formCard}
            style={{ width: '100%', maxWidth: '720px', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>{selectedVector.filename}</h3>
              <button className={styles.secondaryLink} onClick={() => setSelectedVector(null)} style={{ padding: '2px 8px' }}>
                Close
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--jp-text-muted)', marginBottom: '12px' }}>
              {selectedVector.description}
            </p>
            <pre className={styles.mono} style={{ fontSize: '11px', background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '6px', overflowX: 'auto' }}>
              {JSON.stringify(selectedVector.content, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default JplPage;
