import logoUrl from '../assets/jobenpay-logo.svg';
import styles from './BrandLoadingScreen.module.css';

export function BrandLoadingScreen({
  fullScreen = false,
  label,
  message,
}) {
  const text = label || message || 'Initializing secure workspace...';

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={`${styles.loadingShell} ${fullScreen ? styles.fullScreen : styles.inlineShell}`}
      role="status"
    >
      <div className={styles.loadingContainer}>
        <img
          alt="JOBENPAY"
          className={styles.heartbeatLogo}
          src={logoUrl || '/jobenpay-logo.svg'}
        />
        <p className={styles.loadingText}>{text}</p>
      </div>
    </div>
  );
}

export const WorkspaceLoader = BrandLoadingScreen;
export default BrandLoadingScreen;
