import { useState } from 'react';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import EnvSwitchDialog from './EnvSwitchDialog.jsx';
import styles from './AppShell.module.css';

/**
 * EnvironmentToggle - Header/Sidebar toggle component that triggers EnvSwitchDialog.
 */
export default function EnvironmentToggle({ className = '', variant = 'header' }) {
  const { isLive, environment } = useEnvironment();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [targetEnv, setTargetEnv] = useState('SANDBOX');

  const handleRequestSwitch = (newEnv) => {
    if (newEnv === environment) return;
    setTargetEnv(newEnv);
    setDialogOpen(true);
  };

  if (variant === 'sidebar') {
    return (
      <>
        <div className={styles.sidebarEnvCard} data-testid="sidebar-env-card">
          <div className={styles.sidebarEnvHeader}>
            <span className={styles.sidebarEnvLabel}>{isLive ? 'MODE: LIVE' : 'MODE: SANDBOX'}</span>
          </div>
          <div className={styles.sidebarEnvGroup} role="group" aria-label="Environment Selection">
            <button
              type="button"
              className={`${styles.sidebarEnvBtn} ${!isLive ? styles.sidebarEnvActiveSandbox : ''}`}
              onClick={() => handleRequestSwitch('SANDBOX')}
              data-testid="sidebar-env-sandbox-btn"
              aria-pressed={!isLive}
            >
              <span className={styles.envDotSandbox} aria-hidden="true" />
              Sandbox
            </button>
            <button
              type="button"
              className={`${styles.sidebarEnvBtn} ${isLive ? styles.sidebarEnvActiveLive : ''}`}
              onClick={() => handleRequestSwitch('LIVE')}
              data-testid="sidebar-env-live-btn"
              aria-pressed={isLive}
            >
              <span className={styles.envDotLive} aria-hidden="true" />
              Live
            </button>
          </div>
        </div>
        <EnvSwitchDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          targetEnv={targetEnv}
        />
      </>
    );
  }

  return (
    <>
      <div
        className={`${styles.environmentSwitcher} ${className}`.trim()}
        data-testid="sandbox-chip"
        role="group"
        aria-label="Environment Mode"
      >
        <button
          type="button"
          className={`${styles.envSwitchOption} ${!isLive ? styles.envSwitchActiveSandbox : styles.envSwitchInactive}`}
          onClick={() => handleRequestSwitch('SANDBOX')}
          data-testid="env-sandbox-btn"
          aria-pressed={!isLive}
          title="Switch to Sandbox testing mode"
        >
          <span className={styles.envDotSandbox} aria-hidden="true" />
          <span>Sandbox</span>
        </button>
        <button
          type="button"
          className={`${styles.envSwitchOption} ${isLive ? styles.envSwitchActiveLive : styles.envSwitchInactive}`}
          onClick={() => handleRequestSwitch('LIVE')}
          data-testid="env-live-btn"
          aria-pressed={isLive}
          title="Switch to Live production mode"
        >
          <span className={styles.envDotLive} aria-hidden="true" />
          <span>Live</span>
        </button>
      </div>
      <EnvSwitchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        targetEnv={targetEnv}
      />
    </>
  );
}
