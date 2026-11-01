import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownToLine, FileText, Plus, Search, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { safePolicy } from '@shared/policy.schema.js';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import StepUpDialog from '../components/StepUpDialog.jsx';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  FloatingInput,
  FloatingSelect,
  Modal,
  Skeleton,
  StatusPill,
  useToast,
} from '../components/primitives.jsx';
import styles from './F04Pages.module.css';

const REQUEST_STATUSES = [
  'RECEIVED', 'EVALUATING', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING',
  'EXECUTED', 'RECONCILED', 'REJECTED', 'FAILED', 'MISMATCH', 'EXPIRED', 'CANCELLED',
];
const ACTIONS = ['PAYOUT', 'REFUND', 'ACCEPT_DISPUTE'];
const POLICY_GROUPS = [
  ['Actions & currency', ['schemaVersion', 'purpose', 'allowedActions', 'currency']],
  ['Limits', ['budget.period', 'perTransactionCapMinor', 'budget.limitMinor', 'autoApproveBelowMinor']],
  ['Payees', ['payees.mode', 'payees.ids', 'allowNewPayees']],
  ['Schedule', ['schedule.timezone', 'schedule.days', 'schedule.startHour', 'schedule.endHour']],
  ['Velocity', ['velocity.maxRequestsPerHour', 'velocity.maxPayoutPerPayeePerDay', 'duplicateWindowHours']],
  ['Invoice & AI', ['requireInvoice', 'invoiceAmountToleranceMinor', 'ai.intentCheck', 'ai.escalateOnRiskAtOrAbove', 'ai.blockOnRiskAtOrAbove']],
  ['Approval rules', ['stepUpApprovalAboveMinor', 'fourEyesAboveMinor', 'approvalTtlHours', 'validFrom', 'validTo']],
];
const FIELD_LABELS = {
  schemaVersion: 'Schema version',
  'budget.period': 'Budget period',
  'payees.mode': 'Payee mode',
  purpose: 'Purpose',
  allowedActions: 'Allowed actions',
  currency: 'Currency',
  perTransactionCapMinor: 'Per-transaction cap (minor units)',
  'budget.limitMinor': 'Monthly budget limit (minor units)',
  autoApproveBelowMinor: 'Auto-approve below (minor units)',
  'payees.ids': 'Allowed payees',
  allowNewPayees: 'Allow new payees',
  'schedule.timezone': 'IANA timezone',
  'schedule.days': 'Allowed weekdays',
  'schedule.startHour': 'Start hour',
  'schedule.endHour': 'End hour (exclusive)',
  'velocity.maxRequestsPerHour': 'Maximum requests per hour',
  'velocity.maxPayoutPerPayeePerDay': 'Maximum payouts per payee per day',
  duplicateWindowHours: 'Duplicate window (hours)',
  requireInvoice: 'Require invoice',
  invoiceAmountToleranceMinor: 'Invoice amount tolerance (minor units)',
  'ai.intentCheck': 'AI intent check',
  'ai.escalateOnRiskAtOrAbove': 'Escalate risk score at or above',
  'ai.blockOnRiskAtOrAbove': 'Block risk score at or above',
  stepUpApprovalAboveMinor: 'Require step-up above (minor units)',
  fourEyesAboveMinor: 'Require two approvers above (minor units)',
  approvalTtlHours: 'Approval expiry (hours)',
  validFrom: 'Valid from (UTC)',
  validTo: 'Valid to (UTC)',
};
const WEEKDAYS = [
  [1, 'Monday'], [2, 'Tuesday'], [3, 'Wednesday'], [4, 'Thursday'],
  [5, 'Friday'], [6, 'Saturday'], [7, 'Sunday'],
];

function usePageQuery(queryKey, queryFn, { active = false, enabled = true } = {}) {
  const [visible, setVisible] = useState(document.visibilityState === 'visible');
  useEffect(() => {
    const updateVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);
  return useQuery({
    queryKey,
    queryFn,
    enabled,
    refetchInterval: visible ? (active ? 3000 : 15000) : false,
    refetchIntervalInBackground: false,
  });
}

function LoadingRows() {
  return <div className={styles.loadingRows}><Skeleton /><Skeleton /><Skeleton /></div>;
}

function PageError({ error, retry }) {
  return (
    <EmptyState
      title="Unable to load this page"
      description={error?.message || 'The request could not be completed.'}
      action={<Button onClick={retry}>Retry</Button>}
    />
  );
}

function Pagination({ cursor, hasNext, onPrevious, onNext, count }) {
  return (
    <div className={styles.pagination}>
      <span>{count ? `1–${count}` : '0'} of {count + (hasNext ? '+' : '')}</span>
      <div>
        <Button aria-label="Previous page" disabled={!cursor} onClick={onPrevious} variant="secondary">‹</Button>
        <Button aria-label="Next page" disabled={!hasNext} onClick={onNext} variant="secondary">›</Button>
      </div>
    </div>
  );
}

function FilterSelect({ label, children, ...props }) {
  return (
    <label className={styles.filterPill}>
      <span>{label}</span>
      <select {...props}>{children}</select>
    </label>
  );
}

function formatMoney(minor, currency = 'USD') {
  if (minor == null || !/^-?\d+$/.test(String(minor))) return '—';
  const value = BigInt(minor);
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const major = absolute / 100n;
  const cents = String(absolute % 100n).padStart(2, '0');
  return `${sign}${currency} ${new Intl.NumberFormat('en-US').format(major)}.${cents}`;
}

function dateLabel(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function defaultPolicy() {
  const validFrom = new Date();
  const validTo = new Date(validFrom.getTime() + 60 * 24 * 60 * 60 * 1000);
  return {
    schemaVersion: 1,
    purpose: '',
    allowedActions: ['PAYOUT'],
    currency: 'USD',
    perTransactionCapMinor: 1500,
    budget: { period: 'MONTH', limitMinor: 5000 },
    autoApproveBelowMinor: 1000,
    payees: { mode: 'ALLOWLIST', ids: [] },
    allowNewPayees: false,
    schedule: { timezone: 'Asia/Jakarta', days: [1, 2, 3, 4, 5], startHour: 8, endHour: 18 },
    velocity: { maxRequestsPerHour: 10, maxPayoutPerPayeePerDay: 3 },
    duplicateWindowHours: 24,
    requireInvoice: true,
    invoiceAmountToleranceMinor: 0,
    ai: { intentCheck: true, escalateOnRiskAtOrAbove: 50, blockOnRiskAtOrAbove: 80 },
    stepUpApprovalAboveMinor: 1500,
    fourEyesAboveMinor: 5000,
    approvalTtlHours: 24,
    validFrom: validFrom.toISOString(),
    validTo: validTo.toISOString(),
  };
}

function getPath(object, path) {
  return path.split('.').reduce((value, part) => value?.[part], object);
}

function setPath(object, path, nextValue) {
  const next = structuredClone(object);
  const parts = path.split('.');
  let target = next;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = nextValue;
  return next;
}

function policyIssueMap(result) {
  if (result.success) return {};
  return result.error.issues.reduce((messages, issue) => {
    const key = issue.path.join('.');
    messages[key] = issue.message;
    return messages;
  }, {});
}

function PolicyEditor({ policy, onChange, payees, issues }) {
  const toggleArrayValue = (path, value) => {
    const current = getPath(policy, path);
    onChange(setPath(policy, path, current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value]));
  };
  const renderField = (path) => {
    const value = getPath(policy, path);
    const label = FIELD_LABELS[path];
    if (path === 'purpose') {
      return (
        <label className={styles.editorField} key={path}>
          <span>{label}</span>
          <textarea aria-label={label} onChange={(event) => onChange(setPath(policy, path, event.target.value))} value={value} />
          {issues[path] ? <small role="alert">{issues[path]}</small> : null}
        </label>
      );
    }
    if (path === 'allowedActions' || path === 'schedule.days' || path === 'payees.ids') {
      const options = path === 'allowedActions'
        ? ACTIONS.map((action) => [action, action])
        : path === 'schedule.days'
          ? WEEKDAYS
          : payees.map((payee) => [payee.id, payee.display_name]);
      return (
        <fieldset className={styles.editorField} key={path}>
          <legend>{label}</legend>
          <div className={styles.choiceGrid}>
            {options.length ? options.map(([option, optionLabel]) => (
              <label className={styles.checkLine} key={option}>
                <input checked={value.includes(path === 'schedule.days' ? Number(option) : option)} onChange={() => toggleArrayValue(path, path === 'schedule.days' ? Number(option) : option)} type="checkbox" />
                <span>{optionLabel}</span>
              </label>
            )) : <span className={styles.muted}>No payees are available in this organization.</span>}
          </div>
          {issues[path] ? <small role="alert">{issues[path]}</small> : null}
        </fieldset>
      );
    }
    if (typeof value === 'boolean') {
      return (
        <label className={styles.checkLine} key={path}>
          <input checked={value} onChange={(event) => onChange(setPath(policy, path, event.target.checked))} type="checkbox" />
          <span>{label}</span>
          {issues[path] ? <small role="alert">{issues[path]}</small> : null}
        </label>
      );
    }
    if (path === 'schemaVersion' || path === 'budget.period' || path === 'payees.mode') {
      return <FloatingInput aria-label={label} key={path} label={label} readOnly value={value} />;
    }
    if (path === 'validFrom' || path === 'validTo') {
      return (
        <FloatingInput
          aria-label={label}
          error={issues[path]}
          key={path}
          label={label}
          onChange={(event) => {
            const parsed = new Date(event.target.value);
            if (!Number.isNaN(parsed.getTime())) onChange(setPath(policy, path, parsed.toISOString()));
          }}
          type="datetime-local"
          value={value.slice(0, 16)}
        />
      );
    }
    const numeric = typeof value === 'number';
    return (
      <FloatingInput
        aria-label={label}
        error={issues[path]}
        key={path}
        label={label}
        max={path === 'schedule.startHour' ? 23 : path === 'schedule.endHour' ? 24 : undefined}
        min={path.startsWith('ai.') ? 0 : numeric ? 0 : undefined}
        onChange={(event) => onChange(setPath(policy, path, numeric ? Number(event.target.value) : event.target.value.toUpperCase()))}
        type={numeric ? 'number' : 'text'}
        value={value}
      />
    );
  };
  return (
    <div className={styles.policyGroups}>
      {POLICY_GROUPS.map(([title, paths]) => (
        <Card className={styles.policyGroup} key={title}>
          <h3>{title}</h3>
          <div className={styles.editorGrid}>{paths.map(renderField)}</div>
        </Card>
      ))}
    </div>
  );
}

export function MandatesPage() {
  const auth = useAuth();
  const query = usePageQuery(['mandates'], async () => (await apiClient.get('/mandates')).mandates);
  const agentsQuery = usePageQuery(['agents'], async () => (await apiClient.get('/agents')).agents);
  const mandates = query.data || [];
  const agentsById = new Map((agentsQuery.data || []).map((agent) => [agent.id, agent.name]));
  const canCreate = ['OWNER', 'ADMIN', 'OPERATOR', 'JUDGE'].includes(auth.role);
  return (
    <div className={styles.pageStack}>
      <div className={styles.pageToolbar}>
        <h2>Mandates</h2>
        {canCreate ? <Link className={styles.primaryLink} to="/mandates/new"><Plus aria-hidden="true" />New mandate</Link> : null}
      </div>
      {query.isPending ? <LoadingRows /> : query.error ? <PageError error={query.error} retry={query.refetch} /> : mandates.length === 0 ? (
        <EmptyState title="No mandates yet" description="Create a mandate to define guarded payment limits for an agent." action={<Link className={styles.primaryLink} to="/mandates/new">Create mandate</Link>} />
      ) : (
        <Card className={styles.tableCard} padding="none">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead><tr><th>Mandate</th><th>Agent</th><th>Status</th><th>Version</th><th>Monthly limit</th></tr></thead>
              <tbody>{mandates.map((mandate) => (
                <tr key={mandate.id}>
                  <td><Link to={`/mandates/${mandate.id}`}>{mandate.name}</Link></td>
                  <td>{agentsById.get(mandate.agent_id) || mandate.agent_id}</td>
                  <td><StatusPill status={mandate.status} /></td>
                  <td>{mandate.version ? `v${mandate.version}` : '—'}</td>
                  <td>{mandate.policy?.budget ? formatMoney(mandate.policy.budget.limitMinor, mandate.policy.currency) : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function MandateBuilderPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [agentId, setAgentId] = useState('');
  const [purposeText, setPurposeText] = useState('');
  const [policy, setPolicy] = useState(defaultPolicy);
  const [warnings, setWarnings] = useState([]);
  const [diff, setDiff] = useState(null);
  const [issues, setIssues] = useState({});
  const [aiError, setAiError] = useState('');
  const agentsQuery = usePageQuery(['agents'], async () => (await apiClient.get('/agents')).agents);
  const payeesQuery = usePageQuery(['payees'], async () => (await apiClient.get('/payees')).payees);
  const agents = agentsQuery.data || [];
  const payees = payeesQuery.data || [];
  useEffect(() => {
    if (!agentId && agents.length) setAgentId(agents[0].id);
  }, [agentId, agents]);
  const generate = useMutation({
    mutationFn: () => apiClient.post('/mandates/draft-from-text', { agentId, purposeText }),
    onSuccess: ({ draft, diff: nextDiff, warnings: nextWarnings }) => {
      setPolicy(draft.policy);
      setDiff(nextDiff);
      setWarnings(nextWarnings || []);
      setIssues({});
      setAiError('');
      notify({ message: 'Draft generated. Review assumptions before saving.' });
    },
    onError: (error) => setAiError(error.message),
  });
  const save = useMutation({
    mutationFn: () => apiClient.post('/mandates', {
      agentId,
      name: purposeText.trim().slice(0, 120) || policy.purpose || 'Untitled mandate',
      purposeText,
      policy,
    }),
    onSuccess: async ({ mandate }) => {
      await queryClient.invalidateQueries({ queryKey: ['mandates'] });
      notify({ message: 'Mandate draft saved.' });
      navigate(`/mandates/${mandate.id}`);
    },
  });
  const validate = () => {
    const result = safePolicy(policy);
    setIssues(policyIssueMap(result));
    return result.success;
  };
  return (
    <div className={styles.pageStack}>
      <Card className={styles.formCard}>
        <div><h2>Mandate purpose</h2><p>Describe the human-written purpose and limits for this agent.</p></div>
        <div className={styles.builderTop}>
          <FloatingSelect label="Agent" onChange={(event) => setAgentId(event.target.value)} value={agentId}>
            <option value="">Select an agent</option>
            {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </FloatingSelect>
          <label className={styles.editorField}><span>Purpose in natural language</span><textarea onChange={(event) => {
            setPurposeText(event.target.value);
            setPolicy((current) => ({ ...current, purpose: event.target.value }));
          }} value={purposeText} /></label>
        </div>
        {aiError ? <Banner kind="warning" title="AI draft unavailable">You can continue with the manual editor. {aiError}</Banner> : null}
        <div className={styles.inlineActions}>
          <Button disabled={!agentId || !purposeText.trim()} loading={generate.isPending} onClick={() => generate.mutate()}>Generate draft</Button>
          <Button disabled={!agentId} loading={save.isPending} onClick={() => {
            if (validate()) save.mutate();
          }} variant="secondary">Save draft</Button>
        </div>
        {generate.error ? <p className={styles.formError} role="alert">{generate.error.message}</p> : null}
        {save.error ? <p className={styles.formError} role="alert">{save.error.message}</p> : null}
      </Card>
      {warnings.length ? <Banner kind="warning" title="Review AI assumptions">{warnings.join(' ')}</Banner> : null}
      {diff ? (
        <Card className={styles.formCard}>
          <h2>Draft preview and diff</h2>
          <p>{diff.previous ? 'A previous policy exists; compare each field before saving.' : 'This is a new policy for the selected agent.'}</p>
          {diff.previous ? <pre className={styles.diffPreview}>{JSON.stringify({ previous: diff.previous, draft: diff.next }, null, 2)}</pre> : null}
        </Card>
      ) : null}
      <PolicyEditor issues={issues} onChange={setPolicy} payees={payees} policy={policy} />
    </div>
  );
}

export function MandateDetailPage() {
  const { id } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [stepUp, setStepUp] = useState(false);
  const [confirmAction, setConfirmAction] = useState('');
  const query = usePageQuery(['mandates', id], () => apiClient.get(`/mandates/${id}`));
  const mandate = query.data?.mandate;
  const budgetQuery = usePageQuery(
    ['mandates', id, 'budget'],
    async () => {
      try {
        return await apiClient.get(`/mandates/${id}/budget`);
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    },
    { enabled: Boolean(mandate?.status === 'ACTIVE'), active: true },
  );
  const allowedAdmin = ['OWNER', 'ADMIN'].includes(auth.role);
  const activate = useMutation({
    mutationFn: (grantId) => apiClient.post(`/mandates/${id}/activate`, { versionId: mandate.currentVersion.id }, { stepUpGrant: grantId }),
    onSuccess: async () => {
      setStepUp(false);
      notify({ message: 'Mandate activated.' });
      await queryClient.invalidateQueries({ queryKey: ['mandates'] });
      await queryClient.invalidateQueries({ queryKey: ['mandates', id] });
    },
  });
  const statusChange = useMutation({
    mutationFn: (action) => apiClient.post(`/mandates/${id}/${action}`),
    onSuccess: async (_, action) => {
      setConfirmAction('');
      notify({ message: action === 'suspend' ? 'Mandate suspended.' : 'Mandate revoked.' });
      await queryClient.invalidateQueries({ queryKey: ['mandates'] });
      await queryClient.invalidateQueries({ queryKey: ['mandates', id] });
    },
  });
  if (query.isPending) return <LoadingRows />;
  if (query.error || !mandate) return <PageError error={query.error} retry={query.refetch} />;
  const version = mandate.currentVersion;
  const budget = budgetQuery.data;
  const used = budget ? BigInt(budget.reservedMinor) + BigInt(budget.spentMinor) : 0n;
  const limit = budget ? BigInt(budget.limitMinor) : 0n;
  const percent = limit > 0n ? Number((used * 100n) / limit) : 0;
  return (
    <div className={styles.pageStack}>
      <Card className={styles.formCard}>
        <div className={styles.cardHeading}><div><h2>{mandate.name}</h2><p>Agent mandate · {mandate.agent_id}</p></div><StatusPill status={mandate.status} /></div>
        {version ? <>
          <p>{version.purposeText}</p>
          <dl className={styles.detailsList}>
            <div><dt>Current version</dt><dd>v{version.version}</dd></div>
            <div><dt>Validity</dt><dd>{dateLabel(version.validFrom)} – {dateLabel(version.validTo)}</dd></div>
            <div><dt>Policy hash</dt><dd><code>{version.policyHash || 'Not activated'}</code></dd></div>
            <div><dt>Signature key ID</dt><dd><code>{version.signingKid || 'Not activated'}</code></dd></div>
          </dl>
          <section className={styles.versionsList}>
            <h3>Versions</h3>
            {(mandate.versions || (version ? [version] : [])).map((item) => (
              <div key={item.id}>
                <strong>Version {item.version}</strong>
                <StatusPill status={item.activatedAt ? 'ACTIVE' : 'DRAFT'} />
                <span>{item.policyHash || 'Not signed yet'}</span>
                <small>{dateLabel(item.createdAt)}</small>
              </div>
            ))}
          </section>
          <PolicySummary policy={version.policy} />
        </> : <p>This draft does not have a policy version.</p>}
        {mandate.status === 'ACTIVE' ? (
          <div className={styles.budgetCard}>
            <div className={styles.cardHeading}><h3>Budget usage</h3><span>{budget ? `${percent}% used` : 'No period usage yet'}</span></div>
            <progress aria-label="Budget used" max="100" value={percent} />
            <p>{budget ? `${formatMoney(used.toString(), budget.currency)} used · ${formatMoney(budget.remainingMinor, budget.currency)} remaining of ${formatMoney(budget.limitMinor, budget.currency)}` : 'Usage appears when the first request reserves budget.'}</p>
            {budget ? <small>{dateLabel(budget.periodStart)} – {dateLabel(budget.periodEnd)}</small> : null}
          </div>
        ) : null}
        {budgetQuery.error ? <p className={styles.formError} role="alert">{budgetQuery.error.message}</p> : null}
        <div className={styles.inlineActions}>
          {mandate.status === 'DRAFT' && allowedAdmin && version ? <Button onClick={() => setStepUp(true)}>Activate</Button> : null}
          {mandate.status === 'ACTIVE' && allowedAdmin ? <Button onClick={() => setConfirmAction('suspend')} variant="secondary">Suspend</Button> : null}
          {['DRAFT', 'ACTIVE', 'SUSPENDED'].includes(mandate.status) && allowedAdmin ? <Button onClick={() => setConfirmAction('revoke')} variant="secondary">Revoke</Button> : null}
        </div>
        {activate.error ? <p className={styles.formError} role="alert">{activate.error.message}</p> : null}
        {statusChange.error ? <p className={styles.formError} role="alert">{statusChange.error.message}</p> : null}
      </Card>
      <StepUpDialog description="Confirm mandate activation." onConfirm={(grantId) => activate.mutateAsync(grantId)} onOpenChange={setStepUp} open={stepUp} purpose="ACTIVATE_MANDATE" />
      <Modal
        footer={<><Button onClick={() => setConfirmAction('')} variant="secondary">Cancel</Button><Button loading={statusChange.isPending} onClick={() => statusChange.mutate(confirmAction)}>{confirmAction === 'revoke' ? 'Revoke mandate' : 'Suspend mandate'}</Button></>}
        onOpenChange={(open) => { if (!open) setConfirmAction(''); }}
        open={Boolean(confirmAction)}
        title={`${confirmAction === 'revoke' ? 'Revoke' : 'Suspend'} mandate?`}
      >
        <p>This changes the mandate status and records the action in the ledger.</p>
      </Modal>
    </div>
  );
}

function PolicySummary({ policy }) {
  if (!policy) return null;
  return (
    <div className={styles.policySummary}>
      {POLICY_GROUPS.map(([title, paths]) => (
        <section key={title}>
          <h3>{title}</h3>
          <dl>{paths.map((path) => (
            <div key={path}><dt>{FIELD_LABELS[path]}</dt><dd>{Array.isArray(getPath(policy, path)) ? getPath(policy, path).join(', ') : String(getPath(policy, path))}</dd></div>
          ))}</dl>
        </section>
      ))}
    </div>
  );
}

export function DocumentsPage() {
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const auth = useAuth();
  const [file, setFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const canDelete = auth.role === 'OWNER';
  const canUpload = ['OWNER', 'ADMIN', 'OPERATOR'].includes(auth.role);
  const query = usePageQuery(['documents'], async () => (await apiClient.get('/documents')).documents, { active: true });
  const upload = useMutation({
    mutationFn: () => apiClient.upload('/documents', file, setProgress),
    onSuccess: async () => {
      setFile(null);
      setProgress(100);
      setUploadError('');
      notify({ message: 'Document uploaded.' });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => setUploadError(error.message),
  });
  const acceptFile = (candidate) => {
    if (!candidate) return;
    const valid = /\.(pdf|png|jpe?g|txt)$/i.test(candidate.name) && candidate.size <= 10 * 1024 * 1024;
    if (!valid) {
      setUploadError('Choose a PDF, PNG, JPG, or TXT file up to 10 MB.');
      setFile(null);
      return;
    }
    setUploadError('');
    setProgress(0);
    setFile(candidate);
  };
  const deletion = useMutation({
    mutationFn: () => apiClient.delete(`/documents/${deleteTarget.id}`),
    onSuccess: async () => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      notify({ message: 'Document deleted.' });
    },
  });
  const documents = query.data || [];
  return (
    <div className={styles.pageStack}>
      {canUpload ? <Card className={`${styles.uploadZone} ${dragging ? styles.uploadDragging : ''}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { event.preventDefault(); setDragging(false); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }}>
        <FileText aria-hidden="true" />
        <h2>Upload a document</h2>
        <p>Drop a file here or choose a PDF, PNG, JPG, or TXT file up to 10 MB.</p>
        <input aria-label="Choose document" accept=".pdf,.png,.jpg,.jpeg,.txt" onChange={(event) => acceptFile(event.target.files[0])} type="file" />
        {file ? <div className={styles.inlineActions}><span>{file.name} · {Math.ceil(file.size / 1024)} KB</span><Button disabled={upload.isPending} loading={upload.isPending} onClick={() => upload.mutate()}>Upload</Button></div> : null}
        {upload.isPending ? <progress aria-label="Upload progress" max="100" value={progress} /> : null}
        {uploadError ? <p className={styles.formError} role="alert">{uploadError}</p> : null}
      </Card> : null}
      {query.isPending ? <LoadingRows /> : query.error ? <PageError error={query.error} retry={query.refetch} /> : documents.length === 0 ? (
        <EmptyState title="No documents" description="Upload an invoice or supporting document to review its extraction and safety flags." />
      ) : (
        <Card className={styles.tableCard} padding="none">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead><tr><th>Document</th><th>Uploaded</th><th>Extraction</th><th>SHA-256</th><th>Actions</th></tr></thead>
              <tbody>{documents.map((document) => (
                <tr key={document.id}>
                  <td><Link to={`/documents/${document.id}`}>{document.filename}</Link><span className={styles.cellDescription}>{document.mime} · {Math.ceil(document.size / 1024)} KB</span></td>
                  <td>{dateLabel(document.createdAt)}</td>
                  <td><StatusPill status={document.status} /></td>
                  <td><code>{document.sha256}</code>{document.injectionFlags?.length ? <span className={styles.flagText}><AlertTriangle aria-hidden="true" />{document.injectionFlags.length} safety flag(s)</span> : null}</td>
                  <td className={styles.tableActions}>
                    <a aria-label={`Download ${document.filename}`} className={styles.iconLink} href={`/api/v1/documents/${document.id}/file`}><ArrowDownToLine aria-hidden="true" /></a>
                    {canDelete ? <Button aria-label={`Delete ${document.filename}`} onClick={() => setDeleteTarget(document)} variant="secondary"><Trash2 aria-hidden="true" /></Button> : null}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
      {deletion.error ? <p className={styles.formError} role="alert">{deletion.error.message}</p> : null}
      <Modal
        footer={<><Button onClick={() => setDeleteTarget(null)} variant="secondary">Cancel</Button><Button loading={deletion.isPending} onClick={() => deletion.mutate()}>Delete document</Button></>}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        open={Boolean(deleteTarget)}
        title="Delete this document?"
      >
        <p>{deleteTarget?.filename} will be removed. Its SHA-256 hash remains in the audit ledger.</p>
      </Modal>
    </div>
  );
}

export function DocumentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = usePageQuery(['documents', id], () => apiClient.get(`/documents/${id}`), { active: true });
  const deletion = useMutation({
    mutationFn: () => apiClient.delete(`/documents/${id}`),
    onSuccess: async () => {
      setConfirmDelete(false);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      notify({ message: 'Document deleted.' });
      navigate('/documents');
    },
  });
  if (query.isPending) return <LoadingRows />;
  if (query.error || !query.data?.document) return <PageError error={query.error} retry={query.refetch} />;
  const { document, extraction } = query.data;
  return (
    <div className={styles.pageStack}>
      <Card className={styles.formCard}>
        <div className={styles.cardHeading}><div><h2>{document.filename}</h2><p>{document.mime} · {Math.ceil(document.size / 1024)} KB</p></div><StatusPill status={document.status} /></div>
        <dl className={styles.detailsList}>
          <div><dt>SHA-256</dt><dd><code>{document.sha256}</code></dd></div>
          <div><dt>Uploaded</dt><dd>{dateLabel(document.createdAt)}</dd></div>
        </dl>
        {extraction ? <Card className={styles.nestedCard}>
          <h3>Invoice extraction</h3>
          <dl className={styles.detailsList}>
            <div><dt>Payee</dt><dd>{extraction.payeeName || '—'}</dd></div>
            <div><dt>Invoice number</dt><dd>{extraction.invoiceNumber || '—'}</dd></div>
            <div><dt>Amount</dt><dd>{extraction.amountMinor ? formatMoney(extraction.amountMinor, extraction.currency) : '—'}</dd></div>
            <div><dt>Due date</dt><dd>{extraction.dueDate || '—'}</dd></div>
            <div><dt>Confidence</dt><dd>{extraction.confidence ?? '—'}</dd></div>
            <div><dt>Notes</dt><dd>{extraction.notes || '—'}</dd></div>
          </dl>
          {extraction.items?.length ? <pre className={styles.diffPreview}>{JSON.stringify(extraction.items, null, 2)}</pre> : null}
        </Card> : <p>No structured extraction is available for this document.</p>}
        <section className={styles.flagSection}>
          <h3>Injection and safety flags</h3>
          {document.injectionFlags?.length ? <ul>{document.injectionFlags.map((flag, index) => <li key={`${flag.kind}-${index}`}><AlertTriangle aria-hidden="true" /><strong>{flag.kind}</strong><span>{flag.evidence_excerpt}</span><small>{flag.location}</small></li>)}</ul> : <p>No injection flags found.</p>}
        </section>
        <div className={styles.inlineActions}>
          <a className={styles.primaryLink} href={`/api/v1/documents/${id}/file`}><ArrowDownToLine aria-hidden="true" />Download</a>
          {auth.role === 'OWNER' ? <Button onClick={() => setConfirmDelete(true)} variant="secondary"><Trash2 aria-hidden="true" />Delete</Button> : null}
        </div>
        {deletion.error ? <p className={styles.formError} role="alert">{deletion.error.message}</p> : null}
      </Card>
      <Modal
        footer={<><Button onClick={() => setConfirmDelete(false)} variant="secondary">Cancel</Button><Button loading={deletion.isPending} onClick={() => deletion.mutate()}>Delete document</Button></>}
        onOpenChange={setConfirmDelete}
        open={confirmDelete}
        title="Delete this document?"
      >
        <p>The file will be removed. Its SHA-256 hash remains in the audit ledger.</p>
      </Modal>
    </div>
  );
}

export function RequestsPage() {
  const [status, setStatus] = useState('');
  const [agentId, setAgentId] = useState('');
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState('');
  const [previousCursors, setPreviousCursors] = useState([]);
  const agentsQuery = usePageQuery(['agents'], async () => (await apiClient.get('/agents')).agents);
  const queryKey = ['requests', { status, agentId, search, cursor }];
  const query = usePageQuery(queryKey, async () => {
    const params = new URLSearchParams({ limit: '25' });
    if (status) params.set('status', status);
    if (agentId) params.set('agentId', agentId);
    if (search.trim()) params.set('q', search.trim());
    if (cursor) params.set('cursor', cursor);
    return apiClient.get(`/requests?${params}`);
  }, { active: true });
  const changeFilter = (setter, value) => {
    setter(value);
    setCursor('');
    setPreviousCursors([]);
  };
  const rows = query.data?.requests || [];
  return (
    <div className={styles.pageStack}>
      <div className={styles.filters}>
        <FilterSelect aria-label="Status" onChange={(event) => changeFilter(setStatus, event.target.value)} value={status}>
          <option value="">All statuses</option>
          {REQUEST_STATUSES.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
        </FilterSelect>
        <FilterSelect aria-label="Agent" onChange={(event) => changeFilter(setAgentId, event.target.value)} value={agentId}>
          <option value="">All agents</option>
          {(agentsQuery.data || []).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </FilterSelect>
        <label className={styles.searchField}><Search aria-hidden="true" /><input aria-label="Search requests" onChange={(event) => changeFilter(setSearch, event.target.value)} placeholder="Search requests" value={search} /></label>
      </div>
      {query.isPending ? <LoadingRows /> : query.error ? <PageError error={query.error} retry={query.refetch} /> : rows.length === 0 ? (
        <EmptyState title="No requests found" description="Requests matching these filters will appear here." />
      ) : (
        <Card className={styles.tableCard} padding="none">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead><tr><th>Time</th><th>Agent</th><th>Payee</th><th className={styles.amountCell}>Amount</th><th>Decision</th><th>Status</th><th>Reason codes</th></tr></thead>
              <tbody>{rows.map((request) => (
                <tr key={request.id}>
                  <td><Link to={`/requests/${request.id}`}>{dateLabel(request.created_at)}</Link></td>
                  <td>{request.agent_name}</td>
                  <td>{request.payee_name || request.payee_id}</td>
                  <td className={styles.amountCell}>{formatMoney(request.amount_minor, request.currency)}</td>
                  <td>{request.decision || '—'}</td>
                  <td><StatusPill status={request.status} /></td>
                  <td><small>{(request.reason_codes || []).join(', ') || '—'}</small></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Pagination
            cursor={Boolean(cursor)}
            count={rows.length}
            hasNext={Boolean(query.data?.nextCursor)}
            onNext={() => {
              setPreviousCursors((current) => [...current, cursor]);
              setCursor(query.data.nextCursor);
            }}
            onPrevious={() => {
              setCursor(previousCursors.at(-1) || '');
              setPreviousCursors((current) => current.slice(0, -1));
            }}
          />
        </Card>
      )}
    </div>
  );
}

export function RequestDetailPage() {
  const { id } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const query = usePageQuery(['requests', id], () => apiClient.get(`/requests/${id}`), { active: true });
  const cancel = useMutation({
    mutationFn: () => apiClient.post(`/requests/${id}/cancel`),
    onSuccess: async () => {
      notify({ message: 'Request cancelled.' });
      await queryClient.invalidateQueries({ queryKey: ['requests'] });
      await queryClient.invalidateQueries({ queryKey: ['requests', id] });
    },
  });
  if (query.isPending) return <LoadingRows />;
  if (query.error || !query.data?.request) return <PageError error={query.error} retry={query.refetch} />;
  const { request, evaluations, timeline, approvals, executions, ledger } = query.data;
  const canCancel = ['OWNER', 'ADMIN', 'APPROVER'].includes(auth.role)
    && (request.status === 'PENDING_APPROVAL' || request.status === 'APPROVED');
  return (
    <div className={styles.detailColumns}>
      <div className={styles.pageStack}>
        <Card className={styles.formCard}>
          <div className={styles.cardHeading}><div><h2>Request {request.id}</h2><p>{request.action} · {dateLabel(request.created_at)}</p></div><StatusPill status={request.status} /></div>
          <dl className={styles.detailsList}>
            <div><dt>Amount</dt><dd>{formatMoney(request.amount_minor, request.currency)}</dd></div>
            <div><dt>Payee</dt><dd>{request.payee_id || '—'}</dd></div>
            <div><dt>Decision</dt><dd>{request.decision || '—'}</dd></div>
            <div><dt>Request hash</dt><dd><code>{request.request_hash}</code></dd></div>
          </dl>
          {request.explanation ? <p>{request.explanation}</p> : null}
          {request.reason_codes?.length ? <div className={styles.reasonCodes}>{request.reason_codes.map((code) => <code key={code}>{code}</code>)}</div> : null}
        </Card>
        <Card className={styles.formCard}>
          <h2>Request timeline</h2>
          <ol className={styles.timeline}>
            <li><span className={styles.timelineDot} /><div><strong>RECEIVED</strong><small>{dateLabel(request.created_at)}</small></div></li>
            {evaluations.map((evaluation) => {
              const result = typeof evaluation.result === 'string' ? JSON.parse(evaluation.result) : evaluation.result;
              return <li key={evaluation.id || `${evaluation.stage}-${evaluation.created_at}`}><span className={styles.timelineDot} /><div><strong>Evaluation {evaluation.stage}</strong><small>{dateLabel(evaluation.created_at)}</small><p>{(result?.reasonCodes || result?.reason_codes || []).join(', ') || JSON.stringify(result)}</p></div></li>;
            })}
            <li><span className={styles.timelineDot} /><div><strong>{request.status}</strong><small>{dateLabel(request.updated_at || request.created_at)}</small></div></li>
            {approvals.map((approval) => <li key={approval.id}><span className={styles.timelineDot} /><div><strong>Approval · {approval.status}</strong><small>Expires {dateLabel(approval.expires_at)}</small><Link to={`/approvals/${approval.id}`}>Open approval</Link></div></li>)}
            {executions.map((execution) => <li key={execution.id}><span className={styles.timelineDot} /><div><strong>Execution · {execution.status}</strong><small>{dateLabel(execution.created_at)}</small></div></li>)}
            {ledger.map((entry) => <li key={entry.seq}><span className={styles.timelineDot} /><div><strong>{entry.type}</strong><small>{dateLabel(entry.created_at)} · sequence {entry.seq}</small><code>{entry.entry_hash || entry.hash || 'Ledger entry'}</code></div></li>)}
            {timeline.length === 0 && !evaluations.length ? <li><span className={styles.timelineDot} /><div><strong>No additional events</strong></div></li> : null}
          </ol>
        </Card>
      </div>
      <Card className={styles.actionCard}>
        <h2>Actions</h2>
        {canCancel ? <Button loading={cancel.isPending} onClick={() => cancel.mutate()} variant="secondary">Cancel request</Button> : <p>No actions are available for this request.</p>}
        {cancel.error ? <p className={styles.formError} role="alert">{cancel.error.message}</p> : null}
        {request.reason_codes?.length ? <section><h3>Why this decision?</h3><p>{request.explanation || request.reason_codes.join(', ')}</p>{request.reason_codes.map((code) => <small className={styles.reasonCode} key={code}>{code}</small>)}</section> : null}
      </Card>
    </div>
  );
}

export function ApprovalsPage() {
  const [status, setStatus] = useState('PENDING');
  const [cursor, setCursor] = useState('');
  const [previousCursors, setPreviousCursors] = useState([]);
  const query = usePageQuery(['approvals', status, cursor], async () => {
    const params = new URLSearchParams({ limit: '25', status });
    if (cursor) params.set('cursor', cursor);
    return apiClient.get(`/approvals?${params}`);
  }, { active: status === 'PENDING' });
  const rows = query.data?.approvals || [];
  return (
    <div className={styles.pageStack}>
      <FilterSelect aria-label="Status" onChange={(event) => { setStatus(event.target.value); setCursor(''); setPreviousCursors([]); }} value={status}>
        {['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
      </FilterSelect>
      {query.isPending ? <LoadingRows /> : query.error ? <PageError error={query.error} retry={query.refetch} /> : rows.length === 0 ? (
        <EmptyState title="No approvals" description={status === 'PENDING' ? 'Requests waiting for review will appear here.' : 'There are no approvals in this status.'} />
      ) : (
        <Card className={styles.tableCard} padding="none">
          <div className={styles.tableScroll}>
            <table className={styles.dataTable}>
              <thead><tr><th>Request</th><th>Agent</th><th>Payee</th><th className={styles.amountCell}>Amount</th><th>Status</th><th>Expires</th></tr></thead>
              <tbody>{rows.map((approval) => (
                <tr key={approval.id}>
                  <td><Link to={`/approvals/${approval.id}`}>{approval.action} · {approval.request_id}</Link></td>
                  <td>{approval.agent_name}</td><td>{approval.payee_name || approval.payee_id || '—'}</td>
                  <td className={styles.amountCell}>{formatMoney(approval.amount_minor, approval.currency)}</td>
                  <td><StatusPill status={approval.status} /></td><td>{dateLabel(approval.expires_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <Pagination cursor={Boolean(cursor)} count={rows.length} hasNext={Boolean(query.data?.nextCursor)} onNext={() => { setPreviousCursors((current) => [...current, cursor]); setCursor(query.data.nextCursor); }} onPrevious={() => { setCursor(previousCursors.at(-1) || ''); setPreviousCursors((current) => current.slice(0, -1)); }} />
        </Card>
      )}
    </div>
  );
}

export function ApprovalDetailPage() {
  const { id } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [decision, setDecision] = useState('');
  const [comment, setComment] = useState('');
  const [banner, setBanner] = useState('');
  const [stepUp, setStepUp] = useState(false);
  const query = usePageQuery(['approvals', id], () => apiClient.get(`/approvals/${id}`), { active: true });
  const decide = useMutation({
    mutationFn: ({ choice, grantId }) => apiClient.post(`/approvals/${id}/decision`, {
      requestHash: query.data.approval.requestHash,
      decision: choice,
      comment,
      ...(grantId ? { stepUpGrantId: grantId } : {}),
    }),
    onSuccess: async ({ result }) => {
      setBanner('');
      setDecision('');
      notify({ message: `Approval ${result.status?.toLowerCase() || 'decided'}.` });
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
      await queryClient.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: async (error) => {
      if (error.code === 'REQUEST_HASH_MISMATCH') {
        setBanner('Request changed, review again.');
        await queryClient.invalidateQueries({ queryKey: ['approvals', id] });
      } else if (error.code === 'APPROVAL_EXPIRED') {
        setBanner('This approval has expired.');
        await queryClient.invalidateQueries({ queryKey: ['approvals'] });
        await queryClient.invalidateQueries({ queryKey: ['approvals', id] });
      }
      else setBanner(error.message);
    },
  });
  if (query.isPending) return <LoadingRows />;
  if (query.error || !query.data?.approval) return <PageError error={query.error} retry={query.refetch} />;
  const { approval, request, document, evaluations, payeeHistory, decisions, executions, ledger, budget } = query.data;
  const canDecide = ['OWNER', 'ADMIN', 'APPROVER'].includes(auth.role) && approval.status === 'PENDING';
  const startDecision = (choice) => {
    setDecision(choice);
    if (approval.stepUpRequired && choice === 'APPROVE') setStepUp(true);
    else decide.mutate({ choice });
  };
  const confirmStepUp = (grantId) => decide.mutateAsync({ choice: decision, grantId });
  return (
    <div className={styles.detailColumns}>
      <div className={styles.pageStack}>
        <Card className={styles.formCard}>
          <div className={styles.cardHeading}><div><h2>Review request</h2><p>{request.agentName} · {request.action}</p></div><StatusPill status={approval.status} /></div>
          <dl className={styles.detailsList}>
            <div><dt>Amount</dt><dd>{formatMoney(request.amountMinor, request.currency)}</dd></div>
            <div><dt>Payee</dt><dd>{request.payeeName || '—'} · {request.payeeTrust || 'Unknown trust'}</dd></div>
            <div><dt>Request status</dt><dd>{request.status}</dd></div>
            <div><dt>Expires</dt><dd>{dateLabel(approval.expiresAt)}</dd></div>
            <div><dt>Request hash</dt><dd><code>{approval.requestHash}</code></dd></div>
            <div><dt>Reason codes</dt><dd>{request.reasonCodes?.join(', ') || '—'}</dd></div>
          </dl>
          {request.explanation ? <p>{request.explanation}</p> : null}
        </Card>
        {document ? <Card className={styles.formCard}>
          <h3>Supporting document</h3>
          <p><Link to={`/documents/${document.id}`}>{document.filename}</Link> · {document.status}</p>
          {document.extraction ? <dl className={styles.detailsList}>
            <div><dt>Extracted payee</dt><dd>{document.extraction.payeeName || '—'}</dd></div>
            <div><dt>Invoice</dt><dd>{document.extraction.invoiceNumber || '—'}</dd></div>
            <div><dt>Amount</dt><dd>{formatMoney(document.extraction.amountMinor, document.extraction.currency)}</dd></div>
            <div><dt>Confidence</dt><dd>{document.extraction.confidence ?? '—'}</dd></div>
          </dl> : null}
          <p><code>{document.sha256}</code></p>
          {document.injectionFlags?.length ? <ul className={styles.flagList}>{document.injectionFlags.map((flag, index) => <li key={`${flag.kind}-${index}`}><AlertTriangle aria-hidden="true" />{flag.kind}: {flag.evidence_excerpt}</li>)}</ul> : <p>No injection flags.</p>}
        </Card> : <Card className={styles.formCard}><h3>Supporting document</h3><p>No document is attached.</p></Card>}
        <Card className={styles.formCard}>
          <h3>Evaluation results</h3>
          <ol className={styles.timeline}>
            {evaluations.map((evaluation) => {
              const result = typeof evaluation.result === 'string' ? JSON.parse(evaluation.result) : evaluation.result;
              return <li key={evaluation.id || `${evaluation.stage}-${evaluation.created_at}`}><span className={styles.timelineDot} /><div><strong>Stage {evaluation.stage}</strong><p>{(result?.reasonCodes || result?.reason_codes || []).join(', ') || JSON.stringify(result)}</p><small>{dateLabel(evaluation.created_at)}</small></div></li>;
            })}
          </ol>
        </Card>
        <Card className={styles.formCard}>
          <h3>Payee history</h3>
          <p>Identifier revisions: {payeeHistory.revisions.length}</p>
          {payeeHistory.revisions.map((revision) => <p key={revision.id}>{revision.field} · {dateLabel(revision.created_at)}</p>)}
          <p>Previous requests: {payeeHistory.priorRequests.length}</p>
          {payeeHistory.priorRequests.map((previous) => <p key={previous.id}><Link to={`/requests/${previous.id}`}>{previous.status}</Link> · {formatMoney(previous.amount_minor, previous.currency)} · {dateLabel(previous.created_at)}</p>)}
        </Card>
        <Card className={styles.formCard}>
          <h3>Budget remaining</h3>
          {budget ? <p>{formatMoney(budget.remainingMinor, request.currency)} remaining of {formatMoney(budget.limitMinor, request.currency)}</p> : <p>Budget period data is unavailable.</p>}
        </Card>
      </div>
      <Card className={styles.actionCard}>
        <h2>Decision</h2>
        <p>Approval expires {dateLabel(approval.expiresAt)}.</p>
        {approval.stepUpRequired ? <Banner kind="warning" title="Step-up required">Approving this amount requires re-authentication.</Banner> : null}
        <label className={styles.editorField}><span>Comment</span><textarea maxLength={1000} onChange={(event) => setComment(event.target.value)} value={comment} /></label>
        {banner ? <Banner kind={banner.includes('expired') ? 'warning' : 'error'} title={banner}>{banner === 'Request changed, review again.' ? 'The request hash changed after this approval was opened. Review the refreshed request details.' : null}</Banner> : null}
        {canDecide ? <div className={styles.decisionButtons}>
          <Button disabled={decide.isPending} onClick={() => startDecision('APPROVE')}>Approve</Button>
          <Button disabled={decide.isPending} onClick={() => startDecision('REJECT')} variant="secondary">Reject</Button>
        </div> : <p>No decision actions are available for this approval.</p>}
        {decide.error && !banner ? <p className={styles.formError} role="alert">{decide.error.message}</p> : null}
        <h3>Decision history</h3>
        {decisions.length ? decisions.map((item) => <p key={item.id}>{item.decision} · {dateLabel(item.created_at)}<br />{item.comment || ''}</p>) : <p>No decisions recorded.</p>}
        {executions.length || ledger.length ? <p>{executions.length} execution record(s) · {ledger.length} ledger entry(s)</p> : null}
      </Card>
      <StepUpDialog
        description="Confirm your identity to approve this request."
        onConfirm={confirmStepUp}
        onOpenChange={(open) => { setStepUp(open); if (!open) setDecision(''); }}
        open={stepUp}
        purpose="APPROVE_ABOVE_THRESHOLD"
      />
    </div>
  );
}
