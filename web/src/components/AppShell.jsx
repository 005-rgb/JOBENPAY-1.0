import React, { useEffect, useMemo, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import {
  Activity,
  Bell,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCheck,
  Grid,
  Home,
  Landmark,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  Plus,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../api/client.js';
import {
  Banner,
  Button,
  Modal,
  useToast,
} from './primitives.jsx';
import styles from './AppShell.module.css';

const navigation = [
  { key: 'home', title: 'home', icon: Home, path: '/dashboard' },
  {
    key: 'activity',
    title: 'activity',
    icon: Activity,
    children: [
      { title: 'requests', path: '/requests' },
      { title: 'approvals', path: '/approvals' },
      { title: 'ledger', path: '/ledger' },
      { title: 'audit', path: '/audit' },
    ],
  },
  {
    key: 'payGetPaid',
    title: 'payGetPaid',
    icon: Wallet,
    children: [
      { title: 'payees', path: '/payees' },
      { title: 'documents', path: '/documents' },
      { title: 'disputes', path: '/disputes', comingSoon: true },
    ],
  },
  {
    key: 'agentsMandates',
    title: 'agentsMandates',
    icon: FileCheck,
    children: [
      { title: 'agents', path: '/agents' },
      { title: 'mandates', path: '/mandates' },
      { title: 'simulator', path: '/simulator' },
    ],
  },
  {
    key: 'businessTools',
    title: 'businessTools',
    icon: Grid,
    children: [
      { title: 'organization', path: '/organization' },
      { title: 'members', path: '/members' },
      { title: 'paypalSandbox', path: '/settings/paypal' },
      { title: 'security', path: '/settings/security' },
    ],
  },
];

const creationActions = [
  ['newAgent', '/agents/new'],
  ['newMandate', '/mandates/new'],
  ['newPayee', '/payees/new'],
  ['uploadDocument', '/documents/new'],
  ['proposePayout', '/simulator'],
  ['verifyLedger', '/ledger/verify'],
];

const routeTitles = [
  ['/dashboard', 'pageTitle'],
  ['/agents', 'agents'],
  ['/mandates', 'mandates'],
  ['/payees', 'payees'],
  ['/settings/paypal', 'paypalSandbox'],
  ['/settings/security', 'security'],
  ['/requests', 'requests'],
  ['/approvals', 'approvals'],
  ['/ledger', 'ledger'],
  ['/audit', 'audit'],
  ['/documents', 'documents'],
  ['/disputes', 'disputes'],
  ['/simulator', 'simulator'],
  ['/developer', 'developer'],
];

function isActivePath(pathname, item) {
  if (item.path === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

function SideNavigation({ pathname, t, openGroups, setOpenGroups, onNavigate }) {
  return (
    <nav className={styles.navigation} aria-label={t('app.primaryNavigation')} data-testid="nav-list">
      {navigation.map((item) => {
        const Icon = item.icon;
        const expanded = openGroups[item.key] ?? item.children?.some((child) => isActivePath(pathname, child));
        const active = item.path ? isActivePath(pathname, item) : item.children?.some((child) => isActivePath(pathname, child));

        if (item.path) {
          return (
            <RouterLink
              aria-current={active ? 'page' : undefined}
              className={`${styles.navItem} ${active ? styles.navActive : ''}`}
              data-testid="nav-item"
              key={item.key}
              onClick={onNavigate}
              to={item.path}
            >
              <Icon aria-hidden="true" className={styles.navIcon} strokeWidth={1.5} />
              <span>{t(`app.${item.title}`)}</span>
            </RouterLink>
          );
        }

        return (
          <React.Fragment key={item.key}>
            <button
              aria-expanded={Boolean(expanded)}
              className={`${styles.navItem} ${active ? styles.navActive : ''}`}
              data-testid="nav-item"
              onClick={() => setOpenGroups((current) => ({ ...current, [item.key]: !expanded }))}
              type="button"
            >
              <Icon aria-hidden="true" className={styles.navIcon} strokeWidth={1.5} />
              <span>{t(`app.${item.title}`)}</span>
              <ChevronRight aria-hidden="true" className={`${styles.navChevron} ${expanded ? styles.navChevronOpen : ''}`} strokeWidth={1.5} />
            </button>
            {expanded ? (
              <div className={styles.submenu}>
                {item.children.map((child) => child.comingSoon ? (
                  <span
                    aria-disabled="true"
                    className={`${styles.submenuItem} ${styles.submenuDisabled}`}
                    key={child.path}
                    title={t('app.availableLater')}
                  >
                    <span>{t(`app.${child.title}`)}</span>
                    <span className={styles.comingSoon}>{t('app.comingSoon')}</span>
                  </span>
                ) : (
                  <RouterLink
                    aria-current={isActivePath(pathname, child) ? 'page' : undefined}
                    className={`${styles.submenuItem} ${isActivePath(pathname, child) ? styles.navActive : ''}`}
                    key={child.path}
                    onClick={onNavigate}
                    to={child.path}
                  >
                    {t(`app.${child.title}`)}
                  </RouterLink>
                ))}
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

function CreateMenu({ t }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={styles.createButton} data-testid="create-button" type="button">
          <Plus aria-hidden="true" size={16} strokeWidth={1.5} />
          <span>{t('app.create')}</span>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" className={styles.dropdownContent} side="bottom" sideOffset={8}>
          {creationActions.map(([label, path]) => (
            <DropdownMenu.Item asChild key={path}>
              <RouterLink className={styles.dropdownItem} to={path}>{t(`app.${label}`)}</RouterLink>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NotificationPopover({ t }) {
  const queryClient = useQueryClient();
  const [readError, setReadError] = useState(false);
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiClient.get('/notifications').then((result) => result.notifications),
    refetchInterval: visible ? 15000 : false,
    refetchIntervalInBackground: false,
  });
  const notifications = notificationsQuery.data || [];
  const unreadCount = notifications.filter((notification) => notification.status !== 'READ').length;
  const markRead = async (id) => {
    setReadError(false);
    try {
      await apiClient.post(`/notifications/${id}/read`);
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch {
      setReadError(true);
    }
  };
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button aria-label={t('app.notifications')} className={styles.headerIconButton} data-testid="notification-button" type="button">
          <Bell aria-hidden="true" size={24} strokeWidth={1.5} />
          <span aria-label={t('app.notificationsCount', { count: unreadCount })} className={styles.notificationBadge} data-testid="notification-badge">{unreadCount}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" className={styles.popoverContent} sideOffset={12}>
          <div className={styles.popoverHeader}>
            <strong>{t('app.notifications')}</strong>
            <Popover.Close asChild><button aria-label={t('app.dismiss')} className={styles.smallIconButton} type="button"><X aria-hidden="true" /></button></Popover.Close>
          </div>
          {readError || notificationsQuery.error ? <p className={styles.noNotifications} role="alert">{t('app.actionFailed')}</p> : null}
          {notificationsQuery.isPending ? <p className={styles.noNotifications}>{t('components.loading')}</p> : null}
          {!notificationsQuery.isPending && notifications.length ? (
            <ul className={styles.notificationList}>
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button disabled={notification.status === 'READ'} onClick={() => markRead(notification.id)} type="button">
                    <strong>{notification.payload?.title || notification.kind || t('app.notifications')}</strong>
                    <span>{notification.payload?.message || notification.payload?.body || ''}</span>
                    {notification.status !== 'READ' ? <small>{t('app.notificationRead')}</small> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!notificationsQuery.isPending && !notificationsQuery.error && !notifications.length && !readError ? <p className={styles.noNotifications}>{t('app.noNotifications')}</p> : null}
          <RouterLink className={styles.popoverLink} to="/audit">{t('app.viewAll')}</RouterLink>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function AccountMenu({ t, user, org, csrfToken, onLogout }) {
  const initials = (user?.display_name || user?.email || 'JP')
    .split(/[ .@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button aria-label={`${user?.display_name || 'Account'} account menu`} className={styles.avatar} data-testid="avatar" type="button">
          {initials}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={styles.accountMenu} sideOffset={8}>
          <div className={styles.accountIdentity}>
              <strong>{user?.display_name || user?.email || t('app.name')}</strong>
            {user?.email ? <span>{user.email}</span> : null}
          </div>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Label className={styles.menuLabel}>{t('app.switchOrganization')}</DropdownMenu.Label>
          <DropdownMenu.Item className={styles.menuItem} disabled>
            <Building2 aria-hidden="true" />{org?.name || 'JOBENPAY'}<Check aria-hidden="true" className={styles.menuCheck} />
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Item asChild><RouterLink className={styles.menuItem} to="/settings/security"><LockKeyhole aria-hidden="true" />{t('app.security')}</RouterLink></DropdownMenu.Item>
          <DropdownMenu.Label className={styles.menuLabel}>{t('app.language')}</DropdownMenu.Label>
          <DropdownMenu.Item className={styles.menuItem} disabled><Check aria-hidden="true" />{t('app.english')}</DropdownMenu.Item>
          <DropdownMenu.Item aria-disabled="true" className={`${styles.menuItem} ${styles.menuDisabled}`} disabled>{t('app.indonesian')} · {t('app.comingSoon')}</DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.menuSeparator} />
          <DropdownMenu.Item className={styles.menuItem} onSelect={(event) => {
            event.preventDefault();
            onLogout(csrfToken);
          }}>
            <LogOut aria-hidden="true" />{t('app.logOut')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function FeedbackDialog({ open, onOpenChange, csrfToken, t }) {
  const { notify } = useToast();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/v1/feedback', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': csrfToken || '',
        },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) throw new Error(`Feedback request failed (${response.status}).`);
      setMessage('');
      onOpenChange(false);
      notify({ message: t('app.feedbackSent') });
    } catch {
      notify({ message: t('app.feedbackFailed'), kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      description={t('app.feedbackPrompt')}
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)} type="button">{t('app.cancel')}</Button><Button disabled={!message.trim()} loading={busy} type="submit" form="feedback-form">{t('app.submit')}</Button></>}
      onOpenChange={onOpenChange}
      open={open}
      title={t('app.sendFeedback')}
    >
      <form className={styles.feedbackForm} id="feedback-form" onSubmit={submit}>
        <label htmlFor="feedback-message">{t('app.feedback')}</label>
        <textarea id="feedback-message" maxLength={2000} onChange={(event) => setMessage(event.target.value)} placeholder={t('app.feedbackPlaceholder')} required rows={5} value={message} />
      </form>
    </Modal>
  );
}

function Footer({ t, className = '' }) {
  const firstRowLinks = ['help', 'contact', 'sitemap', 'fees', 'security', 'about', 'developers', 'partners'];
  return (
    <footer className={`${styles.footer} ${className}`.trim()}>
      <div className={styles.footerLinks} data-testid="footer-links">
        <nav aria-label={t('app.footerNavigation')}>
          {firstRowLinks.map((key) => <a href={`#${key}`} key={key}>{t(`app.${key}`)}</a>)}
        </nav>
        <div className={styles.localePickers}><span>{t('app.indonesia')}</span><span>{t('app.english')}</span></div>
      </div>
      <div className={styles.footerDivider} data-testid="footer-divider" />
      <div className={styles.footerCopyright} data-testid="footer-copyright">
        <span>{t('app.copyright')}</span><span aria-hidden="true" className={styles.footerVerticalDivider} /><nav aria-label={t('app.legalNavigation')}>
          <a href="#privacy">{t('app.privacy')}</a><a href="#legal">{t('app.legal')}</a><a href="#policy">{t('app.policyUpdates')}</a>
        </nav>
      </div>
      <p className={styles.footerLegal} data-testid="footer-legal">{t('app.legalNotice')}</p>
    </footer>
  );
}

function Sidebar({ pathname, t, onNavigate }) {
  const [openGroups, setOpenGroups] = useState({});
  return (
    <aside className={styles.sidebar} data-testid="sidebar">
      <RouterLink aria-label={t('app.name')} className={styles.wordmark} data-testid="wordmark" to="/dashboard" onClick={onNavigate}>
        <span>{t('app.name')}</span>
      </RouterLink>
      <CreateMenu t={t} />
      <SideNavigation
        onNavigate={onNavigate}
        openGroups={openGroups}
        pathname={pathname}
        setOpenGroups={setOpenGroups}
        t={t}
      />
    </aside>
  );
}

export default function AppShell({
  user,
  org,
  role,
  frozen = false,
  aiMode = 'live',
  csrfToken,
  children,
  fixture = false,
  pageTitle,
  onLogout: onLogoutProp,
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const routeTitle = useMemo(
    () => routeTitles.find(([route]) => location.pathname.startsWith(route))?.[1] || 'pageTitle',
    [location.pathname],
  );
  const title = pageTitle
    || (location.pathname === '/' || location.pathname === '/dashboard'
      ? user?.display_name || user?.email || t(`app.${routeTitle}`)
      : t(`app.${routeTitle}`));

  const { notify } = useToast();
  const handleLogout = async (token) => {
    try {
      if (onLogoutProp) {
        await onLogoutProp();
        navigate('/login');
        return;
      }
      const response = await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'x-csrf-token': token || '' },
      });
      if (!response.ok) throw new Error(`Logout failed (${response.status}).`);
      navigate('/login');
    } catch {
      notify({ message: t('app.actionFailed'), kind: 'error' });
    }
  };

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className={`${styles.appShell} ${fixture ? styles.parityShell : ''}`}>
      {drawerOpen ? <button aria-label="Close navigation" className={styles.drawerBackdrop} onClick={closeDrawer} type="button" /> : null}
      <div className={`${styles.sidebarFrame} ${drawerOpen ? styles.sidebarOpen : ''}`}>
        <Sidebar onNavigate={closeDrawer} pathname={location.pathname} t={t} />
      </div>
      <div className={styles.mainColumn}>
        <header className={styles.header} data-testid="header">
          <div className={styles.headerStart}>
            <button aria-label="Open navigation" className={styles.mobileMenuButton} onClick={() => setDrawerOpen(true)} type="button">
              <Menu aria-hidden="true" />
            </button>
            <span className={styles.mobileWordmark}>{t('app.name')}</span>
            <div className={styles.headerTitle}>
              <h1 data-testid="page-title">{title}</h1>
              <p>{t('app.organizationRole', { organization: org?.name || t('app.name'), role: role || 'VIEWER' })}</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <span className={styles.sandboxChip} data-testid="sandbox-chip">{t('app.sandbox')}</span>
            <RouterLink aria-label={t('app.developer')} className={styles.headerIconButton} to="/developer">
              <Code2 aria-hidden="true" size={24} strokeWidth={1.5} />
            </RouterLink>
            <NotificationPopover t={t} />
            <span aria-hidden="true" className={styles.headerDivider} data-testid="header-divider" />
            <AccountMenu csrfToken={csrfToken} onLogout={handleLogout} org={org} t={t} user={user} />
          </div>
        </header>
        <main className={styles.mainContent}>
          <div className={styles.globalBanners}>
            {frozen ? <Banner kind="error" title={t('app.killSwitch')}>{t('app.frozenNotice')}</Banner> : null}
            {aiMode === 'replay' ? <Banner className={styles.replayBanner} kind="warning" title={t('app.replayMode')} /> : null}
          </div>
          {children || (
            <div className={styles.emptyRoute}>
              <ShieldCheck aria-hidden="true" />
              <h2>{title}</h2>
              <p>{t('app.pageUnavailable')}</p>
            </div>
          )}
          {!fixture || location.pathname.includes('/s2') ? <Footer className={fixture ? styles.footerFixture : ''} t={t} /> : null}
        </main>
      </div>
      <button aria-label={t('app.feedback')} className={styles.feedbackTab} data-testid="feedback-tab" onClick={() => setFeedbackOpen(true)} type="button">
        {t('app.feedback')}
      </button>
      <FeedbackDialog csrfToken={csrfToken} onOpenChange={setFeedbackOpen} open={feedbackOpen} t={t} />
    </div>
  );
}

export function FixtureMain({ type, t }) {
  if (type === 's2') {
    return (
      <div className={styles.fixtureS2}>
        <section className={styles.fixtureForm} data-testid="content-card">
          <h2>{t('app.newPayee')}</h2>
          <p>{t('app.pageUnavailable')}</p>
          <div className={styles.fixtureFormFields}>
            <label><span>{t('app.newPayee')}</span><input aria-label={t('app.newPayee')} data-testid="floating-input" placeholder=" " /></label>
            <Button data-testid="button-md">{t('app.create')}</Button>
            <Button data-testid="button-lg" size="lg" variant="secondary">{t('app.submit')}</Button>
          </div>
        </section>
      </div>
    );
  }
  return (
    <div className={styles.fixtureS1}>
      <section className={styles.budgetHeader}>
        <div><p>{t('app.remainingBudget')}</p><strong>USD 50.00</strong></div>
        <Button size="md" variant="secondary">{t('app.manageMandates')} <ChevronDown aria-hidden="true" /></Button>
      </section>
      <section aria-label={t('app.setupCards')} className={styles.setupCards}>
        <article className={styles.setupCard} data-testid="setup-card">
          <Mail aria-hidden="true" />
          <RouterLink to="/settings/paypal">{t('app.connectPaypal')}</RouterLink>
          <p>{t('app.connectSandboxDescription')}</p>
        </article>
        <article className={styles.setupCard} data-testid="setup-card"><Users aria-hidden="true" /><RouterLink to="/agents">{t('app.createAgent')}</RouterLink><p>{t('app.createAgentDescription')}</p></article>
        <article className={styles.setupCard} data-testid="setup-card"><ScrollText aria-hidden="true" /><RouterLink to="/mandates">{t('app.activateMandate')}</RouterLink><p>{t('app.activateMandateDescription')}</p></article>
      </section>
      <section aria-label={t('app.quickAccess')} className={styles.quickSection}>
        <h2>{t('app.quickAccess')}</h2>
        <div className={styles.quickItems}>
          {[
            ['agents', Users],
            ['mandates', FileCheck],
            ['simulator', Landmark],
            ['approvals', Check],
            ['payees', Wallet],
            ['ledger', ScrollText],
            ['verifyLedger', ShieldCheck],
          ].map(([label, Icon]) => (
            <RouterLink className={styles.quickItem} data-testid="quick-access-item" key={label} to={`/${label === 'verifyLedger' ? 'ledger/verify' : label}`}>
              <span className={styles.quickCircle} data-testid="quick-access-circle"><Icon aria-hidden="true" strokeWidth={1.5} /></span>
              <span>{t(`app.${label}`)}</span>
            </RouterLink>
          ))}
        </div>
      </section>
      <CardFixture t={t} />
      <div className={styles.fixtureMeasurement} aria-hidden="true">
        <div data-testid="table-row" />
      </div>
      <div className={styles.fixtureControls}>
        <label className={styles.fixtureInputLabel} htmlFor="parity-input">{t('app.newPayee')}</label>
        <input aria-label={t('app.newPayee')} data-testid="floating-input" id="parity-input" placeholder=" " />
        <Button data-testid="button-md">{t('app.create')}</Button>
        <Button data-testid="button-lg" size="lg" variant="secondary">{t('app.submit')}</Button>
      </div>
    </div>
  );
}

function CardFixture({ t }) {
  return (
    <section className={styles.fixturePerformance}>
      <div className={styles.performanceHeader}><h2>{t('app.agentPerformance')}</h2><span>{t('app.comparisonCaption')}</span></div>
      <article className={styles.performanceCard} data-testid="content-card"><h3>{t('app.requests')}</h3><strong>0</strong><span>—</span></article>
    </section>
  );
}
