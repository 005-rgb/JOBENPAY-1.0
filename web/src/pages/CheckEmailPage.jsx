import { useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client.js';
import { Banner, Button, Card } from '../components/primitives.jsx';
import logoUrl from '../assets/jobenpay-logo.svg';
import styles from './FeaturePages.module.css';

export function CheckEmailPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const email = location.state?.email || '';

  const [countdown, setCountdown] = useState(60);
  const [resending, setResending] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setNotice('');
    try {
      if (email) {
        await apiClient.post('/auth/resend-verification', { email });
      }
      setNotice(t('app.resendSuccess'));
      setCountdown(60);
    } catch {
      // Anti-enumeration: treat generically
      setNotice(t('app.resendSuccess'));
      setCountdown(60);
    } finally {
      setResending(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      <Card className={styles.loginCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">
          <img alt={t('app.name')} className={styles.loginLogo} src={logoUrl} />
        </Link>
        <h1>{t('app.checkEmailTitle')}</h1>

        <div className={styles.formStack}>
          {notice ? (
            <Banner kind="success" title={notice}>
              {notice}
            </Banner>
          ) : null}

          <p className={styles.authNotice}>
            {t('app.checkEmailDescription')}
          </p>

          <Button
            className={styles.fullWidth}
            disabled={countdown > 0 || resending}
            loading={resending}
            onClick={handleResend}
            variant="secondary"
          >
            {countdown > 0
              ? t('app.resendCooldown', { seconds: countdown })
              : t('app.resendEmail')}
          </Button>

          <Link className={styles.loginLink} to="/login">
            {t('app.backToLogin')}
          </Link>
        </div>

        <p className={styles.paypalDisclaimer}>{t('app.paypalDisclaimer')}</p>
      </Card>
    </main>
  );
}

export default CheckEmailPage;

