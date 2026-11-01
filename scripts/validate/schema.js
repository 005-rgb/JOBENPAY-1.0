import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const requiredTables = [
  'users', 'sessions', 'email_tokens', 'step_up_grants', 'organizations', 'memberships',
  'invitations', 'paypal_connections', 'agents', 'agent_api_keys', 'mandates',
  'mandate_versions', 'mandate_budget_periods', 'payees', 'payee_revisions', 'documents',
  'document_extractions', 'payment_requests', 'request_evaluations', 'approvals',
  'approval_decisions', 'executions', 'webhook_events', 'ledger_entries', 'ledger_heads',
  'disputes', 'dispute_cases', 'notifications', 'email_outbox', 'audit_events', 'jobs',
  'rate_limit_buckets', 'ai_usage', 'schema_migrations',
];
const globalIndexExceptions = new Map([
  ['organizations', ['slug']],
  ['paypal_connections', ['webhook_token']],
  ['webhook_events', ['paypal_event_id']],
  ['users', ['lower(email)']],
  ['jobs', ['dedupe_key']],
]);
const results = [];

function record(id, passed, detail) {
  results.push(`${id}\t${passed ? 'PASS' : 'FAIL'}\t${String(detail).replace(/[\r\n\t]+/g, ' ')}`);
}

function definitionsMatch(definitions, table, pattern) {
  return definitions.some((entry) => entry.table_name === table && pattern.test(entry.definition));
}

async function validate(client) {
  const tablesResult = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  const tables = new Set(tablesResult.rows.map((row) => row.table_name));
  const missingTables = requiredTables.filter((table) => !tables.has(table));
  record('SC-01', missingTables.length === 0, missingTables.length ? `Missing tables: ${missingTables.join(', ')}` : `${requiredTables.length} required tables exist.`);

  const columnsResult = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
           character_maximum_length
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  const columns = columnsResult.rows;
  const allowedExactNumeric = new Set([
    'document_extractions.confidence',
    'ai_usage.cost_usd',
    'ai_usage.reserved_cost_usd',
  ]);
  const forbiddenNumeric = columns
    .filter((column) => ['numeric', 'real', 'double precision', 'money'].includes(column.data_type)
      && !allowedExactNumeric.has(`${column.table_name}.${column.column_name}`))
    .map((column) => `${column.table_name}.${column.column_name} (${column.data_type})`);
  record('SC-02', forbiddenNumeric.length === 0, forbiddenNumeric.length ? forbiddenNumeric.join(', ') : 'No numeric, real, double precision, or money columns.');

  const incorrectMoney = columns.filter((column) => /(?:_minor$|^amount_minor$)/i.test(column.column_name)
    && column.data_type !== 'bigint').map((column) => `${column.table_name}.${column.column_name}:${column.data_type}`);
  const incorrectCurrency = columns.filter((column) => column.column_name === 'currency'
    && !(column.data_type === 'character' && column.character_maximum_length === 3))
    .map((column) => `${column.table_name}.${column.column_name}:${column.data_type}`);
  record('SC-03', incorrectMoney.length === 0 && incorrectCurrency.length === 0,
    `Money type violations: ${incorrectMoney.join(', ') || 'none'}; currency violations: ${incorrectCurrency.join(', ') || 'none'}.`);

  const tenantTables = columns.filter((column) => column.column_name === 'org_id').map((column) => column.table_name);
  const nullableOrgIds = columns.filter((column) => column.column_name === 'org_id' && column.is_nullable !== 'NO')
    .map((column) => column.table_name);
  const indexesResult = await client.query(`
    SELECT t.relname AS table_name, i.indisprimary AS is_primary,
           pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
  `);
  const indexViolations = [];
  for (const index of indexesResult.rows) {
    if (index.is_primary || !tenantTables.includes(index.table_name)) continue;
    const body = index.definition.match(/\((.*)\)(?:\s+WHERE\s+(.*))?$/i);
    const firstColumn = body?.[1]?.split(',')[0]?.trim().replaceAll('"', '').toLowerCase();
    const isAllowedGlobal = (globalIndexExceptions.get(index.table_name) || []).some((exception) => {
      if (exception === 'lower(email)') return /unique\s+index.*lower\s*\(\s*email\s*\)/i.test(index.definition);
      return firstColumn === exception
        && /\bunique\b/i.test(index.definition)
        && (exception !== 'dedupe_key' || /\bwhere\b.*dedupe_key\s+is\s+not\s+null/i.test(index.definition));
    });
    if (firstColumn !== 'org_id' && !isAllowedGlobal) indexViolations.push(`${index.table_name}: ${index.definition}`);
  }
  record('SC-04', nullableOrgIds.length === 0 && indexViolations.length === 0,
    `Nullable org_id: ${nullableOrgIds.join(', ') || 'none'}; non-tenant-leading indexes: ${indexViolations.join('; ') || 'none'}; tenant tables: ${tenantTables.length}.`);

  const constraintsResult = await client.query(`
    SELECT c.relname AS table_name, pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND k.contype = 'c'
  `);
  const checks = constraintsResult.rows.map((row) => ({
    table_name: row.table_name,
    definition: row.definition.toLowerCase().replaceAll('"', ''),
  }));
  const requiredChecks = [
    ['memberships', /\brole\b/],
    ['agents', /\bstatus\b/],
    ['mandates', /\bstatus\b/],
    ['payees', /\bkind\b/],
    ['payees', /\btrust\b/],
    ['payment_requests', /\baction\b/],
    ['payment_requests', /\bstatus\b/],
    ['payment_requests', /\bdecision\b/],
    ['payment_requests', /\bamount_minor\b.*>\s*0|>\s*0.*\bamount_minor\b/],
    ['request_evaluations', /\bstage\b/],
    ['executions', /\bstatus\b/],
    ['mandate_budget_periods', /reserved_minor.*spent_minor.*(?:limit|budget).*minor|(?:limit|budget).*minor.*reserved_minor.*spent_minor/],
    ['mandate_budget_periods', /reserved_minor\s*>=\s*0/],
    ['mandate_budget_periods', /spent_minor\s*>=\s*0/],
  ];
  const missingChecks = requiredChecks.filter(([table, pattern]) => !definitionsMatch(checks, table, pattern))
    .map(([table, pattern]) => `${table}:${pattern}`);
  record('SC-05', missingChecks.length === 0, missingChecks.length ? `Missing CHECK constraints: ${missingChecks.join(', ')}` : 'Required CHECK constraints exist.');

  const uniqueIndexes = indexesResult.rows.filter((index) => /\bCREATE\s+UNIQUE\s+INDEX\b/i.test(index.definition));
  const uniqueRequirements = [
    ['mandates', /\(\s*agent_id\s*\).*where\s+.*status\s*=\s*'active'/i],
    ['jobs', /\(\s*dedupe_key\s*\).*where\s+.*dedupe_key\s+is\s+not\s+null/i],
    ['payment_requests', /\(\s*agent_id\s*,\s*agent_idempotency_key\s*\)/i],
    ['payees', /\(\s*org_id\s*,\s*identifier_hmac\s*\)/i],
    ['users', /\(\s*lower\s*\(\s*email\s*\)\s*\)/i],
    ['mandate_versions', /\(\s*mandate_id\s*,\s*version\s*\)/i],
    ['mandate_budget_periods', /\(\s*version_id\s*,\s*period_start\s*\)/i],
    ['memberships', /\(\s*org_id\s*,\s*user_id\s*\)/i],
  ];
  const missingUnique = uniqueRequirements.filter(([table, pattern]) => !definitionsMatch(uniqueIndexes, table, pattern))
    .map(([table]) => table);
  record('SC-06', missingUnique.length === 0, missingUnique.length ? `Missing unique indexes: ${missingUnique.join(', ')}` : 'Required unique and partial indexes exist.');

  const triggerResult = await client.query(`
    SELECT c.relname AS table_name, t.tgname, t.tgenabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  `);
  const requiredTriggerTables = ['ledger_entries', 'mandate_versions'];
  const missingTriggers = requiredTriggerTables.filter((table) => !triggerResult.rows.some((trigger) => trigger.table_name === table));
  record('SC-07', missingTriggers.length === 0, missingTriggers.length ? `Missing immutable-table triggers: ${missingTriggers.join(', ')}` : 'Immutable-table triggers exist.');

  const primaryKeysResult = await client.query(`
    SELECT c.relname AS table_name, array_agg(a.attname ORDER BY key.ordinality) AS columns
    FROM pg_constraint k
    JOIN pg_class c ON c.oid = k.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(k.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = key.attnum
    WHERE n.nspname = 'public' AND k.contype = 'p'
    GROUP BY c.relname
  `);
  const primaryKeys = new Map(primaryKeysResult.rows.map((row) => [row.table_name, row.columns]));
  const ledgerEntriesPk = JSON.stringify(primaryKeys.get('ledger_entries') || []);
  const ledgerHeadsPk = JSON.stringify(primaryKeys.get('ledger_heads') || []);
  const createdAt = columns.find((column) => column.table_name === 'ledger_entries' && column.column_name === 'created_at');
  const schemaValid = ledgerEntriesPk === JSON.stringify(['org_id', 'seq'])
    && ledgerHeadsPk === JSON.stringify(['org_id'])
    && createdAt?.is_nullable === 'NO'
    && createdAt?.column_default == null;
  record('SC-08', schemaValid, `ledger_entries PK=${ledgerEntriesPk}; ledger_heads PK=${ledgerHeadsPk}; created_at NOT NULL/no default=${createdAt?.is_nullable === 'NO' && createdAt?.column_default == null}.`);

  const uuidFunction = await client.query(`SELECT to_regprocedure('gen_random_uuid()') IS NOT NULL AS available`);
  const idColumns = columns.filter((column) => column.column_name === 'id');
  const invalidIds = idColumns.filter((column) => column.udt_name !== 'uuid'
    || !/gen_random_uuid\s*\(\s*\)/i.test(column.column_default || ''))
    .map((column) => column.table_name);
  record('SC-09', uuidFunction.rows[0].available && invalidIds.length === 0,
    `gen_random_uuid available=${uuidFunction.rows[0].available}; invalid id defaults: ${invalidIds.join(', ') || 'none'}.`);

  const migrationDir = path.resolve(process.cwd(), 'server/migrations');
  const migrationFiles = fs.readdirSync(migrationDir).filter((file) => /^\d+_.*\.sql$/i.test(file)).sort();
  const migrationResult = await client.query('SELECT filename FROM public.schema_migrations ORDER BY filename');
  const applied = migrationResult.rows.map((row) => row.filename);
  const ordered = migrationFiles.every((file, index) => {
    const current = Number(file.match(/^(\d+)/)?.[1]);
    return current === index + 1;
  });
  const mismatch = migrationFiles.length !== applied.length
    || migrationFiles.some((file, index) => file !== applied[index]);
  record('SC-10', ordered && !mismatch,
    `Local migrations=${migrationFiles.length}; applied=${applied.length}; sequence contiguous=${ordered}; names match=${!mismatch}.`);
}

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  for (let index = 1; index <= 10; index += 1) {
    record(`SC-${String(index).padStart(2, '0')}`, false, 'DATABASE_URL is not set; catalog checks were not run.');
  }
} else {
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await validate(client);
  } catch (error) {
    for (let index = 1; index <= 10; index += 1) {
      record(`SC-${String(index).padStart(2, '0')}`, false, `Catalog query failed: ${error.message}`);
    }
  } finally {
    await client.end().catch((error) => {
      console.error(`Schema validator database close failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}

console.log(results.join('\n'));
if (results.some((result) => result.includes('\tFAIL\t'))) process.exitCode = 1;
