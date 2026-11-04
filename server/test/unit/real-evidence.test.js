import assert from 'node:assert/strict';
import test from 'node:test';
import {
  maskEmail,
  redactString,
  redactEvidencePayload,
  maskUrl,
  exportEvidence,
} from '../../src/services/realEvidence.js';

test('maskEmail handles standard and edge case emails correctly', () => {
  assert.equal(maskEmail('alice@example.com'), 'a***@e***.com');
  assert.equal(maskEmail('finance-team@sandbox.paypal.com'), 'f***@s***.com');
  assert.equal(maskEmail('a@b.co'), 'a***@b***.co');
  assert.equal(maskEmail('not-an-email'), 'a***@d***.tld');
});

test('redactString masks emails inside strings while preserving other text', () => {
  const text = 'Payout sent to vendor@merchant.org with note: invoice 101';
  const redacted = redactString(text);
  assert.equal(redacted, 'Payout sent to v***@m***.org with note: invoice 101');
  assert.ok(!redacted.includes('vendor@merchant.org'));
});

test('redactEvidencePayload removes secrets and masks PII while preserving structure', () => {
  const rawPayload = {
    event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
    resource: {
      payout_item_id: 'ITEM123456',
      transaction_status: 'SUCCESS',
      payout_item: {
        amount: {
          currency: 'USD',
          value: '1.00',
        },
        receiver: 'receiver.user@sandbox.paypal.com',
        recipient_type: 'EMAIL',
        sender_item_id: 'REQ-001',
      },
      payer: {
        payer_id: 'PAYER9999',
        payer_email: 'business@sandbox.paypal.com',
        name: {
          given_name: 'John',
          surname: 'Doe',
        },
        phone: '+1234567890',
        address: {
          address_line_1: '123 Test St',
          city: 'San Jose',
          postal_code: '95131',
        },
      },
      // Forbidden secret fields that must be dropped
      token: 'access_token_1234567890',
      client_secret: 'super_secret_key',
      authorization: 'Bearer secret_jwt',
      password: 'mypassword',
    },
    links: [
      {
        href: 'https://api-m.sandbox.paypal.com/v1/payments/payouts-item/ITEM123456',
        rel: 'self',
        method: 'GET',
      },
    ],
  };

  const redacted = redactEvidencePayload(rawPayload);

  // Structure preserved
  assert.equal(redacted.event_type, 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED');
  assert.equal(redacted.resource.payout_item_id, 'ITEM123456');
  assert.equal(redacted.resource.transaction_status, 'SUCCESS');
  assert.equal(redacted.resource.payout_item.amount.currency, 'USD');
  assert.equal(redacted.resource.payout_item.amount.value, '1.00');
  assert.equal(redacted.resource.payout_item.sender_item_id, 'REQ-001');

  // PII masked
  assert.equal(redacted.resource.payout_item.receiver, 'r***@s***.com');
  assert.equal(redacted.resource.payer.payer_email, 'b***@s***.com');
  assert.equal(redacted.resource.payer.payer_id, '[REDACTED]');
  assert.equal(redacted.resource.payer.name.given_name, '[REDACTED]');
  assert.equal(redacted.resource.payer.name.surname, '[REDACTED]');
  assert.equal(redacted.resource.payer.phone, '[REDACTED]');
  assert.equal(redacted.resource.payer.address.address_line_1, '[REDACTED]');
  assert.equal(redacted.resource.payer.address.city, 'San Jose');

  // Secrets completely removed
  assert.equal(redacted.resource.token, undefined);
  assert.equal(redacted.resource.client_secret, undefined);
  assert.equal(redacted.resource.authorization, undefined);
  assert.equal(redacted.resource.password, undefined);

  // Serialized json has no secret strings
  const serialized = JSON.stringify(redacted);
  assert.ok(!serialized.includes('receiver.user@sandbox.paypal.com'));
  assert.ok(!serialized.includes('business@sandbox.paypal.com'));
  assert.ok(!serialized.includes('access_token_1234567890'));
  assert.ok(!serialized.includes('super_secret_key'));
  assert.ok(!serialized.includes('secret_jwt'));
  assert.ok(!serialized.includes('mypassword'));
});

test('maskUrl masks the hostname of public base URL', () => {
  assert.equal(maskUrl('https://nh.jobenapp.cloud'), 'https://n***.jobenapp.cloud');
  assert.equal(maskUrl('http://localhost:3000'), 'http://l***');
  assert.equal(maskUrl(''), null);
});

test('exportEvidence builds complete structure without secret leakage and respects org scoping', async () => {
  const orgId = '00000000-0000-4000-8000-000000000001';
  const otherOrgId = '00000000-0000-4000-8000-000000000002';
  const requestId = '99999999-9999-4999-8999-999999999999';

  const mockDb = {
    async query(sql, params = []) {
      const sqlLower = sql.toLowerCase();

      // Scoped request query
      if (sqlLower.includes('from payment_requests')) {
        const [queryOrg, queryReq] = params;
        if (queryOrg !== orgId || queryReq !== requestId) {
          return { rows: [] };
        }
        return {
          rows: [{
            id: requestId,
            org_id: orgId,
            agent_id: '11111111-1111-4111-8111-111111111111',
            action: 'PAYOUT',
            status: 'COMPLETED',
            amount_minor: '100',
            currency: 'USD',
            payee_id: '22222222-2222-4222-8222-222222222222',
            request_hash: 'abc123hash',
            agent_reason: 'payout for invoice test@domain.com',
            created_at: new Date('2026-11-04T10:00:00Z'),
          }],
        };
      }

      if (sqlLower.includes('from executions')) {
        return {
          rows: [{
            id: '33333333-3333-4333-8333-333333333333',
            attempts: 1,
            status: 'SUCCEEDED',
            paypal_ref: 'BATCH-12345',
            http_status: 201,
            created_at: new Date('2026-11-04T10:00:01Z'),
            response_redacted: {
              batch_header: {
                payout_batch_id: 'BATCH-12345',
                batch_status: 'SUCCESS',
              },
              items: [{
                payout_item_id: 'ITEM-67890',
              }],
              latency_ms: 350,
            },
          }],
        };
      }

      if (sqlLower.includes('from webhook_events')) {
        return {
          rows: [{
            id: '44444444-4444-4444-8444-444444444444',
            paypal_event_id: 'WH-EVT-1',
            event_type: 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED',
            status: 'PROCESSED',
            received_at: new Date('2026-11-04T10:00:04Z'),
            processed_at: new Date('2026-11-04T10:00:05Z'),
            payload: {
              resource: {
                payout_item_id: 'ITEM-67890',
                receiver: 'vendor@sandbox.paypal.com',
                sender_item_id: requestId,
              },
            },
          }],
        };
      }

      if (sqlLower.includes('from ledger_entries')) {
        return {
          rows: [{
            seq: '10',
            type: 'RECONCILED',
            subject_type: 'payment_request',
            subject_id: requestId,
            signature: 'sig_base64_val',
            created_at: new Date('2026-11-04T10:00:05Z'),
            payload: {
              amountMinor: '100',
              balanceAfter: '99900',
              requestId,
            },
          }],
        };
      }

      return { rows: [] };
    },
  };

  // Cross-tenant test: querying otherOrgId must return null (which becomes 404 in route)
  const crossTenantResult = await exportEvidence(otherOrgId, requestId, { db: mockDb });
  assert.equal(crossTenantResult, null);

  // Matching tenant
  const evidence = await exportEvidence(orgId, requestId, { db: mockDb });
  assert.ok(evidence);

  // Check top-level properties
  assert.ok(evidence.request);
  assert.ok(Array.isArray(evidence.executions));
  assert.ok(Array.isArray(evidence.webhook_events));
  assert.ok(Array.isArray(evidence.ledger));
  assert.ok(evidence.timings);
  assert.ok(evidence.meta);

  // Check request
  assert.equal(evidence.request.id, requestId);
  assert.equal(evidence.request.status, 'COMPLETED');
  assert.equal(evidence.request.agent_reason, 'payout for invoice t***@d***.com');

  // Check executions
  assert.equal(evidence.executions.length, 1);
  const exec = evidence.executions[0];
  assert.equal(exec.paypal_payout_batch_id, 'BATCH-12345');
  assert.equal(exec.paypal_item_id, 'ITEM-67890');
  assert.equal(exec.response_code, 201);
  assert.equal(exec.latency_ms, 350);

  // Check webhook_events
  assert.equal(evidence.webhook_events.length, 1);
  const wh = evidence.webhook_events[0];
  assert.equal(wh.event_type, 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED');
  assert.equal(wh.payload.resource.receiver, 'v***@s***.com');

  // Check ledger
  assert.equal(evidence.ledger.length, 1);
  const led = evidence.ledger[0];
  assert.equal(led.entry_type, 'RECONCILED');
  assert.equal(led.amount, '100');
  assert.equal(led.balance_after, '99900');
  assert.equal(led.signature, 'sig_base64_val');

  // Check timings
  assert.equal(evidence.timings.requested_at, '2026-11-04T10:00:00.000Z');
  assert.equal(evidence.timings.first_attempt_at, '2026-11-04T10:00:01.000Z');
  assert.equal(evidence.timings.completed_at, '2026-11-04T10:00:01.000Z');
  assert.equal(evidence.timings.elapsed_sec, 1);
  assert.deepEqual(evidence.timings.webhook_delays_sec, [3]); // 10:00:04 - 10:00:01 = 3s

  // Check meta
  assert.equal(evidence.meta.jobenpay_version, '0.1.0');
  assert.ok(evidence.meta.exported_at);

  // Negative test: verify no secret keys or unredacted emails leaked in JSON output
  const jsonOutput = JSON.stringify(evidence);
  assert.ok(!jsonOutput.includes('vendor@sandbox.paypal.com'));
  assert.ok(!jsonOutput.includes('test@domain.com'));
  assert.ok(!jsonOutput.includes('client_secret'));
  assert.ok(!jsonOutput.includes('password'));
  assert.ok(!jsonOutput.includes('authorization'));
});
