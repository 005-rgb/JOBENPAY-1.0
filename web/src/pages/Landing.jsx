import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { Footer } from '../components/AppShell.jsx';
import logoUrl from '../assets/jobenpay-logo.svg';
import styles from './Landing.module.css';

export default function LandingPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const [registrationEnabled, setRegistrationEnabled] = useState(false);

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

  const showDemoHint = import.meta.env.VITE_SHOW_DEMO_HINT === '1';
  const tryStep1 = showDemoHint
    ? t('landing.tryStep1Demo')
    : registrationEnabled
      ? t('landing.tryStep1Create')
      : t('landing.tryStep1Ask');

  return (
    <div className={styles.landingPage}>
      <a href="#main-content" className={styles.skipLink}>
        {t('landing.skipToContent')}
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brandLink} aria-label={t('app.name')}>
            <img src={logoUrl} alt={t('app.name')} className={styles.brandLogo} />
          </Link>

          <div className={styles.headerRight}>
            <span className={styles.sandboxChip}>SANDBOX</span>
            <Link to="/login" className={styles.headerLoginBtn} data-testid="header-login-btn">
              {t('landing.logIn')}
            </Link>
            {registrationEnabled ? (
              <Link to="/signup" className={styles.headerSignupBtn} data-testid="header-signup-btn">
                {t('landing.createAccount')}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main id="main-content" className={styles.mainContent}>
        {/* HERO SECTION */}
        <section className={styles.heroSection}>
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <p className={styles.heroEyebrow}>{t('landing.eyebrow')}</p>
              <h1 className={styles.heroTitle}>{t('landing.h1')}</h1>
              <p className={styles.heroSub}>{t('landing.sub')}</p>

              <div className={styles.heroActions}>
                {registrationEnabled ? (
                  <>
                    <Link to="/signup" className={styles.ctaPrimary}>
                      {t('landing.createAccount')}
                    </Link>
                    <Link to="/login" className={styles.ctaSecondary}>
                      {t('landing.logIn')}
                    </Link>
                  </>
                ) : (
                  <Link to="/login" className={styles.ctaPrimary}>
                    {t('landing.logIn')}
                  </Link>
                )}
                <a href="#how-it-works" className={styles.textLink}>
                  {t('landing.seeHowItWorks')}
                </a>
              </div>

              <p className={styles.heroNote}>{t('landing.sandboxDemoNote')}</p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how-it-works" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('landing.howItWorksTitle')}</h2>
              <p className={styles.sectionSub}>{t('landing.howItWorksSub')}</p>
            </div>

            <ol className={styles.srOnly}>
              <li><strong>{t('landing.step1Title')}:</strong> {t('landing.step1Desc')}</li>
              <li><strong>{t('landing.step2Title')}:</strong> {t('landing.step2Desc')}</li>
              <li><strong>{t('landing.step3Title')}:</strong> {t('landing.step3Desc')}</li>
              <li><strong>{t('landing.step4Title')}:</strong> {t('landing.step4Desc')}</li>
              <li><strong>{t('landing.step5Title')}:</strong> {t('landing.step5Desc')}</li>
            </ol>

            <div className={styles.stepsGrid} aria-hidden="true">
              <article className={styles.stepCard}>
                <span className={styles.stepBadge}>1</span>
                <h3 className={styles.stepTitle}>{t('landing.step1Title')}</h3>
                <p className={styles.stepDesc}>{t('landing.step1Desc')}</p>
              </article>
              <article className={styles.stepCard}>
                <span className={styles.stepBadge}>2</span>
                <h3 className={styles.stepTitle}>{t('landing.step2Title')}</h3>
                <p className={styles.stepDesc}>{t('landing.step2Desc')}</p>
              </article>
              <article className={styles.stepCard}>
                <span className={styles.stepBadge}>3</span>
                <h3 className={styles.stepTitle}>{t('landing.step3Title')}</h3>
                <p className={styles.stepDesc}>{t('landing.step3Desc')}</p>
              </article>
              <article className={styles.stepCard}>
                <span className={styles.stepBadge}>4</span>
                <h3 className={styles.stepTitle}>{t('landing.step4Title')}</h3>
                <p className={styles.stepDesc}>{t('landing.step4Desc')}</p>
              </article>
              <article className={styles.stepCard}>
                <span className={styles.stepBadge}>5</span>
                <h3 className={styles.stepTitle}>{t('landing.step5Title')}</h3>
                <p className={styles.stepDesc}>{t('landing.step5Desc')}</p>
              </article>
            </div>
          </div>
        </section>

        {/* WHAT YOU STAY IN CONTROL OF */}
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('landing.controlTitle')}</h2>
            </div>

            <div className={styles.controlGrid}>
              <article className={styles.controlCard}>
                <h3 className={styles.controlCardTitle}>{t('landing.mandatesTitle')}</h3>
                <p className={styles.controlCardDesc}>{t('landing.mandatesDesc')}</p>
              </article>
              <article className={styles.controlCard}>
                <h3 className={styles.controlCardTitle}>{t('landing.approvalsTitle')}</h3>
                <p className={styles.controlCardDesc}>{t('landing.approvalsDesc')}</p>
              </article>
              <article className={styles.controlCard}>
                <h3 className={styles.controlCardTitle}>{t('landing.proofTitle')}</h3>
                <p className={styles.controlCardDesc}>{t('landing.proofDesc')}</p>
              </article>
            </div>
          </div>
        </section>

        {/* FOUR FACTS */}
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.factsGrid}>
              <article className={styles.factCard}>
                <p className={styles.factText}>{t('landing.fact1')}</p>
              </article>
              <article className={styles.factCard}>
                <p className={styles.factText}>{t('landing.fact2')}</p>
              </article>
              <article className={styles.factCard}>
                <p className={styles.factText}>{t('landing.fact3')}</p>
              </article>
              <article className={styles.factCard}>
                <p className={styles.factText}>{t('landing.fact4')}</p>
              </article>
            </div>
          </div>
        </section>

        {/* TRY IT IN THREE MINUTES */}
        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>{t('landing.tryTitle')}</h2>
            </div>

            <ol className={styles.tryStepsList}>
              <li className={styles.tryStepItem}>
                <span className={styles.tryStepNumber}>1</span>
                <span>{tryStep1}</span>
              </li>
              <li className={styles.tryStepItem}>
                <span className={styles.tryStepNumber}>2</span>
                <span>{t('landing.tryStep2')}</span>
              </li>
              <li className={styles.tryStepItem}>
                <span className={styles.tryStepNumber}>3</span>
                <span>{t('landing.tryStep3')}</span>
              </li>
            </ol>

            <div className={styles.heroActions}>
              {registrationEnabled ? (
                <>
                  <Link to="/signup" className={styles.ctaPrimary}>
                    {t('landing.createAccount')}
                  </Link>
                  <Link to="/login" className={styles.ctaSecondary}>
                    {t('landing.logIn')}
                  </Link>
                </>
              ) : (
                <Link to="/login" className={styles.ctaPrimary}>
                  {t('landing.logIn')}
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* HONEST LIMITS */}
        <aside className={styles.honestLimitsSection}>
          <div className={styles.container}>
            <p className={styles.honestLimitsText}>{t('landing.honestLimitsText')}</p>
          </div>
        </aside>
      </main>

      <Footer t={t} />
    </div>
  );
}

