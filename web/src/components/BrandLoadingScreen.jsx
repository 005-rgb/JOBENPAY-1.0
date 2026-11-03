import { useTranslation } from 'react-i18next';

import brandMarkUrl from '../assets/jobenpay-mark.svg';
import wordmarkUrl from '../assets/jobenpay-logo.svg';
import styles from './BrandLoadingScreen.module.css';

export default function BrandLoadingScreen({
  fullScreen = false,
  label,
  message,
}) {
  const { t } = useTranslation();
  const title = label || t('app.loadingWorkspace');
  const detail = message || t('app.loadingWorkspaceHint');

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`${styles.loadingShell} ${fullScreen ? styles.fullScreen : styles.inlineShell}`}
      role="status"
    >
      <div className={styles.loadingPanel}>
        <div className={styles.markStage} aria-hidden="true">
          <span className={styles.markHalo} />
          <span className={styles.markRing} />
          <img alt="" className={styles.mark} src={brandMarkUrl} />
        </div>
        <img alt={t('app.name')} className={styles.wordmark} src={wordmarkUrl} />
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t('app.name')}</p>
          <h1>{title}</h1>
          <p>{detail}</p>
        </div>
        <div className={styles.signalRow} aria-hidden="true">
          <span>{t('app.brandCardSandbox')}</span>
          <span>{t('app.brandCardGoverned')}</span>
          <span>{t('app.brandCardAudit')}</span>
        </div>
        <div className={styles.progressTrack} aria-hidden="true">
          <span className={styles.progressBar} />
        </div>
      </div>
    </div>
  );
}
