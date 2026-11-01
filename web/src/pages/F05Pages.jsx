import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, ExternalLink, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { ERROR_CODES } from '@shared/error-codes.js';

import { apiClient } from '../api/client.js';
import { useAuth } from '../auth/AuthProvider.jsx';
import {
  Banner,
  Button,
  Card,
  CodeBlock,
  EmptyState,
  Modal,
  Skeleton,
  StatusPill,
  useToast,
} from '../components/primitives.jsx';
import styles from './F05Pages.module.css';

const PAGE_SIZE = 25;

function useCursorPage(key, path, filters = {}) {
  const [cursors, setCursors] = useState([]);
  const cursor = cursors.at(-1);
  const query = new URLSearchParams({ limit: String(PAGE_SIZE), ...filters });
  if (cursor) query.set('cursor', cursor);
  const result = useQuery({
    queryKey: [key, filters, cursor],
    queryFn: () => apiClient.get(`${path}?${query.toString()}`),
  });
  return {
    ...result,
    page: result.data,
    cursors,
    next: () => result.data?.nextCursor && setCursors((value) => [...value, result.data.nextCursor]),
    previous: () => setCursors((value) => value.slice(0, -1)),
    reset: () => setCursors([]),
  };
}

function VirtualTable({ columns, data, emptyTitle, emptyDescription, highlightRow }) {
  const parentRef = useRef(null);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--jp-table-row-h');
      return Number.parseFloat(value) || 0;
    },
    overscan: 8,
  });

  if (!data.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;

  return (
    <div className={styles.virtualTable} ref={parentRef} role="table">
      <div className={`${styles.virtualRow} ${styles.virtualHeader}`} role="row">
        {table.getHeaderGroups().flatMap((group) => group.headers).map((header) => (
          <div className={styles.virtualCell} key={header.id} role="columnheader">
            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
          </div>
        ))}
      </div>
      <div className={styles.virtualBody} style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              className={`${styles.virtualRow} ${row.original.seq === highlightRow ? styles.brokenRow : ''}`}
              key={row.id}
              role="row"
              style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.getVisibleCells().map((cell) => (
                <div className={styles.virtualCell} key={cell.id} role="cell">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CursorPagination({ page, cursors, onPrevious, onNext, total }) {
  const start = total === 0 ? 0 : cursors.length * PAGE_SIZE + 1;
  const end = Math.min(cursors.length * PAGE_SIZE + (page?.entries?.length ?? page?.events?.length ?? 0), total);
  return (
    <div className={styles.pagination}>
      <span>{start}-{end} of {total}</span>
      <div>
        <Button aria-label="Previous page" className={styles.pageButton} disabled={!cursors.length} onClick={onPrevious} variant="secondary">‹</Button>
        <Button aria-label="Next page" className={styles.pageButton} disabled={!page?.hasNext} onClick={onNext} variant="secondary">›</Button>
      </div>
    </div>
  );
}

function PageLoading() {
  return <div className={styles.loadingRows}><Skeleton /><Skeleton /><Skeleton /></div>;
}

function FilterBar({ children, onSearch, search, onSubmit }) {
  return (
    <div className={styles.filterBar}>
      {children}
      <label className={styles.searchBox}>
        <Search aria-hidden="true" />
        <span className={styles.visuallyHidden}>Search</span>
        <input onChange={(event) => onSearch(event.target.value)} placeholder="Search" value={search} />
      </label>
      <Button onClick={onSubmit} variant="secondary">Search</Button>
    </div>
  );
}

function useSearchFilters() {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  return { draft, search, setDraft, setSearch };
}

export function LedgerPage() {
  const location = useLocation();
  const [type, setType] = useState('');
  const [subject, setSubject] = useState('');
  const [seqFrom, setSeqFrom] = useState('');
  const [seqTo, setSeqTo] = useState('');
  const filters = useSearchFilters();
  const page = useCursorPage('ledger', '/ledger', {
    ...(type ? { type } : {}),
    ...(subject ? { subject } : {}),
    ...(seqFrom ? { seqFrom } : {}),
    ...(seqTo ? { seqTo } : {}),
    ...(filters.search ? { q: filters.search } : {}),
  });
  const [verification, setVerification] = useState(null);
  const [brokenEntry, setBrokenEntry] = useState(null);
  const { notify } = useToast();
  const verify = useMutation({
    mutationFn: () => apiClient.get('/ledger/verify'),
    onSuccess: async (result) => {
      setVerification(result);
      setBrokenEntry(null);
      if (!result.valid && result.firstBrokenSeq != null) {
        const row = page.page?.entries?.find((entry) => entry.seq === result.firstBrokenSeq);
        if (row) setBrokenEntry(row);
        else {
          const detail = await apiClient.get(`/ledger?limit=1&seqFrom=${result.firstBrokenSeq}&seqTo=${result.firstBrokenSeq}`);
          setBrokenEntry(detail.entries[0] ?? null);
        }
      }
    },
    onError: (error) => notify({ kind: 'error', message: error.message }),
  });
  const verifyLedger = verify.mutate;
  useEffect(() => {
    if (location.pathname.endsWith('/verify')) verifyLedger();
  }, [location.pathname, verifyLedger]);
  const columns = useMemo(() => [
    { accessorKey: 'seq', header: 'Seq' },
    { accessorKey: 'created_at', header: 'Time', cell: ({ getValue }) => new Date(getValue()).toLocaleString() },
    { accessorKey: 'type', header: 'Type' },
    { accessorFn: (row) => `${row.subject_type || '—'} ${row.subject_id || ''}`, id: 'subject', header: 'Subject' },
    { accessorFn: (row) => JSON.stringify(row.payload ?? {}), id: 'payload', header: 'Summary' },
    {
      accessorKey: 'entry_hash',
      header: 'Entry hash',
      cell: ({ getValue }) => <CopyHash value={getValue()} />,
    },
    { accessorKey: 'kid', header: 'kid' },
  ], []);
  const entries = page.page?.entries ?? [];
  const tableData = brokenEntry && !entries.some((entry) => entry.seq === brokenEntry.seq)
    ? [...entries, brokenEntry].sort((a, b) => b.seq - a.seq)
    : entries;
  const download = async () => {
    try {
      const response = await fetch('/api/v1/ledger/export?format=json', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Ledger export could not be downloaded.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'ledger.json';
      anchor.click();
      URL.revokeObjectURL(url);
      notify({ message: 'Ledger JSON exported.' });
    } catch (error) {
      notify({ kind: 'error', message: error.message });
    }
  };
  const showBroken = verification && !verification.valid;

  return (
    <div className={styles.pageStack}>
      <div className={styles.pageToolbar}>
        <h2>Ledger</h2>
        <div className={styles.actions}>
          <Button loading={verify.isPending} onClick={() => verify.mutate()} variant="secondary"><ShieldCheck aria-hidden="true" /> Verify ledger</Button>
          <Button onClick={download} variant="secondary"><Download aria-hidden="true" /> Export JSON</Button>
        </div>
      </div>
      {verification ? (
        <Banner kind={verification.valid ? 'success' : 'error'} title={verification.valid ? 'Ledger verified' : `Ledger integrity failed at sequence ${verification.firstBrokenSeq}`}>
          {verification.valid
            ? `${verification.checkedEntries} entries checked.`
            : `${verification.checkedEntries} entries checked. ${verification.reason}`}
        </Banner>
      ) : null}
      {showBroken && brokenEntry ? (
        <Card className={styles.brokenEntry}>
          <strong><TriangleAlert aria-hidden="true" /> Broken entry highlighted</strong>
          <span>Sequence {brokenEntry.seq}: {brokenEntry.type} — {JSON.stringify(brokenEntry.payload)}</span>
        </Card>
      ) : null}
      <Card className={styles.tableCard}>
        <FilterBar
          onSearch={filters.setDraft}
          onSubmit={() => { filters.setSearch(filters.draft.trim()); page.reset(); }}
          search={filters.draft}
        >
          <label className={styles.filterPill}>Type
            <select onChange={(event) => { setType(event.target.value); page.reset(); }} value={type}>
              <option value="">All types</option>
              {['REQUEST_RECEIVED', 'REQUEST_DECIDED', 'APPROVAL_DECIDED', 'EXECUTION_STARTED', 'EXECUTION_RESULT', 'RECONCILED', 'MISMATCH', 'DOCUMENT_ADDED', 'DOCUMENT_DELETED', 'DEMO_RESET'].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className={styles.filterPill}>Subject
            <input onChange={(event) => { setSubject(event.target.value); page.reset(); }} placeholder="Type or ID" value={subject} />
          </label>
          <label className={styles.filterPill}>Seq from
            <input min="1" onChange={(event) => { setSeqFrom(event.target.value); page.reset(); }} type="number" value={seqFrom} />
          </label>
          <label className={styles.filterPill}>Seq to
            <input min="1" onChange={(event) => { setSeqTo(event.target.value); page.reset(); }} type="number" value={seqTo} />
          </label>
        </FilterBar>
        {page.isPending ? <PageLoading /> : page.error ? <Banner kind="error" title="Unable to load ledger">{page.error.message}</Banner> : (
          <>
            <VirtualTable
              columns={columns}
              data={tableData}
              emptyDescription="Ledger entries will appear here as activity occurs."
              emptyTitle="No ledger entries"
              highlightRow={showBroken ? verification.firstBrokenSeq : null}
            />
            <CursorPagination page={page.page} cursors={page.cursors} onNext={page.next} onPrevious={page.previous} total={page.page?.total ?? 0} />
          </>
        )}
      </Card>
    </div>
  );
}

export function AuditPage() {
  const filters = useSearchFilters();
  const [action, setAction] = useState('');
  const page = useCursorPage('audit', '/audit', {
    ...(action ? { action } : {}),
    ...(filters.search ? { q: filters.search } : {}),
  });
  const columns = useMemo(() => [
    { accessorKey: 'created_at', header: 'Time', cell: ({ getValue }) => new Date(getValue()).toLocaleString() },
    { accessorKey: 'actor', header: 'Actor' },
    { accessorKey: 'action', header: 'Action' },
    { accessorKey: 'target', header: 'Target', cell: ({ getValue }) => getValue() || '—' },
  ], []);

  return (
    <div className={styles.pageStack}>
      <h2>Audit</h2>
      <Card className={styles.tableCard}>
        <FilterBar
          onSearch={filters.setDraft}
          onSubmit={() => { filters.setSearch(filters.draft.trim()); page.reset(); }}
          search={filters.draft}
        >
          <label className={styles.filterPill}>Action
            <input onChange={(event) => { setAction(event.target.value); page.reset(); }} placeholder="All actions" value={action} />
          </label>
        </FilterBar>
        {page.isPending ? <PageLoading /> : page.error ? <Banner kind="error" title="Unable to load audit events">{page.error.message}</Banner> : (
          <>
            <VirtualTable columns={columns} data={page.page?.events ?? []} emptyDescription="Audit events will appear here." emptyTitle="No audit events" />
            <CursorPagination page={page.page} cursors={page.cursors} onNext={page.next} onPrevious={page.previous} total={page.page?.total ?? 0} />
          </>
        )}
      </Card>
    </div>
  );
}

export function SimulatorPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { notify } = useToast();
  const [results, setResults] = useState([]);
  const [resetOpen, setResetOpen] = useState(false);
  const run = useMutation({
    mutationFn: (scenario) => apiClient.post('/simulator/run', { scenario }),
    onSuccess: (result) => {
      setResults(result.results);
      const passed = result.results.every((entry) => entry.passed);
      notify({ message: passed ? 'Simulator scenarios passed.' : 'Simulator scenarios completed with failures.', kind: passed ? 'success' : 'error' });
    },
    onError: (error) => notify({ message: error.message, kind: 'error' }),
  });
  const reset = useMutation({
    mutationFn: () => apiClient.post('/admin/demo-reset', {}),
    onSuccess: (result) => {
      setResults([]);
      setResetOpen(false);
      queryClient.invalidateQueries();
      auth.refresh();
      notify({ message: `Demo data reset. New organization ${result.organizationId} is ready.` });
    },
    onError: (error) => notify({ message: error.message, kind: 'error' }),
  });
  const resetBudget = useMutation({
    mutationFn: () => apiClient.post('/simulator/reset-budget', {}),
    onSuccess: (result) => {
      setResults([]);
      notify({ message: `Demo budget reset. ${result.cancelledRequests} pending request(s) cancelled.` });
    },
    onError: (error) => notify({ message: error.message, kind: 'error' }),
  });

  return (
    <div className={styles.pageStack}>
      <h2>Simulator</h2>
      <Banner title="Synthetic data. Sandbox only.">Scenarios submit requests using seeded synthetic documents and do not directly execute payouts.</Banner>
      <Card className={styles.simulatorCard}>
        <div className={styles.actions}>
          <Button disabled={run.isPending} loading={run.isPending} onClick={() => run.mutate('legit')}>Run legit invoice</Button>
          <Button disabled={run.isPending} loading={run.isPending} onClick={() => run.mutate('attack-pack')} variant="secondary">Run attack pack</Button>
          <Button disabled={run.isPending} loading={run.isPending} onClick={() => run.mutate('all')} variant="secondary">Run all</Button>
          {['OWNER', 'JUDGE'].includes(auth.role) ? (
            <Button disabled={reset.isPending} onClick={() => setResetOpen(true)} variant="secondary">Reset demo data</Button>
          ) : null}
          {['OWNER', 'ADMIN', 'JUDGE'].includes(auth.role) ? (
            <Button disabled={resetBudget.isPending} loading={resetBudget.isPending} onClick={() => resetBudget.mutate()} variant="secondary">Reset demo budget</Button>
          ) : null}
        </div>
        {run.isPending ? <PageLoading /> : results.length ? (
          <div className={styles.resultTable}>
            <div className={styles.resultHeader}><span>Scenario</span><span>Result</span><span>Decision</span><span>Reason codes</span><span>Request</span></div>
            {results.map((result) => (
              <div className={styles.resultRow} key={`${result.scenario}-${result.requestId || result.reasonCodes.join('-')}`}>
                <strong>{result.scenario}</strong>
                <StatusPill label={result.passed ? 'PASS' : 'FAIL'} status={result.passed ? 'APPROVED' : 'FAILED'} />
                <span>{result.decision || result.status}</span>
                <span className={styles.reasonCodes}>{result.reasonCodes.join(', ') || '—'}</span>
                {result.requestId ? <Link to={`/requests/${result.requestId}`}>View <ExternalLink aria-hidden="true" /></Link> : <span>—</span>}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Ready to simulate" description="Choose a scenario to test legitimate and hostile invoice inputs." />
        )}
      </Card>
      <Modal
        description="A new synthetic organization will be seeded. The current demo organization will be archived as read-only; its ledger will remain intact."
        footer={(
          <>
            <Button onClick={() => setResetOpen(false)} variant="secondary">Cancel</Button>
            <Button disabled={reset.isPending} loading={reset.isPending} onClick={() => reset.mutate()}>Reset demo data</Button>
          </>
        )}
        onOpenChange={setResetOpen}
        open={resetOpen}
        title="Reset demo data?"
      />
    </div>
  );
}

const REMEDIATIONS = {
  ORG_FROZEN: 'Ask an organization owner to unfreeze the organization before submitting a request.',
  CAP_EXCEEDED: 'Reduce the amount to the active mandate transaction cap.',
  DUPLICATE_SUSPECTED: 'Review the prior request and use a new invoice only when it is genuinely distinct.',
  INVOICE_REQUIRED: 'Attach a readable invoice that has completed extraction.',
  INVOICE_MISMATCH_AMOUNT: 'Correct the request amount or provide an invoice with a matching total.',
  DOC_INJECTION_SUSPECTED: 'Review the source document manually and confirm its payee and bank details.',
  AI_UNAVAILABLE: 'Wait for AI evaluation service or budget availability; the request remains fail-closed.',
  AI_HIGH_RISK: 'Review the request details and mandate intent before proposing it again.',
  AI_INTENT_MISMATCH: 'Align the request with the trusted mandate purpose or request human review.',
};

export function DeveloperPage() {
  const info = useQuery({ queryKey: ['developer-info'], queryFn: () => apiClient.get('/developer/info') });
  const reasonCodes = Object.entries(ERROR_CODES);

  return (
    <div className={styles.pageStack}>
      <h2><code>&lt;/&gt;</code> Developer</h2>
      {info.isPending ? <PageLoading /> : info.error ? <Banner kind="error" title="Unable to load developer info">{info.error.message}</Banner> : (
        <>
          <Card className={styles.developerCard}>
            <h3>MCP server</h3>
            <CodeBlock value={info.data.mcpUrl} />
            <h3>Node 22 client</h3>
            <CodeBlock value={`const response = await fetch(process.env.JOBENPAY_URL + '/api/v1/agent/v1/payout-requests', {\n  method: 'POST',\n  headers: { Authorization: 'Bearer ' + process.env.JOBENPAY_AGENT_KEY, 'Idempotency-Key': crypto.randomUUID(), 'Content-Type': 'application/json' },\n  body: JSON.stringify({ payeeId, amountMinor: 1250, currency: 'USD' }),\n});\nconsole.log(await response.json());`} />
            <h3>MCP client configuration</h3>
            <CodeBlock value={JSON.stringify({ mcpServers: { jobenpay: { url: info.data.mcpUrl, headers: { Authorization: 'Bearer ${JOBENPAY_AGENT_KEY}' } } } }, null, 2)} />
            <h3>Available tools</h3>
            <ul>{info.data.tools.map((tool) => <li key={tool.name}><code>{tool.name}</code> — {tool.description}</li>)}</ul>
            <a href="/api/v1/developer/integration-docs">Read docs/INTEGRATION.md <ExternalLink aria-hidden="true" /></a>
          </Card>
          <Card className={styles.developerCard}>
            <h3>Reason codes and remediation</h3>
            <div className={styles.reasonTable}>
              {reasonCodes.map(([code, details]) => (
                <div className={styles.reasonRow} key={code}>
                  <code>{code}</code>
                  <span>{details.message}</span>
                  <span>{REMEDIATIONS[code] || 'Review the request and its mandate; if needed, ask an authorized reviewer.'}</span>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function CopyHash({ value }) {
  const { notify } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notify({ message: 'Ledger hash copied.' });
    } catch (error) {
      notify({ message: error.message || 'Could not copy the ledger hash.', kind: 'error' });
    }
  };
  return <button className={styles.copyHash} onClick={copy} title="Copy hash" type="button">{value.slice(0, 14)}…</button>;
}

export default { AuditPage, DeveloperPage, LedgerPage, SimulatorPage };
