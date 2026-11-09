import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import BrandLoadingScreen from '../components/BrandLoadingScreen.jsx';
import { GoogleAuthButton } from '../components/GoogleAuthButton.jsx';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  FloatingInput,
} from '../components/primitives.jsx';
import logoUrl from '../assets/jobenpay-logo.svg';
import styles from './FeaturePages.module.css';

export function SignupPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [website, setWebsite] = useState(''); // Honeypot

  const [loading, setLoading] = useState(false);
  const [bannerError, setBannerError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [registrationEnabled, setRegistrationEnabled] = useState(null);
  const [googleClientId, setGoogleClientId] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.get('/auth/config')
      .then((data) => {
        if (active) {
          setRegistrationEnabled(Boolean(data?.registrationEnabled));
          setGoogleClientId(data?.googleClientId || '');
        }
      })
      .catch(() => {
        if (active) {
          setRegistrationEnabled(false);
        }
      });
    return () => { active = false; };
  }, []);

  const handleGoogleSuccess = async (credential) => {
    setLoading(true);
    setBannerError('');
    setFieldErrors({});
    try {
      await auth.googleLogin({
        credential,
        orgName: orgName.trim() || undefined,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setBannerError(err?.message || t('app.googleAuthFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (auth.user) {
    return <Navigate to="/dashboard" replace />;
  }

  if (registrationEnabled === null) {
    return <BrandLoadingScreen />;
  }

  const validate = () => {
    const errors = {};
    if (!email || !email.includes('@')) {
      errors.email = t('app.actionFailed');
    }
    if (!password || password.length < 12) {
      errors.password = t('app.passwordRules');
    } else {
      const localPart = email.split('@')[0];
      if (password.toLowerCase() === email.toLowerCase() || (localPart && password.toLowerCase() === localPart.toLowerCase())) {
        errors.password = t('app.passwordRules');
      }
    }
    if (!displayName || displayName.trim().length < 2) {
      errors.displayName = t('app.actionFailed');
    }
    if (!orgName || orgName.trim().length < 2) {
      errors.orgName = t('app.actionFailed');
    }
    if (!acceptTerms) {
      errors.acceptTerms = t('app.actionFailed');
    }
    return errors;
  };

  const submit = async (event) => {
    event.preventDefault();
    setBannerError('');
    const validation = validate();
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/auth/register', {
        email: email.trim().toLowerCase(),
        password,
        displayName: displayName.trim(),
        orgName: orgName.trim(),
        acceptTerms: true,
        website,
      });

      navigate('/signup/check-email', { state: { email } });
    } catch (err) {
      const status = err?.status || err?.statusCode;
      if (status === 429 || status === 503 || err?.code === 'RATE_LIMITED' || err?.code === 'SERVICE_UNAVAILABLE') {
        setBannerError(err?.message || t('app.actionFailed'));
      } else {
        setFieldErrors({ form: err?.message || t('app.actionFailed') });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.loginPage}>
      <Card className={styles.loginCard} padding="section">
        <div className={styles.loginHeader}>
          <h1 className={styles.loginTitle}>
            <span>{t('app.signUpFor', 'Sign up for')}</span>
            <Link aria-label={t('app.name')} className={styles.inlineLogoLink} to="/">
              <img alt={t('app.name')} className={styles.inlineLogo} src={logoUrl} />
            </Link>
          </h1>
        </div>

        {!registrationEnabled ? (
          <div className={styles.formStack}>
            <Banner kind="warning" title={t('app.registrationClosed')}>
              {t('app.registrationClosed')}
            </Banner>
            <Link className={styles.loginLink} to="/login">
              {t('app.backToLogin')}
            </Link>
          </div>
        ) : (
          <form className={styles.formStack} onSubmit={submit}>
            {googleClientId ? (
              <>
                <GoogleAuthButton
                  clientId={googleClientId}
                  onError={(err) => setBannerError(err.message)}
                  onSuccess={handleGoogleSuccess}
                  text="signup_with"
                />
                <div className={styles.authDivider}>
                  <span>{t('app.or')}</span>
                </div>
              </>
            ) : null}
            {bannerError ? (
              <Banner kind="error" title={bannerError}>
                {bannerError}
              </Banner>
            ) : null}
            {fieldErrors.form ? (
              <Banner kind="error" title={fieldErrors.form}>
                {fieldErrors.form}
              </Banner>
            ) : null}

            {/* Honeypot field invisible to humans and screen readers */}
            <div aria-hidden="true" className={styles.honeypot}>
              <label htmlFor="website-field">Leave this empty</label>
              <input
                id="website-field"
                name="website"
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                type="text"
                value={website}
              />
            </div>

            <FloatingInput
              autoComplete="email"
              error={fieldErrors.email}
              label={t('app.email')}
              name="email"
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              required
              type="email"
              value={email}
            />

            <FloatingInput
              action={(
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="iconButton"
                  onClick={() => setShowPassword((prev) => !prev)}
                  type="button"
                >
                  {showPassword ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
                </button>
              )}
              autoComplete="new-password"
              error={fieldErrors.password}
              hint={t('app.passwordRules')}
              label={t('app.password')}
              name="password"
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              required
              type={showPassword ? 'text' : 'password'}
              value={password}
            />

            <FloatingInput
              autoComplete="name"
              error={fieldErrors.displayName}
              label={t('app.fullName')}
              name="displayName"
              onChange={(e) => {
                setDisplayName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, displayName: undefined }));
              }}
              required
              type="text"
              value={displayName}
            />

            <FloatingInput
              autoComplete="organization"
              error={fieldErrors.orgName}
              label={t('app.organizationName')}
              name="orgName"
              onChange={(e) => {
                setOrgName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, orgName: undefined }));
              }}
              required
              type="text"
              value={orgName}
            />

            <div>
              <Checkbox
                checked={acceptTerms}
                label={(
                  <span>
                    {t('app.agreeTerms')}{' '}
                    <Link className={styles.loginLink} target="_blank" to="/terms">
                      {t('app.termsOfService')}
                    </Link>{' '}
                    {t('app.and')}{' '}
                    <Link className={styles.loginLink} target="_blank" to="/privacy">
                      {t('app.privacyPolicy')}
                    </Link>
                  </span>
                )}
                name="acceptTerms"
                onChange={(e) => {
                  setAcceptTerms(e.target.checked);
                  setFieldErrors((prev) => ({ ...prev, acceptTerms: undefined }));
                }}
              />
              {fieldErrors.acceptTerms ? (
                <p className={styles.fieldHint} role="alert">
                  {t('app.agreeTerms')} {t('app.termsOfService')}
                </p>
              ) : null}
            </div>

            <Button className={styles.fullWidth} loading={loading} size="lg" type="submit">
              {t('app.createAccount')}
            </Button>
          </form>
        )}

        <p className={styles.paypalDisclaimer}>{t('app.paypalDisclaimer')}</p>
        <Link className={styles.loginLink} to="/login">
          {t('app.backToLogin')}
        </Link>
      </Card>
    </main>
  );
}

export default SignupPage;

