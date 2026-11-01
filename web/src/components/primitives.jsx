import { createContext, useCallback, useContext, useId, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { AlertCircle, Check, Copy, Info, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import styles from './primitives.module.css';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  ...props
}) {
  return (
    <button
      aria-busy={loading || undefined}
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${loading ? styles.buttonLoading : ''} ${className}`.trim()}
      type={type}
      disabled={loading || disabled}
      {...props}
    >
      {loading ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function TextLink({ children, className = '', ...props }) {
  return <a className={`${styles.textLink} ${className}`.trim()} {...props}>{children}</a>;
}

export function FloatingInput({
  label,
  id,
  error,
  hint,
  className = '',
  ...props
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <div className={`${styles.field} ${className}`.trim()}>
      <div className={`${styles.floatingField} ${error ? styles.fieldError : ''}`}>
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={[hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined}
          placeholder=" "
          {...props}
        />
        <label htmlFor={inputId}>{label}</label>
      </div>
      {hint ? <span className={styles.hint} id={hintId}>{hint}</span> : null}
      {error ? <span className={styles.errorMessage} id={errorId}><AlertCircle aria-hidden="true" />{error}</span> : null}
    </div>
  );
}

export function FloatingSelect({ label, id, children, className = '', ...props }) {
  const generatedId = useId();
  const selectId = id || generatedId;
  return (
    <div className={`${styles.field} ${className}`.trim()}>
      <div className={styles.floatingField}>
        <label className={styles.selectLabel} htmlFor={selectId}>{label}</label>
        <select id={selectId} {...props}>{children}</select>
      </div>
    </div>
  );
}

export function Checkbox({ label, className = '', ...props }) {
  return <label className={`${styles.choice} ${className}`.trim()}><input type="checkbox" {...props} /><span>{label}</span></label>;
}

export function Radio({ label, name, className = '', ...props }) {
  return <label className={`${styles.choice} ${className}`.trim()}><input type="radio" name={name} {...props} /><span>{label}</span></label>;
}

export function Toggle({ label, checked, onCheckedChange, disabled = false, ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      {...props}
    >
      <span />
    </button>
  );
}

export function Card({ children, padding = 'section', className = '', ...props }) {
  return <section className={`${styles.card} ${styles[`card${padding[0].toUpperCase()}${padding.slice(1)}`]} ${className}`.trim()} {...props}>{children}</section>;
}

const STATUS_KIND = {
  EXECUTED: 'success',
  RECONCILED: 'success',
  APPROVED: 'success',
  COMPLETED: 'success',
  PENDING_APPROVAL: 'warning',
  PENDING: 'warning',
  EXECUTING: 'warning',
  EVALUATING: 'warning',
  EXTRACTING: 'warning',
  STARTED: 'warning',
  SENT: 'warning',
  REJECTED: 'error',
  FAILED: 'error',
  MISMATCH: 'error',
  DEAD: 'error',
  EXTRACTION_FAILED: 'error',
  TRUSTED: 'success',
  PENDING_REVIEW: 'warning',
  BLOCKED: 'error',
  EXTRACTED: 'success',
  NEEDS_MANUAL_REVIEW: 'warning',
  RECEIVED: 'neutral',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  DELETED: 'neutral',
};

export function StatusPill({ status, label }) {
  const kind = STATUS_KIND[String(status).toUpperCase()] || 'neutral';
  const Icon = kind === 'success' ? Check : kind === 'warning' ? Info : kind === 'error' ? AlertCircle : Info;
  return <span className={`${styles.statusPill} ${styles[`status${kind[0].toUpperCase()}${kind.slice(1)}`]}`}><Icon aria-hidden="true" />{label || status}</span>;
}

export function Banner({ kind = 'info', title, children, dismissible = false, className = '' }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);
  const Icon = kind === 'error' ? ShieldAlert : kind === 'success' ? Check : Info;
  if (!visible) return null;
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`${styles.banner} ${styles[`banner${kind[0].toUpperCase()}${kind.slice(1)}`]} ${className}`.trim()}>
      <Icon aria-hidden="true" />
      <div><strong>{title}</strong>{children ? <p>{children}</p> : null}</div>
      {dismissible ? <button type="button" aria-label={t('app.dismiss')} onClick={() => setVisible(false)}><X aria-hidden="true" /></button> : null}
    </div>
  );
}

export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md' }) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content className={`${styles.dialogContent} ${styles[`dialog${size[0].toUpperCase()}${size.slice(1)}`]}`} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
          <div className={styles.dialogHeader}>
            <Dialog.Title id={titleId}>{title}</Dialog.Title>
            <Dialog.Close asChild><button type="button" aria-label={t('app.closeDialog')} className={styles.iconButton}><X aria-hidden="true" /></button></Dialog.Close>
          </div>
          {description ? <Dialog.Description id={descriptionId} className={styles.dialogDescription}>{description}</Dialog.Description> : null}
          <div className={styles.dialogBody}>{children}</div>
          {footer ? <div className={styles.dialogFooter}>{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const notify = useCallback(({ message, kind = 'success', action }) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, message, kind, action }]);
    if (!action) {
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 5000);
    }
    return id;
  }, [dismiss]);
  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toastViewport} aria-live="polite" aria-relevant="additions text">
        {toasts.map((toast) => (
          <div className={`${styles.toast} ${toast.kind === 'error' ? styles.toastError : ''}`} key={toast.id} role={toast.kind === 'error' ? 'alert' : 'status'}>
            <span>{toast.message}</span>
            {toast.action ? <button type="button" onClick={toast.action.onClick}>{toast.action.label}</button> : null}
            <button type="button" aria-label={t('app.dismiss')} onClick={() => dismiss(toast.id)}><X aria-hidden="true" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider.');
  return context;
}

export function Tooltip({ content, children }) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content className={styles.tooltipContent} sideOffset={4}>{content}<TooltipPrimitive.Arrow className={styles.tooltipArrow} /></TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function Tabs({ value, onValueChange, items, children }) {
  return (
    <TabsPrimitive.Root className={styles.tabsRoot} value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List className={styles.tabsList}>
        {items.map((item) => <TabsPrimitive.Trigger className={styles.tabsTrigger} value={item.value} key={item.value}>{item.label}</TabsPrimitive.Trigger>)}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function Skeleton({ className = '', ...props }) {
  return <div aria-hidden="true" className={`${styles.skeleton} ${className}`.trim()} {...props} />;
}

export function CodeBlock({ value }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notify({ message: t('components.copied') });
    } catch (error) {
      notify({ message: t('components.copyFailed'), kind: 'error' });
      throw error;
    }
  };
  return <div className={styles.codeBlock}><code>{value}</code><Button variant="icon" aria-label={t('components.copy')} onClick={copy}><Copy aria-hidden="true" /></Button></div>;
}

export function EmptyState({ icon: Icon = Info, title, description, action }) {
  return <div className={styles.emptyState}><span className={styles.emptyIcon}><Icon aria-hidden="true" /></span><h2>{title}</h2><p>{description}</p>{action || null}</div>;
}

export default {
  Banner,
  Button,
  Card,
  Checkbox,
  CodeBlock,
  EmptyState,
  FloatingInput,
  FloatingSelect,
  Modal,
  Radio,
  Skeleton,
  StatusPill,
  Tabs,
  TextLink,
  ToastProvider,
  Toggle,
  Tooltip,
};
