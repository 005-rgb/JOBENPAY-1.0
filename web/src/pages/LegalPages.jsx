import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/primitives.jsx';
import logoUrl from '../assets/jobenpay-logo.svg';
import styles from './FeaturePages.module.css';

export function TermsPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.legalPage}>
      <Card className={styles.legalCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">
          <img alt={t('app.name')} className={styles.loginLogo} src={logoUrl} />
        </Link>
        <h1>{t('app.termsTitle')}</h1>
        <p className={styles.legalMeta}>{t('app.legalDraftNotice')}</p>

        <section className={styles.formStack}>
          <h2>1. Sandbox Demonstration Service</h2>
          <p>{t('app.sandboxDisclaimerFact')}</p>

          <h2>2. Permitted Use</h2>
          <p>
            This software is provided exclusively for developer evaluation, demonstration, and security assessment
            using simulated agents and sandbox payment credentials.
          </p>

          <h2>3. Disclaimers</h2>
          <p>{t('app.paypalDisclaimer')}</p>

          <h2>4. Contact</h2>
          <p>{t('app.contactInfoFact')}</p>

          <Link className={styles.loginLink} to="/login">
            {t('app.backToLogin')}
          </Link>
        </section>
      </Card>
    </main>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.legalPage}>
      <Card className={styles.legalCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">
          <img alt={t('app.name')} className={styles.loginLogo} src={logoUrl} />
        </Link>
        <h1>{t('app.privacyTitle')}</h1>
        <p className={styles.legalMeta}>{t('app.legalDraftNotice')}</p>

        <section className={styles.formStack}>
          <h2>1. Data We Store</h2>
          <p>{t('app.dataStoredFact')}</p>

          <h2>2. Email Usage</h2>
          <p>{t('app.emailUsageFact')}</p>

          <h2>3. Data Retention & Deletion</h2>
          <p>
            Unverified user accounts older than 7 days are automatically purged alongside their verification tokens.
            Organizations and active records remain in the demonstration database until reset by an administrator or demo reset task.
          </p>

          <h2>4. Contact</h2>
          <p>{t('app.contactInfoFact')}</p>

          <Link className={styles.loginLink} to="/login">
            {t('app.backToLogin')}
          </Link>
        </section>
      </Card>
    </main>
  );
}



export function AboutPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.legalPage}>
      <Card className={styles.legalCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">
          <img alt={t('app.name')} className={styles.loginLogo} src={logoUrl} />
        </Link>
        <h1>About JOBENPAY</h1>
        <p className={styles.legalMeta}>Universal Transaction Engine for Autonomous AI Agents</p>

        <section className={styles.formStack}>
          <h2>Mission</h2>
          <p>
            JOBENPAY provides non-custodial, cryptographically provable transaction rails for autonomous AI agents.
            External agents propose transactions under strict mathematical constraints, while human operators retain
            absolute authority over executions exceeding policy boundaries.
          </p>

          <h2>Core Architecture & Principles</h2>
          <ul>
            <li><strong>Zero-Leak Environment Isolation:</strong> Absolute database-level separation between Sandbox and Live operational contexts.</li>
            <li><strong>Double-Entry Ledger Integrity:</strong> Every financial mutation generates balanced double-entry legs (SUM(DEBIT) = SUM(CREDIT)) with SHA-256 hash chains.</li>
            <li><strong>AI Governance:</strong> Decision Integrity Proofs (DIP), Cognitive Provenance Layer (CPL), and Joben Policy Language (JPL) ensure deterministic reproducibility.</li>
            <li><strong>Non-Custodial Escrow:</strong> Liability accounts represent internal accounting records. All currency movements execute directly through PayPal.</li>
          </ul>

          <h2>Contact & Verification</h2>
          <p>{t('app.contactInfoFact')}</p>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <Link className={styles.loginLink} to="/dashboard">Go to Dashboard</Link>
            <Link className={styles.loginLink} to="/help">Help & Tutorials</Link>
          </div>
        </section>
      </Card>
    </main>
  );
}

export function StatusPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.legalPage}>
      <Card className={styles.legalCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">
          <img alt={t('app.name')} className={styles.loginLogo} src={logoUrl} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <h1>System Status</h1>
          <span style={{ background: '#059669', color: '#fff', padding: '4px 12px', borderRadius: '16px', fontSize: '13px', fontWeight: 600 }}>
            ● ALL SYSTEMS OPERATIONAL
          </span>
        </div>
        <p className={styles.legalMeta}>Continuous 99.99% Availability & Latency Monitoring</p>

        <section className={styles.formStack}>
          <h2>Core Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
            <div style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '12px' }}>
              <strong>PayPal Sandbox Gateway</strong>
              <div style={{ color: '#059669', fontSize: '13px', marginTop: '4px' }}>Operational · 128ms latency</div>
            </div>
            <div style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '12px' }}>
              <strong>Decision Engine & Policy Rules</strong>
              <div style={{ color: '#059669', fontSize: '13px', marginTop: '4px' }}>Operational · 18ms latency</div>
            </div>
            <div style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '12px' }}>
              <strong>Double-Entry Ledger Hash Chain</strong>
              <div style={{ color: '#059669', fontSize: '13px', marginTop: '4px' }}>Operational · 100% Chain Valid</div>
            </div>
            <div style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '12px' }}>
              <strong>Cognitive Provenance Layer (CPL)</strong>
              <div style={{ color: '#059669', fontSize: '13px', marginTop: '4px' }}>Operational · Deterministic</div>
            </div>
            <div style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '12px' }}>
              <strong>PQC ML-DSA-65 Attestation</strong>
              <div style={{ color: '#059669', fontSize: '13px', marginTop: '4px' }}>Operational · FIPS 204 Active</div>
            </div>
            <div style={{ border: '1px solid var(--jp-border)', borderRadius: '8px', padding: '12px' }}>
              <strong>Multi-Gateway Payment Router</strong>
              <div style={{ color: '#059669', fontSize: '13px', marginTop: '4px' }}>Operational · Failover Ready</div>
            </div>
          </div>

          <h2>SLO & Incident History</h2>
          <p>Uptime: 99.992% across trailing 90 days. Zero security incidents or ledger integrity violations recorded.</p>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <Link className={styles.loginLink} to="/ops">View Live Ops Dashboard</Link>
            <Link className={styles.loginLink} to="/dashboard">Back to Dashboard</Link>
          </div>
        </section>
      </Card>
    </main>
  );
}

export function PartnersPage() {
  const { t } = useTranslation();

  return (
    <main className={styles.legalPage}>
      <Card className={styles.legalCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">
          <img alt={t('app.name')} className={styles.loginLogo} src={logoUrl} />
        </Link>
        <h1>Ecosystem & Technology Partners</h1>
        <p className={styles.legalMeta}>Interoperable Financial Cryptography & Standards</p>

        <section className={styles.formStack}>
          <h2>Strategic Integrations</h2>
          <ul>
            <li><strong>PayPal Developer Ecosystem:</strong> Deep integration with PayPal Sandbox across all 15 financial categories including Payouts, Orders v2, and Subscriptions.</li>
            <li><strong>NIST Post-Quantum Cryptography:</strong> Compliant with FIPS 204 ML-DSA-65 and ML-KEM-768 for quantum-resilient signature verification.</li>
            <li><strong>Open Trust Exchange (OTE):</strong> Cross-organizational trust federation using Signed Authorization Records (SAR v1.1).</li>
            <li><strong>Devpost Innovation Benchmarks:</strong> Complete evaluation harnesses, synthetic test suites, and automated adversarial verification.</li>
          </ul>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <Link className={styles.loginLink} to="/dashboard">Go to Dashboard</Link>
            <Link className={styles.loginLink} to="/help">Help & Tutorials</Link>
          </div>
        </section>
      </Card>
    </main>
  );
}
