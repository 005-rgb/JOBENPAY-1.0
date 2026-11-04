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

