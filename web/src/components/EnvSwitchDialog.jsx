import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, Info, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import styles from './primitives.module.css';

/**
 * EnvSwitchDialog - Confirmation dialog for switching between SANDBOX and LIVE environments.
 * For LIVE: Requires typing "LIVE" as a strict safety barrier with a red warning theme.
 * For SANDBOX: Provides a clean transition with an informative blue theme.
 */
export default function EnvSwitchDialog({ open, onOpenChange, targetEnv = 'LIVE' }) {
  const queryClient = useQueryClient();
  const [confirmText, setConfirmText] = useState('');
  const isTargetLive = targetEnv === 'LIVE';

  const handleClose = () => {
    setConfirmText('');
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (isTargetLive && confirmText.trim() !== 'LIVE') {
      return;
    }

    try {
      localStorage.setItem('currentEnvironment', targetEnv);
      localStorage.setItem('jobenpay_environment', targetEnv);
    } catch {}

    if (queryClient) {
      queryClient.clear();
    }

    // Hard reload to eliminate state leak between environments
    window.location.href = '/dashboard';
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content
          className={`${styles.dialogContent} ${styles.dialogMd}`}
          style={{
            borderTop: isTargetLive ? '4px solid #dc2626' : '4px solid #2563eb',
          }}
          aria-labelledby="env-switch-title"
          aria-describedby="env-switch-desc"
        >
          <div className={styles.dialogHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isTargetLive ? (
                <AlertTriangle aria-hidden="true" style={{ color: '#dc2626' }} size={24} />
              ) : (
                <Info aria-hidden="true" style={{ color: '#2563eb' }} size={24} />
              )}
              <Dialog.Title id="env-switch-title" style={{ color: isTargetLive ? '#b91c1c' : '#1e40af' }}>
                {isTargetLive ? '⚠️ Switch to LIVE Mode?' : 'Switch to SANDBOX Mode?'}
              </Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className={styles.iconButton}
                onClick={handleClose}
              >
                <X aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>

          <Dialog.Description id="env-switch-desc" className={styles.dialogDescription}>
            {isTargetLive
              ? 'You are about to switch to the LIVE production environment. All transactions will move real money through connected PayPal accounts. Proceed with extreme caution.'
              : 'You are switching to the SANDBOX testing environment. All transactions and funds are simulated.'}
          </Dialog.Description>

          <div className={styles.dialogBody}>
            {isTargetLive ? (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                }}
              >
                <p style={{ color: '#991b1b', fontSize: '0.875rem', marginBottom: '0.75rem', fontWeight: 500 }}>
                  To confirm switching to Live mode, please type <strong>LIVE</strong> below:
                </p>
                <input
                  type="text"
                  placeholder='Type "LIVE" to confirm'
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.75rem',
                    border: '1px solid #f87171',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#111827',
                    background: '#ffffff',
                    outline: 'none',
                  }}
                  autoFocus
                />
              </div>
            ) : null}
          </div>

          <div className={styles.dialogFooter}>
            <button
              type="button"
              className={`${styles.button} ${styles.secondary} ${styles.md}`}
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${styles.button} ${styles.md}`}
              disabled={isTargetLive && confirmText.trim() !== 'LIVE'}
              onClick={handleConfirm}
              style={{
                backgroundColor: isTargetLive ? '#dc2626' : '#2563eb',
                color: '#ffffff',
                border: 'none',
                opacity: isTargetLive && confirmText.trim() !== 'LIVE' ? 0.5 : 1,
                cursor: isTargetLive && confirmText.trim() !== 'LIVE' ? 'not-allowed' : 'pointer',
              }}
            >
              {isTargetLive ? 'I understand, switch to LIVE' : 'Switch to SANDBOX'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
