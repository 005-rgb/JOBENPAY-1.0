import logoFull from '../assets/jobenpay-logo.svg';
import logoMark from '../assets/jobenpay-mark.svg';
import styles from './BrandKit.module.css';

export function BrandLogo({
  variant = 'full',
  size = 'md',
  className = '',
  alt = 'JOBENPAY',
}) {
  const src = variant === 'mark' ? logoMark : logoFull;
  const resolvedAlt = alt || (variant === 'mark' ? 'JOBENPAY mark' : 'JOBENPAY logo');

  return (
    <img
      alt={resolvedAlt}
      className={`${styles.logo} ${styles[variant]} ${styles[size]} ${className}`.trim()}
      src={src}
    />
  );
}

export function BrandSplash({
  className = '',
  compact = false,
  message = 'Loading workspace',
}) {
  return (
    <div className={`${styles.splash} ${compact ? styles.splashCompact : ''} ${className}`.trim()} role="status">
      <div className={styles.splashHalo} aria-hidden="true" />
      <div className={styles.splashOrb} aria-hidden="true">
        <BrandLogo alt="" className={styles.splashMark} size="sm" variant="mark" />
      </div>
      <BrandLogo alt="JOBENPAY logo" className={styles.splashWordmark} size={compact ? 'sm' : 'md'} variant="full" />
      <p>{message}</p>
    </div>
  );
}
