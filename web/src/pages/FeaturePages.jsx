import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDollarSign,
  Database,
  Ellipsis,
  FileCheck,
  Minus,
  Pencil,
  Plus,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { GoogleAuthButton } from '../components/GoogleAuthButton.jsx';
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useEnvironment } from '../context/EnvironmentContext.jsx';
import BrandLoadingScreen from '../components/BrandLoadingScreen.jsx';
import StepUpDialog from '../components/StepUpDialog.jsx';
import {
  Banner,
  Button,
  Card,
  CodeBlock,
  EmptyState,
  FloatingInput,
  FloatingSelect,
  Modal,
  StatusPill,
  useToast,
} from '../components/primitives.jsx';
import logoUrl from '../assets/jobenpay-logo.svg';
import brandMarkUrl from '../assets/jobenpay-mark.svg';
import styles from './FeaturePages.module.css';

function usePageQuery(queryKey, queryFn, { active = false } = {}) {
  const { environment } = useEnvironment();
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  const enrichedKey = Array.isArray(queryKey) ? [...queryKey, environment] : [queryKey, environment];
  return useQuery({
    queryKey: enrichedKey,
    queryFn,
    refetchInterval: visible ? (active ? 3000 : 15000) : false,
    refetchIntervalInBackground: false,
  });
}

function LoadingState() {
  return <BrandLoadingScreen />;
}

function PageError({ error, onRetry }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      description={error?.message || t('app.actionFailed')}
      title={t('components.error')}
      action={<Button onClick={onRetry}>{t('app.retry')}</Button>}
    />
  );
}

export function LoginPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState('');
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.get('/auth/config')
      .then((cfg) => {
        if (active) {
          setRegistrationEnabled(Boolean(cfg?.registrationEnabled));
          setGoogleClientId(cfg?.googleClientId || '');
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const handleGoogleSuccess = async (credential) => {
    setLoading(true);
    setError('');
    setUnverified(false);
    try {
      await auth.googleLogin({ credential });
      const returnTo = location.state?.from?.pathname || '/dashboard';
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err?.message || t('app.googleAuthFailed'));
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setUnverified(false);
    setResendNotice('');
    try {
      await auth.login({ email, password });
      const returnTo = location.state?.from?.pathname || '/dashboard';
      navigate(returnTo, { replace: true });
    } catch (loginError) {
      if (loginError.code === 'EMAIL_NOT_VERIFIED' || loginError.message === 'Email not verified.') {
        setUnverified(true);
      } else {
        setError(loginError.code === 'UNAUTHENTICATED' ? t('app.loginError') : loginError.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email || resending) return;
    setResending(true);
    setResendNotice('');
    try {
      await apiClient.post('/auth/resend-verification', { email });
      setResendNotice(t('app.resendSuccess'));
    } catch {
      setResendNotice(t('app.resendSuccess'));
    } finally {
      setResending(false);
    }
  };

  if (auth.user) return <Navigate to="/dashboard" replace />;
  return (
    <main className={styles.loginPage}>
      <Card className={styles.loginCard} padding="section">
        <div className={styles.loginHeader}>
          <h1 className={styles.loginTitle}>
            <span>{t('app.signInTo', 'Sign in to')}</span>
            <Link aria-label={t('app.name')} className={styles.inlineLogoLink} to="/">
              <img alt={t('app.name')} className={styles.inlineLogo} src={logoUrl} />
            </Link>
          </h1>
        </div>

        {unverified ? (
          <Banner kind="warning" title={t('app.emailNotVerified')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--jp-space-2)' }}>
              <span>{t('app.emailNotVerified')}</span>
              {resendNotice ? (
                <span style={{ fontWeight: 'bold' }}>{resendNotice}</span>
              ) : (
                <Button
                  loading={resending}
                  onClick={handleResend}
                  size="sm"
                  variant="secondary"
                >
                  {t('app.resendVerification')}
                </Button>
              )}
            </div>
          </Banner>
        ) : null}

        {googleClientId ? (
          <div className={styles.formStack}>
            <GoogleAuthButton
              clientId={googleClientId}
              onError={(err) => setError(err.message)}
              onSuccess={handleGoogleSuccess}
              text="signin_with"
            />
            <div className={styles.authDivider}>
              <span>{t('app.or')}</span>
            </div>
          </div>
        ) : null}
        <form className={styles.formStack} onSubmit={submit}>
          <FloatingInput autoComplete="username" label={t('app.email')} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <FloatingInput autoComplete="current-password" error={error} label={t('app.password')} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <Button className={styles.fullWidth} loading={loading} size="lg" type="submit">{t('app.login')}</Button>
          {registrationEnabled ? (
            <Link className={styles.loginLink} to="/signup">{t('app.createAccount')}</Link>
          ) : null}
        </form>
        {import.meta.env.VITE_SHOW_DEMO_HINT === '1' ? <p className={styles.demoHint}>{t('app.demoAccountsHint')}</p> : null}
        <p className={styles.paypalDisclaimer}>{t('app.paypalDisclaimer')}</p>
        <Link className={styles.loginLink} to="/terms">{t('app.help')}</Link>
      </Card>
    </main>
  );
}

function Sparkline() {
  return (
    <svg aria-hidden="true" className={styles.sparkline} viewBox="0 0 120 32">
      <path d="M1 24 L20 24 L40 24 L60 24 L80 24 L100 24 L119 24" fill="none" stroke="var(--jp-blue)" strokeWidth="1.5" />
    </svg>
  );
}

function formatMinor(minor, currency) {
  const amount = BigInt(minor || '0');
  const value = Number(amount);
  if (!Number.isSafeInteger(value)) throw new Error('The amount exceeds the supported display range.');
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value / 100);
}

function payeeKindKey(kind, isLive = false) {
  if (kind === 'PAYPAL_ID') {
    return isLive ? 'paypalIdKindLive' : 'paypalIdKind';
  }
  return `${String(kind).toLowerCase()}Kind`;
}

function MetricCard({ label, value, hasData, t }) {
  return (
    <Card className={styles.metricCard} padding="section">
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
      <span className={styles.metricDelta}>
        <Minus aria-hidden="true" />
        {hasData ? t('app.noComparison') : t('app.noData')}
      </span>
      {hasData ? <Sparkline /> : null}
    </Card>
  );
}

function QueueMetricCard({ label, value }) {
  return (
    <Card className={styles.metricCard} padding="section">
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </Card>
  );
}

function BrandCard({ auth, data, setupCards, t, isLive }) {
  const completedSetupCount = setupCards.filter((card) => card.done).length;
  const orgName = auth.org?.name || t('app.name');
  const roleName = auth.role || 'VIEWER';

  return (
    <Card className={styles.brandCard} padding="section">
      <div className={styles.brandCardGrid}>
        <div className={styles.fintechCardWrapper}>
          <div className={styles.fintechCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardChipBlock}>
                <div className={styles.emvChip} aria-hidden="true" />
                <svg className={styles.contactlessWave} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M8.5 16.5a5 5 0 0 1 0-7M12 18.5a8.5 8.5 0 0 0 0-13M15.5 20.5a12 12 0 0 0 0-17" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <img src={logoUrl} alt="JobenPay" className={styles.cardBrandLogo} />
            </div>

            <div className={styles.cardWatermark} aria-hidden="true">
              <img src={brandMarkUrl} alt="" className={styles.cardWatermarkImg} />
            </div>

            <div className={styles.cardNumber}>
              <span>••••</span>
              <span>••••</span>
              <span>••••</span>
              <strong>8842</strong>
            </div>

            <div className={styles.cardFooter}>
              <div className={styles.cardInfo}>
                <span className={styles.cardLabel}>{t('app.brandCardRole')}</span>
                <span className={styles.cardHolderName}>{orgName}</span>
              </div>
              <div className={styles.cardInfo}>
                <span className={styles.cardLabel}>VALID THRU</span>
                <span className={styles.cardExpiry}>12/29</span>
              </div>
              <div className={styles.cardTierBadge}>
                <span>PLATINUM</span>
              </div>
            </div>

            <div className={styles.cardSheen} aria-hidden="true" />
          </div>
        </div>

        <div className={styles.brandCardContent}>
          <div className={styles.brandCopy}>
            <div className={styles.brandHeaderRow}>
              <div className={styles.brandMarkMiniWrap} aria-hidden="true">
                <span className={styles.brandGlowMini} />
                <img alt="" className={styles.brandMarkMini} src={brandMarkUrl} />
              </div>
              <div>
                <p className={styles.brandEyebrow}>{t('app.brandCardEyebrow')}</p>
                <h2>{t('app.brandCardTitle')}</h2>
              </div>
            </div>
            <p className={styles.brandDescription}>
              {isLive
                ? 'JOBENPAY brings live production control, mandate governance, and audit-ready workflows into one calm operating surface.'
                : t('app.brandCardDescription')}
            </p>
            <div className={styles.brandSignals}>
              <span className={styles.signalBadge}>
                <span className={styles.signalDot} />
                {isLive ? 'Live production' : t('app.brandCardSandbox')}
              </span>
              <span className={styles.signalBadge}>
                <span className={styles.signalDot} />
                {t('app.brandCardGoverned')}
              </span>
              <span className={styles.signalBadge}>
                <span className={styles.signalDot} />
                {t('app.brandCardAudit')}
              </span>
            </div>
          </div>

          <div className={styles.brandStats}>
            <div className={styles.brandStat}>
              <span>{t('app.brandCardBudget')}</span>
              <strong>{formatMinor(data.remainingBudgetMinor, data.currency)}</strong>
              <small>{data.budgetUsedPct}% {t('app.budgetUsed')}</small>
            </div>
            <div className={styles.brandStat}>
              <span>{t('app.brandCardReadiness')}</span>
              <strong>{t('app.brandCardReadinessValue', { count: completedSetupCount, total: setupCards.length })}</strong>
              <small className={completedSetupCount === setupCards.length ? styles.readyStatus : styles.progressStatus}>
                {completedSetupCount === setupCards.length ? t('app.brandCardReady') : t('app.brandCardInProgress')}
              </small>
            </div>
            <div className={styles.brandStat}>
              <span>{t('app.brandCardRole')}</span>
              <strong>{orgName}</strong>
              <small className={styles.roleTag}>{roleName}</small>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const navigate = useNavigate();
  const { environment, isLive } = useEnvironment();
  const { notify } = useToast();
  const [seeding, setSeeding] = useState(false);

  const summaryQuery = usePageQuery(
    ['dashboard', 'summary', environment],
    () => apiClient.get(`/dashboard/summary?environment=${encodeURIComponent(environment)}`, {
      headers: {
        'x-jobenpay-environment': environment,
        'x-environment': environment,
      },
    })
  );
  const { data, error, isPending, refetch } = summaryQuery;

  const handleSeedSandbox = async () => {
    setSeeding(true);
    try {
      const res = await apiClient.post('/sandbox/seed', {});
      notify({ message: `Sandbox seeded with ${res.seededCount || 0} scrubbed test transactions` });
      refetch();
    } catch (err) {
      notify({ message: err.message || 'Failed to seed Sandbox data', kind: 'error' });
    } finally {
      setSeeding(false);
    }
  };

  if (isPending) return <LoadingState />;
  if (error || !data) return <PageError error={error} onRetry={refetch} />;

  const metrics = [
    [t('app.requestsMetric'), data.counts.requests],
    [t('app.autoApproved'), data.counts.autoApproved],
    [t('app.heldForApproval'), data.counts.held],
    [t('app.blocked'), data.counts.blocked],
    [t('app.reconciled'), data.counts.reconciled],
    [t('app.budgetUsed'), `${data.budgetUsedPct}%`],
  ];
  const hasData = data.counts.requests > 0;
  const setupCards = [
    {
      key: 'paypal',
      title: isLive ? 'Connect PayPal Live' : 'Connect PayPal Sandbox',
      description: isLive
        ? 'Connect a live PayPal production account to execute real transactions.'
        : t('app.connectSandboxDescription'),
      to: '/settings/paypal',
      done: Boolean(data?.isPaypalConnected ?? data?.paypalConnected),
    },
    {
      key: 'agent',
      title: isLive ? 'Create an agent in Live' : t('app.createAgent'),
      description: isLive
        ? 'Create an agent for live operation before assigning a mandate.'
        : t('app.createAgentDescription'),
      to: '/agents',
      done: Boolean(data?.hasAgent),
    },
    {
      key: 'mandate',
      title: isLive ? 'Activate a mandate in Live' : t('app.activateMandate'),
      description: isLive
        ? 'Set guarded limits before a live agent can propose a transaction.'
        : t('app.activateMandateDescription'),
      to: '/mandates',
      done: Boolean(data?.hasActiveMandate),
    },
  ];
  const quickLinks = [
    ['transactions', '/transactions'],
    ['agents', '/agents'],
    ['mandates', '/mandates'],
    ['proposePayout', '/simulator', 'proposePayoutShort'],
    ['approvals', '/approvals'],
    ['payees', '/payees'],
    ['ledger', '/ledger'],
    ['verifyLedger', '/ledger/verify'],
  ];

  return (
    <div className={styles.dashboard}>
      <section className={styles.budgetHeader}>
        <div>
          <p>{t('app.dashboardBudget')}</p>
          <strong>{formatMinor(data.remainingBudgetMinor, data.currency)}</strong>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {!isLive && (
            <Button
              onClick={handleSeedSandbox}
              loading={seeding}
              variant="secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Seed Sandbox with scrubbed test transactions"
              data-testid="seed-sandbox-btn"
            >
              <Database size={16} />
              Seed Sandbox Data
            </Button>
          )}
          <Button className={styles.budgetAction} onClick={() => navigate('/mandates')} variant="secondary">
            {t('app.manageMandates')} <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      </section>
      <BrandCard auth={auth} data={data} setupCards={setupCards} t={t} isLive={isLive} />
      {['OWNER', 'ADMIN', 'JUDGE'].includes(auth.role) && data.aiDailyUsage?.warning ? (
        <Banner title="AI daily budget warning">
          AI usage is at {data.aiDailyUsage.usedPct}% of the daily budget ({data.aiDailyUsage.usedUsd.toFixed(2)} of {data.aiDailyUsage.budgetUsd.toFixed(2)} USD).
        </Banner>
      ) : null}

      <section aria-label={t('app.setupCards')} className={styles.setupCards}>
        {setupCards.map((card) => (
          card.done ? (
            <Card className={`${styles.setupCard} ${styles.setupComplete}`} key={card.key} padding="tile">
              <span className={styles.completedText}><Check aria-hidden="true" />{card.title}</span>
            </Card>
          ) : (
            <Card className={styles.setupCard} key={card.key} padding="tile">
              <div className={styles.setupCardTop}>
                <span aria-hidden="true" className={styles.setupIcon}><Circle size={14} className={styles.emptyDot} /></span>
                <button
                  aria-label={`${card.title} ${t('app.actions')}`}
                  className={styles.iconAction}
                  type="button"
                  onClick={() => navigate(card.to)}
                >
                  <ChevronRight />
                </button>
              </div>
              <Link to={card.to}>{card.title}</Link>
              <p>{card.description}</p>
            </Card>
          )
        ))}
      </section>

      <section className={styles.quickSection}>
        <div className={styles.sectionHeading}>
          <h2>{t('app.quickAccess')}</h2>
          <button
            aria-label={t('app.editQuickAccess')}
            className={styles.iconAction}
            type="button"
            onClick={() => notify({
              title: 'Quick Access',
              message: 'Quick access items are automatically synchronized based on your frequently accessed operational modules.',
              kind: 'info',
            })}
          >
            <Pencil aria-hidden="true" />
          </button>
        </div>
        <div className={styles.quickItems}>
          {quickLinks.map(([key, to, labelKey = key]) => (
            <Link className={styles.quickItem} key={key} to={to}>
              <span className={styles.quickCircle}><QuickIcon name={key} /></span>
              <span>{t(`app.${labelKey}`)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.performance}>
        <div className={styles.performanceHeading}>
          <div>
            <h2>{t('app.agentPerformance')}</h2>
            <p>{t('app.comparisonCaption')}</p>
          </div>
          <Link to="/requests">{t('app.viewMore')}</Link>
        </div>
        <div className={styles.metricsGrid}>
          {metrics.map(([label, value]) => <MetricCard hasData={hasData} key={label} label={label} t={t} value={value} />)}
        </div>
        {!hasData ? <EmptyState title={t('app.noData')} description={t('app.noPerformanceData')} /> : null}
      </section>

      <section className={styles.performance} aria-label="Recent Transactions">
        <div className={styles.performanceHeading}>
          <div>
            <h2>Recent Activity ({isLive ? 'LIVE' : 'SANDBOX'})</h2>
            <p>{isLive ? 'Latest real production transactions' : 'Latest simulated sandbox transactions'}</p>
          </div>
          <Link to="/transactions">{t('app.viewMore')}</Link>
        </div>
        {data.recentTransactions && data.recentTransactions.length > 0 ? (
          <Card className={styles.tableCard} padding="none">
            <table className={styles.dataTable} data-testid="dashboard-recent-txs-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Sub-type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <Link to={`/transactions/${tx.id}`} style={{ fontWeight: 600 }}>
                        {tx.category}
                      </Link>
                    </td>
                    <td><span className={styles.cellDescription}>{tx.sub_type}</span></td>
                    <td>{formatMinor(tx.amount_minor, tx.currency)}</td>
                    <td>
                      <StatusPill status={tx.status} label={tx.status} />
                    </td>
                    <td>{new Date(tx.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <EmptyState
            title="No Recent Activity"
            description={isLive ? 'No live transactions recorded yet in production.' : 'No sandbox transactions recorded yet. Use Seed Sandbox Data to create test transactions.'}
          />
        )}
      </section>

      {data.queue ? (
        <section aria-label={t('app.queueMetrics')} className={styles.performance}>
          <div className={styles.performanceHeading}>
            <h2>{t('app.queueMetrics')}</h2>
          </div>
          <div className={styles.metricsGrid}>
            <QueueMetricCard label={t('app.queueDepth')} value={data.queue.depth} />
            <QueueMetricCard label={t('app.deadJobs')} value={data.queue.dead} />
            <QueueMetricCard
              label={t('app.oldestWebhook')}
              value={data.queue.oldestUnprocessedWebhookAgeSeconds == null
                ? '-'
                : `${data.queue.oldestUnprocessedWebhookAgeSeconds}s`}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QuickIcon({ name }) {
  const icons = {
    transactions: CircleDollarSign,
    newTransaction: Plus,
    agents: Users,
    mandates: FileCheck,
    proposePayout: CircleDollarSign,
    approvals: Check,
    payees: Wallet,
    ledger: ScrollText,
    verifyLedger: ShieldCheck,
  };
  const Icon = icons[name] || CircleDollarSign;
  return <Icon aria-hidden="true" className={styles.quickIcon} strokeWidth={1.5} />;
}

export function ComingSoonPage() {
  const { t } = useTranslation();
  return <EmptyState title={t('app.comingSoonTitle')} description={t('app.comingSoonDescription')} />;
}

export function AgentsPage({ initialCreate = false }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(initialCreate);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState(0);
  const location = useLocation();
  useEffect(() => {
    if (initialCreate) setCreateOpen(true);
  }, [initialCreate, location.pathname]);
  const agentsQuery = usePageQuery(['agents'], async () => (await apiClient.get('/agents')).agents, { active: true });
  const createMutation = useMutation({
    mutationFn: () => apiClient.post('/agents', { name, description }),
    onSuccess: async ({ agent }) => {
      await queryClient.invalidateQueries({ queryKey: ['agents'] });
      setCreateOpen(false);
      setName('');
      setDescription('');
      navigate(`/agents/${agent.id}`);
    },
  });
  const rows = agentsQuery.data || [];
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageToolbar}>
        <span>{t('app.agents')}</span>
        <Button onClick={() => setCreateOpen(true)}><Plus aria-hidden="true" />{t('app.newAgent')}</Button>
      </div>
      {agentsQuery.isPending ? <LoadingState /> : agentsQuery.error ? <PageError error={agentsQuery.error} onRetry={agentsQuery.refetch} /> : rows.length === 0 ? (
        <EmptyState title={t('app.agents')} description={t('app.noAgents')} action={<Button onClick={() => setCreateOpen(true)}>{t('app.newAgent')}</Button>} />
      ) : (
        <Card className={styles.tableCard} padding="none">
          <table className={styles.dataTable}>
            <thead><tr><th>{t('app.agentName')}</th><th>{t('app.active')}</th><th>{t('app.createdAt')}</th><th>{t('app.actions')}</th></tr></thead>
            <tbody>{pageRows.map((agent) => (
              <tr key={agent.id}>
                <td><Link to={`/agents/${agent.id}`}>{agent.name}</Link><span className={styles.cellDescription}>{agent.description}</span></td>
                <td><StatusPill status={agent.status} label={t(`app.${agent.status.toLowerCase()}`)} /></td>
                <td>{new Date(agent.created_at).toLocaleDateString()}</td>
                <td><Link className={styles.rowAction} to={`/agents/${agent.id}`}>{t('app.viewMore')}</Link></td>
              </tr>
            ))}</tbody>
          </table>
          <Pagination page={page} pages={pages} onPage={setPage} />
        </Card>
      )}
      <Modal
        footer={<><Button onClick={() => setCreateOpen(false)} variant="secondary">{t('app.cancel')}</Button><Button disabled={!name.trim()} form="create-agent-form" loading={createMutation.isPending} type="submit">{t('app.create')}</Button></>}
        onOpenChange={setCreateOpen}
        open={createOpen}
        title={t('app.newAgent')}
      >
        <form className={styles.formStack} id="create-agent-form" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
          <FloatingInput label={t('app.agentName')} onChange={(event) => setName(event.target.value)} required value={name} />
          <FloatingInput label={t('app.description')} onChange={(event) => setDescription(event.target.value)} value={description} />
          {createMutation.error ? <p className={styles.formError}>{createMutation.error.message}</p> : null}
        </form>
      </Modal>
    </div>
  );
}

function Pagination({ page, pages, onPage }) {
  const { t } = useTranslation();
  return (
    <div className={styles.pagination}>
      <Button disabled={page === 0} onClick={() => onPage(page - 1)} variant="secondary"><ChevronLeft aria-hidden="true" />{t('app.previous')}</Button>
      <span>{t('app.pageOf', { page: page + 1, pages })}</span>
      <Button disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} variant="secondary">{t('app.next')}<ChevronRight aria-hidden="true" /></Button>
    </div>
  );
}

export function AgentDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [createdKey, setCreatedKey] = useState('');
  const [stepUp, setStepUp] = useState('');
  const [pendingAction, setPendingAction] = useState(null);
  const [updateError, setUpdateError] = useState('');
  const query = usePageQuery(['agents', id], () => apiClient.get(`/agents/${id}`));
  const agent = query.data?.agent;
  const keys = query.data?.keys || [];
  const keyMutation = useMutation({
    mutationFn: () => apiClient.post(`/agents/${id}/keys`),
    onSuccess: async (result) => {
      setCreatedKey(result.apiKey);
      await queryClient.invalidateQueries({ queryKey: ['agents', id] });
    },
  });
  const finishStepUp = async (grantId) => {
    await pendingAction(grantId);
    setPendingAction(null);
    setStepUp('');
    await queryClient.invalidateQueries({ queryKey: ['agents', id] });
  };
  const requireStepUp = (action) => {
    setPendingAction(() => action);
    setStepUp('ROTATE_CREDENTIALS');
  };

  if (query.isPending) return <LoadingState />;
  if (query.error || !agent) return <PageError error={query.error} onRetry={query.refetch} />;

  return (
    <div className={styles.pageStack}>
      <Card className={styles.formCard} padding="form">
        <div className={styles.cardHeading}><div><h2>{agent.name}</h2><p>{agent.description}</p></div><StatusPill status={agent.status} label={t(`app.${agent.status.toLowerCase()}`)} /></div>
        <form className={styles.formStack} onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setUpdateError('');
          try {
            await apiClient.patch(`/agents/${id}`, { name: form.get('name'), description: form.get('description') });
            await queryClient.invalidateQueries({ queryKey: ['agents', id] });
          } catch (error) {
            setUpdateError(error.message);
          }
        }}>
          <FloatingInput defaultValue={agent.name} label={t('app.agentName')} name="name" required />
          <FloatingInput defaultValue={agent.description || ''} label={t('app.description')} name="description" />
          {updateError ? <p className={styles.formError} role="alert">{updateError}</p> : null}
          <Button className={styles.alignStart} type="submit">{t('app.save')}</Button>
        </form>
      </Card>
      <Card className={styles.formCard} padding="form">
        <div className={styles.cardHeading}><h2>{t('app.apiKeys')}</h2><Button onClick={() => keyMutation.mutate()} loading={keyMutation.isPending}>{t('app.createApiKey')}</Button></div>
        {keyMutation.error ? <p className={styles.formError}>{keyMutation.error.message}</p> : null}
        {createdKey ? <div className={styles.oneTimeKey}><Banner kind="warning" title={t('app.createdKey')}>{t('app.keyCreatedWarning')}</Banner><CodeBlock value={createdKey} /></div> : null}
        {keys.length ? (
          <div className={styles.keyList}>
            {keys.map((key) => (
              <div className={styles.keyRow} key={key.id}>
                <div><code>{key.prefix}••••••</code><span>{t('app.lastUsed')}: {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : t('app.noData')}</span></div>
                {key.revoked_at ? <StatusPill status="REVOKED" label={t('app.revoked')} /> : (
                  <Button onClick={() => requireStepUp((grantId) => apiClient.post(`/agents/${id}/keys/${key.id}/revoke`, {}, { stepUpGrant: grantId }))} variant="secondary">{t('app.revoke')}</Button>
                )}
              </div>
            ))}
          </div>
        ) : <EmptyState title={t('app.apiKeys')} description={t('app.noKeys')} />}
        <Button onClick={() => requireStepUp(async (grantId) => {
          const result = await apiClient.post(`/agents/${id}/keys/rotate`, {}, { stepUpGrant: grantId });
          setCreatedKey(result.apiKey);
        })} variant="secondary">{t('app.rotateApiKey')}</Button>
      </Card>
      <StepUpDialog onConfirm={finishStepUp} onOpenChange={(open) => { if (!open) { setStepUp(''); setPendingAction(null); } }} open={Boolean(stepUp)} purpose={stepUp} />
    </div>
  );
}

export function PayeesPage({ initialCreate = false }) {
  const { t } = useTranslation();
  const { isLive } = useEnvironment();
  const auth = useAuth();
  const canWrite = ['OWNER', 'ADMIN', 'OPERATOR', 'JUDGE'].includes(auth.role);
  const canTrust = ['OWNER', 'ADMIN', 'JUDGE'].includes(auth.role);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(initialCreate && canWrite);
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(0);
  const [trustTarget, setTrustTarget] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [formError, setFormError] = useState('');
  const location = useLocation();
  useEffect(() => {
    if (initialCreate && canWrite) setDialogOpen(true);
    if (!canWrite) setDialogOpen(false);
  }, [canWrite, initialCreate, location.pathname]);
  const payeesQuery = usePageQuery(['payees'], async () => (await apiClient.get('/payees')).payees, { active: true });
  const rows = payeesQuery.data || [];
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  const closeForm = () => {
    setDialogOpen(false);
    setEditing(null);
  };
  const savePayee = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get('displayName') || '').trim();
    const identifier = String(form.get('identifier') || '').trim();
    const kind = String(form.get('kind') || 'EMAIL');
    if (editing && kind !== editing.kind && !identifier) {
      setFormError(t('app.identifierRequiredForTypeChange'));
      return;
    }
    const body = { displayName };
    if (!editing || identifier) {
      body.kind = kind;
      body.identifier = identifier;
    }
    if (!editing && !identifier) return;
    setFormError('');
    try {
      await apiClient[editing ? 'patch' : 'post'](
        editing ? `/payees/${editing.id}` : '/payees',
        body,
      );
      await queryClient.invalidateQueries({ queryKey: ['payees'] });
      closeForm();
    } catch (error) {
      setFormError(error.message);
    }
  };
  const changeTrust = async (grantId) => {
    await pendingAction(grantId);
    setPendingAction(null);
    setTrustTarget(null);
    await queryClient.invalidateQueries({ queryKey: ['payees'] });
  };

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageToolbar}>
        <span>{t('app.payees')}</span>
        {canWrite ? <Button onClick={() => { setFormError(''); setEditing(null); setDialogOpen(true); }}><Plus aria-hidden="true" />{t('app.newPayee')}</Button> : null}
      </div>
      {payeesQuery.isPending ? <LoadingState /> : payeesQuery.error ? <PageError error={payeesQuery.error} onRetry={payeesQuery.refetch} /> : rows.length === 0 ? (
        <EmptyState title={t('app.payees')} description={t('app.noPayees')} action={canWrite ? <Button onClick={() => { setFormError(''); setDialogOpen(true); }}>{t('app.newPayee')}</Button> : null} />
      ) : (
        <Card className={styles.tableCard} padding="none">
          <table className={styles.dataTable}>
            <thead><tr><th>{t('app.displayName')}</th><th>{t('app.payeeType')}</th><th>{t('app.identifierMasked')}</th><th>{t('app.trust')}</th><th>{t('app.actions')}</th></tr></thead>
            <tbody>{pageRows.map((payee) => (
              <tr key={payee.id}>
                <td><Link to={`/payees/${payee.id}`}>{payee.displayName}</Link></td>
                <td>{t(`app.${payeeKindKey(payee.kind, isLive)}`)}</td>
                <td><code>{payee.identifierMasked || '—'}</code></td>
                <td><StatusPill status={payee.trust} label={t(`app.${payee.trust.toLowerCase() === 'pending_review' ? 'untrusted' : payee.trust.toLowerCase() === 'blocked' ? 'blockedTrust' : 'trusted'}`)} /></td>
                <td className={styles.tableActions}>
                  {canWrite ? <Button onClick={() => { setFormError(''); setEditing(payee); setDialogOpen(true); }} variant="secondary">{t('app.editPayee')}</Button> : null}
                  {canTrust ? <Button onClick={() => {
                    setTrustTarget(payee);
                    const nextTrust = {
                      TRUSTED: 'BLOCKED',
                      BLOCKED: 'PENDING_REVIEW',
                      PENDING_REVIEW: 'TRUSTED',
                    }[payee.trust];
                    setPendingAction(() => (grantId) => apiClient.post(`/payees/${payee.id}/trust`, { trust: nextTrust }, { stepUpGrant: grantId }));
                  }} variant="secondary">{t('app.changeTrust')}</Button> : null}
                </td>
              </tr>
            ))}</tbody>
          </table>
          <Pagination page={page} pages={pages} onPage={setPage} />
        </Card>
      )}
      {canWrite ? <Modal
        footer={<><Button onClick={closeForm} variant="secondary">{t('app.cancel')}</Button><Button form="payee-form" type="submit">{t('app.save')}</Button></>}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        title={editing ? t('app.editPayee') : t('app.newPayee')}
      >
        <form className={styles.formStack} id="payee-form" onSubmit={savePayee}>
          <FloatingInput defaultValue={editing?.displayName || ''} label={t('app.displayName')} name="displayName" required />
          <FloatingSelect defaultValue={editing?.kind || 'EMAIL'} label={t('app.payeeType')} name="kind">
            <option value="EMAIL">{t('app.emailKind')}</option>
            <option value="PAYPAL_ID">{isLive ? t('app.paypalIdKindLive') : t('app.paypalIdKind')}</option>
            <option value="PHONE">{t('app.phoneKind')}</option>
          </FloatingSelect>
          <FloatingInput label={t('app.identifier')} name="identifier" required={!editing} type="text" />
          {editing ? <p className={styles.fieldHint}>{t('app.maskedIdentifierHint', { identifier: editing.identifierMasked })}</p> : null}
          {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
        </form>
      </Modal> : null}
      <StepUpDialog
        onConfirm={changeTrust}
        onOpenChange={(open) => {
          if (!open) {
            setTrustTarget(null);
            setPendingAction(null);
          }
        }}
        open={Boolean(trustTarget)}
        purpose="TRUST_PAYEE"
      />
    </div>
  );
}

export function PayeeDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { isLive } = useEnvironment();
  const query = usePageQuery(['payees', id], () => apiClient.get(`/payees/${id}`));
  if (query.isPending) return <LoadingState />;
  if (query.error || !query.data) return <PageError error={query.error} onRetry={query.refetch} />;
  const { payee, revisions } = query.data;
  return (
    <div className={styles.pageStack}>
      <Card className={styles.formCard} padding="form">
        <div className={styles.cardHeading}><h2>{payee.displayName}</h2><StatusPill status={payee.trust} label={payee.trust} /></div>
        <dl className={styles.detailsList}>
          <div><dt>{t('app.payeeType')}</dt><dd>{t(`app.${payeeKindKey(payee.kind, isLive)}`)}</dd></div>
          <div><dt>{t('app.identifierMasked')}</dt><dd><code>{payee.identifierMasked || '—'}</code></dd></div>
          <div><dt>{t('app.createdAt')}</dt><dd>{new Date(payee.createdAt).toLocaleString()}</dd></div>
        </dl>
      </Card>
      <Card className={styles.formCard} padding="form">
        <h2>{t('app.changeHistory')}</h2>
        {revisions.length ? (
          <ul className={styles.historyList}>{revisions.map((revision) => (
            <li key={revision.id}><span>{new Date(revision.changedAt).toLocaleString()}</span><span>{revision.changedBy || t('app.noData')}</span></li>
          ))}</ul>
        ) : <EmptyState title={t('app.noData')} description={t('app.noHistory')} />}
      </Card>
    </div>
  );
}

export function PaypalSettingsPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { environment, isLive } = useEnvironment();
  const [stepUp, setStepUp] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const [feedback, setFeedback] = useState('');
  const formRef = useRef(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState(null);
  const [preflightError, setPreflightError] = useState('');

  const owner = auth.role === 'OWNER';
  const envQueryString = `?environment=${environment}&env=${environment}`;
  const envHeaders = {
    'x-jobenpay-environment': environment,
    'x-environment': environment,
  };

  const runPreflight = async () => {
    setPreflightLoading(true);
    setPreflightError('');
    try {
      const data = await apiClient.get(`/admin/real-preflight${envQueryString}`, { headers: envHeaders });
      setPreflightResult(data);
    } catch (err) {
      setPreflightError(err.message);
    } finally {
      setPreflightLoading(false);
    }
  };
  const query = usePageQuery(['paypal-credentials', environment], async () => {
    try {
      return await apiClient.get(`/paypal/credentials${envQueryString}`, { headers: envHeaders });
    } catch (err) {
      if (err?.status === 404) {
        return await apiClient.get(`/paypal/connection${envQueryString}`, { headers: envHeaders });
      }
      throw err;
    }
  });

  const rawConnection = query.data;
  const isDataMatchingEnv = rawConnection && rawConnection.environment === environment;
  const connection = isDataMatchingEnv ? rawConnection : {
    client_id_masked: null,
    status: 'UNTESTED',
    environment,
    webhookUrl: null,
    webhookId: null,
    lastTestedAt: null,
    lastErrorCode: null,
  };

  const isConnected = connection.status === 'CONNECTED' && Boolean(connection.client_id_masked);

  const save = async (event, grantId) => {
    event?.preventDefault();
    const form = event?.currentTarget ? new FormData(event.currentTarget) : pendingCredentials;
    if (!form) return;
    const clientId = String(form.get('clientId') || '').trim();
    const clientSecret = String(form.get('clientSecret') || '').trim();
    const webhookId = String(form.get('webhookId') || '').trim();
    if (Boolean(clientId) !== Boolean(clientSecret)) {
      setFeedback(t('app.credentialsBothRequired'));
      return;
    }
    if (isLive && clientId && (clientId.toLowerCase().startsWith('sb-') || clientId.toLowerCase().includes('sandbox'))) {
      setFeedback('Peringatan: Kredensial terdeteksi sebagai Sandbox. Untuk mode Live, gunakan Client ID produksi.');
      return;
    }
    const body = {
      ...(clientId && clientSecret ? { clientId, clientSecret } : {}),
      webhookId,
    };
    if (connection?.client_id_masked && clientId) {
      setPendingCredentials(form);
      setStepUp(true);
      return;
    }
    try {
      await apiClient.put(`/paypal/credentials${envQueryString}`, body, { stepUpGrant: grantId, headers: envHeaders });
    } catch (err) {
      if (err?.status === 404) {
        await apiClient.put(`/paypal/connection${envQueryString}`, body, { stepUpGrant: grantId, headers: envHeaders });
      } else {
        throw err;
      }
    }
    setPendingCredentials(null);
    formRef.current?.reset();
    setFeedback(t('app.connectionSaved'));
    await queryClient.invalidateQueries({ queryKey: ['paypal-credentials', environment] });
    await queryClient.invalidateQueries({ queryKey: ['paypal', 'connection'] });
  };
  const testConnection = async () => {
    setFeedback('');
    try {
      try {
        await apiClient.post(`/paypal/credentials/test${envQueryString}`, null, { headers: envHeaders });
      } catch (err) {
        if (err?.status === 404) {
          await apiClient.post(`/paypal/connection/test${envQueryString}`, null, { headers: envHeaders });
        } else {
          throw err;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['paypal-credentials', environment] });
      await queryClient.invalidateQueries({ queryKey: ['paypal', 'connection'] });
      setFeedback(t('app.connectionTested'));
    } catch (error) {
      setFeedback(error.message);
    }
  };

  if (query.isPending) return <LoadingState />;
  if (query.error) return <PageError error={query.error} onRetry={query.refetch} />;

  return (
    <div className={styles.pageStack}>
      {isLive && !isConnected ? (
        <Banner kind="warning" title="PAYPAL LIVE — BELUM TERHUBUNG">
          Lingkungan LIVE beroperasi dengan data dan dana nyata. Saat ini <strong>PayPal Live</strong> produksi Anda <strong>BELUM TERHUBUNG</strong>. Silakan masukkan Client ID dan Secret akun produksi Anda di bawah ini, lalu klik Simpan &amp; Uji Koneksi untuk mengaktifkan transaksi nyata. Jangan gunakan kunci Sandbox di sini.
        </Banner>
      ) : null}
      {isLive && isConnected ? (
        <Banner kind="error" title="LIVE MODE WARNING">
          Konektor <strong>PayPal Live</strong> aktif terhubung ke produksi. Seluruh transaksi dan mutasi saldo di lingkungan ini menggunakan uang nyata.
        </Banner>
      ) : null}
      {!isLive ? (
        <Banner kind="info" title="PAYPAL SANDBOX">
          Konektor <strong>PayPal Sandbox</strong> aktif di lingkungan simulasi. Semua transaksi dan saldo bersifat simulasi aman tanpa uang riil.
        </Banner>
      ) : null}
      <Card
        className={styles.formCard}
        padding="form"
        style={isLive ? { borderTop: '4px solid var(--jp-error, #dc2626)' } : {}}
      >
        <div className={styles.cardHeading}>
          <h2 style={isLive ? { color: 'var(--jp-error, #dc2626)' } : {}}>
            PayPal {isLive ? 'Live' : 'Sandbox'}
          </h2>
          <StatusPill
            status={isConnected ? 'COMPLETED' : (isLive ? 'FAILED' : connection.status)}
            label={isConnected ? `CONNECTED (${isLive ? 'LIVE' : 'SANDBOX'})` : (isLive ? 'BELUM TERHUBUNG' : connection.status)}
          />
        </div>
        <dl className={styles.detailsList}>
          <div>
            <dt>{t('app.connectionStatus')}</dt>
            <dd style={{ fontWeight: 600, color: isConnected ? 'var(--jp-success, #16a34a)' : (isLive ? 'var(--jp-error, #dc2626)' : 'inherit') }}>
              {isConnected ? 'CONNECTED' : (isLive ? 'BELUM TERHUBUNG / NOT CONNECTED' : connection.status)}
            </dd>
          </div>
          <div>
            <dt>{t('app.clientId')}</dt>
            <dd>{connection.client_id_masked || (isLive ? 'Belum terhubung (Masukkan Live Client ID)' : t('app.noConnection'))}</dd>
          </div>
          <div>
            <dt>{t('app.lastTested')}</dt>
            <dd>{connection.lastTestedAt ? new Date(connection.lastTestedAt).toLocaleString() : 'Belum pernah diuji / Never tested'}</dd>
          </div>
          {connection.lastErrorCode ? <div><dt>{t('components.error')}</dt><dd>{connection.lastErrorCode}</dd></div> : null}
        </dl>
        {!owner ? <p className={styles.fieldHint}>{t('app.readOnlyRole')}</p> : (
          <form className={styles.formStack} onSubmit={(event) => {
            save(event).catch((error) => setFeedback(error.message));
          }} ref={formRef}>
            <FloatingInput
              autoComplete="off"
              label={isLive ? 'Client ID (PayPal Live)' : t('app.clientId')}
              name="clientId"
              placeholder={isLive ? 'Masukkan Live Client ID produksi' : ''}
            />
            <FloatingInput
              autoComplete="new-password"
              label={isLive ? 'Client Secret (PayPal Live)' : t('app.clientSecret')}
              name="clientSecret"
              type="password"
              placeholder={isLive ? 'Masukkan Live Client Secret produksi' : ''}
            />
            <FloatingInput
              key={`${environment}-${connection.webhookId || 'empty'}`}
              defaultValue={connection.webhookId || ''}
              label={isLive ? 'Webhook ID (PayPal Live)' : t('app.webhookId')}
              name="webhookId"
            />
            {feedback ? <p className={styles.formFeedback} role="status">{feedback}</p> : null}
            <div className={styles.inlineActions}>
              <Button type="submit">{t('app.saveConnection')}</Button>
              <Button onClick={testConnection} type="button" variant="secondary">{t('app.testConnection')}</Button>
            </div>
          </form>
        )}
        {connection.webhookUrl ? (
          <div className={styles.webhookBlock}>
            <h3>{isLive ? 'PayPal Live Webhook URL' : t('app.webhookUrl')}</h3>
            <p className={styles.fieldHint}>
              {isLive
                ? 'Daftarkan webhook URL ini pada dashboard pengembang mode Live untuk menerima event mutasi nyata.'
                : 'Daftarkan webhook URL ini pada dashboard pengembang mode Sandbox untuk menerima event simulasi.'}
            </p>
            <CodeBlock value={connection.webhookUrl} />
          </div>
        ) : (
          <div className={styles.webhookBlock}>
            <h3>{isLive ? 'PayPal Live Webhook URL' : t('app.webhookUrl')}</h3>
            <p className={styles.fieldHint} style={{ color: 'var(--jp-muted, #64748b)' }}>
              {isLive
                ? 'Webhook URL Live akan otomatis dibuat dan aktif setelah kredensial PayPal Live Anda disimpan.'
                : 'Webhook URL Sandbox akan otomatis dibuat dan aktif setelah kredensial PayPal Sandbox Anda disimpan.'}
            </p>
          </div>
        )}
      </Card>
      <Card className={styles.formCard} padding="form">
        <div className={styles.cardHeading}>
          <h2>{isLive ? 'Live Real-Payout Preflight Checks' : (t('app.preflightTitle') || 'Real-Payout Preflight Checks')}</h2>
          {preflightResult ? (
            <StatusPill
              status={preflightResult.ready ? 'COMPLETED' : 'FAILED'}
              label={preflightResult.ready ? 'READY (PASS)' : 'NOT READY (FAIL)'}
            />
          ) : null}
        </div>
        <p className={styles.fieldHint}>
          {isLive
            ? 'Verifikasi seluruh 12 pemeriksaan kesiapan operasional (PF-01 s/d PF-12) sebelum mengeksekusi payout uang nyata pada PayPal Live.'
            : (t('app.preflightDesc') || 'Verify all 12 operational readiness checks (PF-01 to PF-12) before executing payouts against PayPal Sandbox.')}
        </p>
        <div className={styles.inlineActions}>
          <Button disabled={preflightLoading} onClick={runPreflight} type="button">
            {preflightLoading ? (t('app.runningPreflight') || 'Running checks...') : (t('app.runPreflight') || 'Run real-payout preflight')}
          </Button>
        </div>
        {preflightError ? <p className={styles.formFeedback} role="alert">{preflightError}</p> : null}
        {preflightResult?.checks ? (
          <div className={styles.tableCard}>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th scope="col">{t('app.status') || 'Status'}</th>
                  <th scope="col">{t('app.checkId') || 'Check'}</th>
                  <th scope="col">{t('app.detail') || 'Detail'}</th>
                </tr>
              </thead>
              <tbody>
                {preflightResult.checks.map((check) => (
                  <tr key={check.id}>
                    <td>
                      <StatusPill
                        status={check.status === 'PASS' ? 'COMPLETED' : (check.status === 'WARN' ? 'PENDING' : 'FAILED')}
                        label={check.status}
                      />
                    </td>
                    <td><code>{check.id}</code></td>
                    <td>{check.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
      <StepUpDialog
        onConfirm={async (grantId) => {
          const form = pendingCredentials;
          if (!form) return;
          await apiClient.put('/paypal/credentials', {
            clientId: String(form.get('clientId') || '').trim(),
            clientSecret: String(form.get('clientSecret') || '').trim(),
            webhookId: String(form.get('webhookId') || '').trim(),
          }, { stepUpGrant: grantId });
          setPendingCredentials(null);
          formRef.current?.reset();
          setFeedback(t('app.connectionSaved'));
          await queryClient.invalidateQueries({ queryKey: ['paypal-credentials', environment] });
          await queryClient.invalidateQueries({ queryKey: ['paypal', 'connection'] });
        }}
        onOpenChange={(open) => {
          if (!open) {
            setStepUp(false);
            setPendingCredentials(null);
            formRef.current?.reset();
          }
        }}
        open={stepUp}
        purpose="ROTATE_CREDENTIALS"
      />
    </div>
  );
}

export function SecurityPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState('');
  const [stepUp, setStepUp] = useState(false);
  const canFreeze = ['OWNER', 'ADMIN', 'JUDGE'].includes(auth.role);
  const action = auth.org?.frozen ? 'unfreeze' : 'freeze';
  const confirm = async (grantId) => {
    await apiClient.post(`/org/${action}`, {}, { stepUpGrant: grantId });
    await auth.refresh();
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    setStepUp(false);
    setPendingAction('');
  };
  return (
    <Card className={styles.formCard} padding="form">
      <div className={styles.cardHeading}>
        <h2>{t('app.killSwitchTitle')}</h2>
        {auth.org?.frozen ? <StatusPill status="FAILED" label={t('app.frozenOrganization')} /> : null}
      </div>
      <p>{t('app.freezeDescription')}</p>
      {canFreeze ? <Button onClick={() => { setPendingAction(action); setStepUp(true); }} variant={auth.org?.frozen ? 'primary' : 'secondary'}>
        {auth.org?.frozen ? t('app.unfreezeOrganization') : t('app.freezeOrganization')}
      </Button> : <p className={styles.fieldHint}>{t('app.readOnlyRole')}</p>}
      <StepUpDialog
        description={t('app.freezeDescription')}
        onConfirm={confirm}
        onOpenChange={(open) => { setStepUp(open); if (!open) setPendingAction(''); }}
        open={stepUp && Boolean(pendingAction)}
        purpose="FREEZE_TOGGLE"
      />
    </Card>
  );
}
