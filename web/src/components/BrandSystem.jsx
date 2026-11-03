import styles from './BrandSystem.module.css';

function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}

export function BrandMark({ className = '', title = 'JobenPay' }) {
  return (
    <svg
      aria-hidden={title ? undefined : 'true'}
      aria-label={title || undefined}
      className={joinClasses(styles.mark, className)}
      role="img"
      viewBox="0 0 220 180"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="jp-brand-deep" x1="30" x2="196" y1="12" y2="145" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0a2f9d" />
          <stop offset="1" stopColor="#1565ff" />
        </linearGradient>
        <linearGradient id="jp-brand-cyan" x1="30" x2="172" y1="146" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#21b5ff" />
          <stop offset="1" stopColor="#49d2ff" />
        </linearGradient>
        <linearGradient id="jp-brand-overlay" x1="111" x2="209" y1="53" y2="111" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#07144f" />
          <stop offset="1" stopColor="#0897ff" />
        </linearGradient>
      </defs>
      <path
        d="M72 18C76 7 86 0 98 0h81c23 0 41 18 41 41v32c0 22-18 40-40 40h-42c-11 0-20-9-20-20V67c0-11 9-20 20-20h34c11 0 21 4 28 11V41c0-11-9-20-20-20h-69c-9 0-17 6-19 15l-25 97c-4 16-18 27-34 27H16c-11 0-18-10-15-21l25-97c4-16 18-27 34-27h12Z"
        fill="url(#jp-brand-deep)"
      />
      <path
        d="M107 26c3-13 15-22 28-22h28c11 0 19 10 16 20l-20 78c-4 16-18 27-34 27H15C6 129 0 123 0 115V92c0-10 8-18 18-18h39c11 0 20 9 20 20v14c0 7-2 13-6 18h35c7 0 14-5 16-12l17-66c1-5 5-9 10-12h-25c-8 0-14 5-16 13l-6 23H94l13-46Z"
        fill="url(#jp-brand-cyan)"
      />
      <path
        d="M126 47h44c24 0 44 19 44 43 0 8-2 16-6 23-7 2-14 3-21 3h-49c-11 0-20-9-20-20V67c0-11 9-20 20-20h-12Z"
        fill="url(#jp-brand-overlay)"
        opacity="0.32"
      />
    </svg>
  );
}

export function BrandLogo({
  className = '',
  size = 'md',
  stacked = false,
  showCaption = true,
  showTagline = false,
  caption = 'JPay',
  tagline = 'Precision payout workspace',
  label = 'JOBENPAY',
}) {
  return (
    <div
      aria-label={label}
      className={joinClasses(
        styles.logo,
        styles[`logo${size[0].toUpperCase()}${size.slice(1)}`],
        stacked ? styles.logoStacked : '',
        className,
      )}
      role="img"
    >
      <BrandMark className={styles.logoMark} title="" />
      <div className={styles.logoText}>
        <span aria-hidden="true" className={styles.wordmark}>JobenPay</span>
        {showCaption ? (
          <span aria-hidden="true" className={styles.captionRow}>
            <span className={styles.captionRule} />
            <span className={styles.caption}>{caption}</span>
            <span className={styles.captionRule} />
          </span>
        ) : null}
        {showTagline ? <span className={styles.tagline}>{tagline}</span> : null}
      </div>
    </div>
  );
}

export function BrandSplash({
  title = 'Preparing workspace',
  description = 'Loading your dashboard experience with the latest brand assets.',
  compact = false,
}) {
  return (
    <div className={joinClasses(styles.splash, compact ? styles.splashCompact : '')}>
      <div className={styles.splashGlow} aria-hidden="true" />
      <div className={styles.splashCore}>
        <BrandLogo showTagline size={compact ? 'sm' : 'lg'} stacked />
        <div aria-hidden="true" className={styles.loadingTrack}>
          <span className={styles.loadingBar} />
        </div>
        <div className={styles.splashCopy}>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
}

export function BrandCard({
  className = '',
  eyebrow = 'Brand System',
  title = 'JobenPay identity is now unified across workspace surfaces.',
  description = 'Logo, favicon, splash motion, and dashboard signature work together with a clean transparent finish for a premium experience.',
}) {
  return (
    <section className={joinClasses(styles.brandCard, className)}>
      <div className={styles.brandCardCopy}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <BrandLogo showTagline size="lg" stacked tagline="Clean, elegant, and precise visual identity" />
        <p>{description}</p>
        <div className={styles.brandMeta}>
          <span>Transparent SVG</span>
          <span>Responsive layout</span>
          <span>Motion tuned</span>
        </div>
      </div>
      <div aria-hidden="true" className={styles.brandStage}>
        <div className={styles.orbitRing} />
        <div className={styles.orbitRingSecondary} />
        <div className={styles.brandBadge}>
          <BrandMark className={styles.stageMark} title="" />
          <span>{title}</span>
        </div>
      </div>
    </section>
  );
}
