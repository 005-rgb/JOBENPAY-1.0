import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client.js';
import BrandLoadingScreen from '../components/BrandLoadingScreen.jsx';
import {
  Banner,
  Button,
  Card,
  FloatingInput,
} from '../components/primitives.jsx';
import logoUrl from '../assets/jobenpay-logo.svg';
import styles from './FeaturePages.module.css';

export function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [errorMessage, setErrorMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    // Set Referrer-Policy to no-referrer
    let meta = document.querySelector('meta[name="referrer"]');
    let created = false;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'referrer';
      meta.content = 'no-referrer';
      document.head.appendChild(meta);
      created = true;
    } else {
      meta.content = 'no-referrer';
    }

    // Extract token and immediately clean from URL
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');
    window.history.replaceState({}, document.title, window.location.pathname);

    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    if (!token) {
      setStatus('error');
      setErrorMessage(t('app.emailVerificationFailed'));
      return;
    }

    apiClient.post('/auth/verify-email', { token })
      .then(() => {
        setStatus('success');
      })
      .catch((err) => {
        setStatus('error');
        setErrorMessage(err?.message || t('app.emailVerificationFailed'));
      });

    return () => {
      if (created && meta.parentNode) {
        meta.parentNode.removeChild(meta);
      }
    };
  }, [t]);

  const handleResend = async (e) => {
    e.preventDefault();
    if (!resendEmail || !resendEmail.includes('@')) return;
    setResendLoading(true);
    setResendNotice('');
    try {
      await apiClient.post('/auth/resend-verification', { email: resendEmail });
      setResendNotice(t('app.resendSuccess'));
    } catch {
      setResendNotice(t('app.resendSuccess'));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      <Card className={styles.loginCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">
          <img alt={t('app.name')} className={styles.loginLogo} src={logoUrl} />
        </Link>
        <h1>{t('app.verifyEmailTitle')}</h1>

        {status === 'verifying' ? (
          <div className={styles.formStack}>
            <BrandLoadingScreen message={t('components.loading')} />
          </div>
        ) : null}

        {status === 'success' ? (
          <div className={styles.formStack}>
            <Banner kind="success" title={t('app.emailVerified')}>
              {t('app.emailVerifiedDescription')}
            </Banner>
            <Button
              className={styles.fullWidth}
              onClick={() => navigate('/login')}
              size="lg"
            >
              {t('app.login')}
            </Button>
          </div>
        ) : null}

        {status === 'error' ? (
          <div className={styles.formStack}>
            <Banner kind="error" title={errorMessage || t('app.emailVerificationFailed')}>
              {errorMessage || t('app.emailVerificationFailed')}
            </Banner>

            {resendNotice ? (
              <Banner kind="success" title={resendNotice}>
                {resendNotice}
              </Banner>
            ) : null}

            <form className={styles.formStack} onSubmit={handleResend}>
              <FloatingInput
                autoComplete="email"
                label={t('app.email')}
                onChange={(e) => setResendEmail(e.target.value)}
                required
                type="email"
                value={resendEmail}
              />
              <Button
                className={styles.fullWidth}
                loading={resendLoading}
                type="submit"
                variant="secondary"
              >
                {t('app.resendVerification')}
              </Button>
            </form>

            <Link className={styles.loginLink} to="/login">
              {t('app.backToLogin')}
            </Link>
          </div>
        ) : null}

        <p className={styles.paypalDisclaimer}>{t('app.paypalDisclaimer')}</p>
      </Card>
    </main>
  );
}

export default VerifyEmailPage;

