import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from '../pages/FeaturePages.module.css';

export function GoogleAuthButton({ clientId, onSuccess, onError, text = 'continue_with' }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.getElementById('google-gsi-client');
    if (existingScript) {
      const handleLoad = () => setScriptLoaded(true);
      existingScript.addEventListener('load', handleLoad);
      return () => existingScript.removeEventListener('load', handleLoad);
    }

    const script = document.createElement('script');
    script.id = 'google-gsi-client';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => {
      if (onError) onError(new Error(t('app.googleAuthFailed')));
    };
    document.head.appendChild(script);
  }, [clientId, onError, t]);

  useEffect(() => {
    if (!scriptLoaded || !clientId || !containerRef.current || !window.google?.accounts?.id) {
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response?.credential) {
            onSuccess(response.credential);
          } else if (onError) {
            onError(new Error(t('app.googleAuthFailed')));
          }
        },
      });

      containerRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        type: 'standard',
        shape: 'rectangular',
        text: text || 'continue_with',
        logo_alignment: 'left',
        width: 320,
      });
    } catch (err) {
      if (onError) onError(err);
    }
  }, [scriptLoaded, clientId, onSuccess, onError, text, t]);

  if (!clientId) return null;

  return (
    <div className={styles.googleButtonContainer}>
      <div ref={containerRef} aria-label={t('app.signInWithGoogle')} role="region" />
    </div>
  );
}

export default GoogleAuthButton;

