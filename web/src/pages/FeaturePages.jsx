import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
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
import { useTranslation } from 'react-i18next';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
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
  Skeleton,
  StatusPill,
} from '../components/primitives.jsx';
import styles from './FeaturePages.module.css';

function usePageQuery(queryKey, queryFn, { active = false } = {}) {
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  return useQuery({
    queryKey,
    queryFn,
    refetchInterval: visible ? (active ? 3000 : 15000) : false,
    refetchIntervalInBackground: false,
  });
}

function LoadingState() {
  const { t } = useTranslation();
  return (
    <div aria-label={t('components.loading')} className={styles.skeletonGrid}>
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  );
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

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await auth.login({ email, password });
      const returnTo = location.state?.from?.pathname || '/dashboard';
      navigate(returnTo, { replace: true });
    } catch (loginError) {
      setError(loginError.code === 'UNAUTHENTICATED' ? t('app.loginError') : loginError.message);
    } finally {
      setLoading(false);
    }
  };

  if (auth.user) return <Navigate to="/dashboard" replace />;
  return (
    <main className={styles.loginPage}>
      <Card className={styles.loginCard} padding="section">
        <Link aria-label={t('app.name')} className={styles.loginWordmark} to="/dashboard">{t('app.name')}</Link>
        <h1>{t('app.loginTitle')}</h1>
        <form className={styles.formStack} onSubmit={submit}>
          <FloatingInput autoComplete="username" label={t('app.email')} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          <FloatingInput autoComplete="current-password" error={error} label={t('app.password')} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          <Button className={styles.fullWidth} loading={loading} size="lg" type="submit">{t('app.login')}</Button>
        </form>
        {import.meta.env.VITE_SHOW_DEMO_HINT === '1' ? <p className={styles.demoHint}>{t('app.demoAccountsHint')}</p> : null}
        <p className={styles.paypalDisclaimer}>{t('app.paypalDisclaimer')}</p>
        <Link className={styles.loginLink} to="/coming-soon">{t('app.help')}</Link>
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

function payeeKindKey(kind) {
  return kind === 'PAYPAL_ID' ? 'paypalIdKind' : `${String(kind).toLowerCase()}Kind`;
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

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const summaryQuery = usePageQuery(['dashboard', 'summary'], () => apiClient.get('/dashboard/summary'));
  const { data, error, isPending, refetch } = summaryQuery;
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
      title: t('app.connectPaypal'),
      description: t('app.connectSandboxDescription'),
      to: '/settings/paypal',
      done: data.paypalConnected,
    },
    {
      key: 'agent',
      title: t('app.createAgent'),
      description: t('app.createAgentDescription'),
      to: '/agents',
      done: data.hasAgent,
    },
    {
      key: 'mandate',
      title: t('app.activateMandate'),
      description: t('app.activateMandateDescription'),
      to: '/mandates',
      done: data.hasActiveMandate,
    },
  ];
  const quickLinks = [
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
        <Button className={styles.budgetAction} onClick={() => navigate('/mandates')} variant="secondary">
          {t('app.manageMandates')} <ChevronDown aria-hidden="true" />
        </Button>
      </section>

      <section aria-label={t('app.setupCards')} className={styles.setupCards}>
        {setupCards.filter((card) => !card.done).map((card) => (
          <Card className={styles.setupCard} key={card.key} padding="tile">
            <div className={styles.setupCardTop}>
              <span aria-hidden="true" className={styles.setupIcon}><Plus /></span>
              <button aria-label={`${card.title} ${t('app.actions')}`} className={styles.iconAction} type="button"><Ellipsis /></button>
            </div>
            <Link to={card.to}>{card.title}</Link>
            <p>{card.description}</p>
          </Card>
        ))}
        {setupCards.filter((card) => card.done).map((card) => (
          <Card className={`${styles.setupCard} ${styles.setupComplete}`} key={card.key} padding="tile">
            <span className={styles.completedText}><Check aria-hidden="true" />{card.title}</span>
          </Card>
        ))}
      </section>

      <section className={styles.quickSection}>
        <div className={styles.sectionHeading}>
          <h2>{t('app.quickAccess')}</h2>
          <Link aria-label={t('app.editQuickAccess')} className={styles.iconAction} to="/coming-soon"><Pencil aria-hidden="true" /></Link>
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
    </div>
  );
}

function QuickIcon({ name }) {
  const icons = {
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
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(initialCreate);
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(0);
  const [trustTarget, setTrustTarget] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [formError, setFormError] = useState('');
  const location = useLocation();
  useEffect(() => {
    if (initialCreate) setDialogOpen(true);
  }, [initialCreate, location.pathname]);
  const payeesQuery = usePageQuery(['payees'], async () => (await apiClient.get('/payees')).payees, { active: true });
  const canWrite = ['OWNER', 'ADMIN', 'OPERATOR'].includes(auth.role);
  const canTrust = ['OWNER', 'ADMIN'].includes(auth.role);
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
                <td>{t(`app.${payeeKindKey(payee.kind)}`)}</td>
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
      <Modal
        footer={<><Button onClick={closeForm} variant="secondary">{t('app.cancel')}</Button><Button form="payee-form" type="submit">{t('app.save')}</Button></>}
        onOpenChange={setDialogOpen}
        open={dialogOpen}
        title={editing ? t('app.editPayee') : t('app.newPayee')}
      >
        <form className={styles.formStack} id="payee-form" onSubmit={savePayee}>
          <FloatingInput defaultValue={editing?.displayName || ''} label={t('app.displayName')} name="displayName" required />
          <FloatingSelect defaultValue={editing?.kind || 'EMAIL'} label={t('app.payeeType')} name="kind">
            <option value="EMAIL">{t('app.emailKind')}</option>
            <option value="PAYPAL_ID">{t('app.paypalIdKind')}</option>
            <option value="PHONE">{t('app.phoneKind')}</option>
          </FloatingSelect>
          <FloatingInput label={t('app.identifier')} name="identifier" required={!editing} type="text" />
          {editing ? <p className={styles.fieldHint}>{t('app.maskedIdentifierHint', { identifier: editing.identifierMasked })}</p> : null}
          {formError ? <p className={styles.formError} role="alert">{formError}</p> : null}
        </form>
      </Modal>
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
  const query = usePageQuery(['payees', id], () => apiClient.get(`/payees/${id}`));
  if (query.isPending) return <LoadingState />;
  if (query.error || !query.data) return <PageError error={query.error} onRetry={query.refetch} />;
  const { payee, revisions } = query.data;
  return (
    <div className={styles.pageStack}>
      <Card className={styles.formCard} padding="form">
        <div className={styles.cardHeading}><h2>{payee.displayName}</h2><StatusPill status={payee.trust} label={payee.trust} /></div>
        <dl className={styles.detailsList}>
          <div><dt>{t('app.payeeType')}</dt><dd>{t(`app.${payeeKindKey(payee.kind)}`)}</dd></div>
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
  const [stepUp, setStepUp] = useState(false);
  const [pendingCredentials, setPendingCredentials] = useState(null);
  const [feedback, setFeedback] = useState('');
  const formRef = useRef(null);
  const owner = auth.role === 'OWNER';
  const query = usePageQuery(['paypal', 'connection'], () => apiClient.get('/paypal/connection'));
  const connection = query.data;

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
    const body = {
      ...(clientId && clientSecret ? { clientId, clientSecret } : {}),
      webhookId,
    };
    if (connection?.client_id_masked && clientId) {
      setPendingCredentials(form);
      setStepUp(true);
      return;
    }
    await apiClient.put('/paypal/connection', body, { stepUpGrant: grantId });
    setPendingCredentials(null);
    formRef.current?.reset();
    setFeedback(t('app.connectionSaved'));
    await queryClient.invalidateQueries({ queryKey: ['paypal', 'connection'] });
  };
  const testConnection = async () => {
    setFeedback('');
    try {
      await apiClient.post('/paypal/connection/test');
      await queryClient.invalidateQueries({ queryKey: ['paypal', 'connection'] });
      setFeedback(t('app.connectionTested'));
    } catch (error) {
      setFeedback(error.message);
    }
  };

  if (query.isPending) return <LoadingState />;
  if (query.error || !connection) return <PageError error={query.error} onRetry={query.refetch} />;

  return (
    <div className={styles.pageStack}>
      <Card className={styles.formCard} padding="form">
        <div className={styles.cardHeading}><h2>{t('app.paypalConnection')}</h2><StatusPill status={connection.status} label={connection.status} /></div>
        <dl className={styles.detailsList}>
          <div><dt>{t('app.connectionStatus')}</dt><dd>{connection.status}</dd></div>
          <div><dt>{t('app.clientId')}</dt><dd>{connection.client_id_masked || t('app.noConnection')}</dd></div>
          <div><dt>{t('app.lastTested')}</dt><dd>{connection.lastTestedAt ? new Date(connection.lastTestedAt).toLocaleString() : t('app.noData')}</dd></div>
          {connection.lastErrorCode ? <div><dt>{t('components.error')}</dt><dd>{connection.lastErrorCode}</dd></div> : null}
        </dl>
        {!owner ? <p className={styles.fieldHint}>{t('app.readOnlyRole')}</p> : (
          <form className={styles.formStack} onSubmit={(event) => {
            save(event).catch((error) => setFeedback(error.message));
          }} ref={formRef}>
            <FloatingInput autoComplete="off" label={t('app.clientId')} name="clientId" />
            <FloatingInput autoComplete="new-password" label={t('app.clientSecret')} name="clientSecret" type="password" />
            <FloatingInput defaultValue={connection.webhookId || ''} label={t('app.webhookId')} name="webhookId" />
            {feedback ? <p className={styles.formFeedback} role="status">{feedback}</p> : null}
            <div className={styles.inlineActions}>
              <Button type="submit">{t('app.saveConnection')}</Button>
              <Button onClick={testConnection} type="button" variant="secondary">{t('app.testConnection')}</Button>
            </div>
          </form>
        )}
        {connection.webhookUrl ? <div className={styles.webhookBlock}><h3>{t('app.webhookUrl')}</h3><CodeBlock value={connection.webhookUrl} /></div> : null}
      </Card>
      <StepUpDialog
        onConfirm={async (grantId) => {
          const form = pendingCredentials;
          if (!form) return;
          await apiClient.put('/paypal/connection', {
            clientId: String(form.get('clientId') || '').trim(),
            clientSecret: String(form.get('clientSecret') || '').trim(),
            webhookId: String(form.get('webhookId') || '').trim(),
          }, { stepUpGrant: grantId });
          setPendingCredentials(null);
          formRef.current?.reset();
          setFeedback(t('app.connectionSaved'));
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
  const canFreeze = ['OWNER', 'ADMIN'].includes(auth.role);
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
