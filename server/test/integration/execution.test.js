import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import pg from 'pg';

import { runMigrations } from '../../scripts/migrate.js';
import { encrypt, hmacSha256 } from '../../src/lib/crypto.js';
import { env } from '../../src/config.js';
import { requestHash } from '../../src/services/requestHash.js';
import { executeRequest } from '../../src/jobs/handlers/executeRequest.js';
import { reconcileRequest } from '../../src/jobs/handlers/reconcileRequest.js';
import { processWebhook } from '../../src/jobs/webhook.js';
import { clearPaypalTokenCache, paypalFor } from '../../src/paypal/client.js';
import { createFakePaypalServer } from '../helpers/fake-paypal.js';

const connectionString = process.env.TEST_DATABASE_URL;
const canRun = Boolean(connectionString && env.JOBENPAY_HMAC_PEPPER);
const encryptionKey = crypto.randomBytes(32).toString('base64');
const payeeAddress = 'payout-recipient@example.test';
const childScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../helpers/executeRequestChild.js');

function encrypted(orgId, field, plaintext) {
  return encrypt({
    key: encryptionKey,
    plaintext,
    aad: `paypal_connections:${field}:${orgId}`,
  });
}

function createPaypal(orgId, db) {
  return paypalFor(orgId, { db, encryptionKey });
}

async function insertApprovedRequest(db, {
  orgId,
  agentId,
  payeeId,
  amountMinor = '1234',
  mandateVersionId = null,
  reservedPeriodId = null,
  status = 'APPROVED',
}) {
  const requestId = crypto.randomUUID();
  const hash = requestHash({
    orgId,
    agentId,
    mandateVersionId,
    action: 'PAYOUT',
    amountMinor,
    currency: 'USD',
    payeeId,
    documentSha256: null,
  });
  await db.query(
    `INSERT INTO payment_requests
       (id, org_id, agent_id, mandate_version_id, action, status, amount_minor, currency,
        payee_id, request_hash, reserved_period_id, reserved_amount_minor)
     VALUES ($1, $2, $3, $4, 'PAYOUT', $5, $6, 'USD', $7, $8, $9, $10)`,
    [requestId, orgId, agentId, mandateVersionId, status, amountMinor, payeeId, hash, reservedPeriodId,
      reservedPeriodId ? amountMinor : null],
  );
  return requestId;
}

async function execute(db, orgId, requestId, paypal) {
  return executeRequest({
    type: 'execute_request',
    attempts: 1,
    payload: { orgId, requestId },
  }, {
    db,
    encryptionKey,
    paypalFor: () => paypal,
  });
}

test('execute_request is idempotent across lost responses and concurrent workers; signed webhook reconciles once', {
  skip: !canRun,
}, async (t) => {
  const schema = `s13_test_${crypto.randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Client({ connectionString });
  await admin.connect();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const isolatedUrl = new URL(connectionString);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema},public`);
  const isolatedConnectionString = isolatedUrl.toString();
  const db = new pg.Pool({ connectionString: isolatedConnectionString });
  let fake;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalApiOverride = process.env.PAYPAL_API_BASE_OVERRIDE;

  try {
    await runMigrations(isolatedConnectionString);
    fake = await createFakePaypalServer();
    process.env.NODE_ENV = 'test';
    process.env.PAYPAL_API_BASE_OVERRIDE = fake.baseUrl;

    const orgId = crypto.randomUUID();
    const agentId = crypto.randomUUID();
    await db.query(
      'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)',
      [orgId, 'SYNTHETIC S13 organization', `s13-${orgId}`],
    );
    const owner = await db.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, 'not-used-in-this-test', 'SYNTHETIC owner') RETURNING id`,
      [`owner-${orgId}@synthetic.test`],
    );
    await db.query(
      `INSERT INTO memberships (org_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [orgId, owner.rows[0].id],
    );
    await db.query(
      'INSERT INTO agents (id, org_id, name, status) VALUES ($1, $2, $3, $4)',
      [agentId, orgId, 'SYNTHETIC payout agent', 'ACTIVE'],
    );
    const payee = await db.query(
      `INSERT INTO payees
         (org_id, display_name, kind, identifier_enc, identifier_hmac, identifier_masked, trust)
       VALUES ($1, $2, 'EMAIL', $3, $4, 'p***@example.test', 'TRUSTED')
       RETURNING id`,
      [
        orgId,
        'SYNTHETIC payout recipient',
        encrypt({
          key: encryptionKey,
          plaintext: payeeAddress,
          aad: `payees:identifier_enc:${orgId}`,
        }),
        hmacSha256(env.JOBENPAY_HMAC_PEPPER, payeeAddress),
      ],
    );
    const payeeId = payee.rows[0].id;
    await db.query(
      `INSERT INTO paypal_connections (org_id, client_id_enc, client_secret_enc, webhook_id, status)
       VALUES ($1, $2, $3, 'SYNTHETIC-WEBHOOK', 'CONNECTED')`,
      [orgId, encrypted(orgId, 'client_id_enc', 'test-client'), encrypted(orgId, 'client_secret_enc', 'test-secret')],
    );
    clearPaypalTokenCache(orgId);
    const paypal = await createPaypal(orgId, db);

    const crashRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    fake.loseNextPayoutResponses(1);
    await assert.rejects(() => execute(db, orgId, crashRequestId, paypal), (error) => (
      error.code === 'PAYPAL_NETWORK_ERROR'
    ));
    await execute(db, orgId, crashRequestId, paypal);
    assert.equal(fake.uniquePayoutCount, 1);
    assert.equal(fake.payoutRequests[0].idempotencyId, crashRequestId);
    assert.equal(fake.payoutRequests[0].result.items[0].receiver, payeeAddress);
    assert.equal(fake.payoutRequests[0].result.items[0].amount.value, '12.34');
    const executed = await db.query(
      `SELECT r.status, e.status AS execution_status, e.attempts, e.paypal_ref,
              e.response_redacted::text AS response_redacted
       FROM payment_requests r
       JOIN executions e ON e.org_id = r.org_id AND e.request_id = r.id
       WHERE r.org_id = $1 AND r.id = $2`,
      [orgId, crashRequestId],
    );
    assert.equal(executed.rows[0].status, 'EXECUTED');
    assert.equal(executed.rows[0].execution_status, 'SUCCEEDED');
    assert.equal(Number(executed.rows[0].attempts), 2);
    assert.equal(executed.rows[0].response_redacted.includes(payeeAddress), false);

    const payoutCountBeforeFailureCases = fake.uniquePayoutCount;
    const timeoutBeforeCreateId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    fake.loseNextPayoutResponses(1, { afterCreation: false });
    await assert.rejects(() => execute(db, orgId, timeoutBeforeCreateId, paypal), (error) => (
      error.code === 'PAYPAL_NETWORK_ERROR'
    ));
    await execute(db, orgId, timeoutBeforeCreateId, paypal);
    assert.equal(fake.uniquePayoutCount, payoutCountBeforeFailureCases + 1);

    const missingKeyRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: missingKeyRequestId },
    }, { db, encryptionKey: null, paypalFor: () => paypal });
    const missingKey = await db.query(
      'SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, missingKeyRequestId],
    );
    assert.equal(missingKey.rows[0].status, 'FAILED');
    assert.deepEqual(missingKey.rows[0].reason_codes, ['PAYPAL_ENCRYPTION_KEY_MISSING']);

    const originalIdentifier = await db.query(
      'SELECT identifier_enc FROM payees WHERE org_id = $1 AND id = $2',
      [orgId, payeeId],
    );
    await db.query('UPDATE payees SET identifier_enc = NULL WHERE org_id = $1 AND id = $2', [orgId, payeeId]);
    const missingPayeeRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, missingPayeeRequestId, paypal);
    await db.query(
      'UPDATE payees SET identifier_enc = $3 WHERE org_id = $1 AND id = $2',
      [orgId, payeeId, originalIdentifier.rows[0].identifier_enc],
    );
    const missingPayee = await db.query(
      'SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, missingPayeeRequestId],
    );
    assert.equal(missingPayee.rows[0].status, 'FAILED');
    assert.deepEqual(missingPayee.rows[0].reason_codes, ['PAYEE_UNAVAILABLE']);

    const alreadyFailedRequestId = await insertApprovedRequest(db, {
      orgId,
      agentId,
      payeeId,
      status: 'FAILED',
    });
    await execute(db, orgId, alreadyFailedRequestId, paypal);
    const alreadyFailedExecution = await db.query(
      'SELECT 1 FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, alreadyFailedRequestId],
    );
    assert.equal(alreadyFailedExecution.rowCount, 0);
    await assert.rejects(() => executeRequest({ payload: { orgId } }, { db }), /requires orgId and requestId/);

    const malformedIdentifier = await db.query(
      'SELECT identifier_enc FROM payees WHERE org_id = $1 AND id = $2',
      [orgId, payeeId],
    );
    await db.query('UPDATE payees SET identifier_enc = $3 WHERE org_id = $1 AND id = $2', [
      orgId, payeeId, 'not-encrypted-json',
    ]);
    const decryptFailureRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, decryptFailureRequestId, paypal);
    await db.query('UPDATE payees SET identifier_enc = $3 WHERE org_id = $1 AND id = $2', [
      orgId, payeeId, malformedIdentifier.rows[0].identifier_enc,
    ]);
    const decryptFailure = await db.query(
      'SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, decryptFailureRequestId],
    );
    assert.equal(decryptFailure.rows[0].status, 'FAILED');
    assert.deepEqual(decryptFailure.rows[0].reason_codes, ['PAYEE_DECRYPT_FAILED']);

    const freezeDuringPrepareId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: freezeDuringPrepareId },
    }, {
      db,
      encryptionKey,
      paypalFor: async () => {
        await db.query('UPDATE organizations SET frozen_at = now() WHERE id = $1', [orgId]);
        return paypal;
      },
    });
    const freezeDuringPrepare = await db.query(
      'SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, freezeDuringPrepareId],
    );
    assert.equal(freezeDuringPrepare.rows[0].status, 'FAILED');
    assert.deepEqual(freezeDuringPrepare.rows[0].reason_codes, ['ORG_FROZEN']);
    await db.query('UPDATE organizations SET frozen_at = NULL WHERE id = $1', [orgId]);

    const rejectedProviderRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: rejectedProviderRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: () => ({
        request: async () => {
          const error = new Error('SYNTHETIC invalid payout request');
          error.code = 'PAYPAL_INVALID_REQUEST';
          error.statusCode = 400;
          throw error;
        },
      }),
    });
    const rejectedProvider = await db.query(
      'SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, rejectedProviderRequestId],
    );
    assert.equal(rejectedProvider.rows[0].status, 'FAILED');
    assert.deepEqual(rejectedProvider.rows[0].reason_codes, ['PAYPAL_INVALID_REQUEST']);

    const duplicateBatchRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    const duplicateLookups = [];
    await executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: duplicateBatchRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: () => ({
        request: async (method, endpoint) => {
          duplicateLookups.push(`${method} ${endpoint}`);
          if (method === 'POST') {
            const error = new Error('SYNTHETIC duplicate batch');
            error.code = 'PAYPAL_REQUEST_REJECTED';
            error.statusCode = 409;
            error.details = {
              response: {
                name: 'DUPLICATE_REQUEST_ID',
                links: [{ href: 'https://sandbox.example.test/v1/payments/payouts/SYNTHETIC-BATCH' }],
              },
            };
            throw error;
          }
          return {
            body: { batch_header: { payout_batch_id: 'SYNTHETIC-BATCH' } },
            status: 200,
          };
        },
      }),
    });
    assert.ok(duplicateLookups.some((lookup) => lookup.includes('GET /v1/payments/payouts/SYNTHETIC-BATCH')));
    const duplicateBatch = await db.query(
      'SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, duplicateBatchRequestId],
    );
    assert.equal(duplicateBatch.rows[0].status, 'EXECUTED');

    const malformedResponseRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await assert.rejects(() => executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: malformedResponseRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: () => ({ request: async () => ({ body: {}, status: 201 }) }),
    }), (error) => error.code === 'PAYPAL_INVALID_PAYOUT_RESPONSE');
    await executeRequest({
      type: 'execute_request',
      attempts: 2,
      payload: { orgId, requestId: malformedResponseRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: () => ({
        request: async () => ({
          body: { batch_header: { payout_batch_id: `SYNTHETIC-${malformedResponseRequestId}` } },
          status: 201,
        }),
      }),
    });
    const malformedResponse = await db.query(
      'SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, malformedResponseRequestId],
    );
    assert.equal(malformedResponse.rows[0].status, 'EXECUTED');

    const serverErrorAfterCreateId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    fake.setPayoutResponseFailures(500);
    await assert.rejects(() => execute(db, orgId, serverErrorAfterCreateId, paypal), (error) => (
      error.code === 'PAYPAL_UNAVAILABLE'
    ));
    await execute(db, orgId, serverErrorAfterCreateId, paypal);
    assert.equal(fake.uniquePayoutCount, payoutCountBeforeFailureCases + 2);

    fake.setPayoutStatus(executed.rows[0].paypal_ref, 'SUCCESS');
    const webhook = fake.buildWebhook(executed.rows[0].paypal_ref);
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, webhook.event.id, webhook.event.event_type, webhook.event],
    );
    const webhookJob = {
      payload: { orgId, eventId: webhook.event.id },
    };
    await processWebhook(webhookJob, { db });
    await processWebhook(webhookJob, { db });
    const reconciled = await db.query(
      `SELECT r.status, w.status AS webhook_status, w.processed_at
       FROM payment_requests r
       JOIN webhook_events w ON w.org_id = r.org_id
       WHERE r.org_id = $1 AND r.id = $2 AND w.paypal_event_id = $3`,
      [orgId, crashRequestId, webhook.event.id],
    );
    assert.equal(reconciled.rows[0].status, 'RECONCILED');
    assert.equal(reconciled.rows[0].webhook_status, 'RECONCILED');
    assert.ok(reconciled.rows[0].processed_at);

    await assert.rejects(
      processWebhook({ payload: {} }, { db }),
      /requires orgId and eventId/,
    );
    await processWebhook({
      payload: { orgId, eventId: `SYNTHETIC-MISSING-${crypto.randomUUID()}` },
    }, { db });
    const ignoredEvents = [
      {
        eventId: `SYNTHETIC-UNKNOWN-${crypto.randomUUID()}`,
        eventType: 'ACCOUNT.UPDATED',
        payload: {},
      },
      {
        eventId: `SYNTHETIC-UNMATCHED-${crypto.randomUUID()}`,
        eventType: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
        payload: {
          resource: {
            sender_item_id: crypto.randomUUID(),
            sender_batch_id: `jp_${crypto.randomUUID()}`,
            payout_batch_id: crypto.randomUUID(),
          },
        },
      },
    ];
    for (const ignored of ignoredEvents) {
      await db.query(
        `INSERT INTO webhook_events
           (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
         VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
        [orgId, ignored.eventId, ignored.eventType, ignored.payload],
      );
      await processWebhook({ payload: { orgId, eventId: ignored.eventId } }, { db });
      await processWebhook({ payload: { orgId, eventId: ignored.eventId } }, { db });
    }
    const ignoredStatuses = await db.query(
      `SELECT status FROM webhook_events WHERE org_id = $1 AND paypal_event_id = ANY($2::text[])`,
      [orgId, ignoredEvents.map(({ eventId }) => eventId)],
    );
    assert.deepEqual(ignoredStatuses.rows.map(({ status }) => status), ['IGNORED', 'IGNORED']);

    const concurrentRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await Promise.all([
      execute(db, orgId, concurrentRequestId, paypal),
      execute(db, orgId, concurrentRequestId, paypal),
    ]);
    assert.equal(fake.uniquePayoutCount, payoutCountBeforeFailureCases + 3);
    const concurrent = await db.query(
      `SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2`,
      [orgId, concurrentRequestId],
    );
    assert.equal(concurrent.rows[0].status, 'EXECUTED');

    fake.setNextPayoutStatus('SUCCESS');
    const polledRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, polledRequestId, paypal);
    const polledExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, polledRequestId],
    );
    await reconcileRequest({
      payload: { orgId, requestId: polledRequestId, pollAttempt: 0 },
    }, {
      db,
      paypalFor: () => paypal,
    });
    const polled = await db.query(
      'SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, polledRequestId],
    );
    assert.ok(polledExecution.rows[0].paypal_ref);
    assert.equal(polled.rows[0].status, 'RECONCILED');
    fake.setNextPayoutStatus('PENDING');

    const mismatchAmountRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, mismatchAmountRequestId, paypal);
    const mismatchAmountExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, mismatchAmountRequestId],
    );
    fake.setPayoutStatus(mismatchAmountExecution.rows[0].paypal_ref, 'SUCCESS');
    const amountWebhook = fake.buildWebhook(
      mismatchAmountExecution.rows[0].paypal_ref,
      'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
      {
        payout_item: {
          sender_item_id: mismatchAmountRequestId,
          sender_batch_id: `jp_${mismatchAmountRequestId}`,
          receiver: payeeAddress,
          amount: { value: '12.35', currency: 'USD' },
          transaction_status: 'SUCCESS',
        },
      },
    );
    await db.query(
      `INSERT INTO webhook_events (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, amountWebhook.event.id, amountWebhook.event.event_type, amountWebhook.event],
    );
    await processWebhook({
      payload: { orgId, eventId: amountWebhook.event.id },
    }, { db });
    const amountMismatch = await db.query(
      'SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, mismatchAmountRequestId],
    );
    assert.equal(amountMismatch.rows[0].status, 'MISMATCH');

    fake.setNextItemOverrides({ receiver: 'different-recipient@example.test' });
    const mismatchReceiverRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, mismatchReceiverRequestId, paypal);
    fake.setNextItemOverrides({});
    const mismatchReceiverExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, mismatchReceiverRequestId],
    );
    fake.setPayoutStatus(mismatchReceiverExecution.rows[0].paypal_ref, 'SUCCESS');
    const receiverWebhook = fake.buildWebhook(mismatchReceiverExecution.rows[0].paypal_ref);
    await db.query(
      `INSERT INTO webhook_events (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, receiverWebhook.event.id, receiverWebhook.event.event_type, receiverWebhook.event],
    );
    await processWebhook({
      payload: { orgId, eventId: receiverWebhook.event.id },
    }, { db });
    const receiverMismatch = await db.query(
      'SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, mismatchReceiverRequestId],
    );
    assert.equal(receiverMismatch.rows[0].status, 'MISMATCH');

    await t.test('a killed worker recovers through the same provider idempotency IDs', async () => {
      const requestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
      const initialCount = fake.uniquePayoutCount;
      fake.holdNextPayoutResponse();
      const child = spawn(process.execPath, ['--import=./server/test/setup.js', childScript], {
        env: {
          ...process.env,
          TEST_DATABASE_URL: isolatedConnectionString,
          PAYPAL_API_BASE_OVERRIDE: fake.baseUrl,
          NODE_ENV: 'test',
          orgId,
          requestId,
          S13_ENC_KEY: encryptionKey,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      const closed = once(child, 'close');
      const deadline = Date.now() + 10_000;
      while (!fake.payoutResponseHeld && Date.now() < deadline && child.exitCode === null) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(fake.payoutResponseHeld, true, `child did not reach provider crash window: ${output}`);
      child.kill(process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL');
      const [exitCode, signal] = await closed;
      assert.ok(exitCode !== 0 || signal);
      assert.equal(fake.payoutResponseHeld, false);

      const sent = await db.query(
        `SELECT r.status, e.status AS execution_status
         FROM payment_requests r
         JOIN executions e ON e.org_id = r.org_id AND e.request_id = r.id
         WHERE r.org_id = $1 AND r.id = $2`,
        [orgId, requestId],
      );
      assert.equal(sent.rows[0].status, 'EXECUTING');
      assert.equal(sent.rows[0].execution_status, 'SENT');

      await executeRequest({
        type: 'execute_request',
        attempts: 2,
        payload: { orgId, requestId },
      }, {
        db,
        encryptionKey,
        paypalFor: () => paypal,
      });
      const recovered = await db.query(
        'SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2',
        [orgId, requestId],
      );
      assert.equal(recovered.rows[0].status, 'EXECUTED');
      assert.equal(fake.uniquePayoutCount, initialCount + 1);
    });

    const changedHashRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await db.query(
      'UPDATE payment_requests SET amount_minor = 1250 WHERE org_id = $1 AND id = $2',
      [orgId, changedHashRequestId],
    );
    await execute(db, orgId, changedHashRequestId, paypal);
    const changedHash = await db.query(
      `SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2`,
      [orgId, changedHashRequestId],
    );
    assert.equal(changedHash.rows[0].status, 'FAILED');
    assert.deepEqual(changedHash.rows[0].reason_codes, ['HASH_CHANGED']);
    assert.equal(fake.uniquePayoutCount, payoutCountBeforeFailureCases + 7);

    await db.query(
      'UPDATE organizations SET frozen_at = now() WHERE id = $1',
      [orgId],
    );
    const frozenRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, frozenRequestId, paypal);
    const frozen = await db.query(
      `SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2`,
      [orgId, frozenRequestId],
    );
    assert.equal(frozen.rows[0].status, 'CANCELLED');
    assert.equal(fake.uniquePayoutCount, payoutCountBeforeFailureCases + 7);
    await db.query('UPDATE organizations SET frozen_at = NULL WHERE id = $1', [orgId]);

    const earlyWebhookRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    fake.loseNextPayoutResponses(1);
    await assert.rejects(() => execute(db, orgId, earlyWebhookRequestId, paypal), (error) => (
      error.code === 'PAYPAL_NETWORK_ERROR'
    ));
    const earlyPayoutId = fake.payoutRequests.at(-1).result.batch_header.payout_batch_id;
    const reviewWebhook = fake.buildWebhook(earlyPayoutId);
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, reviewWebhook.event.id, reviewWebhook.event.event_type, reviewWebhook.event],
    );
    await processWebhook({
      attempts: 5,
      payload: { orgId, eventId: reviewWebhook.event.id },
    }, { db });
    const needsReview = await db.query(
      'SELECT status FROM webhook_events WHERE org_id = $1 AND paypal_event_id = $2',
      [orgId, reviewWebhook.event.id],
    );
    assert.equal(needsReview.rows[0].status, 'NEEDS_REVIEW');

    const earlyWebhook = fake.buildWebhook(earlyPayoutId);
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, earlyWebhook.event.id, earlyWebhook.event.event_type, earlyWebhook.event],
    );
    await assert.rejects(() => processWebhook({
      attempts: 1,
      payload: { orgId, eventId: earlyWebhook.event.id },
    }, { db }), (error) => error.code === 'WEBHOOK_WAITING_FOR_EXECUTION');
    await execute(db, orgId, earlyWebhookRequestId, paypal);
    await processWebhook({
      attempts: 2,
      payload: { orgId, eventId: earlyWebhook.event.id },
    }, { db });
    const earlyWebhookResult = await db.query(
      `SELECT r.status, w.status AS webhook_status
       FROM payment_requests r
       JOIN webhook_events w ON w.org_id = r.org_id
       WHERE r.org_id = $1 AND r.id = $2 AND w.paypal_event_id = $3`,
      [orgId, earlyWebhookRequestId, earlyWebhook.event.id],
    );
    assert.equal(earlyWebhookResult.rows[0].status, 'RECONCILED');
    assert.equal(earlyWebhookResult.rows[0].webhook_status, 'RECONCILED');

    const pollLimitRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, pollLimitRequestId, paypal);
    await reconcileRequest({
      payload: { orgId, requestId: pollLimitRequestId, pollAttempt: 9 },
    }, {
      db,
      paypalFor: () => ({
        request: async () => {
          throw new Error('SYNTHETIC reconciliation provider unavailable');
        },
      }),
    });
    const pollLimitNotification = await db.query(
      `SELECT 1 FROM notifications
       WHERE org_id = $1 AND kind = 'PAYOUT_REQUIRES_REVIEW'
         AND payload->>'requestId' = $2
       LIMIT 1`,
      [orgId, pollLimitRequestId],
    );
    assert.equal(pollLimitNotification.rowCount, 1);
    const extraPoll = await db.query(
      `SELECT 1 FROM jobs WHERE dedupe_key = $1`,
      [`rec:${pollLimitRequestId}:10`],
    );
    assert.equal(extraPoll.rowCount, 0);

    const mandateId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    await db.query(
      `INSERT INTO mandates (id, org_id, agent_id, name, status)
       VALUES ($1, $2, $3, 'SYNTHETIC retry mandate', 'ACTIVE')`,
      [mandateId, orgId, agentId],
    );
    await db.query(
      `INSERT INTO mandate_versions
         (id, org_id, mandate_id, version, policy, valid_from, valid_to)
       VALUES ($1, $2, $3, 1, '{}'::jsonb, now() - interval '1 day', now() + interval '1 day')`,
      [versionId, orgId, mandateId],
    );
    await db.query('UPDATE mandates SET current_version_id = $1 WHERE id = $2', [versionId, mandateId]);
    const period = await db.query(
      `INSERT INTO mandate_budget_periods
         (org_id, version_id, period_start, period_end, limit_minor, reserved_minor, spent_minor, currency)
       VALUES ($1, $2, now() - interval '1 day', now() + interval '29 days', 5000, 1234, 0, 'USD')
       RETURNING id`,
      [orgId, versionId],
    );
    const rateLimitedRequestId = await insertApprovedRequest(db, {
      orgId,
      agentId,
      payeeId,
      mandateVersionId: versionId,
      reservedPeriodId: period.rows[0].id,
    });
    const payoutCallCount = fake.getRequestCount('/v1/payments/payouts');
    fake.setTransientFailures('/v1/payments/payouts', 429, 5);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await assert.rejects(() => executeRequest({
        type: 'execute_request',
        attempts: attempt,
        payload: { orgId, requestId: rateLimitedRequestId },
      }, {
        db,
        encryptionKey,
        paypalFor: () => paypal,
      }));
    }
    assert.equal(fake.getRequestCount('/v1/payments/payouts') - payoutCallCount, 5);
    const rateLimited = await db.query(
      `SELECT r.status, r.reason_codes, r.reserved_released,
              b.reserved_minor, e.attempts, e.status AS execution_status
       FROM payment_requests r
       JOIN executions e ON e.org_id = r.org_id AND e.request_id = r.id
       JOIN mandate_budget_periods b ON b.id = r.reserved_period_id
       WHERE r.org_id = $1 AND r.id = $2`,
      [orgId, rateLimitedRequestId],
    );
    assert.equal(rateLimited.rows[0].status, 'FAILED');
    assert.deepEqual(rateLimited.rows[0].reason_codes, ['PAYPAL_RATE_LIMITED']);
    assert.equal(rateLimited.rows[0].reserved_released, true);
    assert.equal(String(rateLimited.rows[0].reserved_minor), '0');
    assert.equal(Number(rateLimited.rows[0].attempts), 5);
    assert.equal(rateLimited.rows[0].execution_status, 'FAILED');

    const uncertainRequestId = await insertApprovedRequest(db, {
      orgId,
      agentId,
      payeeId,
      mandateVersionId: versionId,
      reservedPeriodId: period.rows[0].id,
    });
    await db.query(
      'UPDATE mandate_budget_periods SET reserved_minor = reserved_minor + 1234 WHERE id = $1',
      [period.rows[0].id],
    );
    fake.setTransientFailures('/v1/payments/payouts', 500, 1);
    await assert.rejects(() => execute(db, orgId, uncertainRequestId, paypal), (error) => (
      error.code === 'PAYPAL_UNAVAILABLE'
    ));
    fake.setTransientFailures('/v1/payments/payouts', 500, 1);
    await assert.rejects(() => executeRequest({
      type: 'execute_request',
      attempts: 5,
      payload: { orgId, requestId: uncertainRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: () => paypal,
    }), (error) => error.code === 'PAYPAL_UNAVAILABLE');
    const uncertainRequest = await db.query(
      `SELECT r.status, r.reason_codes, r.reserved_released, b.reserved_minor
       FROM payment_requests r
       JOIN mandate_budget_periods b ON b.id = r.reserved_period_id
       WHERE r.org_id = $1 AND r.id = $2`,
      [orgId, uncertainRequestId],
    );
    assert.equal(uncertainRequest.rows[0].status, 'FAILED');
    assert.deepEqual(uncertainRequest.rows[0].reason_codes, ['UNCERTAIN_NEEDS_MANUAL_CHECK']);
    assert.equal(uncertainRequest.rows[0].reserved_released, false);
    assert.equal(String(uncertainRequest.rows[0].reserved_minor), '1234');

    const pendingWebhookRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, pendingWebhookRequestId, paypal);
    const pendingWebhookExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, pendingWebhookRequestId],
    );
    const pendingWebhook = fake.buildWebhook(
      pendingWebhookExecution.rows[0].paypal_ref,
      'PAYMENT.PAYOUTS-ITEM.PROCESSING',
      {
        payout_item: {
          sender_item_id: pendingWebhookRequestId,
          sender_batch_id: `jp_${pendingWebhookRequestId}`,
          receiver: payeeAddress,
          amount: { value: '12.34', currency: 'USD' },
          transaction_status: 'PENDING',
        },
      },
    );
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, pendingWebhook.event.id, pendingWebhook.event.event_type, pendingWebhook.event],
    );
    await assert.rejects(() => processWebhook({
      attempts: 1,
      payload: { orgId, eventId: pendingWebhook.event.id },
    }, { db }), (error) => error.code === 'WEBHOOK_WAITING_FOR_EXECUTION');
    await processWebhook({
      attempts: 5,
      payload: { orgId, eventId: pendingWebhook.event.id },
    }, { db });

    const noBatchRefRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, noBatchRefRequestId, paypal);
    const noBatchRef = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, noBatchRefRequestId],
    );
    const noBatchRefWebhook = fake.buildWebhook(noBatchRef.rows[0].paypal_ref);
    noBatchRefWebhook.event.resource.receiver = null;
    noBatchRefWebhook.event.resource.amount = null;
    noBatchRefWebhook.event.resource.payout_item.receiver = null;
    noBatchRefWebhook.event.resource.payout_item.amount = null;
    await db.query(
      'UPDATE executions SET paypal_ref = NULL WHERE org_id = $1 AND request_id = $2',
      [orgId, noBatchRefRequestId],
    );
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, noBatchRefWebhook.event.id, noBatchRefWebhook.event.event_type, noBatchRefWebhook.event],
    );
    await assert.rejects(() => processWebhook({
      attempts: 1,
      payload: { orgId, eventId: noBatchRefWebhook.event.id },
    }, { db }), (error) => error.code === 'WEBHOOK_WAITING_FOR_EXECUTION');
    await db.query(
      'UPDATE executions SET paypal_ref = $3 WHERE org_id = $1 AND request_id = $2',
      [orgId, noBatchRefRequestId, noBatchRef.rows[0].paypal_ref],
    );
    await processWebhook({
      attempts: 2,
      payload: { orgId, eventId: noBatchRefWebhook.event.id },
    }, { db, paypalFor: () => paypal });
    const noBatchRefResult = await db.query(
      'SELECT status FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, noBatchRefRequestId],
    );
    assert.equal(noBatchRefResult.rows[0].status, 'RECONCILED');

    const fallbackRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, fallbackRequestId, paypal);
    const fallbackExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, fallbackRequestId],
    );
    fake.setPayoutStatus(fallbackExecution.rows[0].paypal_ref, 'SUCCESS');
    const fallbackWebhook = fake.buildWebhook(fallbackExecution.rows[0].paypal_ref);
    fallbackWebhook.event.resource.payout_item.receiver = null;
    fallbackWebhook.event.resource.payout_item.amount = null;
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, fallbackWebhook.event.id, fallbackWebhook.event.event_type, fallbackWebhook.event],
    );
    await processWebhook({
      payload: { orgId, eventId: fallbackWebhook.event.id },
    }, { db, paypalFor: () => paypal });
    const fallbackResult = await db.query(
      `SELECT r.status, w.status AS webhook_status
       FROM payment_requests r
       JOIN webhook_events w ON w.org_id = r.org_id
       WHERE r.org_id = $1 AND r.id = $2 AND w.paypal_event_id = $3`,
      [orgId, fallbackRequestId, fallbackWebhook.event.id],
    );
    assert.equal(fallbackResult.rows[0].status, 'RECONCILED');
    assert.equal(fallbackResult.rows[0].webhook_status, 'RECONCILED');

    const unavailableDetailsRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, unavailableDetailsRequestId, paypal);
    const unavailableDetailsExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, unavailableDetailsRequestId],
    );
    const unavailableDetailsWebhook = fake.buildWebhook(unavailableDetailsExecution.rows[0].paypal_ref);
    unavailableDetailsWebhook.event.resource.payout_item.receiver = null;
    unavailableDetailsWebhook.event.resource.payout_item.amount = null;
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, unavailableDetailsWebhook.event.id, unavailableDetailsWebhook.event.event_type, unavailableDetailsWebhook.event],
    );
    const sentRetryUnavailablePaypal = {
      request: async () => {
        const error = new Error('SYNTHETIC provider unavailable');
        error.code = 'PAYPAL_UNAVAILABLE';
        throw error;
      },
    };
    await assert.rejects(() => processWebhook({
      attempts: 1,
      payload: { orgId, eventId: unavailableDetailsWebhook.event.id },
    }, { db, paypalFor: () => unavailablePaypal }), (error) => error.code === 'PAYPAL_UNAVAILABLE');
    await processWebhook({
      attempts: 5,
      payload: { orgId, eventId: unavailableDetailsWebhook.event.id },
    }, { db, paypalFor: () => unavailablePaypal });
    const unavailableStatus = await db.query(
      'SELECT status FROM webhook_events WHERE org_id = $1 AND paypal_event_id = $2',
      [orgId, unavailableDetailsWebhook.event.id],
    );
    assert.equal(unavailableStatus.rows[0].status, 'NEEDS_REVIEW');

    await assert.rejects(
      executeRequest({ payload: {} }, { db, encryptionKey }),
      /requires orgId and requestId/,
    );

    const expiredRetryRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await assert.rejects(() => executeRequest({
      type: 'execute_request',
      attempts: 6,
      payload: { orgId, requestId: expiredRetryRequestId },
    }, { db, encryptionKey, paypalFor: () => paypal }), (error) => (
      error.code === 'UNCERTAIN_NEEDS_MANUAL_CHECK'
    ));
    const expiredRetry = await db.query(
      'SELECT status, reason_codes, reserved_released FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, expiredRetryRequestId],
    );
    assert.equal(expiredRetry.rows[0].status, 'FAILED');
    assert.deepEqual(expiredRetry.rows[0].reason_codes, ['UNCERTAIN_NEEDS_MANUAL_CHECK']);
    assert.equal(expiredRetry.rows[0].reserved_released, false);

    const unavailableCredentialsRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await assert.rejects(() => executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: unavailableCredentialsRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: async () => {
        const error = new Error('SYNTHETIC credentials unavailable');
        error.code = 'PAYPAL_UNAVAILABLE';
        throw error;
      },
    }), (error) => error.code === 'PAYPAL_UNAVAILABLE');
    await executeRequest({
      type: 'execute_request',
      attempts: 5,
      payload: { orgId, requestId: unavailableCredentialsRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: async () => {
        const error = new Error('SYNTHETIC credentials unavailable');
        error.code = 'PAYPAL_UNAVAILABLE';
        throw error;
      },
    });
    const unavailableCredentials = await db.query(
      'SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, unavailableCredentialsRequestId],
    );
    assert.equal(unavailableCredentials.rows[0].status, 'FAILED');
    assert.deepEqual(unavailableCredentials.rows[0].reason_codes, ['PAYPAL_UNAVAILABLE']);

    const notFoundBatchRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    fake.loseNextPayoutResponses(1, { afterCreation: false });
    await assert.rejects(() => execute(db, orgId, notFoundBatchRequestId, paypal), (error) => (
      error.code === 'PAYPAL_NETWORK_ERROR'
    ));
    await db.query(
      'UPDATE executions SET paypal_ref = $3 WHERE org_id = $1 AND request_id = $2',
      [orgId, notFoundBatchRequestId, 'SYNTHETIC-MISSING-BATCH'],
    );
    await execute(db, orgId, notFoundBatchRequestId, paypal);
    const recoveredNotFoundBatch = await db.query(
      `SELECT r.status, e.status AS execution_status
       FROM payment_requests r
       JOIN executions e ON e.org_id = r.org_id AND e.request_id = r.id
       WHERE r.org_id = $1 AND r.id = $2`,
      [orgId, notFoundBatchRequestId],
    );
    assert.equal(recoveredNotFoundBatch.rows[0].status, 'EXECUTED');
    assert.equal(recoveredNotFoundBatch.rows[0].execution_status, 'SUCCEEDED');

    const invalidDuplicateLinkRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: invalidDuplicateLinkRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: () => ({
        request: async () => {
          const error = new Error('SYNTHETIC duplicate payout response');
          error.code = 'PAYPAL_REQUEST_REJECTED';
          error.statusCode = 409;
          error.details = {
            response: {
              name: 'DUPLICATE_REQUEST_ID',
              links: [{ href: 'not-a-valid-url' }],
            },
          };
          throw error;
        },
      }),
    });
    const invalidDuplicateLink = await db.query(
      'SELECT status, reason_codes FROM payment_requests WHERE org_id = $1 AND id = $2',
      [orgId, invalidDuplicateLinkRequestId],
    );
    assert.equal(invalidDuplicateLink.rows[0].status, 'FAILED');
    assert.deepEqual(invalidDuplicateLink.rows[0].reason_codes, ['PAYPAL_REQUEST_REJECTED']);

    const sentCredentialFailureRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    const sentCredentialFailurePaypal = {
      request: async () => {
        const error = new Error('SYNTHETIC payout response lost');
        error.code = 'PAYPAL_NETWORK_ERROR';
        error.statusCode = 503;
        throw error;
      },
    };
    await assert.rejects(() => executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: sentCredentialFailureRequestId },
    }, { db, encryptionKey, paypalFor: () => sentCredentialFailurePaypal }), (error) => (
      error.code === 'PAYPAL_NETWORK_ERROR'
    ));
    await assert.rejects(() => executeRequest({
      type: 'execute_request',
      attempts: 5,
      payload: { orgId, requestId: sentCredentialFailureRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: async () => {
        const error = new Error('SYNTHETIC credentials unavailable');
        error.code = 'PAYPAL_UNAVAILABLE';
        throw error;
      },
    }), (error) => error.code === 'UNCERTAIN_NEEDS_MANUAL_CHECK');

    const emptyBatchRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, emptyBatchRequestId, paypal);
    const emptyBatchExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, emptyBatchRequestId],
    );
    const emptyBatchWebhook = fake.buildWebhook(emptyBatchExecution.rows[0].paypal_ref);
    emptyBatchWebhook.event.resource.receiver = null;
    emptyBatchWebhook.event.resource.amount = null;
    emptyBatchWebhook.event.resource.payout_item.receiver = null;
    emptyBatchWebhook.event.resource.payout_item.amount = null;
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, emptyBatchWebhook.event.id, emptyBatchWebhook.event.event_type, emptyBatchWebhook.event],
    );
    await processWebhook({
      payload: { orgId, eventId: emptyBatchWebhook.event.id },
    }, {
      db,
      paypalFor: () => ({
        request: async () => ({ batch_header: { batch_status: 'SUCCESS' }, items: [] }),
      }),
    });
    const emptyBatchResult = await db.query(
      `SELECT r.status, w.status AS webhook_status
       FROM payment_requests r
       JOIN webhook_events w ON w.org_id = r.org_id
       WHERE r.org_id = $1 AND r.id = $2 AND w.paypal_event_id = $3`,
      [orgId, emptyBatchRequestId, emptyBatchWebhook.event.id],
    );
    assert.equal(emptyBatchResult.rows[0].status, 'MISMATCH');
    assert.equal(emptyBatchResult.rows[0].webhook_status, 'MISMATCH');

    const sparseResponseRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await executeRequest({
      type: 'execute_request',
      attempts: 1,
      payload: { orgId, requestId: sparseResponseRequestId },
    }, {
      db,
      encryptionKey,
      paypalFor: () => ({
        request: async () => ({
          body: { batch_header: { payout_batch_id: `SYNTHETIC-${sparseResponseRequestId}` } },
          status: 201,
        }),
      }),
    });
    const sparseResponse = await db.query(
      'SELECT status, response_redacted FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, sparseResponseRequestId],
    );
    assert.equal(sparseResponse.rows[0].status, 'SUCCEEDED');
    assert.deepEqual(sparseResponse.rows[0].response_redacted, {
      batchId: `SYNTHETIC-${sparseResponseRequestId}`,
      batchStatus: null,
      senderBatchId: null,
    });

    const fallbackItemRequestId = await insertApprovedRequest(db, { orgId, agentId, payeeId });
    await execute(db, orgId, fallbackItemRequestId, paypal);
    const fallbackItemExecution = await db.query(
      'SELECT paypal_ref FROM executions WHERE org_id = $1 AND request_id = $2',
      [orgId, fallbackItemRequestId],
    );
    const fallbackItemWebhook = fake.buildWebhook(fallbackItemExecution.rows[0].paypal_ref);
    fallbackItemWebhook.event.resource.receiver = null;
    fallbackItemWebhook.event.resource.amount = null;
    fallbackItemWebhook.event.resource.payout_item.receiver = null;
    fallbackItemWebhook.event.resource.payout_item.amount = null;
    await db.query(
      `INSERT INTO webhook_events
         (org_id, paypal_event_id, event_type, payload, verified, status, received_at)
       VALUES ($1, $2, $3, $4, true, 'PENDING', now())`,
      [orgId, fallbackItemWebhook.event.id, fallbackItemWebhook.event.event_type, fallbackItemWebhook.event],
    );
    await processWebhook({
      payload: { orgId, eventId: fallbackItemWebhook.event.id },
    }, {
      db,
      paypalFor: () => ({
        request: async () => ({
          batch_header: { payout_batch_id: 'SYNTHETIC-FALLBACK', batch_status: 'SUCCESS' },
          items: [{
            sender_item_id: 'SYNTHETIC-OTHER-REQUEST',
            receiver: payeeAddress,
            amount: { value: '12.34', currency: 'USD' },
            transaction_status: 'SUCCESS',
          }],
        }),
      }),
    });
    const fallbackItemResult = await db.query(
      `SELECT r.status, w.status AS webhook_status
       FROM payment_requests r
       JOIN webhook_events w ON w.org_id = r.org_id
       WHERE r.org_id = $1 AND r.id = $2 AND w.paypal_event_id = $3`,
      [orgId, fallbackItemRequestId, fallbackItemWebhook.event.id],
    );
    assert.equal(fallbackItemResult.rows[0].status, 'MISMATCH');
    assert.equal(fallbackItemResult.rows[0].webhook_status, 'MISMATCH');
  } finally {
    clearPaypalTokenCache();
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalApiOverride === undefined) delete process.env.PAYPAL_API_BASE_OVERRIDE;
    else process.env.PAYPAL_API_BASE_OVERRIDE = originalApiOverride;
    if (fake) await fake.close();
    await db.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
