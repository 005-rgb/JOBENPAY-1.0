import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Layers,
  Lock,
  Network,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import logoUrl from '../assets/jobenpay-logo.svg';
import styles from './Landing.module.css';

const GOLDEN_PATH_STEPS = [
  {
    step: 1,
    id: 'propose',
    name: 'Propose',
    sub: 'MCP Agent',
    title: '1. Autonomous Proposal via MCP',
    desc: 'The AI agent (Claude, Cursor, or custom script) drafts a structured intent via Model Context Protocol JSON-RPC 2.0 without direct bank access.',
    guarantee: 'Agent has 0 direct disbursement credentials.',
    code: `// Agent Proposal Payload (MCP JSON-RPC 2.0)\n{\n  "jsonrpc": "2.0",\n  "method": "tools/call",\n  "params": {\n    "name": "propose_payout",\n    "arguments": {\n      "recipient": "supplier_88@corp.net",\n      "amount": "1500.00",\n      "currency": "USD",\n      "mandate_id": "mnd_88291a"\n    }\n  }\n}`,
  },
  {
    step: 2,
    id: 'check',
    name: 'Check',
    sub: 'Mandates',
    title: '2. Deterministic Mandate Verification',
    desc: 'Hardware-level database triggers enforce velocity caps, cumulative limits, and counterparty allowlists. Rogue agent requests are terminated instantly.',
    guarantee: 'Enforced at DB layer with FOR UPDATE locking.',
    code: `// Deterministic Mandate Guard\n{\n  "mandate_id": "mnd_88291a",\n  "daily_limit": 5000.00,\n  "consumed_today": 1500.00,\n  "status": "APPROVED_WITHIN_BUDGET",\n  "requires_human_stepup": false\n}`,
  },
  {
    step: 3,
    id: 'decide',
    name: 'Decide',
    sub: 'DIP Engine',
    title: '3. Decision Integrity Proof (DIP)',
    desc: 'The Decision Engine evaluates the semantic alignment between original intent and proposed action, generating a verifiable 0-100 score.',
    guarantee: 'Zero autonomous execution if score < 85.',
    code: `// Decision Integrity Score (DIS)\n{\n  "score": 98,\n  "threshold": 85,\n  "reasoning_hash": "e3b0c44298fc1c149afbf4c8996fb924",\n  "decision": "AUTO_APPROVE",\n  "disposition": "TRUSTED"\n}`,
  },
  {
    step: 4,
    id: 'execute',
    name: 'Execute',
    sub: 'POL Rails',
    title: '4. Payment Orchestration Layer (POL)',
    desc: 'Multi-rail execution through PayPal Sandbox and Stripe fallback with circuit breaker failovers and org-scoped idempotency keys.',
    guarantee: 'Idempotency key prevents double payouts.',
    code: `// Payment Orchestration Dispatch\n{\n  "provider": "PAYPAL_SANDBOX",\n  "idempotency_key": "jp_req_994812_payout",\n  "circuit_breaker": "CLOSED (HEALTHY)",\n  "gateway_status": "SUCCESS (201 Created)"\n}`,
  },
  {
    step: 5,
    id: 'prove',
    name: 'Prove',
    sub: 'Ledger',
    title: '5. Immutable Double-Entry Ledger',
    desc: 'Every penny is recorded in a balanced journal entry (SUM(DEBIT) = SUM(CREDIT)) and cryptographically hash-chained for external auditing.',
    guarantee: 'DB triggers reject any unbalanced write.',
    code: `// Double-Entry Ledger Settlement\n[\n  { "account": "liability:tenant_88", "debit": 150000, "credit": 0 },\n  { "account": "asset:paypal_sandbox", "debit": 0, "credit": 150000 }\n]\n// Balanced: DEBIT (1500.00) = CREDIT (1500.00) [HASH: 9a7b...4c]`,
  },
];

export default function LandingPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [activeStepId, setActiveStepId] = useState('decide');

  useEffect(() => {
    let active = true;
    apiClient
      .get('/auth/config')
      .then((data) => {
        if (active) {
          setRegistrationEnabled(Boolean(data?.registrationEnabled));
        }
      })
      .catch(() => {
        if (active) {
          setRegistrationEnabled(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (auth.user) {
      navigate('/dashboard', { replace: true });
    }
  }, [auth.user, navigate]);

  const activeStep = GOLDEN_PATH_STEPS.find((s) => s.id === activeStepId) || GOLDEN_PATH_STEPS[2];

  return (
    <div className={styles.landingPage}>
      <a href="#main-content" className={styles.skipLink}>
        {t('landing.skipToContent', 'Skip to main content')}
      </a>

      {/* HEADER NAVIGATION */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brandLink} aria-label="JOBENPAY Home">
            <img src={logoUrl} alt="JOBENPAY" className={styles.brandLogo} />
          </Link>

          <nav className={styles.headerNav} aria-label="Main Navigation">
            <a href="#golden-path" className={styles.headerNavLink}>
              Architecture
            </a>
            <a href="#capabilities" className={styles.headerNavLink}>
              Capabilities
            </a>
            <a href="#trust" className={styles.headerNavLink}>
              Security
            </a>
            <Link to="/help" className={styles.headerNavLink}>
              Help Center
            </Link>
          </nav>

          <div className={styles.headerRight}>
            <span className={styles.sandboxChip}>SANDBOX</span>
            <Link to="/login" className={styles.headerLoginBtn} data-testid="header-login-btn">
              {t('landing.logIn', 'Log In')}
            </Link>
            {registrationEnabled ? (
              <Link to="/signup" className={styles.headerSignupBtn} data-testid="header-signup-btn">
                {t('landing.createAccount', 'Create Account')}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main id="main-content" className={styles.mainContent}>
        {/* =================================================================
            SECTION 1: THE HERO (Above the Fold)
            ================================================================= */}
        <section className={styles.heroSection}>
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              {/* Left Column: Value Prop */}
              <div className={styles.heroContent}>
                <div className={styles.heroBadge}>
                  <span className={styles.pulseDot} />
                  <span>Backed by PayPal Sandbox &amp; Gemini 3.8 Flash</span>
                </div>

                <h1 className={styles.heroTitle}>
                  The Trust Layer for Agentic Commerce.
                </h1>

                <p className={styles.heroSub}>
                  Giving an AI agent access to your funds shouldn&apos;t be a blind leap of faith.
                  JOBENPAY mathematically verifies every intent, blocks rogue agents, and secures
                  payouts with Post-Quantum Cryptography.
                </p>

                <div className={styles.heroActions}>
                  <Link to="/login" className={styles.ctaPrimary} data-testid="hero-primary-cta">
                    Deploy Your Agent
                    <ArrowRight size={18} />
                  </Link>

                  <a href="#golden-path" className={styles.ctaSecondary}>
                    Read the Architecture
                  </a>

                  <Link to="/help" className={styles.ctaTertiary}>
                    Explore Docs &rarr;
                  </Link>
                </div>
              </div>

              {/* Right Column: Hero Visual Micro-Console Simulator */}
              <div className={styles.heroVisual} aria-label="Interactive Intent Verification Simulator">
                <div className={styles.consoleWindow}>
                  <div className={styles.consoleHeader}>
                    <div className={styles.consoleDots}>
                      <span className={styles.dotRed} />
                      <span className={styles.dotYellow} />
                      <span className={styles.dotGreen} />
                    </div>
                    <span className={styles.consoleTitle}>JOBENPAY INTENT VERIFICATION ENGINE</span>
                    <span className={styles.consoleLivePill}>
                      <span className={styles.pulseDot} /> LIVE
                    </span>
                  </div>

                  <div className={styles.consoleBody}>
                    <div className={`${styles.consoleRow} ${styles.row1}`}>
                      <span className={styles.consolePrompt}>&gt;</span>
                      <span className={`${styles.consoleTag} ${styles.tagAgent}`}>MCP PROPOSAL</span>
                      <span className={styles.consoleText}>
                        Agent proposes payout: <span className={styles.consoleValue}>$1,500.00 USD</span> to supplier
                      </span>
                    </div>

                    <div className={`${styles.consoleRow} ${styles.row2}`}>
                      <span className={styles.consolePrompt}>&gt;</span>
                      <span className={`${styles.consoleTag} ${styles.tagMandate}`}>MANDATE GUARD</span>
                      <span className={styles.consoleText}>
                        Velocity &amp; scope checks: <span className={styles.consoleValue}>PASS (Within $5K cap)</span>
                      </span>
                    </div>

                    <div className={`${styles.consoleRow} ${styles.row3}`}>
                      <span className={styles.consolePrompt}>&gt;</span>
                      <span className={`${styles.consoleTag} ${styles.tagDip}`}>DIP EVALUATION</span>
                      <span className={styles.consoleText}>
                        Reasoning vector checked against original intent
                      </span>
                    </div>

                    {/* Illuminated DIP Shield Box */}
                    <div className={styles.dipShieldBox}>
                      <div className={styles.shieldLeft}>
                        <ShieldCheck className={styles.shieldIcon} />
                        <div>
                          <div className={styles.shieldScoreText}>Decision Integrity Score: 98/100</div>
                          <div className={styles.shieldDetail}>Deterministic Reasoning Verified &bull; Zero Hallucination</div>
                        </div>
                      </div>
                      <span className={styles.shieldBadge}>APPROVED</span>
                    </div>

                    <div className={`${styles.consoleRow} ${styles.row4}`}>
                      <span className={styles.consolePrompt}>&gt;</span>
                      <span className={`${styles.consoleTag} ${styles.tagLedger}`}>LEDGER PROOF</span>
                      <span className={styles.consoleText}>
                        Settled in double-entry ledger: <span className={styles.consoleValue}>SUM(DEBIT) = SUM(CREDIT)</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            SECTION 2: THE GOLDEN PATH (Interactive 5-Step Timeline)
            ================================================================= */}
        <section id="golden-path" className={styles.goldenPathSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionEyebrow}>Deterministic Architecture</span>
              <h2 className={styles.sectionTitle}>From Request to Proof in Five Steps.</h2>
              <p className={styles.sectionSub}>
                Every autonomous transaction travels through our five-stage security pipeline.
                Select any step to inspect the mathematical guarantees.
              </p>
            </div>

            {/* Timeline Track with Animated Traveling Glowing Packet */}
            <div className={styles.timelineTrack} role="tablist" aria-label="Golden Path Stages">
              <div className={styles.conduitLine}>
                <span className={styles.conduitPacket} />
              </div>

              {GOLDEN_PATH_STEPS.map((step) => {
                const isActive = activeStepId === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`${styles.timelineNode} ${isActive ? styles.nodeActive : ''}`}
                    onClick={() => setActiveStepId(step.id)}
                  >
                    <div className={styles.nodeCircle}>{step.step}</div>
                    <div className={styles.nodeTitle}>{step.name}</div>
                    <div className={styles.nodeSub}>{step.sub}</div>
                  </button>
                );
              })}
            </div>

            {/* Interactive Timeline Detail Card */}
            <div className={styles.timelineDetailCard} aria-live="polite">
              <div className={styles.detailLeft}>
                <span className={styles.detailStepPill}>Step {activeStep.step} of 5 &bull; {activeStep.name}</span>
                <h3 className={styles.detailTitle}>{activeStep.title}</h3>
                <p className={styles.detailDesc}>{activeStep.desc}</p>
                <div className={styles.detailGuarantee}>
                  <CheckCircle2 size={16} />
                  <span>Security Guarantee: {activeStep.guarantee}</span>
                </div>
              </div>

              <div className={styles.detailRight}>
                <div className={styles.detailCodeTitle}>Verified Payload Inspector</div>
                <pre style={{ margin: 0 }}>
                  <code>{activeStep.code}</code>
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            SECTION 3: BENTO GRID FEATURES (The Capabilities)
            ================================================================= */}
        <section id="capabilities" className={styles.bentoSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionEyebrow}>Enterprise Capabilities</span>
              <h2 className={styles.sectionTitle}>Uncompromising Security &amp; Control.</h2>
              <p className={styles.sectionSub}>
                Built for mission-critical commerce where rogue agent executions cannot be tolerated.
              </p>
            </div>

            <div className={styles.bentoGrid}>
              {/* Card 1 (Large): DIP */}
              <div className={`${styles.bentoCard} ${styles.cardDIP}`}>
                <div>
                  <div className={styles.bentoIconWrapper}>
                    <Sparkles size={24} />
                  </div>
                  <h3 className={styles.bentoCardTitle}>Decision Integrity Proof (DIP)</h3>
                  <p className={styles.bentoCardDesc}>
                    We don&apos;t just check budgets. We mathematically score the AI&apos;s reasoning
                    (0-100) against your original intent before moving a single cent.
                  </p>
                </div>

                <div className={styles.dipScoreVisual}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Semantic Alignment</span>
                  <div className={styles.meterTrack}>
                    <div className={styles.meterFill} />
                  </div>
                  <span className={styles.meterValue}>98/100</span>
                </div>
              </div>

              {/* Card 2 (Small): Zero-Leak Multi-Environment */}
              <div className={`${styles.bentoCard} ${styles.cardZeroLeak}`}>
                <div>
                  <div className={styles.bentoIconWrapper}>
                    <ShieldAlert size={24} />
                  </div>
                  <h3 className={styles.bentoCardTitle}>Zero-Leak Multi-Environment</h3>
                  <p className={styles.bentoCardDesc}>
                    Complete isolation between Sandbox and Live. Cross-environment IDOR is strictly blocked at the database level.
                  </p>
                </div>

                <div className={styles.zeroLeakVisual}>
                  <span className={`${styles.envPill} ${styles.envSandbox}`}>SANDBOX</span>
                  <div className={styles.wallDivider}>
                    <Lock size={14} />
                    <span>AIR GAP</span>
                  </div>
                  <span className={`${styles.envPill} ${styles.envLive}`}>LIVE</span>
                </div>
              </div>

              {/* Card 3 (Small): Agentic Interface MCP */}
              <div className={`${styles.bentoCard} ${styles.cardMCP}`}>
                <div>
                  <div className={styles.bentoIconWrapper}>
                    <Terminal size={24} />
                  </div>
                  <h3 className={styles.bentoCardTitle}>Agentic Interface (MCP)</h3>
                  <p className={styles.bentoCardDesc}>
                    Native JSON-RPC 2.0 support. Connect Cursor, Claude, or autonomous agent frameworks securely with fine-grained scoping.
                  </p>
                </div>
                <div style={{ fontSize: 11, fontFamily: 'var(--jp-font-mono)', color: 'var(--jp-blue-dark)', background: 'var(--jp-surface-sidebar)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--jp-border)' }}>
                  tools/call &bull; propose_transaction
                </div>
              </div>

              {/* Card 4 (Medium): Post-Quantum Cryptography */}
              <div className={`${styles.bentoCard} ${styles.cardPQC}`}>
                <div>
                  <div className={styles.bentoIconWrapper}>
                    <Cpu size={24} />
                  </div>
                  <h3 className={styles.bentoCardTitle}>Post-Quantum Cryptography</h3>
                  <p className={styles.bentoCardDesc}>
                    Future-proof your financial data with NIST ML-DSA-65 hybrid encryption and immutable tamper detection.
                  </p>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--jp-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} /> Quantum-Resistant ML-DSA-65
                </div>
              </div>

              {/* Card 5 (Medium): Payment Orchestration Layer */}
              <div className={`${styles.bentoCard} ${styles.cardPOL}`}>
                <div>
                  <div className={styles.bentoIconWrapper}>
                    <Zap size={24} />
                  </div>
                  <h3 className={styles.bentoCardTitle}>Payment Orchestration (POL)</h3>
                  <p className={styles.bentoCardDesc}>
                    Smart failover between PayPal and Stripe with built-in Circuit Breakers and zero cross-tenant contamination.
                  </p>
                </div>
                <div className={styles.circuitVisual}>
                  <span>CIRCUIT STATUS: <strong>CLOSED</strong></span>
                  <span style={{ color: 'var(--jp-success)', fontWeight: 'bold' }}>&bull; HEALTHY</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            SECTION 4: TRUST & COMPLIANCE STRIP
            ================================================================= */}
        <section id="trust" className={styles.trustStrip}>
          <div className={styles.container}>
            <div className={styles.trustGrid}>
              <div className={styles.trustItem}>
                <Layers className={styles.trustIcon} />
                <div>
                  <h4 className={styles.trustTitle}>Hash-Chained Ledger</h4>
                  <p className={styles.trustDesc}>
                    SUM(DEBIT) = SUM(CREDIT) enforced via PostgreSQL triggers on every single cent.
                  </p>
                </div>
              </div>

              <div className={styles.trustItem}>
                <ShieldCheck className={styles.trustIcon} />
                <div>
                  <h4 className={styles.trustTitle}>Human-in-the-Loop</h4>
                  <p className={styles.trustDesc}>
                    Step-up verification required for any anomalous or high-value intent.
                  </p>
                </div>
              </div>

              <div className={styles.trustItem}>
                <Lock className={styles.trustIcon} />
                <div>
                  <h4 className={styles.trustTitle}>SLSA Level 3 Supply Chain</h4>
                  <p className={styles.trustDesc}>
                    Hermetic build verification, zero native C-bindings, and signed release provenance.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =================================================================
            CTA BANNER
            ================================================================= */}
        <section className={styles.ctaBanner}>
          <div className={styles.container}>
            <h2 className={styles.ctaBannerTitle}>Ready to Secure Your Autonomous Commerce?</h2>
            <p className={styles.ctaBannerSub}>
              Deploy agentic workflows with mathematical peace of mind.
            </p>
            <div className={styles.heroActions} style={{ justifyContent: 'center' }}>
              <Link to="/login" className={styles.ctaPrimary}>
                Deploy Your Agent
                <ArrowRight size={18} />
              </Link>
              <Link to="/help" className={styles.ctaSecondary}>
                Read User Manual &amp; Tutorials
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* =================================================================
          SECTION 5: PUBLIC FOOTER
          ================================================================= */}
      <footer className={styles.publicFooter}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <Link to="/" className={styles.brandLink}>
              <img src={logoUrl} alt="JOBENPAY" className={styles.brandLogo} />
            </Link>

            <nav className={styles.footerLinks} aria-label="Footer links">
              <Link to="/login" className={styles.footerLink}>
                Log In
              </Link>
              {registrationEnabled ? (
                <Link to="/signup" className={styles.footerLink}>
                  Sign Up
                </Link>
              ) : null}
              <Link to="/help" className={styles.footerLink}>
                Help Center
              </Link>
              <Link to="/terms" className={styles.footerLink}>
                Terms
              </Link>
              <Link to="/privacy" className={styles.footerLink}>
                Privacy
              </Link>
              <a
                href="https://github.com/005-rgb/JOBENPAY-1.0"
                target="_blank"
                rel="noreferrer"
                className={styles.footerLink}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                GitHub <ExternalLink size={12} />
              </a>
            </nav>
          </div>

          <div className={styles.footerDisclaimer}>
            JOBENPAY is not a PayPal product. Connected to PayPal Sandbox only. Built for PayPal AI Hackathon 2026.
          </div>
        </div>
      </footer>
    </div>
  );
}
